import WebSocket from "ws";
const LIMIT=300,MAX_WATCH=30,MAX_PAID_EVENTS=10000,DAY=86400000;
const events=[],byMint=new Map(),watched=new Set(),trades=new Map(),seen=new Map();
let ws=null,retry=null,tries=0,paidCount=0,paused=false,startedAt=Date.now();
const stats={status:"INITIALIZING",connectedAt:null,lastEventAt:null,lastTradeAt:null,lastError:null,received:0};
export const isAddress=s=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s||""));
const ready=()=>ws?.readyState===WebSocket.OPEN;
function send(method,keys){if(ready())ws.send(JSON.stringify(keys?{method,keys}:{method}));}
function subscribe(mint){if(paused||watched.has(mint)||watched.size>=MAX_WATCH)return;watched.add(mint);send("subscribeTokenTrade",[mint]);}
function stopPaid(){if(paused)return;paused=true;if(watched.size)send("unsubscribeTokenTrade",[...watched]);watched.clear();console.warn("[pump-trades] PAUSED at capped streamed trade messages",paidCount);}
function registerTrade(d,mint){
 if(!watched.has(mint)||paused)return;
 const side=String(d.txType||"").toLowerCase();if(side!=="buy"&&side!=="sell")return;
 paidCount++;if(paidCount>=MAX_PAID_EVENTS)stopPaid();
 const signature=String(d.signature||"");const dedup=signature+":"+mint+":"+side;
 if(signature&&seen.has(dedup))return;
 if(signature){seen.set(dedup,Date.now());if(seen.size>30000)seen.clear();}
 const amount=Number(d.solAmount);
 if(!Number.isFinite(amount)||amount<0)return;
 const now=Date.now(),arr=trades.get(mint)||[];
 arr.push({time:now,side,sol:amount,signature});
 while(arr.length&&arr[0].time<now-DAY)arr.shift();
 trades.set(mint,arr);stats.lastTradeAt=new Date(now).toISOString();
}
function connect(){
 const key=process.env.PUMPPORTAL_API_KEY;
 if(!key){stats.status="NOT_CONFIGURED";stats.lastError="PUMPPORTAL_API_KEY missing";return;}
 stats.status="CONNECTING";
 ws=new WebSocket("wss://pumpportal.fun/api/data?api-key="+encodeURIComponent(key),{handshakeTimeout:12000});
 ws.on("open",()=>{tries=0;stats.status="CONNECTED";stats.lastError=null;stats.connectedAt=new Date().toISOString();send("subscribeNewToken");if(!paused&&watched.size)send("subscribeTokenTrade",[...watched]);});
 ws.on("message",raw=>{try{
  const d=JSON.parse(String(raw)),mint=String(d.mint||"");
  if(!isAddress(mint))return;
  if(d.txType==="buy"||d.txType==="sell"){registerTrade(d,mint);return;}
  if(byMint.has(mint)||d.txType!=="create")return;
  const item={mint,name:String(d.name||"Unknown").slice(0,100),symbol:String(d.symbol||"UNKNOWN").slice(0,25),
    creator:isAddress(d.traderPublicKey)?d.traderPublicKey:null,signature:String(d.signature||"").slice(0,110),
    createdAt:new Date().toISOString(),initialBuy:Number.isFinite(Number(d.initialBuy))?Number(d.initialBuy):null,
    solAmount:Number.isFinite(Number(d.solAmount))?Number(d.solAmount):null,marketCapSol:Number.isFinite(Number(d.marketCapSol))?Number(d.marketCapSol):null,
    source:"PumpPortal: Pump.fun launch",signal:"WAIT",risk:"UNVERIFIED"};
  byMint.set(mint,item);events.unshift(item);
  if(events.length>LIMIT){const old=events.pop();byMint.delete(old.mint);}
  stats.lastEventAt=item.createdAt;stats.received++;
  // Rolling active watchlist: bound subscriptions and cost; stop replacing once 30 are tracked.
  subscribe(mint);
 }catch(e){console.warn("[pump-event] malformed payload");}});
 ws.on("error",e=>{stats.lastError=String(e.message).slice(0,150)});
 ws.on("close",()=>{stats.status="DISCONNECTED";if(retry)clearTimeout(retry);retry=setTimeout(connect,Math.min(60000,5000*++tries));retry.unref?.()});
}
export function start(){connect()}
export function getState(){return {...stats,count:events.length,items:events.slice(0,100),source:"PumpPortal",tradeStreamEnabled:!paused&&watched.size>0,tradeSubscriptions:watched.size,paidEvents:paidCount,paidEventCap:MAX_PAID_EVENTS,estimatedChargeSOL:paidCount/10000*0.01,costCapScope:"PER_PROCESS; restarts reset counter",tradePaused:paused,autoTrade:false}}
export function getToken(mint){return byMint.get(mint)}
export function getTradeRanking(){
 const now=Date.now();return {status:paused?"PAUSED_CAP":stats.status,updatedAt:new Date(now).toISOString(),
  observedSince:new Date(startedAt).toISOString(),complete24h:now-startedAt>=DAY&&!paused,
  coverage:"Watched token launch subset only; not official Pump.fun market-wide trending",
  source:"PumpPortal subscribeTokenTrade",paidEvents:paidCount,paidEventCap:MAX_PAID_EVENTS,estimatedChargeSOL:paidCount/10000*0.01,
  rows:[...trades.entries()].map(([mint,arr])=>{
    const active=arr.filter(x=>x.time>=now-DAY);trades.set(mint,active);
    const buy=active.filter(x=>x.side==="buy"),sell=active.filter(x=>x.side==="sell");
    const sum=x=>Number(x.reduce((s,t)=>s+t.sol,0).toFixed(6));
    const buySOL=sum(buy),sellSOL=sum(sell);
    return {mint,symbol:byMint.get(mint)?.symbol||"?",buySOL,sellSOL,volumeSOL:buySOL+sellSOL,netSOL:Number((buySOL-sellSOL).toFixed(6)),buys:buy.length,sells:sell.length,firstObserved:active[0]?.time?new Date(active[0].time).toISOString():null};
  }).sort((a,b)=>b.volumeSOL-a.volumeSOL).slice(0,50)};
}
