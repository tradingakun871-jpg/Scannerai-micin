// Social signals are matched by ticker only, not contract, so never treated as verified token sentiment.
let cached=null;
export async function socialMentions(token){
  if(!cached||Date.now()-cached.time>20*60*1000){
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),9000);
    try{
      const r=await fetch("https://apewisdom.io/api/v1.0/filter/all-crypto",{signal:c.signal,headers:{accept:"application/json"}});
      if(!r.ok)throw Error("HTTP "+r.status);
      const data=await r.json();
      cached={time:Date.now(),results:Array.isArray(data.results)?data.results:[]};
    }catch(e){
      cached={time:Date.now(),results:[],error:String(e.message)};
    }finally{clearTimeout(timer)}
  }
  const symbol=String(token.symbol||"").replace(/^\$/,"").toUpperCase();
  const matches=cached.results.filter(x=>String(x.ticker||"").replace(/^\$/,"").toUpperCase()===symbol);
  const entry=matches.length===1?matches[0]:null;
  return {
    status:"INSUFFICIENT_DATA",
    source:"ApeWisdom Reddit mentions (ticker-only)",
    tickerMatch:entry?{rank:Number(entry.rank)||null,mentions:Number(entry.mentions)||0,
      mentions24hAgo:Number(entry.mentions_24h_ago)||0,
      upvotes:Number(entry.upvotes)||0}:null,
    reason:cached.error?"Source error: "+cached.error:
      entry?"Ticker mention observed, but contract identity, bot activity and sentiment polarity not verified":
      "No matching ticker or multiple ambiguous matches; cannot infer token sentiment"
  };
}
