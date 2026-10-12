const SYSTEM = `You are a conservative Indonesian-language research analyst for early-stage meme coins.
Never invent blockchain checks, liquidity lock status, holder distribution, bundler/sniper evidence, social sentiment, profit probabilities, or a BUY recommendation.
You receive public market discovery data only. Analyze momentum and explain risks, NEVER treat discovery as verified investment advice.
Return JSON only: {"summary":"...","positives":["..."],"risks":["..."],"technical_view":"...","suggested_action":"WAIT"}.
Use Bahasa Indonesia. Max 3 items per array. NO trading instruction; no unsupported numeric targets. DEX Screener promotions and boosts are paid visibility, not confirmation of organic buying; distinguish M5/H1/H6/H24 price and volume from on-chain security. If poolMatched is false, do not interpret DEX windows as data for the displayed primary pool.`;
const withTimeout = async (url, options, ms=25000) => {
  const c=new AbortController();const timer=setTimeout(()=>c.abort(),ms);
  try {const r=await fetch(url,{...options,signal:c.signal}); const body=await r.text();
    if(!r.ok){
      const detail=r.status===401?"API key ditolak; periksa OPENAI_API_KEY pada Railway":
        r.status===429?"rate limit atau quota penyedia API tercapai":
        r.status===402?"saldo API tidak cukup":"permintaan ditolak; lihat billing/permissions penyedia";
      // Don't log response bodies; some provider errors contain credential fragments.
      throw new Error("AI provider HTTP "+r.status+": "+detail);
    }
    return JSON.parse(body);
  } finally {clearTimeout(timer);}
};
const parseResult=(input)=>{
  const s=String(input||"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
  try {return JSON.parse(s);} catch {}
  const first=s.indexOf("{"),last=s.lastIndexOf("}");
  if(first!==-1&&last>first){try{return JSON.parse(s.slice(first,last+1));}catch{}}
  return {summary:s.slice(0,1200),positives:[],risks:[],technical_view:"Tidak tersedia"};
};
export function providerStatus() {
  const selected=(process.env.AI_PROVIDER||"openai").toLowerCase();
  const provider=["openai","anthropic","router"].includes(selected)?selected:"openai";
  const keys={
    openai:!!process.env.OPENAI_API_KEY,
    anthropic:!!process.env.ANTHROPIC_API_KEY,
    router:!!(process.env.AI_BASE_URL&&process.env.AI_API_KEY)
  };
  const models={
    openai:process.env.OPENAI_MODEL||"gpt-5-mini",
    anthropic:process.env.ANTHROPIC_MODEL||"claude-sonnet-4-5",
    router:process.env.AI_MODEL||"AISCANER"
  };
  return {provider,configured:keys[provider],model:models[provider],
    alternativeAvailable:Object.entries(keys).some(([id,available])=>id!==provider&&available)};
}

export async function analyzeToken(token,inspection=null){
  const p=providerStatus();
  if(!p.configured) throw new Error("AI belum dikonfigurasi. Tambahkan API key untuk AI_PROVIDER yang dipilih di Railway.");
  const info = {
    token:token.symbol,network:token.network,contract:token.tokenAddress,
    price:token.price,liquidity_usd:token.liquidity,volume_24h:token.volume24h,
    price_change_24h_pct:token.change24h,buys_24h:token.buys,sells_24h:token.sells,
    detected_market_phase:token.phase,
    dex_market_data:token.dex?{
      windows:token.dex.poolMatched?token.dex.windows:null,
      poolMatched:token.dex.poolMatched===true,
      observedAt:token.dex.observedAt,
      paidPromotion:token.dex.promotion?.promoted===true,
      boostActive:token.dex.promotion?.boostActive||0,
      websiteCount:token.dex.links?.websites?.length||0,
      socialAccountCount:token.dex.links?.socials?.length||0,
      warning:"Boost/ads/links are promotional metadata, NOT organic holder or verified sentiment evidence"
    }:null,
    mandatory_checks:{
      lp_lock:inspection?.liquidityLock||"NOT VERIFIED",holder_max_2_5_pct:inspection?.holders||"NOT VERIFIED",
      bundler:inspection?.bundler||"NOT VERIFIED",sniper:inspection?.sniper||"NOT VERIFIED",
      social:inspection?.social||"NOT VERIFIED",
      contract_safety:inspection?.security||"NOT VERIFIED",honeypot:inspection?.honeypot||"NOT VERIFIED",
      smart_money:inspection?.smartMoney||"NOT VERIFIED"
    }
  };
  let content;
  if(p.provider==="openai"){
    const response=await withTimeout("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"content-type":"application/json","authorization":"Bearer "+process.env.OPENAI_API_KEY},
      body:JSON.stringify({
        model:p.model,
        store:false,
        max_output_tokens:1600,
        reasoning:{effort:"low"},
        instructions:SYSTEM,
        input:JSON.stringify(info),
        text:{format:{type:"json_schema",name:"meme_coin_research",strict:true,
          schema:{type:"object",additionalProperties:false,
            properties:{
              summary:{type:"string"},
              positives:{type:"array",items:{type:"string"}},
              risks:{type:"array",items:{type:"string"}},
              technical_view:{type:"string"},
              suggested_action:{type:"string",enum:["WAIT"]}
            },
            required:["summary","positives","risks","technical_view","suggested_action"]
          }
        }}
      })
    },45000);
    if(response.status!=="completed")throw new Error("OpenAI response incomplete or failed");
    const blocks=(response.output||[]).filter(x=>x.type==="message")
      .flatMap(x=>x.content||[]);
    if(blocks.some(x=>x.type==="refusal"))throw new Error("OpenAI declined the research request");
    content=blocks.filter(x=>x.type==="output_text").map(x=>x.text||"").join("\n");
    if(!content.trim())throw new Error("OpenAI response contained no text");
  } else if(p.provider==="anthropic"){
    const response=await withTimeout("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"content-type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:p.model,max_tokens:750,system:SYSTEM,messages:[{role:"user",content:JSON.stringify(info)}]})
    });
    content=(response.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n");
  } else {
    const base=process.env.AI_BASE_URL.replace(/\/+$/,"");
    const response=await withTimeout(base+"/chat/completions",{
      method:"POST",
      headers:{"content-type":"application/json","authorization":"Bearer "+process.env.AI_API_KEY},
      body:JSON.stringify({model:p.model,max_tokens:850,temperature:0.2,messages:[{role:"system",content:SYSTEM},{role:"user",content:JSON.stringify(info)}]})
    });
    content=response.choices?.[0]?.message?.content||"";
    if(Array.isArray(content))content=content.map(x=>x.text||"").join("\n");
  }
  const data=parseResult(content);
  const explanation=String(data.summary || "AI belum menghasilkan ringkasan yang dapat diproses.").slice(0,1400);
  // Hard gate: discovery data cannot satisfy holder, LP, bundler, sniper and contract validation.
  return {
    provider:p.provider,model:p.model,
    recommendation:"WAIT",signalAllowed:false,aiScore:null,
    recommendedTpX:null,tpProbability:null,
    explanation,data,
    gatingReason:"Pemeriksaan wajib Blueprint V2.0 belum terverifikasi: LP lock, holder, security, bundler, sniper, smart money dan sentimen."
  };
}
