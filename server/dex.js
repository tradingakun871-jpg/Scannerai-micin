// Public DEX Screener market discovery. Does NOT perform token security verification.
// Requests are batched (up to 30 addresses), bounded and tracked for transparency.
// Social links and paid placements are metadata, never proof of sentiment or safety.
const API="https://api.dexscreener.com";
const NETWORKS={solana:"solana",ethereum:"eth",bsc:"bsc",base:"base"};
const DEX_CHAIN={solana:"solana",eth:"ethereum",bsc:"bsc",base:"base"};
const WINDOWS=["m5","h1","h6","h24"];
const n=x=>{const v=Number(x);return Number.isFinite(v)?v:0};
const arr=x=>Array.isArray(x)?x:[];
const idOf=(network,address)=>network+":"+(network==="solana"?address:String(address||"").toLowerCase());
const keyOf=(network,address)=>network+":"+String(address||"").toLowerCase();
const short=s=>String(s||"").slice(0,300);
function safeLink(url){
  try{const x=new URL(url);return x.protocol==="https:"?x.href.slice(0,500):null;}catch{return null}
}
function networkOf(chain){return NETWORKS[String(chain||"").toLowerCase()]||null}
function validAddress(network,address){
  if(network==="solana")return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(address||""));
  return /^0x[a-fA-F0-9]{40}$/.test(String(address||""));
}
function readArrays(pair){
  const windows={};
  for(const period of WINDOWS){
    const tx=pair.txns?.[period], v=pair.volume?.[period], change=pair.priceChange?.[period];
    windows[period]={
      buys:tx&&Number.isFinite(Number(tx.buys))?n(tx.buys):null,
      sells:tx&&Number.isFinite(Number(tx.sells))?n(tx.sells):null,
      volume: v!==undefined&&v!==null? n(v):null,
      change:change!==undefined&&change!==null?n(change):null
    };
  }
  return windows;
}
export function mapDexPair(pair,meta={},now=Date.now()){
  const network=networkOf(pair?.chainId),address=pair?.baseToken?.address;
  if(!network||!validAddress(network,address)||!pair?.pairAddress||n(pair.priceUsd)<=0)return null;
  const createdMs=Number(pair.pairCreatedAt)||0,liquidity=n(pair.liquidity?.usd);
  const windows=readArrays(pair),h24=windows.h24;
  const dailyBuys=h24.buys??0,dailySells=h24.sells??0,change=h24.change??0;
  const ageHours=createdMs?Math.max(0,(now-createdMs)/3600000):null;
  let phase="DISCOVERY";
  if(change< -15&&dailySells>dailyBuys)phase="DISTRIBUTION";
  else if(change>28&&dailyBuys>dailySells)phase="EARLY BREAKOUT";
  else if(ageHours!==null&&ageHours<36)phase="NEW POOL";
  else if(change>-6&&change<28&&dailyBuys>=dailySells*1.2&&dailyBuys>12)phase="ACCUMULATION";
  else if(change>0)phase="TRENDING";
  const volume=n(h24.volume);
  const liqScore=Math.min(23,Math.max(0,Math.log10(Math.max(1,liquidity))-4)*13);
  const volScore=Math.min(26,Math.log10(Math.max(1,volume))*4);
  const buyersScore=Math.min(25,dailyBuys+dailySells>0?dailyBuys/(dailyBuys+dailySells)*34:0);
  const priceScore=Math.min(16,Math.max(0,change+10)/5);
  const youngScore=ageHours!==null&&ageHours<168?10:3;
  const momentum=Math.round(Math.min(100,liqScore+volScore+buyersScore+priceScore+youngScore));
  const info=pair.info||{};
  const websites=arr(info.websites).map(x=>safeLink(x?.url)).filter(Boolean).slice(0,5);
  const socials=arr(info.socials).map(x=>({
    platform:short(x?.platform).slice(0,35),
    handle:short(x?.handle).slice(0,120)
  })).filter(x=>x.platform).slice(0,8);
  const labels=[...new Set(arr(meta.labels).map(x=>short(x)).filter(Boolean))];
  const boostActive=n(pair.boosts?.active),boostLatest=n(meta.latestBoost),boostTop=n(meta.topBoost);
  const promoted=labels.length>0||boostActive>0||boostLatest>0||boostTop>0;
  const dex={
    pairAddress:pair.pairAddress,chainId:pair.chainId,dexId:short(pair.dexId).slice(0,60),
    windows,labels,poolCount:Math.max(1,n(meta.poolCount)||1),
    promotion:{
      promoted,boostActive,boostLatest,boostTop,
      paidProfile:labels.includes("TOKEN_PROFILE"),
      communityTakeover:labels.includes("COMMUNITY_TAKEOVER"),
      advertised:labels.includes("ADVERTISED"),
      notice:promoted?"Paid/marketing exposure observed; this is not evidence of organic accumulation":"No boost or listing promotion evidence in sampled feeds"
    },
    links:{websites,socials},imageUrl:safeLink(info.imageUrl),
    observedAt:new Date(now).toISOString(),
    poolMatched:true
  };
  const first=labels.includes("TOKEN_PROFILE")?"DEX Profiles":
    labels.includes("BOOST_LATEST")||labels.includes("BOOST_TOP")?"DEX Boosts":
    labels.includes("COMMUNITY_TAKEOVER")?"Community Takeover":
    labels.includes("ADVERTISED")?"DEX Ads":"DEX Pools";
  const url=safeLink(pair.url)||"https://dexscreener.com/"+pair.chainId+"/"+encodeURIComponent(pair.pairAddress);
  return {
    id:idOf(network,address),network,networkName:network==="eth"?"Ethereum":network==="bsc"?"BNB Chain":network==="solana"?"Solana":"Base",
    symbol:short(pair.baseToken?.symbol||"UNKNOWN").slice(0,28),name:short(pair.baseToken?.name||pair.baseToken?.symbol||"Unknown"),
    tokenAddress:address,poolAddress:pair.pairAddress,price:n(pair.priceUsd),liquidity,volume24h:volume,
    change24h:change,buys:dailyBuys,sells:dailySells,marketCap:n(pair.marketCap),fdv:n(pair.fdv),
    createdAt:createdMs?new Date(createdMs).toISOString():null,ageHours,phase,momentum,
    discovery:first,discoveryLabels:labels,source:"DEX Screener",url,dex,
    liquidityCategory:liquidity>1000000?"LOCK_REQUIRED":liquidity>=100000?"UNLOCKED_REQUIRED":"BELOW_MINIMUM",
    liquidityLock:"UNVERIFIED",holderMaxPct:null,bundlerSupplyPct:null,sniperSupplyPct:null,
    security:"UNVERIFIED",social:"INSUFFICIENT DATA",signal:"WAIT",targetX:null,tpProbability:null,aiScore:null,
    checks:{liquidityAmount:liquidity>=100000,liquidityLock:false,holder:false,contract:false,
      bundler:false,sniper:false,social:false,smartMoney:false}
  };
}
function collectMeta(feed,kind,metadata){
  for(const item of arr(feed)){
    const network=networkOf(item?.chainId),address=item?.tokenAddress;
    if(!network||!validAddress(network,address))continue;
    const id=keyOf(network,address);
    const meta=metadata.get(id)||{network,chainId:DEX_CHAIN[network],tokenAddress:address,labels:[],latestBoost:0,topBoost:0};
    if(!meta.labels.includes(kind))meta.labels.push(kind);
    if(kind==="BOOST_LATEST")meta.latestBoost=Math.max(meta.latestBoost,n(item.totalAmount),n(item.amount));
    if(kind==="BOOST_TOP")meta.topBoost=Math.max(meta.topBoost,n(item.totalAmount),n(item.amount));
    metadata.set(id,meta);
  }
}
export async function discoverDex({loadJson,tracked=[],maxAddresses=150,now=Date.now()}={}){
  if(typeof loadJson!=="function")throw Error("loadJson required");
  // All of these lists are discovery/marketing feeds, not a complete universe of new tokens.
  const feeds=[
    ["TOKEN_PROFILE","/token-profiles/latest/v1"],
    ["BOOST_LATEST","/token-boosts/latest/v1"],
    ["BOOST_TOP","/token-boosts/top/v1"],
    ["COMMUNITY_TAKEOVER","/community-takeovers/latest/v1"],
    ["ADVERTISED","/ads/latest/v1"]
  ];
  const errors=[],sourceCounts={},meta=new Map();
  const results=await Promise.allSettled(feeds.map(([kind,url])=>loadJson(API+url)));
  results.forEach((r,i)=>{
    const [kind]=feeds[i];
    if(r.status==="fulfilled"){
      collectMeta(r.value,kind,meta);
      sourceCounts[kind]=arr(r.value).length;
    }else{
      errors.push("DEX Screener / "+kind+": "+String(r.reason?.message||"unavailable").slice(0,140));
      sourceCounts[kind]=null;
    }
  });
  // Quota reserved for each chain's tracked GeckoTerminal pools, then newest promotions.
  const candidates=new Map();
  const add=(network,address)=>{
    if(!network||!validAddress(network,address))return;
    const key=keyOf(network,address);
    if(candidates.size>=maxAddresses&&!candidates.has(key))return;
    if(!candidates.has(key))candidates.set(key,{network,chainId:DEX_CHAIN[network],tokenAddress:address});
  };
  for(const network of ["solana","eth","bsc","base"]){
    for(const t of tracked.filter(x=>x.network===network).slice(0,18))add(network,t.tokenAddress);
  }
  for(const m of meta.values())add(m.network,m.tokenAddress);
  const grouped={solana:[],eth:[],bsc:[],base:[]};
  for(const c of candidates.values())grouped[c.network].push(c);
  const batches=[];
  for(const network of Object.keys(grouped)){
    for(let i=0;i<grouped[network].length;i+=30)batches.push({
      network,entries:grouped[network].slice(i,i+30)
    });
  }
  const poolByKey=new Map();
  let requests=0,succeeded=0;
  // Bound simultaneous requests so the 300rpm pair endpoint remains far below its cap.
  for(let i=0;i<batches.length;i+=3){
    const outcome=await Promise.allSettled(batches.slice(i,i+3).map(async batch=>{
      const addresses=batch.entries.map(x=>x.tokenAddress).join(",");
      const response=await loadJson(API+"/tokens/v1/"+batch.entries[0].chainId+"/"+addresses);
      return {pairs:arr(response),network:batch.network};
    }));
    outcome.forEach((r,j)=>{
      requests++;
      if(r.status==="rejected"){
        errors.push("DEX Screener / token-batch "+batches[i+j].network+": "+String(r.reason?.message||"unavailable").slice(0,100));
        return;
      }
      succeeded++;
      for(const pair of r.value.pairs){
        const network=networkOf(pair?.chainId),address=pair?.baseToken?.address;
        if(!network||!validAddress(network,address)||n(pair.priceUsd)<=0||n(pair.liquidity?.usd)<0)continue;
        const key=keyOf(network,address);
        if(!candidates.has(key))continue;
        const collection=poolByKey.get(key)||[];
        collection.push(pair);
        poolByKey.set(key,collection);
      }
    });
  }
  const tokens=[];
  for(const [key,pairs] of poolByKey){
    // One token, one primary liquidity pool. Never sum 24h volume across different pools.
    const sorted=pairs.sort((a,b)=>n(b.liquidity?.usd)-n(a.liquidity?.usd));
    const original=meta.get(key)||{};
    const token=mapDexPair(sorted[0],{...original,poolCount:sorted.length},now);
    if(token)tokens.push(token);
  }
  return {
    tokens,errors,
    stats:{
      provider:"DEX Screener public",requestedAddresses:candidates.size,
      marketingTokens:meta.size,matchedTokens:tokens.length,feeds:sourceCounts,
      batchRequests:requests,batchSucceeded:succeeded,
      limits:{profileAndPromotionRpm:60,pairRpm:300,maxAddressesPerBatch:30},
      boostIsPaidExposure:true,
      marketNotSafetyVerified:true
    }
  };
}
export function mergeDexWithGecko(prior,newToken){
  if(!prior)return newToken;
  const samePool=String(prior.poolAddress||"").toLowerCase()===String(newToken.poolAddress||"").toLowerCase();
  const preferDex=n(newToken.liquidity)>n(prior.liquidity);
  const selected=preferDex?{...newToken}: {...prior};
  const dex={...newToken.dex,poolMatched:samePool||preferDex};
  // If GeckoTerminal's different pool is still the primary price source, warn about mismatch.
  if(!preferDex&&!samePool){
    dex.poolMatched=false;
    dex.notice="DEX Screener data references a different pool; not a valid M5/H1/H6/H24 measurement of this displayed pool";
  }
  selected.dex=dex;
  selected.dexMarketMatchesPriceSource=dex.poolMatched;
  selected.discoveryLabels=[...new Set([...(prior.discoveryLabels||[]),...(newToken.discoveryLabels||[])])];
  if(!preferDex){
    selected.source=samePool?"GeckoTerminal + DEX Screener":prior.source;
    selected.url=prior.url;
  }
  // Promotions remain visibility metadata, never added to AI opportunity or activity score.
  return selected;
}
