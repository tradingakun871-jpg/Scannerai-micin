// Central immutable Blueprint V2.0 decision gate. Never trust an LLM to approve an unverified check.
const pass=s=>s?.status==="PASS";
const critical=s=>["CRITICAL","REJECT"].includes(s?.status);
export function decideSignal(token,inspection,technical,aiScore=null,modelCalibration=null){
  const reasons=[];
  const checks={
    liquidityAmount:token.liquidity>=100000,
    liquidityLock:pass(inspection?.liquidityLock),
    holder:pass(inspection?.holders),
    contract:pass(inspection?.security)&&pass(inspection?.honeypot),
    bundler:pass(inspection?.bundler),
    sniper:pass(inspection?.sniper),
    walletClustering:pass(inspection?.walletClustering),
    smartMoney:pass(inspection?.smartMoney),
    social:pass(inspection?.social),
    technical:["OBSERVED"].every(v=>technical?.timeframes?.M5?.status===v)&&Boolean(technical?.suggestion),
    opportunity:Number.isFinite(aiScore)&&aiScore>=80,
    calibratedTp:Boolean(modelCalibration?.verified&&modelCalibration?.horizon)
  };
  if(token.liquidity<100000)reasons.push("LIQUIDITY_BELOW_100K");
  if(token.liquidity<=1000000&&!pass(inspection?.liquidityLock))reasons.push("UNLOCKED_LP_NOT_VERIFIED");
  if(token.liquidity>1000000&&!pass(inspection?.liquidityLock))reasons.push("LOCKED_LP_NOT_VERIFIED");
  for(const [name,ok] of Object.entries(checks))if(!ok)reasons.push("CHECK_INCOMPLETE_"+name.toUpperCase());
  const hardRisk=critical(inspection?.holders)||critical(inspection?.security)||critical(inspection?.honeypot)||critical(inspection?.bundler)||critical(inspection?.sniper);
  const status=hardRisk||token.liquidity<100000?"NO BUY":reasons.length?"WAIT":token.liquidity<=1000000?"BUY SPECULATIVE":"BUY";
  return {status,eligible:status.startsWith("BUY"),reasons:[...new Set(reasons)],checks,
    entry:status.startsWith("BUY")?technical.suggestion.entry:null,
    sl:status.startsWith("BUY")?technical.suggestion.stopLoss:null,
    recommendedTpX:status.startsWith("BUY")?modelCalibration?.recommendedTpX||null:null,
    probability:status.startsWith("BUY")?modelCalibration?.probability||null:null};
}
