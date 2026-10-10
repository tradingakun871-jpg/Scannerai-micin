import test from "node:test";
import assert from "node:assert/strict";
import {inspectToken,cachedInspection} from "../server/intelligence.js";

test("Completed security inspections remain cached instead of disappearing",async()=>{
  const prevFetch=globalThis.fetch;
  const prevAlchemy=process.env.ALCHEMY_API_KEY;
  const prevRoutescan=process.env.ROUTESCAN_API_KEY;
  const prevGoPlus=process.env.GOPLUS_ACCESS_TOKEN;
  const token={
    id:"eth:0x7777777777777777777777777777777777777777",
    network:"eth",symbol:"TEST",
    tokenAddress:"0x7777777777777777777777777777777777777777",
    poolAddress:"0x2222222222222222222222222222222222222222",
    liquidity:450000,createdAt:"2026-10-10T00:00:00Z"
  };
  let count=0;
  try{
    delete process.env.ALCHEMY_API_KEY;
    delete process.env.ROUTESCAN_API_KEY;
    delete process.env.GOPLUS_ACCESS_TOKEN;
    globalThis.fetch=async(url)=>{
      count++;
      const uri=String(url);
      if(uri.includes("gopluslabs"))return new Response(JSON.stringify({
        code:1,result:{"0x7777777777777777777777777777777777777777":{
          is_honeypot:"0",is_mintable:"0",holders:[],lp_holders:[]
        }}
      }),{status:200});
      if(uri.includes("honeypot.is"))return new Response(JSON.stringify({
        honeypotResult:{isHoneypot:false},simulationSuccess:true,
        simulationResult:{buyTax:0,sellTax:0}
      }),{status:200});
      if(uri.includes("routescan"))return new Response(JSON.stringify({items:[]}),{status:200});
      if(uri.includes("apewisdom"))return new Response(JSON.stringify({results:[]}),{status:200});
      throw Error("Unexpected URL "+uri.replace(/\/v2\/[^/]+/,"/v2/redacted"));
    };
    const first=await inspectToken(token);
    assert.equal(first.security.status,"PARTIAL");
    assert.equal(first.honeypot.status,"PARTIAL");
    assert.equal(first.liquidityLock.status,"UNVERIFIED");
    assert.equal(first.holders.status,"UNVERIFIED");
    assert.equal(first.buyStatus,"WAIT");
    assert.ok(cachedInspection(token.id));
    const after=count;
    const next=await inspectToken(token);
    assert.equal(next.inspectedAt,first.inspectedAt);
    assert.equal(count,after,"cached inspection must not re-fetch provider data");
  }finally{
    globalThis.fetch=prevFetch;
    for(const [name,value] of [["ALCHEMY_API_KEY",prevAlchemy],["ROUTESCAN_API_KEY",prevRoutescan],["GOPLUS_ACCESS_TOKEN",prevGoPlus]]){
      if(value===undefined)delete process.env[name]; else process.env[name]=value;
    }
  }
});
