// Pump.fun-only 24-hour observation, never represented as an official Pump.fun ranking.
// Uses already observed launch feed. No paid trade subscriptions, no JWT.
import {getState} from "./pumpfeed.js";
let cached={at:0,data:null};
export async function scanTrending(){
 const now=Date.now();
 if(cached.data&&now-cached.at<15000)return cached.data;
 const feed=getState(),cutoff=now-86400000;
 const tokens=(feed.items||[]).filter(t=>Date.parse(t.createdAt)>=cutoff);
 const rows=tokens.map(t=>({
  mint:t.mint,symbol:t.symbol,name:t.name,creator:t.creator,
  createdAt:t.createdAt,marketCapSol:t.marketCapSol??null,
  initialBuy:t.initialBuy??null,solAmount:t.solAmount??null,
  volume24h:null,trades24h:null,buys24h:null,sells24h:null,
  rankBasis:"MOST_RECENT_OBSERVED_LAUNCH",observedOnly:true
 })).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,100);
 const result={status:feed.status==="CONNECTED"?"PARTIAL":"UNAVAILABLE",
   source:"PumpPortal subscribeNewToken (free) + Helius separate security evidence",
   ranking:"RECENT_LAUNCHES_ONLY",rankingByVolume:false,
   volumeVerified:false,complete24h:false,
   note:"The feed has no paid trade subscription; ranking by 24H volume or BUY/SELL flow cannot be verified. List shows recently observed launches only. In-memory cache may reset on redeploy.",
   windowStart:new Date(cutoff).toISOString(),updatedAt:new Date(now).toISOString(),
   tokens:rows,coverageCount:rows.length,
   error:feed.status==="CONNECTED"?null:feed.lastError||"PumpPortal disconnected"};
 cached={at:now,data:result};return result;
}
