// Exact locked Blueprint V2.0 weights. Unknown data never silently becomes a zero or a positive.
const clamp=(x,min=0,max=100)=>Math.min(max,Math.max(min,Number(x)||0));
const verified=x=>x?.status==="PASS";
export function computeOpportunity(token,inspection){
  const totalTrades=(Number(token.buys)||0)+(Number(token.sells)||0);
  const priceChange=Number(token.change24h)||0,volume=Number(token.volume24h)||0;
  const momentum=clamp((priceChange+12)*1.45)*.25;
  const volRatio=token.liquidity>0?volume/token.liquidity:0;
  const pressure=totalTrades>0?token.buys/totalTrades:0;
  const volumeScore=clamp(volRatio*22+pressure*46)*.25;
  const holder=verified(inspection?.holders)?clamp((2.5-(inspection.holders.topObservedPct||0))/2.5*100)*.2:null;
  const social=verified(inspection?.social)&&Number.isFinite(inspection.social.score)?clamp(inspection.social.score)*.2:null;
  const smartMoney=verified(inspection?.smartMoney)&&Number.isFinite(inspection.smartMoney.score)?clamp(inspection.smartMoney.score)*.1:null;
  const components={
    "Trending & Momentum":{weight:25,points:Math.round(momentum*10)/10,verified:true},
    "Volume & Buy Pressure":{weight:25,points:Math.round(volumeScore*10)/10,verified:totalTrades>0},
    "Holder Distribution":{weight:20,points:holder,verified:holder!==null},
    "Social Sentiment":{weight:20,points:social,verified:social!==null},
    "Smart Money":{weight:10,points:smartMoney,verified:smartMoney!==null}
  };
  const complete=Object.values(components).every(x=>x.verified);
  const verifiedPoints=Object.values(components).reduce((sum,x)=>sum+(x.verified?x.points||0:0),0);
  const verifiedMax=Object.values(components).reduce((sum,x)=>sum+(x.verified?x.weight:0),0);
  return {
    status:complete?"COMPLETE":"PARTIAL",
    opportunityScore:complete?Math.round(verifiedPoints):null,
    verifiedPoints:Math.round(verifiedPoints*10)/10,
    verifiedMax,components,
    reason:complete?"All 5 weight components verified":"Score pending: holder, social and smart money evidence incomplete"
  };
}
