import {getJson} from "./intelligence.js";
const cache=new Map();
const defs=[["M5","minute",5],["M15","minute",15],["H1","hour",1],["H4","hour",4]];
const num=x=>Number.isFinite(Number(x))?Number(x):0;
export async function technicalAnalysis(token){
  if(!token?.poolAddress||!token.network)throw Error("Pool tidak dikenal");
  const hit=cache.get(token.id);
  if(hit&&Date.now()-hit.at<10*60*1000)return hit.data;
  const items=await Promise.allSettled(defs.map(async([tf,unit,ag])=>{
    const url="https://api.geckoterminal.com/api/v2/networks/"+token.network+"/pools/"+encodeURIComponent(token.poolAddress)+"/ohlcv/"+unit+
      "?aggregate="+ag+"&limit=65&currency=usd&token=base";
    const data=await getJson(url,{},9000);
    const bars=(data.data?.attributes?.ohlcv_list||[]).map(row=>({t:Number(row[0]),o:num(row[1]),h:num(row[2]),l:num(row[3]),c:num(row[4]),v:num(row[5])}))
      .filter(x=>x.t&&x.h>=x.l&&x.c>0).sort((a,b)=>a.t-b.t);
    if(bars.length<14) return {tf,status:"INSUFFICIENT_DATA",bars:bars.length};
    const recent=bars.slice(-14,-1),last=bars.at(-1);
    const support=Math.min(...recent.map(x=>x.l)),resistance=Math.max(...recent.map(x=>x.h));
    const avgVol=recent.reduce((s,x)=>s+x.v,0)/recent.length;
    const breaks=last.c>resistance&&last.v>avgVol*1.15;
    const zone=last.c>=support&&last.c<=resistance;
    const atr=bars.slice(-14).reduce((s,x)=>s+(x.h-x.l),0)/14;
    return {tf,status:"OBSERVED",bars:bars.length,lastCandleAt:new Date(last.t*1000).toISOString(),
      close:last.c,support,resistance,atr,relativeVolume:avgVol>0?+(last.v/avgVol).toFixed(2):null,
      structure:breaks?"BREAKOUT":last.c<support?"BREAKDOWN":zone?"RANGE / RETEST":"EXTENSION"};
  }));
  const reports=Object.fromEntries(defs.map(([name],i)=>[name,items[i].status==="fulfilled"?items[i].value:{tf:name,status:"UNAVAILABLE",reason:items[i].reason?.message}]));
  const small=reports.M5,large=reports.H1;
  let suggestion=null;
  if(small.status==="OBSERVED"&&large.status==="OBSERVED"){
    const entry=small.close;
    const sl=Math.min(small.support,entry-1.5*small.atr);
    if(entry>sl&&entry>0){
      const riskPct=(entry-sl)/entry*100;
      const marketCap=Number(token.marketCap||token.fdv)||null;
      const horizon={ "24H":1.5, "7D":2, "30D":5 }; // Scenario only; not forecast.
      suggestion={
        status:"RESEARCH_SCENARIO_ONLY",method:"M5 structure + H1 context",entry,stopLoss:sl,
        riskPct:+riskPct.toFixed(2),marketCap,scenarioMultipliers:Object.entries(horizon).map(([time,x])=>({horizon:time,multiplier:x,targetPrice:+(entry*x).toPrecision(8),probability:null})),
        recommendedTpX:null,probability:null,
        reason:"Kalkulasi area SL dan skenario harga; belum ada model probabilitas terkalibrasi atau validasi BUY."
      };
    }
  }
  const result={tokenId:token.id,evaluatedAt:new Date().toISOString(),timeframes:reports,suggestion};
  cache.set(token.id,{at:Date.now(),data:result});
  return result;
}
