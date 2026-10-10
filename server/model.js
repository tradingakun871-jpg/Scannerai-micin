import {getCalibrationCohorts} from "./store.js";
import {fitCalibration} from "./calibration.js";
let cache=null;
export async function calibratedFor(token){
  if(!cache||Date.now()-cache.at>30*60*1000){
    const cohorts=await getCalibrationCohorts();
    cache={at:Date.now(),...cohorts};
  }
  if(cache.error)return {verified:false,status:"DATABASE_UNAVAILABLE",reason:cache.error,horizon:"30D"};
  if(cache.total<400)return {verified:false,status:"COLLECTING_FORWARD_DATA",
    reason:"Waiting for at least 400 completed 30D cohorts; current matured "+cache.total,
    sampleCount:cache.total,coverage:cache.coverage,horizon:"30D"};
  if(cache.coverage<.9)return {verified:false,status:"MISSING_COHORT_BIAS",
    reason:"Fewer than 90% of matured cohorts have reliable 30D observations. Do not exclude delisted tokens.",
    sampleCount:cache.total,coverage:cache.coverage,horizon:"30D"};
  return fitCalibration(cache.rows,token?.phase||"UNKNOWN");
}
export async function modelSummary(){
  const result=await calibratedFor({phase:"ACCUMULATION"});
  return {model:"Time-split empirical multiplier calibration",...result};
}
