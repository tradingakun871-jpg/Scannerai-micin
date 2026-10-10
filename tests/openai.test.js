import test from "node:test";
import assert from "node:assert/strict";
import {analyzeToken,providerStatus} from "../server/ai.js";

test("OpenAI selection uses direct key and retains Claude as unused alternative", ()=>{
  const prior={provider:process.env.AI_PROVIDER,key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL};
  try{
    process.env.AI_PROVIDER="openai";
    process.env.OPENAI_API_KEY="test-do-not-use";
    process.env.OPENAI_MODEL="gpt-5-mini";
    const s=providerStatus();
    assert.equal(s.provider,"openai");
    assert.equal(s.model,"gpt-5-mini");
    assert.equal(s.configured,true);
  } finally{
    for(const [k,v] of Object.entries({AI_PROVIDER:prior.provider,OPENAI_API_KEY:prior.key,OPENAI_MODEL:prior.model})){
      if(v===undefined)delete process.env[k];else process.env[k]=v;
    }
  }
});
test("OpenAI response is research only, does not create a BUY and has strict JSON schema",async()=>{
  const prior={provider:process.env.AI_PROVIDER,key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL};
  const originalFetch=globalThis.fetch;
  try{
    process.env.AI_PROVIDER="openai";
    process.env.OPENAI_API_KEY="mock-api-key";
    process.env.OPENAI_MODEL="gpt-5-mini";
    globalThis.fetch=async(url,request)=>{
      assert.equal(url,"https://api.openai.com/v1/responses");
      assert.equal(request.headers.authorization,"Bearer mock-api-key");
      const data=JSON.parse(request.body);
      assert.equal(data.store,false);
      assert.equal(data.model,"gpt-5-mini");
      assert.equal(data.text.format.type,"json_schema");
      assert.equal(data.input.includes("NOT VERIFIED"),true);
      return new Response(JSON.stringify({
        status:"completed",
        output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({
          summary:"Masih menunggu konfirmasi",
          positives:["Volume naik"],risks:["LP belum diverifikasi"],
          technical_view:"Belum cukup informasi",suggested_action:"WAIT"
        })}]}]
      }),{status:200,headers:{"content-type":"application/json"}});
    };
    const analysis=await analyzeToken({
      symbol:"MOCK",network:"solana",tokenAddress:"MockMint",
      price:0.0001,liquidity:450000,volume24h:50000,change24h:15,
      buys:100,sells:60,phase:"ACCUMULATION"
    });
    assert.equal(analysis.provider,"openai");
    assert.equal(analysis.recommendation,"WAIT");
    assert.equal(analysis.signalAllowed,false);
    assert.equal(analysis.tpProbability,null);
    assert.equal(analysis.data.summary,"Masih menunggu konfirmasi");
  }finally{
    globalThis.fetch=originalFetch;
    for(const [k,v] of Object.entries({AI_PROVIDER:prior.provider,OPENAI_API_KEY:prior.key,OPENAI_MODEL:prior.model})){
      if(v===undefined)delete process.env[k];else process.env[k]=v;
    }
  }
});
test("Incomplete OpenAI API response is rejected rather than fabricating a research result",async()=>{
  const prior={provider:process.env.AI_PROVIDER,key:process.env.OPENAI_API_KEY};
  const oldFetch=globalThis.fetch;
  try{
    process.env.AI_PROVIDER="openai";process.env.OPENAI_API_KEY="fake";
    globalThis.fetch=async()=>new Response(JSON.stringify({status:"incomplete",output:[]}),{status:200});
    await assert.rejects(analyzeToken({symbol:"TEST",network:"base",tokenAddress:"0xabc",price:1,liquidity:100000}),/incomplete/);
  }finally{
    globalThis.fetch=oldFetch;
    for(const [k,v] of Object.entries({AI_PROVIDER:prior.provider,OPENAI_API_KEY:prior.key})){
      if(v===undefined)delete process.env[k];else process.env[k]=v;
    }
  }
});
