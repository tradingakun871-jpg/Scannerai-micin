import {isAddress} from "./pumpfeed.js";
const rpc=()=>process.env.HELIUS_API_KEY?"https://mainnet.helius-rpc.com/?api-key="+encodeURIComponent(process.env.HELIUS_API_KEY):null;
async function call(method,params){
 const url=rpc();if(!url)throw Error("HELIUS_API_KEY belum dikonfigurasi");
 const abort=AbortSignal.timeout(14000);
 const res=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:abort});
 if(!res.ok)throw Error("Helius RPC HTTP "+res.status);
 const out=await res.json();if(out.error)throw Error(String(out.error.message||"RPC unavailable"));return out.result;
}
const cache=new Map();
export async function inspect(mint,creator){
 if(!isAddress(mint))throw Error("Invalid mint");
 const existing=cache.get(mint);if(existing&&Date.now()-existing.ts<180000)return existing.data;
 const res={mint,checkedAt:new Date().toISOString(),source:"Helius Solana RPC",status:"PARTIAL",
  holder:{status:"UNVERIFIED",topAccounts:[],observedLargestPct:null,reason:"Token accounts sampled, not proven beneficial owner groups"},
  bundler:{status:"UNVERIFIED",reason:"Same-block bundle and common controller cannot be confirmed from largest accounts alone"},
  sniper:{status:"UNVERIFIED",reason:"Early swap trades and remaining balances require full verified launch-trace"},
  developer:{status:"UNVERIFIED",creator:creator||null,reason:"Creator wallet relation and funding not fully traced"},
  liquidity:{status:"UNVERIFIED",reason:"Pump.fun bonding curve and migrated LP require distinct verification"},
  honeypot:{status:"UNVERIFIED",reason:"No completed sale-simulation or authority check"},
  smartMoney:{status:"UNVERIFIED"},social:{status:"UNVERIFIED"},signal:"WAIT",autoTrade:false,errors:[]};
 try{
  const [supply,largest]=await Promise.all([call("getTokenSupply",[mint]),call("getTokenLargestAccounts",[mint])]);
  const total=Number(supply?.value?.amount||0),acc=largest?.value||[];
  if(total>0&&acc.length){
    let parsed=[];
    try{const info=await call("getMultipleAccounts",[acc.slice(0,20).map(x=>x.address),{encoding:"jsonParsed"}]);parsed=info?.value||[]}
    catch(e){res.errors.push("Owner decoding: "+e.message)}
    res.holder.topAccounts=acc.slice(0,20).map((a,i)=>({
      tokenAccount:a.address,owner:parsed[i]?.data?.parsed?.info?.owner||null,
      pct:Number((Number(a.amount||0)/total*100).toFixed(4))
    }));
    res.holder.observedLargestPct=Math.max(...res.holder.topAccounts.map(a=>a.pct));
    res.holder.reason="Top token accounts only; duplicate owners/system wallets and linked funding unverified. Holder ≤2.5% rule NOT cleared.";
  }
  if(creator&&isAddress(creator)){
   try{
    const u="https://api-mainnet.helius-rpc.com/v0/addresses/"+creator+"/transactions?api-key="+encodeURIComponent(process.env.HELIUS_API_KEY)+"&limit=15";
    const reply=await fetch(u,{signal:AbortSignal.timeout(14000)});
    if(!reply.ok)throw Error("HTTP "+reply.status);
    const txs=await reply.json();
    if(Array.isArray(txs)){
      const funders=new Set();
      for(const tx of txs)for(const t of tx.nativeTransfers||[])if(t.toUserAccount===creator&&t.fromUserAccount!==creator)funders.add(t.fromUserAccount);
      res.developer={status:"OBSERVED_PARTIAL",creator,fundingWalletSample:[...funders].slice(0,12),sampleTransactions:txs.length,
        reason:"Sample of recent creator transfers; identity and linked-wallet control NOT proven"};
      res.bundler={status:"UNVERIFIED",fundingWalletSample:[...funders].slice(0,12),reason:"Funding relationships sampled; a shared funder alone does not prove coordinated bundling"};
    }
   }catch(e){res.errors.push("Creator history: "+e.message)}
  }
 }catch(e){res.errors.push("Helius RPC: "+e.message);res.status="UNAVAILABLE"}
 cache.set(mint,{ts:Date.now(),data:res});if(cache.size>400)cache.delete(cache.keys().next().value);
 return res;
}
