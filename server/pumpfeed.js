import WebSocket from "ws";
const LIMIT=300, events=[], byMint=new Map();
let ws=null,retry=null,tries=0;
const stats={status:"INITIALIZING",connectedAt:null,lastEventAt:null,lastError:null,received:0};
const isAddress=s=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s||""));
function connect(){
 const key=process.env.PUMPPORTAL_API_KEY;
 if(!key){stats.status="NOT_CONFIGURED";stats.lastError="PUMPPORTAL_API_KEY belum diatur";return;}
 stats.status="CONNECTING";
 ws=new WebSocket("wss://pumpportal.fun/api/data?api-key="+encodeURIComponent(key),{handshakeTimeout:12000});
 ws.on("open",()=>{tries=0;stats.status="CONNECTED";stats.lastError=null;stats.connectedAt=new Date().toISOString();ws.send(JSON.stringify({method:"subscribeNewToken"}));});
 ws.on("message",raw=>{try{
  const d=JSON.parse(String(raw)),mint=String(d.mint||"");
  if(!isAddress(mint)||byMint.has(mint))return;
  const item={mint,name:String(d.name||"Unknown").slice(0,100),symbol:String(d.symbol||"UNKNOWN").slice(0,25),
    creator:isAddress(d.traderPublicKey)?d.traderPublicKey:null,signature:String(d.signature||"").slice(0,110),
    createdAt:new Date().toISOString(),initialBuy:Number.isFinite(Number(d.initialBuy))?Number(d.initialBuy):null,
    solAmount:Number.isFinite(Number(d.solAmount))?Number(d.solAmount):null,marketCapSol:Number.isFinite(Number(d.marketCapSol))?Number(d.marketCapSol):null,
    source:"PumpPortal: Pump.fun launch",signal:"WAIT",risk:"UNVERIFIED"};
  byMint.set(mint,item);events.unshift(item);if(events.length>LIMIT){const old=events.pop();byMint.delete(old.mint)}
  stats.lastEventAt=item.createdAt;stats.received++;
 }catch(e){console.warn("[pump-event] malformed payload");}});
 ws.on("error",e=>{stats.lastError=String(e.message).slice(0,150)});
 ws.on("close",()=>{stats.status="DISCONNECTED";if(retry)clearTimeout(retry);retry=setTimeout(connect,Math.min(60000,5000*++tries));retry.unref?.()});
}
export function start(){connect()}
export function getState(){return {...stats,count:events.length,items:events.slice(0,100),source:"PumpPortal",tradeStreamEnabled:false,autoTrade:false}}
export function getToken(mint){return byMint.get(mint)}
export {isAddress};
