import test from "node:test";
import assert from "node:assert/strict";
import {inspectEvm,inspectExactEvmV2Pool,parseTransferLogs,graphEvidence} from "../server/evm.js";

const token={
  id:"eth:0x1111111111111111111111111111111111111111",
  tokenAddress:"0x1111111111111111111111111111111111111111",
  poolAddress:"0x2222222222222222222222222222222222222222",
  network:"eth",liquidity:1500000
};
const zero="0x0000000000000000000000000000000000000000";
const dead="0x000000000000000000000000000000000000dead";
const address32=a=>"0x"+"0".repeat(24)+a.slice(2);
const reply=result=>new Response(JSON.stringify({jsonrpc:"2.0",id:1,result}),{status:200});
const lpEncoded=s=>"0x"+"0".repeat(24)+s.slice(2);
test("Transfer logs count only canonical ERC20 Transfer events",()=>{
 const parsed=parseTransferLogs([{
  topics:["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    address32("0x3333333333333333333333333333333333333333"),
    address32("0x4444444444444444444444444444444444444444")],
  data:"0x64",blockNumber:"0x10",transactionHash:"0xabc"
 }]);
 assert.equal(parsed.length,1);assert.equal(parsed[0].value,"100");
 assert.equal(parseTransferLogs([{topics:["0xdead"],data:"0x1",blockNumber:"0x10"}]).length,0);
});
test("Shared funding is only UNVERIFIED graph evidence",()=>{
 const transfer=[
  {from:"0x333",to:"0x444",blockNumber:10,txHash:"tx1"},
  {from:"0x333",to:"0x555",blockNumber:10,txHash:"tx2"}
 ];
 const result=graphEvidence(transfer,"0x222");
 assert.equal(result.walletClustering.status,"UNVERIFIED");
 assert.equal(result.bundler.status,"UNVERIFIED");
 assert.equal(result.walletClustering.sharedFundingCandidates[0].recipientCount,2);
});
test("Alchemy EVM recent holders are observed, not a verified complete census",async()=>{
 const prev=globalThis.fetch;
 const owner="0x3333333333333333333333333333333333333333";
 try{
  globalThis.fetch=async(url,opts)=>{
   assert.ok(url.startsWith("https://eth-mainnet.g.alchemy.com/v2/"));
   const body=JSON.parse(opts.body);
   if(body.method==="eth_blockNumber")return reply("0x100");
   if(body.method==="eth_call"){
     if(body.params[0].data==="0x18160ddd")return reply("0x64");
     return reply("0x03");
   }
   if(body.method==="eth_getLogs")return reply([{
      topics:["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      address32(zero),address32(owner)],
      data:"0x03",blockNumber:"0x100",transactionHash:"0xabc"
    }]);
   throw Error("unexpected "+body.method);
  };
  const d=await inspectEvm(token,{key:"fakeKey"});
  assert.equal(d.status,"OBSERVED");
  assert.equal(d.holders.status,"UNVERIFIED");
  assert.equal(d.holders.topObservedPct,3);
  assert.equal(d.blocksInspected,10);
  assert.equal(d.walletClustering.status,"UNVERIFIED");
 }finally{globalThis.fetch=prev}
});
test("LP burn evidence passes ONLY for exact V2 pool with 100% burned supply",async()=>{
 const prev=globalThis.fetch;
 try{
   globalThis.fetch=async(url,opts)=>{
     const body=JSON.parse(opts.body);
     const data=body.params[0].data;
     if(data==="0x0dfe1681")return reply(lpEncoded(token.tokenAddress));
     if(data==="0xd21220a7")return reply(lpEncoded("0x4444444444444444444444444444444444444444"));
     if(data==="0x18160ddd")return reply("0x64");
     if(data.includes(dead.slice(2)))return reply("0x64");
     return reply("0x0");
   };
   const x=await inspectExactEvmV2Pool(token,{key:"fake"});
   assert.equal(x.status,"PASS");
   assert.equal(x.burnedPct,100);
   const small=await inspectExactEvmV2Pool({...token,liquidity:450000},{key:"fake"});
   assert.equal(small.status,"UNVERIFIED");
 }finally{globalThis.fetch=prev}
});
test("A different token's pool cannot be treated as verified lock",async()=>{
 const prev=globalThis.fetch;
 try{
  globalThis.fetch=async(url,opts)=>{
    const data=JSON.parse(opts.body).params[0].data;
    if(data==="0x0dfe1681")return reply(lpEncoded("0x8888888888888888888888888888888888888888"));
    if(data==="0xd21220a7")return reply(lpEncoded("0x7777777777777777777777777777777777777777"));
    return reply("0x64");
  };
  assert.equal((await inspectExactEvmV2Pool(token,{key:"fake"})).status,"UNVERIFIED");
 }finally{globalThis.fetch=prev}
});
