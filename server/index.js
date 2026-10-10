import express from "express";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {SCAN_INTERVAL_MS,NETWORKS,scanMarkets,scanStatus} from "./scanner.js";
import {persistScan,getHistory,saveReview,saveInspection,dbInfo} from "./store.js";
import {analyzeToken,providerStatus} from "./ai.js";
import {inspectToken,cachedInspection,inspectionStats} from "./intelligence.js";
import {technicalAnalysis} from "./technical.js";
import {decideSignal} from "./signal.js";
import {sendBuyAlert,telegramReady} from "./telegram.js";

const app=express();
app.disable("x-powered-by");
app.set("trust proxy",1);
app.use(express.json({limit:"32kb"}));
app.use((req,res,next)=>{
  res.set("X-Content-Type-Options","nosniff");
  res.set("Referrer-Policy","strict-origin-when-cross-origin");
  res.set("Cache-Control","no-store");
  next();
});
const PORT=Number(process.env.PORT)||3000;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../public");
const has=(key)=>!!process.env[key];
const sources=()=>({
  market:{geckoterminal:{configured:true,implemented:true},dexscreener:{configured:true,implemented:true}},
  solana:{helius:{configured:has("HELIUS_API_KEY"),implemented:false}},
  evm:{routescan:{configured:has("ROUTESCAN_API_KEY"),implemented:true,limited:true},
    alchemy:{configured:has("ALCHEMY_API_KEY"),implemented:false}},
  security:{goplus:{configured:has("GOPLUS_ACCESS_TOKEN"),publicFallback:true,implemented:true},
    honeypot:{configured:true,implemented:true,chainLimited:true},lpProof:{implemented:false}},
  social:{stockgeist:{configured:has("STOCKGEIST_API_KEY"),implemented:false},
    telegram:{configured:has("TELEGRAM_BOT_TOKEN"),implemented:false},
    reddit:{configured:false,implemented:false}},
  notifications:{telegram:{configured:telegramReady(),implemented:true}},
  ai:providerStatus(),database:dbInfo(),inspector:inspectionStats()
});
const safeAdmin=(req,res,next)=>{
  const expected=process.env.DASHBOARD_ADMIN_KEY;
  if(!expected)return res.status(503).json({error:"DASHBOARD_ADMIN_KEY belum diatur di Railway."});
  if(req.get("X-Admin-Key")!==expected)return res.status(401).json({error:"Admin key tidak valid."});
  next();
};
const recentCalls=new Map();
function tokenById(id){return scanStatus().tokens.find(t=>t.id===id)}
function visibleToken(token){
  const evidence=cachedInspection(token.id);
  const decision=decideSignal(token,evidence);
  return {...token,
    security:evidence?.security?.status||"UNVERIFIED",
    holderMaxPct:evidence?.holders?.topObservedPct??null,
    liquidityLock:evidence?.liquidityLock?.status||"UNVERIFIED",
    signal:decision.status,checks:decision.checks,
    inspectionAt:evidence?.inspectedAt||null,
    evidenceErrors:evidence?.errors||[],
    aiScore:decision.eligible?null:null,
    tpProbability:null, targetX:null};
}
app.get("/api/health",(req,res)=>{
  const s=scanStatus(),age=s.scannedAt?Date.now()-Date.parse(s.scannedAt):null;
  const scanStale=age===null||age>SCAN_INTERVAL_MS*2.5;
  res.json({status:"ok",ready:!scanStale&&s.tokens.length>0,app:"AI Meme Coin Early Gem Hunter",
    version:"2.0",time:new Date().toISOString(),scanner:s.sourceStatus,scannedAt:s.scannedAt,scanAgeMs:age,
    monitoredChains:4,schedulerIntervalMs:SCAN_INTERVAL_MS,db:dbInfo()});
});
app.get("/api/overview",async(req,res)=>{
  let s=scanStatus();
  if(!s.scannedAt&&s.tokens.length===0)s=await scanMarkets();
  const network=String(req.query.network||"all").toLowerCase(),
    mode=String(req.query.mode||"all").toLowerCase(),
    search=String(req.query.search||"").trim().toLowerCase().slice(0,90);
  let tokens=s.tokens.filter(t=>t.liquidity>=100000);
  if(network!=="all")tokens=tokens.filter(t=>t.network===network);
  if(mode==="early")tokens=tokens.filter(t=>t.discovery==="New Pools"||t.discovery==="DEX Profiles"||["ACCUMULATION","NEW POOL","EARLY BREAKOUT"].includes(t.phase));
  if(mode==="trending")tokens=tokens.filter(t=>t.discovery==="Trending 24H");
  if(search)tokens=tokens.filter(t=>[t.symbol,t.name,t.tokenAddress].some(x=>String(x||"").toLowerCase().includes(search)));
  res.json({app:"MICIN RADAR",version:"2.0",lastScan:s.scannedAt,started:s.scanStartedAt,
    sourceStatus:s.sourceStatus,loading:s.loading,durationMs:s.lastScanDurationMs,
    metrics:s.metrics,errors:s.errors,filters:{network,mode,search},
    tokens:tokens.slice(0,120).map(visibleToken),totalFiltered:tokens.length,networkOptions:NETWORKS,
    integrations:sources(),policy:{liquidityMinimum:100000,largePoolThreshold:1000000,maxHolderPct:2.5,
      autoTrade:false,blueprint:"LOCKED"},disclaimer:"BUY cannot be issued until all on-chain, social, technical and statistical checks are independently verified."});
});
app.get("/api/integrations",(req,res)=>res.json({integrations:sources(),autoTrading:false,blueprint:"V2.0 LOCKED"}));
app.get("/api/history",async(req,res)=>res.json(await getHistory()));
app.get("/api/inspection",(req,res)=>{
  const id=String(req.query.tokenId||"").slice(0,220);
  const token=tokenById(id);
  if(!token)return res.status(404).json({error:"Token tidak ditemukan dalam pemindaian terkini"});
  const inspection=cachedInspection(id);
  return res.json({token:{id:token.id,symbol:token.symbol,network:token.network},
    inspection,decision:decideSignal(token,inspection),
    verified:false,note:"Data missing is treated as UNVERIFIED; partial on-chain evidence is not a full risk audit."});
});
app.post("/api/inspect",safeAdmin,async(req,res)=>{
  const key=String(req.body?.tokenId||"").slice(0,220),token=tokenById(key);
  if(!token)return res.status(404).json({error:"Token tidak ditemukan"});
  try{
    const inspection=await inspectToken(token,{force:!!req.body?.force});
    const includeTechnical=req.body?.withTechnical===true;
    const technical=includeTechnical?await technicalAnalysis(token):null;
    const decision=decideSignal(token,inspection,technical);
    await saveInspection(token,inspection,decision);
    await sendBuyAlert({token,decision});
    res.json({token:{id:token.id,symbol:token.symbol},inspection,technical,decision});
  }catch(e){console.error("[inspect]",e.message);res.status(502).json({error:"Pemeriksaan provider tidak selesai: "+String(e.message).slice(0,130)})}
});
app.post("/api/scan",safeAdmin,async(req,res)=>{
  const s=await scanMarkets(true);
  await persistScan(s);
  res.json({status:s.sourceStatus,lastScan:s.scannedAt,metrics:s.metrics,errors:s.errors});
});
app.post("/api/technical",safeAdmin,async(req,res)=>{
  const token=tokenById(String(req.body?.tokenId||"").slice(0,220));
  if(!token)return res.status(404).json({error:"Token tidak ditemukan"});
  try{res.json({token:token.id,technical:await technicalAnalysis(token),signal:"WAIT"})}
  catch(e){res.status(502).json({error:"Data OHLCV belum tersedia: "+String(e.message).slice(0,150)})}
});
app.post("/api/ai/analyze",safeAdmin,async(req,res)=>{
  const key=String(req.body?.tokenId||"").slice(0,220),token=tokenById(key);
  if(!token)return res.status(404).json({error:"Token tidak ditemukan"});
  const last=recentCalls.get(key)||0;
  if(Date.now()-last<120000)return res.status(429).json({error:"Tunggu 2 menit sebelum analisis ulang token ini"});
  recentCalls.set(key,Date.now());
  try{
    const inspection=cachedInspection(key);
    const analysis=await analyzeToken(token,inspection);
    await saveReview(token,analysis);
    res.json({token:{id:token.id,symbol:token.symbol,network:token.network},analysis});
  }catch(e){recentCalls.delete(key);res.status(503).json({error:String(e.message||"AI belum tersedia").slice(0,200)})}
});
app.use(express.static(root,{maxAge:"10m",index:false}));
app.get("*",(req,res)=>res.sendFile(path.join(root,"index.html")));
app.use((err,req,res,next)=>{console.error("[http]",err);res.status(500).json({error:"Internal server error"})});
let cycles=0;
let workerRunning=false;
let aiReviewsToday=0;
let aiDay=new Date().toISOString().slice(0,10);
async function worker(){
  if(workerRunning)return;
  workerRunning=true;
  try{
    const state=await scanMarkets(true);
    const stored=await persistScan(state);
    console.log("[scanner]",state.sourceStatus,"observed",state.tokens.length,"errors",state.errors.length,"DB",stored);
    // Bounded inspection of candidates, preserving public-tier rates.
    const eligible=state.tokens.filter(t=>t.liquidity>=100000&&t.price>0).slice(0,2);
    for(const token of eligible){
      try{
        const evidence=await inspectToken(token);
        const decision=decideSignal(token,evidence);
        await saveInspection(token,evidence,decision);
        if(decision.eligible)await sendBuyAlert({token,decision});
      }catch(e){console.warn("[inspection]",token.id,String(e.message).slice(0,100))}
    }
    // Optional capped Claude/9Router research review; no BUY permission delegated to AI.
    const today=new Date().toISOString().slice(0,10);
    if(today!==aiDay){aiDay=today;aiReviewsToday=0}
    const maxPerDay=Math.max(0,Math.min(144,Number(process.env.AI_MAX_DAILY_REVIEWS||48)));
    if(providerStatus().configured && process.env.AI_AUTO_REVIEW!=="false" && aiReviewsToday<maxPerDay && eligible.length){
      const token=eligible[cycles%eligible.length];
      try{
        const analysis=await analyzeToken(token,cachedInspection(token.id));
        await saveReview(token,analysis);
        aiReviewsToday++;
        console.log("[AI review]",token.id,analysis.model,"WAIT");
      }catch(err){console.warn("[AI review]",String(err.message).slice(0,130))}
    }
    cycles++;
  }catch(e){console.error("[worker]",String(e.message).slice(0,200))}
  finally{workerRunning=false}
}
app.listen(PORT,"0.0.0.0",()=>{
  console.log("MICIN RADAR V2.0 port",PORT,"Blueprint LOCKED","AutoTrade disabled");
  setTimeout(worker,1200);
  setInterval(worker,SCAN_INTERVAL_MS).unref();
});
