import test from "node:test";
import assert from "node:assert/strict";
import {summarizePipeline} from "../server/pipeline.js";
const token={id:"eth:0x123",network:"eth",symbol:"DEMO",liquidity:450000};
test("Pipeline without market or inspected token fails closed and says NOT CHECKED",()=>{
 const result=summarizePipeline({tokens:[token],sourceStatus:"UNKNOWN",provider:{provider:"openai",configured:false}});
 assert.equal(result.overall,"FAIL CLOSED");
 assert.equal(result.gates.liquidity.status,"NOT CHECKED");
 assert.equal(result.gates.holder.status,"NOT CHECKED");
 assert.equal(result.gates.wallet.status,"NOT CHECKED");
 assert.equal(result.gates.socialAI.status,"WAITING");
 assert.equal(result.coverage.inspected,0);
});
test("Partial blockchain evidence updates three pipeline stages without fake PASS",()=>{
 const insp={
  inspectedAt:"2026-10-10T04:00:00.000Z",
  liquidityLock:{status:"UNVERIFIED",exactPoolEvidence:{status:"UNVERIFIED"}},
  holders:{status:"UNVERIFIED",accountsInspected:4000,topObservedPct:1.6},
  bundler:{status:"UNVERIFIED",sameBlockTransactionPeak:3},
  sniper:{status:"UNVERIFIED"},walletClustering:{status:"UNVERIFIED"},
  social:{status:"INSUFFICIENT_DATA"}
 };
 const result=summarizePipeline({tokens:[{...token,inspection:insp}],sourceStatus:"LIVE",
 provider:{provider:"openai",configured:true},aiSuccessAt:"2026-10-10T04:02:00.000Z"});
 assert.equal(result.gates.market.status,"ACTIVE");
 assert.equal(result.gates.liquidity.status,"PARTIAL");
 assert.equal(result.gates.holder.status,"PARTIAL");
 assert.equal(result.gates.wallet.status,"PARTIAL");
 assert.equal(result.gates.socialAI.status,"PARTIAL");
 assert.match(result.gates.socialAI.detail,/OpenAI berhasil/);
 assert.equal(result.overall,"FAIL CLOSED");
 assert.deepEqual(result.coverage,{total:1,inspected:1,lpPass:0,holderPass:0});
});
test("Explicit focus selects token, but partial source and missing checks remain visible",()=>{
 const checked={...token,id:"eth:0x456",symbol:"CHECKED",inspection:{
  inspectedAt:"2026-10-10T03:40:00.000Z",holders:{status:"UNVERIFIED",sampledCount:10},
  liquidityLock:{status:"PASS"},bundler:{status:"UNVERIFIED"},sniper:{status:"UNVERIFIED"}
 }};
 const p=summarizePipeline({tokens:[token,checked],focusId:token.id,sourceStatus:"PARTIAL",provider:{configured:true,provider:"openai"}});
 assert.equal(p.basis.id,token.id);
 assert.equal(p.gates.market.status,"PARTIAL");
 assert.equal(p.gates.holder.status,"NOT CHECKED");
 assert.equal(p.coverage.inspected,1);
 const inspected=summarizePipeline({tokens:[token,checked],sourceStatus:"LIVE"});
 assert.equal(inspected.basis.id,checked.id);
 assert.equal(inspected.gates.liquidity.status,"PASS");
 assert.equal(inspected.overall,"FAIL CLOSED");
});
