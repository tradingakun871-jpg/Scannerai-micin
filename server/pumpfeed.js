import WebSocket from "ws";

// PumpPortal is an independent data provider for Pump.fun, not Pump.fun itself.
// Never convert token creation events to eligible BUY decisions.
const MAX_EVENTS=250;
const recent=[];
let socket=null,retryTimer=null,stopped=false;
let state={status:"NOT_CONFIGURED",connectedAt:null,lastEventAt:null,lastError:null,reconnects:0,received:0};
const validMint=x=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(x||""));
export function pumpStatus(){
  return {...state,provider:"PumpPortal",feed:"Pump.fun new tokens",events:[...recent].reverse(),autoTrade:false,securityVerified:false};
}
function retry(){
  if(stopped||retryTimer)return;
  retryTimer=setTimeout(()=>{retryTimer=null;connect();},Math.min(60000,5000*(1+state.reconnects)));
  retryTimer.unref?.();
}
function connect(){
  const key=process.env.PUMPPORTAL_API_KEY;
  if(!key){state.status="NOT_CONFIGURED";state.lastError="Set PUMPPORTAL_API_KEY in Railway Variables";return;}
  state.status="CONNECTING";
  try{
    socket=new WebSocket("wss://pumpportal.fun/api/data?api-key="+encodeURIComponent(key),{handshakeTimeout:12000});
    socket.on("open",()=>{
      state.status="CONNECTED";state.connectedAt=new Date().toISOString();state.lastError=null;
      socket.send(JSON.stringify({method:"subscribeNewToken"}));
    });
    socket.on("message",raw=>{
      try{
        const e=JSON.parse(String(raw));
        const mint=e.mint||e.tokenAddress;
        if(!validMint(mint))return;
        if(recent.some(x=>x.mint===mint))return;
        const token={mint,symbol:String(e.symbol||"UNKNOWN").slice(0,32),name:String(e.name||"Unknown").slice(0,120),
          creator:String(e.traderPublicKey||e.creator||"").slice(0,60),
          signature:String(e.signature||"").slice(0,110),
          receivedAt:new Date().toISOString(),source:"PumpPortal / Pump.fun",
          status:"WAIT",reason:"New launch only — liquidity, holders, bundler, sniper, social, contract, smart money and LP proof UNVERIFIED"};
        recent.push(token);if(recent.length>MAX_EVENTS)recent.shift();
        state.lastEventAt=token.receivedAt;state.received++;
      }catch{/* Ignore malformed frames */}
    });
    socket.on("error",e=>{state.lastError=String(e.message||"websocket error").slice(0,180);});
    socket.on("close",()=>{state.status="DISCONNECTED";state.reconnects++;retry();});
  }catch(e){state.status="DISCONNECTED";state.lastError=String(e.message).slice(0,180);state.reconnects++;retry();}
}
export function startPumpFeed(){stopped=false;connect();}
