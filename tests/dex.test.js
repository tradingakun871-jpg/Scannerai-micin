import test from "node:test";
import assert from "node:assert/strict";
import {mapDexPair,discoverDex,mergeDexWithGecko} from "../server/dex.js";
const mint="0x1111111111111111111111111111111111111111";
function pair(token=mint,pool="0x2222222222222222222222222222222222222222",liquidity=250000){
 return {
  chainId:"ethereum",dexId:"uniswap",pairAddress:pool,
  baseToken:{address:token,symbol:"GEM",name:"Gem Token"},quoteToken:{address:"0x3333333333333333333333333333333333333333",symbol:"WETH"},
  priceUsd:"0.005",liquidity:{usd:liquidity},
  volume:{m5:250,h1:2000,h6:9000,h24:45000},
  txns:{m5:{buys:2,sells:1},h1:{buys:12,sells:6},h6:{buys:41,sells:21},h24:{buys:150,sells:100}},
  priceChange:{m5:1,h1:2,h6:5,h24:13},
  pairCreatedAt:Date.UTC(2026,9,10,2,0),
  boosts:{active:20},
  info:{websites:[{url:"https://example.com"}],socials:[{platform:"twitter",handle:"gem_example"}]}
 }
}
test("Dex market timeframes and paid boosts are recorded, never security PASS",()=>{
 const t=mapDexPair(pair(),{labels:["TOKEN_PROFILE","BOOST_TOP"],topBoost:30},Date.UTC(2026,9,10,4,0));
 assert.equal(t.dex.windows.m5.buys,2);
 assert.equal(t.dex.windows.h1.volume,2000);
 assert.equal(t.dex.windows.h6.change,5);
 assert.equal(t.dex.windows.h24.sells,100);
 assert.equal(t.dex.promotion.promoted,true);
 assert.equal(t.dex.promotion.boostTop,30);
 assert.equal(t.dex.links.socials[0].platform,"twitter");
 assert.equal(t.checks.holder,false);
 assert.equal(t.checks.liquidityLock,false);
 assert.equal(t.signal,"WAIT");
 assert.equal(t.aiScore,null);
});
test("DEX source failure keeps results from other feeds and reports errors",async()=>{
 const loader=async url=>{
  if(url.includes("ads/latest"))throw Error("mock provider 429");
  if(url.includes("token-profiles/latest"))return [{chainId:"ethereum",tokenAddress:mint}];
  if(url.includes("tokens/v1/ethereum"))return [pair()];
  return [];
 };
 const result=await discoverDex({loadJson:loader,now:Date.UTC(2026,9,10,4,0)});
 assert.equal(result.tokens.length,1);
 assert.equal(result.stats.batchRequests,1);
 assert.equal(result.errors.length,1);
 assert.match(result.errors[0],/ADVERTISED/);
 assert.equal(result.tokens[0].source,"DEX Screener");
});
test("Token batch lookup groups up to 30 addresses per call",async()=>{
 const addresses=Array.from({length:31},(_,i)=>"0x"+(i+1).toString(16).padStart(40,"0"));
 const calls=[];
 const loader=async url=>{
  if(url.includes("token-profiles/latest"))return addresses.map(tokenAddress=>({chainId:"ethereum",tokenAddress}));
  if(url.includes("/tokens/v1/ethereum/")){
    const requested=url.split("/").at(-1).split(",");
    calls.push(requested.length);
    return requested.map(a=>pair(a));
  }
  return [];
 };
 const result=await discoverDex({loadJson:loader,maxAddresses:60});
 assert.deepEqual(calls,[30,1]);
 assert.equal(result.stats.matchedTokens,31);
 assert.equal(result.stats.batchSucceeded,2);
 assert.equal(result.stats.marketingTokens,31);
 assert.equal(result.tokens.length,31);
});
test("Multiple pools cannot be summed, only highest-liquidity pair is selected",async()=>{
 const loader=async url=>{
  if(url.includes("token-profiles"))return [{chainId:"ethereum",tokenAddress:mint}];
  if(url.includes("/tokens/v1/"))return [pair(mint,"0x4444444444444444444444444444444444444444",150000),
    pair(mint,"0x5555555555555555555555555555555555555555",300000)];
  return [];
 };
 const data=await discoverDex({loadJson:loader});
 assert.equal(data.tokens[0].liquidity,300000);
 assert.equal(data.tokens[0].volume24h,45000);
 assert.equal(data.tokens[0].dex.poolCount,2);
});
test("Mismatching Gecko pool cannot silently become DEX-specific price source",()=>{
 const dex=mapDexPair(pair(),{labels:["BOOST_LATEST"]});
 const gecko={
  ...dex,source:"GeckoTerminal",poolAddress:"0x6666666666666666666666666666666666666666",
  liquidity:600000,price:0.01,volume24h:1000,change24h:-2,dex:null,discovery:"Trending 24H"
 };
 const merged=mergeDexWithGecko(gecko,dex);
 assert.equal(merged.price,0.01);
 assert.equal(merged.liquidity,600000);
 assert.equal(merged.dex.poolMatched,false);
 assert.equal(merged.dex.promotion.promoted,true);
 assert.equal(merged.checks.holder,false);
});
