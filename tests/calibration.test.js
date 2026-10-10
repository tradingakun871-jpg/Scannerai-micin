import test from "node:test";
import assert from "node:assert/strict";
import {fitCalibration} from "../server/calibration.js";
test("No probability emitted with insufficient 30D forward samples",()=>{
 const report=fitCalibration([{first_seen:"2026-01-01",observed_at:"2026-01-31",first_price:1,max_price:5,first_phase:"ACCUMULATION"}],"ACCUMULATION");
 assert.equal(report.verified,false);assert.equal(report.samples,1);
});
test("No probability on empty data",()=>assert.equal(fitCalibration([],"ACCUMULATION").verified,false));
