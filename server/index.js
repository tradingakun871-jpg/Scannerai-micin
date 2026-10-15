import express from "express";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {start,getState,getToken,isAddress} from "./pumpfeed.js";
import {inspect} from "./pump-intelligence.js";
import {assessPump} from "./pump-analysis.js";
import {scanTrending} from "./pump-trending.js";
const app=express();app.disable("x-powered-by");app.set("trust proxy",1);
app.use(express.json({limit:"8kb"}));
app.use((req,res,next)=>{res.set("X-Content-Type-Options","nosniff");res.set("Cache-Control","no-store");res.set("Referrer-Policy","no-referrer");next()});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../public");
app.get("/api/health",(_req,res)=>{const s=getState();res.json({status:"ok",app:"Pump.fun Micin Radar",network:"solana",feed:s.status,lastEventAt:s.lastEventAt,received:s.received,heliusConfigured:!!process.env.HELIUS_API_KEY,autoTrade:false})});
app.get("/api/pumpfun",(_req,res)=>res.json(getState()));
app.get("/api/tokens",(_req,res)=>res.json(getState()));
app.get("/api/trending24h",async(_req,res)=>res.json(await scanTrending()));
const attempts=new Map();
app.post("/api/inspect",async(req,res)=>{
 const ip=req.ip||"unknown",prior=attempts.get(ip)||0;
 if(Date.now()-prior<1200)return res.status(429).json({error:"Rate limited"});
 attempts.set(ip,Date.now());
 const key=process.env.DASHBOARD_ADMIN_KEY,got=req.get("X-Admin-Key");
 if(!key||!got||got.length!==key.length){return res.status(401).json({error:"Admin key diperlukan"});}
 const {timingSafeEqual}=await import("node:crypto");
 if(!timingSafeEqual(Buffer.from(got),Buffer.from(key)))return res.status(401).json({error:"Admin key salah"});
 const mint=String(req.body?.mint||"");
 if(!isAddress(mint))return res.status(400).json({error:"Mint tidak valid"});
 const found=getToken(mint);if(!found)return res.status(404).json({error:"Token tidak ditemukan dalam cache live"});
 try{const evidence=await inspect(mint,found.creator);res.json({...evidence,pumpAnalysis:assessPump(evidence)})}
 catch(e){res.status(502).json({error:String(e.message||"Inspector unavailable").slice(0,140)})}
});
app.use(express.static(root,{index:false,maxAge:0}));
app.get("*",(_req,res)=>res.sendFile(path.join(root,"index.html")));
const port=Number(process.env.PORT)||3000;
app.listen(port,"0.0.0.0",()=>{console.log("[pumpfun-only] online port",port,"autoTrade false");start()});
