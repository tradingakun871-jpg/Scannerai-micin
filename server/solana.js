// Helius paged Solana token-account census. Conservatively incomplete on pagination limits.
const big=x=>{try{return BigInt(String(x||0))}catch{return 0n}};
export async function inspectSolanaHolders(mint,{maxPages=4}={}){
  if(!process.env.HELIUS_API_KEY)return {status:"UNVERIFIED",reason:"HELIUS_API_KEY belum tersedia",source:null};
  const url="https://mainnet.helius-rpc.com/?api-key="+encodeURIComponent(process.env.HELIUS_API_KEY);
  const rpc=async(method,params)=>{
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),10000);
    try{
      const resp=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:c.signal});
      if(!resp.ok)throw Error("Helius HTTP "+resp.status);
      const j=await resp.json();if(j.error)throw Error("Helius JSON RPC error");return j.result;
    }finally{clearTimeout(timer)}
  };
  try{
    const supply=big((await rpc("getTokenSupply",[mint]))?.value?.amount);
    if(supply<=0n)return {status:"UNVERIFIED",reason:"Token supply tidak tersedia",source:"Helius"};
    const aggregate=new Map();let accounts=0,complete=false;
    for(let page=1;page<=maxPages;page++){
      const res=await rpc("getTokenAccounts",{mint,page,limit:1000});
      const batch=Array.isArray(res?.token_accounts)?res.token_accounts:[];
      if(!batch.length){complete=true;break}
      for(const a of batch){
        if(!a.owner)continue;
        const owner=String(a.owner),amount=big(a.amount);
        aggregate.set(owner,(aggregate.get(owner)||0n)+amount);
        accounts++;
      }
      if(batch.length<1000){complete=true;break}
    }
    const top=[...aggregate.entries()].sort((a,b)=>a[1]===b[1]?0:a[1]>b[1]?-1:1).slice(0,20)
      .map(([owner,amount])=>({owner,pct:Number(amount*1000000n/supply)/10000}));
    return {status:"UNVERIFIED",source:"Helius getTokenAccounts",accountsInspected:accounts,uniqueOwners:aggregate.size,
      completePagination:complete,topObservedPct:top[0]?.pct??null,top,
      reason:complete?"Supply distribution computed; system vault identities and same-controller wallets remain unverified":
        "Only first "+maxPages+" pages read. Full holder census unavailable under request budget."};
  }catch(e){return {status:"UNVERIFIED",source:"Helius",reason:"Helius unavailable: "+String(e.message).slice(0,100)}}
}
