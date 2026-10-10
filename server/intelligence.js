// Evidence-led enrichment: missing evidence NEVER becomes PASS.
const CHAIN={eth:1,bsc:56,base:8453};
const cache=new Map();
const TTL=12*60*1000;
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const bool=x=>x===true||x===1||x==="1";
const list=(x)=>Array.isArray(x)?x:[];
const missing=(why)=>({status:"UNVERIFIED",reason:why,source:null});
export async function getJson(url,headers={},timeoutMs=10500){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{headers:{"accept":"application/json","user-agent":"ScanneraiMicin/2.0",...headers},signal:controller.signal});
    if(!response.ok) throw new Error("HTTP "+response.status);
    return await response.json();
  }finally{clearTimeout(timer)}
}
function securityStatus(raw,network){
  if(!raw||typeof raw!=="object")return missing("GoPlus tidak mengembalikan data token");
  const flags=network==="solana"?["mintable","freezable","transfer_hook","non_transferable"]:["is_honeypot","is_mintable","hidden_owner","can_take_back_ownership","is_blacklisted","transfer_pausable","selfdestruct","is_proxy"];
  const triggered=flags.filter(k=>bool(raw[k])||(k==="transfer_hook"&&raw[k]&&typeof raw[k]==="object"));
  const explicitSafe=network==="solana"?raw.mintable!==undefined&&raw.freezable!==undefined:raw.is_honeypot!==undefined&&raw.is_mintable!==undefined;
  return {
    status:triggered.length?"CRITICAL":explicitSafe?"PARTIAL":"UNVERIFIED",
    flags:triggered,
    reason:triggered.length?"Flag kontrak: "+triggered.join(", "):"Pemeriksaan GoPlus belum membuktikan keamanan seluruh fungsi kontrak",
    source:"GoPlus"
  };
}
function parseHolders(raw,route){
  const direct=list(raw?.holders).map(h=>({address:String(h.address||h.token_account||""),pct:num(h.percent)*(num(h.percent)<=1?100:1),tag:String(h.tag||""),isContract:bool(h.is_contract)}));
  // Some GoPlus versions return percent as a decimal (0..1).
  // For an ambiguous 0.5 value choose conservative 50% rather than 0.5%.
  const additional=list(route?.items).map(h=>({address:String(h.address||""),pct:num(h.percentage),tag:"",isContract:false}));
  const candidates=[...direct,...additional].filter(x=>x.address&&Number.isFinite(x.pct));
  const excluded=candidates.filter(h=>/burn|dead|null|liquidity pool|uniswap v2|pancakeswap/i.test(h.tag));
  const active=candidates.filter(h=>!excluded.includes(h));
  const max=active.length?Math.max(...active.map(x=>x.pct)):null;
  return {
    status:max!==null&&max>2.5?"REJECT":"UNVERIFIED",
    topObservedPct:max,observedCount:active.length,
    excludedTaggedCount:excluded.length,
    reason:max!==null&&max>2.5?"Ditemukan holder non-sistem di atas 2,5%":
      "Sampel top holder tersedia tetapi cakupan lengkap dan cluster satu kendali belum dapat dibuktikan",
    source:route?.items?.length?"GoPlus + Routescan":raw?.holders?.length?"GoPlus":null
  };
}
function parseLp(raw,t){
  const holders=list(raw?.lp_holders);
  const shares=holders.map(h=>({pct:num(h.percent)*(num(h.percent)<=1?100:1),locked:bool(h.is_locked),tag:String(h.tag||""),address:String(h.address||h.token_account||"")}));
  const knownLocked=shares.filter(x=>x.locked||/burn|dead/i.test(x.tag)).reduce((n,x)=>n+x.pct,0);
  // GoPlus data may refer to another AMM pool. Mark UNVERIFIED until LP ownership matches this exact pool.
  return {
    status:"UNVERIFIED",knownLockedPct:Math.round(knownLocked*100)/100,
    observedLpHolders:holders.length,
    required:t.liquidity>1000000?"LOCKED/BURNED":"UNLOCKED",
    reason:"LP holder data belum terikat secara kriptografis ke posisi liquidity pool ini (V2/V3/CLMM dapat berbeda).",
    source:holders.length?"GoPlus LP holder sample":null
  };
}
function parseHoneypot(raw){
  if(!raw)return missing("Honeypot API tidak tersedia pada chain/pool ini");
  if(raw.honeypotResult?.isHoneypot===true)return {status:"CRITICAL",reason:"Honeypot terdeteksi",source:"Honeypot.is"};
  if(raw.honeypotResult?.isHoneypot===false&&raw.simulationSuccess===true)
    return {status:"PARTIAL",reason:"Simulasi buy/sell berhasil; tidak menjamin semua transaksi di masa depan",source:"Honeypot.is",
      buyTax:num(raw.simulationResult?.buyTax),sellTax:num(raw.simulationResult?.sellTax)};
  return {status:"UNVERIFIED",reason:"Simulasi trading tidak lengkap / belum terbukti",source:"Honeypot.is"};
}
function transferSignals(raw,t){
  const txs=list(raw?.items);
  const involved=new Map();
  const launch=t.createdAt?Date.parse(t.createdAt):0;
  let nearLaunch=0;const txByBlock=new Map();
  for(const x of txs){
    if(!x.from||!x.to)continue;
    const from=String(x.from).toLowerCase(),to=String(x.to).toLowerCase();
    for(const a of [from,to])involved.set(a,(involved.get(a)||0)+1);
    const ts=Date.parse(x.timestamp||x.createdAt||"");
    if(launch&&Math.abs(ts-launch)<120000)nearLaunch++;
    const block=x.blockNumber;
    if(block!==undefined)txByBlock.set(block,(txByBlock.get(block)||0)+1);
  }
  const maxSameBlock=Math.max(0,...txByBlock.values());
  return {
    walletClustering:{status:"UNVERIFIED",observedWallets:involved.size,observedTransfers:txs.length,
      potentialSameBlock:maxSameBlock,reason:"Transaksi bersama tidak membuktikan wallet satu pengendali",source:txs.length?"Routescan sampled token transfers":null},
    bundler:{status:"UNVERIFIED",sameBlockTransfers:maxSameBlock,reason:"Diperlukan bukti bundle launch/funding dan kepemilikan cluster",source:txs.length?"Routescan transfer evidence":null},
    sniper:{status:"UNVERIFIED",launchWindowTransfers:nearLaunch,reason:"Pembelian sniper memerlukan transaksi DEX awal dan saldo saat ini, bukan hanya sampel transfer",source:txs.length?"Routescan transfer evidence":null},
    smartMoney:{status:"UNVERIFIED",observedActiveWallets:involved.size,reason:"Profitabilitas historis wallet belum tervalidasi",source:txs.length?"Routescan transfer evidence":null}
  };
}
export async function inspectToken(t,{force=false}={}){
  if(!t?.tokenAddress||!t?.network)return null;
  const key=t.id,hit=cache.get(key);
  if(!force&&hit&&Date.now()-hit.at<TTL)return hit.data;
  if(hit?.running)return hit.running;
  const promise=(async()=>{
    const chain=CHAIN[t.network];
    const params=new URLSearchParams({contract_addresses:t.tokenAddress.toLowerCase()});
    const endpoints=[
      {kind:"goplus",url:t.network==="solana"?"https://api.gopluslabs.io/api/v1/solana/token_security?"+params:
        chain?"https://api.gopluslabs.io/api/v1/token_security/"+chain+"?"+params:null,
       headers:process.env.GOPLUS_ACCESS_TOKEN?{authorization:"Bearer "+process.env.GOPLUS_ACCESS_TOKEN}:{}},
      {kind:"honeypot",url:chain?"https://api.honeypot.is/v2/IsHoneypot?"+new URLSearchParams({address:t.tokenAddress,chainID:String(chain)}):null},
      {kind:"holders",url:chain?"https://api.routescan.io/v2/network/mainnet/evm/"+chain+"/erc20/"+encodeURIComponent(t.tokenAddress)+"/holders?limit=100":null,
       headers:process.env.ROUTESCAN_API_KEY?{apikey:process.env.ROUTESCAN_API_KEY}:{}},
      {kind:"transfers",url:chain?"https://api.routescan.io/v2/network/mainnet/evm/"+chain+"/erc20-transfers?"+new URLSearchParams({tokenAddress:t.tokenAddress,limit:"100",sort:"desc"}):null,
       headers:process.env.ROUTESCAN_API_KEY?{apikey:process.env.ROUTESCAN_API_KEY}:{}}
    ].filter(x=>x.url);
    const results=await Promise.allSettled(endpoints.map(x=>getJson(x.url,x.headers)));
    const d={};const errors=[];
    results.forEach((r,i)=>{const kind=endpoints[i].kind;
      if(r.status==="fulfilled")d[kind]=r.value;
      else errors.push(kind+": "+String(r.reason?.message||"unavailable"));
    });
    const raw=t.network==="solana"?d.goplus?.result?.[t.tokenAddress]:
      d.goplus?.result?.[t.tokenAddress.toLowerCase()]||d.goplus?.result?.[t.tokenAddress];
    const flow=transferSignals(d.transfers,t);
    const out={
      tokenId:key,inspectedAt:new Date().toISOString(),errors,
      security:securityStatus(raw,t.network),
      honeypot:parseHoneypot(d.honeypot),
      liquidityLock:parseLp(raw,t),
      holders:parseHolders(raw,d.holders),
      ...flow,
      social:{status:"INSUFFICIENT_DATA",reason:"Token-specific sentiment with verified contract identity not available; no fabricated positive score"},
      buyStatus:"WAIT", opportunityScore:null, calibratedProbability:null,
      sourceCoverage:endpoints.map(x=>({kind:x.kind,success:!!d[x.kind]}))
    };
    if(out.security.status==="CRITICAL"||out.honeypot.status==="CRITICAL"||out.holders.status==="REJECT"){
      out.buyStatus="NO BUY";
    }
    // ALL six critical risk gates must be independently verified. Currently launch cluster, LP position and social aren't.
    cache.set(key,{at:Date.now(),data:out});
    return out;
  })();
  cache.set(key,{...(hit||{}),running:promise});
  try{return await promise}
  finally{const x=cache.get(key);if(x?.running===promise)cache.delete(key)}
}
export function cachedInspection(id){const c=cache.get(id);return c?.data||null}
export function inspectionStats(){return {cached:[...cache.values()].filter(x=>x.data).length,ageLimitSeconds:TTL/1000}}
