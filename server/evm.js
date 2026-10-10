// Alchemy-backed bounded, read-only EVM evidence. ERC-20 NOT NFT API.
// One Alchemy app key must have the target networks enabled.
// Never treat limited recent Transfer logs as a full holder index or wallet ownership proof.
const RPC_HOST={eth:"eth-mainnet",base:"base-mainnet",bsc:"bnb-mainnet"};
const transferTopic="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const addrPattern=/^0x[a-fA-F0-9]{40}$/;
const selector={totalSupply:"0x18160ddd",balanceOf:"0x70a08231",token0:"0x0dfe1681",token1:"0xd21220a7"};
const zero="0x0000000000000000000000000000000000000000";
const dead="0x000000000000000000000000000000000000dead";
const denominator=1000000n;
const limitedPct=(part,total)=>total>0n?Number((part*denominator)/total)/10000:null;
const uint=value=>{try {return /^0x[0-9a-f]*$/i.test(value)?BigInt(value):null}catch{return null}};
const pad=addr=>"0".repeat(24)+addr.slice(2).toLowerCase();
const toAddr=value=>typeof value==="string"&&/^0x[0-9a-fA-F]{64}$/.test(value)?"0x"+value.slice(-40).toLowerCase():null;
export class AlchemyRPC{
  constructor(chain,key=process.env.ALCHEMY_API_KEY){
    if(!RPC_HOST[chain]||!key)throw Error("Alchemy chain/key not configured");
    this.chain=chain;
    this.url="https://"+RPC_HOST[chain]+".g.alchemy.com/v2/"+encodeURIComponent(key);
  }
  async request(method,params,timeout=9000){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
    try{
      const resp=await fetch(this.url,{method:"POST",
        headers:{"content-type":"application/json","accept":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:ctl.signal});
      if(!resp.ok)throw Error("Alchemy "+this.chain+" HTTP "+resp.status);
      const json=await resp.json();
      if(json.error)throw Error("Alchemy "+this.chain+" RPC "+String(json.error.code||"error"));
      return json.result;
    }finally{clearTimeout(timer)}
  }
  async call(to,data){
    if(!addrPattern.test(to))throw Error("Invalid EVM contract address");
    return this.request("eth_call",[{to,data},"latest"]);
  }
  async uintCall(to,data){return uint(await this.call(to,data))}
}
export function parseTransferLogs(logs){
  const result=[];
  for(const log of Array.isArray(logs)?logs:[]){
    if(log?.removed===true||log?.topics?.length!==3||String(log.topics[0]).toLowerCase()!==transferTopic)continue;
    const from=toAddr(log.topics[1]),to=toAddr(log.topics[2]),value=uint(log.data);
    const block=uint(log.blockNumber);
    if(!from||!to||value===null||block===null)continue;
    result.push({from,to,value:value.toString(),blockNumber:Number(block),txHash:log.transactionHash||null});
  }
  return result;
}
export function graphEvidence(transfers,poolAddress=""){
  const byFunder=new Map(),wallets=new Set(),blocks=new Map();
  for(const t of transfers){
    wallets.add(t.from);wallets.add(t.to);
    if(!blocks.has(t.blockNumber))blocks.set(t.blockNumber,new Set());
    blocks.get(t.blockNumber).add(t.txHash||t.to);
    if(t.from===zero||t.from.toLowerCase()===poolAddress.toLowerCase()||t.to===poolAddress.toLowerCase())continue;
    if(!byFunder.has(t.from))byFunder.set(t.from,new Set());
    byFunder.get(t.from).add(t.to);
  }
  const sharedFundingCandidates=[...byFunder.entries()]
    .filter(([,recipients])=>recipients.size>=2)
    .map(([funder,recipients])=>({funder,recipientCount:recipients.size,recipientSamples:[...recipients].slice(0,5)}))
    .sort((a,b)=>b.recipientCount-a.recipientCount).slice(0,5);
  const maxSameBlockTransactions=Math.max(0,...[...blocks.values()].map(s=>s.size));
  return {
    walletClustering:{status:"UNVERIFIED",sampledUniqueWallets:wallets.size,
      sharedFundingCandidates,reason:"Shared funding is a research lead, not proof of common control",source:"Alchemy recent ERC20 Transfer logs"},
    bundler:{status:"UNVERIFIED",sameBlockTransactionPeak:maxSameBlockTransactions,
      reason:"Recent transfer grouping is not confirmed launch bundle; trace historical launch and funding",source:"Alchemy recent Transfer logs"},
    sniper:{status:"UNVERIFIED",recentTransferCount:transfers.length,
      reason:"Recent transfers do not prove purchases in launch block. Historical swaps and holdings required.",source:"Alchemy recent Transfer logs"},
    smartMoney:{status:"UNVERIFIED",recentWalletCount:wallets.size,
      reason:"No verified wallet PnL or full trading history",source:"Alchemy recent Transfer logs"}
  };
}
export async function inspectEvm(token,{key=process.env.ALCHEMY_API_KEY}={}){
  if(!key)return {status:"UNAVAILABLE",reason:"ALCHEMY_API_KEY missing",source:"Alchemy"};
  if(!RPC_HOST[token.network]||!addrPattern.test(token.tokenAddress)){
    return {status:"UNAVAILABLE",reason:"Invalid network or contract",source:"Alchemy"};
  }
  try{
    const rpc=new AlchemyRPC(token.network,key);
    const [blockRaw,totalSupplyRaw]=await Promise.all([
      rpc.request("eth_blockNumber",[]),
      rpc.uintCall(token.tokenAddress,selector.totalSupply)
    ]);
    const totalSupply=totalSupplyRaw;
    if(totalSupply===null||totalSupply<=0n)throw Error("Cannot validate ERC20 totalSupply");
    const block=Number(uint(blockRaw)),from=Math.max(0,block-9);
    const logs=await rpc.request("eth_getLogs",[{
      fromBlock:"0x"+from.toString(16),toBlock:"0x"+block.toString(16),
      address:token.tokenAddress,topics:[transferTopic]
    }]);
    const transfers=parseTransferLogs(logs);
    const participants=[...new Set(transfers.flatMap(t=>[t.from,t.to]))]
      .filter(address=>address!==zero&&address!==token.poolAddress?.toLowerCase()).slice(0,12);
    const balanceValues=await Promise.allSettled(participants.map(address=>rpc.uintCall(token.tokenAddress,selector.balanceOf+pad(address))));
    const holderEvidence=participants.map((address,i)=>{
      const b=balanceValues[i].status==="fulfilled"?balanceValues[i].value:null;
      return {address,pct:b!==null&&b!==undefined?limitedPct(b,totalSupply):null};
    }).filter(x=>x.pct!==null);
    const highest=holderEvidence.reduce((acc,x)=>!acc||x.pct>acc.pct?x:acc,null);
    const graph=graphEvidence(transfers,token.poolAddress);
    return {
      status:"OBSERVED",chain:token.network,source:"Alchemy JSON-RPC",
      fromBlock:from,toBlock:block,blocksInspected:block-from+1,
      totalSupplyRaw:totalSupply.toString(),transferCount:transfers.length,
      sampledHolderCount:holderEvidence.length,
      holders:{
        status:"UNVERIFIED",topObservedPct:highest?.pct??null,topObservedAddress:highest?.address??null,
        sampledCount:holderEvidence.length,
        reason:"Only wallets seen in the latest 10 blocks sampled; system/LP and cluster classification incomplete",
        source:"Alchemy sampled balanceOf / totalSupply"
      },
      ...graph
    };
  }catch(e){
    return {status:"UNAVAILABLE",source:"Alchemy JSON-RPC",reason:String(e.message||"RPC unavailable").slice(0,140)}
  }
}
export async function inspectExactEvmV2Pool(token,{key=process.env.ALCHEMY_API_KEY}={}){
  if(!key||!RPC_HOST[token.network]||!addrPattern.test(token.poolAddress||""))
    return {status:"UNVERIFIED",source:"Alchemy",reason:"No EVM pool address or Alchemy configuration"};
  try{
    const rpc=new AlchemyRPC(token.network,key),pool=token.poolAddress.toLowerCase();
    const [v0,v1,lpTotal]=await Promise.all([
      rpc.call(pool,selector.token0),rpc.call(pool,selector.token1),rpc.uintCall(pool,selector.totalSupply)
    ]);
    const t0=toAddr(v0),t1=toAddr(v1);
    if(!t0||!t1||![t0,t1].includes(token.tokenAddress.toLowerCase())||lpTotal===null||lpTotal<=0n){
      return {status:"UNVERIFIED",pool,source:"Alchemy eth_call",
        reason:"Pool is not a proven ERC20 V2 fungible LP pair for this token (V3/CLMM or incompatible)"};
    }
    const [burn0,burnDead]=await Promise.all([
      rpc.uintCall(pool,selector.balanceOf+pad(zero)),rpc.uintCall(pool,selector.balanceOf+pad(dead))
    ]);
    if(burn0===null||burnDead===null)return {status:"UNVERIFIED",pool,source:"Alchemy eth_call",reason:"Unable to read LP burn addresses"};
    const burn=burn0+burnDead;
    if(burn>lpTotal)return {status:"UNVERIFIED",pool,source:"Alchemy eth_call",reason:"Inconsistent LP token supply"};
    const burnedPct=limitedPct(burn,lpTotal);
    const expected=token.liquidity>1000000?"LOCKED/BURNED":"UNLOCKED";
    return {
      status:expected==="LOCKED/BURNED"&&burn===lpTotal?"PASS":"UNVERIFIED",
      pool,source:"Alchemy exact-pool ERC20 LP totalSupply/balanceOf",
      poolType:"V2_FUNGIBLE_LP",token0:t0,token1:t1,
      burnedPct,expected,
      reason:burn===lpTotal&&expected==="LOCKED/BURNED"?
        "100% of fungible LP supply is in zero and dead burn addresses of the exact verified pool":
        "Only provable LP burn supply checked; unlocked vs third-party lockers remains unverified"
    };
  }catch(e){
    return {status:"UNVERIFIED",source:"Alchemy exact-pool eth_call",
      reason:"Pool proof unavailable: "+String(e.message).slice(0,100)};
  }
}
