// No notifications are sent for unverified or speculative analysis without verified BUY.
const sent=new Map();
export function telegramReady(){return !!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID)}
export async function sendBuyAlert({token,decision}){
  if(!decision?.eligible||!telegramReady())return {sent:false,reason:"No verified BUY or Telegram not configured"};
  const id=token.id+":"+decision.entry+":"+decision.recommendedTpX;
  if(sent.has(id))return {sent:false,reason:"Already notified"};
  const text=["🚀 MICIN RADAR V2.0 — VERIFIED BUY","Token: "+token.symbol,"Chain: "+token.network,
    "Contract: "+token.tokenAddress,"Entry: "+decision.entry,"SL: "+decision.sl,
    "Dynamic TP: "+decision.recommendedTpX+"X",
    "Probabilitas: "+(decision.probability==null?"Belum tervalidasi":decision.probability),
    "LP/Holder/Bundler/Sniper: verified",
    token.url].join("\n");
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8500);
  try{
    const r=await fetch("https://api.telegram.org/bot"+process.env.TELEGRAM_BOT_TOKEN+"/sendMessage",
      {method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text,disable_web_page_preview:true}),signal:ctrl.signal});
    const json=await r.json();
    if(!r.ok||json.ok!==true)throw Error("Telegram message rejected");
    sent.set(id,Date.now());return {sent:true};
  }catch(e){return {sent:false,reason:e.message}}
  finally{clearTimeout(timer)}
}
