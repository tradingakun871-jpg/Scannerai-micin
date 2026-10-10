import express from "express";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {SCAN_INTERVAL_MS,NETWORKS,scanMarkets,scanStatus} from "./scanner.js";
import {persistScan,getHistory,saveReview,dbInfo} from "./store.js";
import {analyzeToken,providerStatus} from "./ai.js";
const app=express();
app.disable("x-powered-by");
app.set("trust proxy",1);
app.use(express.json({limit:"32kb"}));
app.use((req,res,next)=>{res.set("X-Content-Type-Options","nosniff");res.set("Referrer-Policy","strict-origin-when-cross-origin");next();});
const PORT=Number(process.env.PORT)||3000;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../public");
const has=(key)=>!!process.env[key];
const sources=()=>({
  market:{geckoterminal:true,dexscreener:true},
  solana:{helius:has("HELIUS_API_KEY")},
  evm:{routescan:has("ROUTESCAN_API_KEY"),alchemy:has("ALCHEMY_API_KEY")},
  security:{goplus:has("GOPLUS_ACCESS_TOKEN"),honeypot:true},
  social:{stockgeist:has("STOCKGEIST_API_KEY"),telegram:has("TELEGRAM_BOT_TOKEN"),reddit:false},
  notifications:{telegram:has("TELEGRAM_BOT_TOKEN")&&has("TELEGRAM_CHAT_ID")},
  ai:providerStatus(),database:dbInfo()
});
const safeAdmin=(req,res,next)=>{
  const expected=process.env.DASHBOARD_ADMIN_KEY;
  if(!expected){res.status(503).json({error:"Set DASHBOARD_ADMIN_KEY di Railway sebelum menggunakan fungsi administrator."});return;}
  const actual=req.get("X-Admin-Key");
  if(!actual || actual!==expected){res.status(401).json({error:"Admin key tidak valid."});return;}
  next();
};
app.get("/api/health",(req,res)=>{
  const s=scanStatus();res.json({status:"ok",app:"AI Meme Coin Early Gem Hunter",version:"2.0",time:new Date().toISOString(),scanner:s.sourceStatus,scannedAt:s.scannedAt});
});
app.get("/api/overview",async(req,res)=>{
  let s=scanStatus();
  if (!s.scannedAt && !s.loading) s=await scanMarkets();
  else if(s.loading && !s.scannedAt) s=await scanMarkets();
  const filterNetwork=String(req.query.network||"all").toLowerCase();
  const mode=String(req.query.mode||"all").toLowerCase();
  const search=String(req.query.search||"").trim().toLowerCase().slice(0,90);
  let tokens=s.tokens.filter(x=>x.liquidity>=100000);
  if(filterNetwork!=="all") tokens=tokens.filter(x=>x.network===filterNetwork);
  if(mode==="early")tokens=tokens.filter(x=>x.discovery==="New Pools"||["ACCUMULATION","NEW POOL","EARLY BREAKOUT"].includes(x.phase));
  if(mode==="trending")tokens=tokens.filter(x=>x.discovery==="Trending 24H");
  if(search)tokens=tokens.filter(x=>[x.symbol,x.name,x.tokenAddress].some(v=>String(v||"").toLowerCase().includes(search)));
  res.set("Cache-Control","public,max-age=20");
  res.json({app:"MICIN RADAR",version:"2.0",lastScan:s.scannedAt,started:s.scanStartedAt,
    sourceStatus:s.sourceStatus,loading:s.loading,durationMs:s.lastScanDurationMs,
    metrics:s.metrics,errors:s.errors,filters:{network:filterNetwork,mode,search},
    tokens:tokens.slice(0,120),totalFiltered:tokens.length,networkOptions:NETWORKS,
    integrations:sources(),policy:{liquidityMinimum:100000,largePoolThreshold:1000000,maxHolderPct:2.5,autoTrade:false,blueprint:"LOCKED"},
    disclaimer:"Market ranking is not an AI BUY signal. All tokens remain WAIT until every required security check is verified."});
});
app.get("/api/integrations",(req,res)=>res.json({integrations:sources(),autoTrading:false,blueprint:"V2.0 LOCKED"}));
app.get("/api/history",async(req,res)=>res.json(await getHistory()));
app.post("/api/scan",safeAdmin,async(req,res)=>{
  const s=await scanMarkets(true);
  await persistScan(s);
  res.json({status:s.sourceStatus,lastScan:s.scannedAt,metrics:s.metrics,errors:s.errors});
});
const recentAnalysis=new Map();
app.post("/api/ai/analyze",safeAdmin,async(req,res)=>{
  const key=String(req.body?.tokenId||"").slice(0,200);
  const token=scanStatus().tokens.find(x=>x.id===key);
  if(!token){res.status(404).json({error:"Token tidak ditemukan pada snapshot terkini."});return;}
  const last=recentAnalysis.get(key)||0;
  if(Date.now()-last<120000){res.status(429).json({error:"Tunggu 2 menit sebelum analisis ulang token ini."});return;}
  recentAnalysis.set(key,Date.now());
  try{const analysis=await analyzeToken(token);await saveReview(token,analysis);res.json({token:{id:token.id,symbol:token.symbol,network:token.network},analysis});}
  catch(e){recentAnalysis.delete(key);res.status(503).json({error:String(e.message||"AI tidak tersedia").slice(0,200)});}
});
app.use(express.static(root,{maxAge:"10m",index:false}));
app.get("*",(req,res)=>res.sendFile(path.join(root,"index.html")));
app.use((err,req,res,next)=>{console.error("[http]",err);res.status(500).json({error:"Internal server error"});});
app.listen(PORT,"0.0.0.0",()=>{
  console.log(`MICIN RADAR V2.0 listening on ${PORT} — Blueprint LOCKED`);
  const run=async()=>{
    try{const s=await scanMarkets(true);await persistScan(s);console.log("[scanner]",s.sourceStatus,"tokens:",s.tokens.length,"errors:",s.errors.length);}
    catch(e){console.error("[scanner]",e.message);}
  };
  setTimeout(run,2000);
  setInterval(run,SCAN_INTERVAL_MS).unref();
});
