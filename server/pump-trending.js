import {isAddress} from "./pumpfeed.js";
const API="https://frontend-api-v3.pump.fun/coins";
let cache={status:"INITIALIZING",updatedAt:null,source:"Pump.fun coins 24H",tokens:[],error:null};
let flight=null;
export async function scanTrending(force=false){
 if(flight)return flight;
 if(!force&&cache.updatedAt&&Date.now()-Date.parse(cache.updatedAt)<300000)return cache;
 flight=(async()=>{
  const jwt=process.env.PUMPFUN_BEARER_TOKEN;
  if(!jwt){cache={...cache,status:"AUTH_REQUIRED",updatedAt:new Date().toISOString(),tokens:[],error:"Pump.fun listing API memerlukan PUMPFUN_BEARER_TOKEN. PumpPortal key tidak berlaku untuk listing ini."};return cache;}
  try{
   const url=new URL(API);
   for(const [k,v] of Object.entries({limit:"50",offset:"0",sort:"volume_24h",order:"DESC",searchTerm:"",includeNsfw:"false",complete:"false"}))url.searchParams.set(k,v);
   const response=await fetch(url,{headers:{Authorization:"Bearer "+jwt,Accept:"application/json"},signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error("Pump.fun HTTP "+response.status);
   const raw=await response.json();const rows=Array.isArray(raw)?raw:Array.isArray(raw?.coins)?raw.coins:Array.isArray(raw?.data)?raw.data:[];
   if(!Array.isArray(rows)||!rows.length)throw Error("Empty or unsupported Pump.fun response");
   const tokens=rows.map(t=>({
     mint:String(t.mint||t.token_address||""),name:String(t.name||"").slice(0,120),
     symbol:String(t.symbol||"").slice(0,32),
     volume24h:Number.isFinite(Number(t.volume_24h))?Number(t.volume_24h):null,
     marketCapSol:Number.isFinite(Number(t.market_cap))?Number(t.market_cap):null,
     creator:String(t.creator||""),
     source:"Pump.fun listing API"
   })).filter(t=>isAddress(t.mint));
   cache={status:tokens.length?"LIVE":"EMPTY",updatedAt:new Date().toISOString(),source:"Pump.fun coins listing sorted by provider-reported 24H volume",tokens:tokens.slice(0,50),error:null};
  }catch(e){cache={status:"UNAVAILABLE",updatedAt:new Date().toISOString(),source:"Pump.fun coins listing",tokens:[],error:String(e.message).slice(0,160)}}
  return cache;
 })();
 try{return await flight}finally{flight=null}
}
export function trendingStatus(){return cache}
