// Research-only opportunity assessment: unavailable evidence never becomes a favorable score.
export function assessPump(evidence){
 const holder=evidence?.holder||{},bundler=evidence?.bundler||{},sniper=evidence?.sniper||{};
 const complete=holder.top10Pct!=null&&holder.top20Pct!=null;
 const top10=complete?Number(holder.top10Pct):null;
 const indicators=[
 {name:"Top holders",status:complete?"OBSERVED_PARTIAL":"UNVERIFIED",value:top10,weight:20},
 {name:"Bundler cluster",status:bundler.status||"UNVERIFIED",weight:20},
 {name:"Sniper sell pressure",status:sniper.status||"UNVERIFIED",weight:15},
 {name:"Developer and smart money",status:"UNVERIFIED",weight:15},
 {name:"BUY/SELL transaction volume",status:"UNVERIFIED",weight:20},
 {name:"Price momentum and liquidity",status:"UNVERIFIED",weight:10}
 ];
 const observedWeight=complete?20:0;
 // Score is intentionally withheld until every material market dimension can be verified.
 return {engine:"Pump.fun AI Pump Analysis",method:"evidence gated / no synthetic probabilities",
  decision:"WAIT",tradeAllowed:false,score:null,scoreStatus:"INSUFFICIENT_EVIDENCE",
  observedWeight,requiredWeight:100,indicators,top10ObservedPct:top10,
  reasons:["Holder balances are only a sampled account ranking, not a full owner/cluster census.",
    "Bundler and sniper launch trades are unverified.",
    "Live trade flow, price/market cap history, smart money and verified liquidity are missing."],
  riskFlags:[
    ...(top10!==null&&top10>50?["High observed top-10 account concentration >50%; not a standalone sell trigger"]:[]),
    ...(evidence?.errors||[]).map(e=>"Provider: "+String(e).slice(0,130))
  ],
  buy:{status:"WAIT",entry:null,reason:"All mandatory evidence gates not complete"},
  sell:{status:"NOT_EVALUABLE",reason:"No verified position, distribution/trade flow or price history"},
  targets:["2X","3X","5X","10X"].map(x=>({multiple:x,probability:null,status:"UNVERIFIED",sampleSize:0})),
  horizons:["1H","6H","24H","7D"],autoTrade:false,
  disclaimer:"No validated pump/dump probability. BUY/SELL and 2X–10X require observed trade/price history and forward-tested calibration."
 };
}
