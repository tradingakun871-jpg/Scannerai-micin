// Offline-style time-split statistical calibration from real first-seen cohorts.
// Never outputs a per-token probability before complete 30-day observations and holdout validation.
const targets=[1.5,2,3,5,10,25];
const finite=n=>Number.isFinite(Number(n))?Number(n):0;
export function fitCalibration(cohorts,phase){
  const rows=(Array.isArray(cohorts)?cohorts:[]).filter(x=>{
    const base=finite(x.first_price),peak=finite(x.max_price);
    return base>0&&peak>=base&&x.observed_at&&x.first_seen;
  }).sort((a,b)=>Date.parse(a.first_seen)-Date.parse(b.first_seen));
  const unavailable=(why,extra={})=>({verified:false,status:"INSUFFICIENT_FORWARD_DATA",reason:why,
    samples:rows.length,requiredSamples:400,holdoutTested:false,horizon:"30D",...extra});
  if(rows.length<400)return unavailable("Minimal 400 completed 30D cohorts required before calibration");
  // Prevent data leakage: time-ordered 75% train, 25% true unseen forward window.
  const split=Math.floor(rows.length*.75);
  const train=rows.slice(0,split),test=rows.slice(split);
  const trainPhase=train.filter(x=>x.first_phase===phase);
  const testPhase=test.filter(x=>x.first_phase===phase);
  if(trainPhase.length<90||testPhase.length<30)
    return unavailable("Insufficient same-phase train/forward samples",{trainSample:trainPhase.length,forwardSample:testPhase.length});
  const results={};let valid=true;
  for(const multiple of targets){
    const hit=x=>finite(x.max_price)/finite(x.first_price)>=multiple?1:0;
    const hits=trainPhase.reduce((s,r)=>s+hit(r),0);
    const p=(hits+1)/(trainPhase.length+2); // Laplace smoothing
    const brier=testPhase.reduce((s,r)=>s+(p-hit(r))**2,0)/testPhase.length;
    const globalHits=train.reduce((s,r)=>s+hit(r),0);
    const baseline=(globalHits+1)/(train.length+2);
    const baseBrier=testPhase.reduce((s,r)=>s+(baseline-hit(r))**2,0)/testPhase.length;
    const forwardRate=testPhase.reduce((s,r)=>s+hit(r),0)/testPhase.length;
    const ece=Math.abs(p-forwardRate);
    if(brier>baseBrier+.015||ece>.12)valid=false;
    results[String(multiple)]={
      multiplier:multiple,probability:+p.toFixed(4),
      forwardHitRate:+forwardRate.toFixed(4),forwardBrier:+brier.toFixed(4),
      baselineBrier:+baseBrier.toFixed(4),calibrationError:+ece.toFixed(4)
    };
  }
  // Higher-X outcomes must never have higher estimated probabilities than lower-X outcomes.
  for(let i=1;i<targets.length;i++){
    if(results[String(targets[i])].probability>results[String(targets[i-1])].probability)valid=false;
  }
  if(!valid)return unavailable("Out-of-sample probability calibration failed; no trading TP recommendation",
    {trainSample:trainPhase.length,forwardSample:testPhase.length,models:results});
  const options=Object.values(results).map(x=>({...x,expectedUtility:x.probability*x.multiplier-1}))
    .filter(x=>x.probability>=.1).sort((a,b)=>b.expectedUtility-a.expectedUtility);
  const best=options[0];
  if(!best||best.expectedUtility<=0)return unavailable("No target has positive benchmark utility after validation",
    {trainSample:trainPhase.length,forwardSample:testPhase.length,models:results});
  return {
    verified:true,status:"FORWARD_CALIBRATED_EMPIRICAL",horizon:"30D",
    samples:rows.length,trainSample:trainPhase.length,forwardSample:testPhase.length,
    recommendedTpX:best.multiplier,probability:best.probability,models:results,
    warning:"Historical touch probability, not a guarantee of sell execution, liquidity or profit. Explicit live forward validation is still recommended."
  };
}
