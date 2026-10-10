import test from "node:test";
import assert from "node:assert/strict";
import {decideSignal} from "../server/signal.js";
const base={liquidity:450000};
test("Missing security evidence stays WAIT",()=>{
 const d=decideSignal(base,null);
 assert.equal(d.status,"WAIT");
 assert.equal(d.eligible,false);
 assert.equal(d.recommendedTpX,null);
});
test("Under minimum liquidity REJECT",()=>assert.equal(decideSignal({liquidity:99999},null).status,"NO BUY"));
test("Holder >2.5% is NO BUY",()=>{
 const d=decideSignal(base,{holders:{status:"REJECT"}});
 assert.equal(d.status,"NO BUY");
});
test("Critical honeypot blocks BUY",()=>assert.equal(decideSignal(base,{honeypot:{status:"CRITICAL"}}).status,"NO BUY"));
test("High activity score cannot override mandatory verification",()=>{
 const d=decideSignal(base,{holders:{status:"PASS"},security:{status:"PASS"},honeypot:{status:"PASS"}},
 {timeframes:{M5:{status:"OBSERVED"}},suggestion:{entry:0.1,stopLoss:0.08}},99);
 assert.equal(d.status,"WAIT");
});
test("Fully verified synthetic fixture can pass all gates",()=>{
 const inspection=Object.fromEntries(["holders","security","honeypot","bundler","sniper","walletClustering","smartMoney","social","liquidityLock"]
 .map(k=>[k,{status:"PASS"}]));
 const analysis={timeframes:{M5:{status:"OBSERVED"}},suggestion:{entry:0.1,stopLoss:0.08}};
 const cal={verified:true,horizon:"30D",recommendedTpX:3,probability:0.45};
 const d=decideSignal(base,inspection,analysis,90,cal);
 assert.equal(d.status,"BUY SPECULATIVE");
 assert.equal(d.recommendedTpX,3);
 assert.equal(d.entry,0.1);
});
test("Large locked synthetic fixture requires lock pass",()=>{
 const full=Object.fromEntries(["holders","security","honeypot","bundler","sniper","walletClustering","smartMoney","social","liquidityLock"]
 .map(k=>[k,{status:"PASS"}]));
 const analysis={timeframes:{M5:{status:"OBSERVED"}},suggestion:{entry:0.1,stopLoss:0.08}};
 assert.equal(decideSignal({liquidity:1500000},full,analysis,92,{verified:true,horizon:"30D",recommendedTpX:2,probability:0.4}).status,"BUY");
 delete full.liquidityLock;
 assert.equal(decideSignal({liquidity:1500000},full,analysis,92,{verified:true,horizon:"30D",recommendedTpX:2,probability:0.4}).status,"WAIT");
});