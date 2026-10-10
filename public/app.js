const $=id=>document.getElementById(id);
const state={overview:null,view:"radar",selected:null,search:"",network:"all",mode:"all",history:null,notice:true};
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const n=x=>Number(x)||0;
const compact=(x)=>{const v=n(x);if(v>=1e9)return "$"+(v/1e9).toFixed(2)+"B";if(v>=1e6)return "$"+(v/1e6).toFixed(2)+"M";if(v>=1e3)return "$"+(v/1e3).toFixed(v>1e5?0:1)+"K";return "$"+v.toFixed(0)};
const money=x=>{const a=n(x);if(!a)return "—";if(a<.000001)return "$"+a.toExponential(3);if(a<.01)return "$"+a.toFixed(8);if(a<1)return "$"+a.toFixed(5);return "$"+a.toFixed(2)};
const ago=x=>{if(!x)return "Belum dipindai";const m=Math.max(0,Math.floor((Date.now()-Date.parse(x))/60000));return m<1?"Baru saja":m<60?m+" menit lalu":Math.floor(m/60)+" jam lalu"};
const percent=x=>"<span class='percent "+(n(x)>=0?"up":"down")+"'>"+(n(x)>0?"+":"")+n(x).toFixed(1)+"%</span>";
const chainLabel=c=>({solana:"SOL",eth:"ETH",bsc:"BSC",base:"BASE"})[c]||c.toUpperCase();
const phrase=x=>String(x||"").replace(/_/g," ");
const api=async(endpoint,opts={})=>{const r=await fetch(endpoint,{cache:"no-store",...opts});let d;try{d=await r.json()}catch{throw Error("Server tidak mengirim JSON");}if(!r.ok)throw Error(d.error||"HTTP "+r.status);return d};
function toast(message,isError=false){const t=document.createElement("div");t.className="toast"+(isError?" error":"");t.textContent=message;$("toastWrap").append(t);setTimeout(()=>t.remove(),5200);}
function fmtWib(date){try{return new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(date))+" WIB"}catch{return "—"}}
function clock(){try{$("clock").textContent=new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date())+" WIB"}catch{}}
function setView(v){
 state.view=v;
 for(const el of document.querySelectorAll(".nav-item"))el.classList.toggle("active",el.dataset.view===v);
 for(const el of document.querySelectorAll(".view"))el.classList.toggle("active",el.id==="view-"+v);
 const labels={radar:["Market Intelligence","Dashboard","Overview"],discovery:["Early Gem","Discovery","Gem Discovery"],signals:["BUY Signal","Command Center","BUY Signals"],security:["Security & Wallet","Intelligence","Security Center"],learning:["AI Learning","Journal","AI Learning"],integrations:["API Integrations","Monitor","API Integrations"],settings:["System","Configuration","Configuration"]};
 const label=labels[v]||labels.radar;
 $("pageTitle").innerHTML=esc(label[0])+" <span>"+esc(label[1])+"</span>";
 $("breadcrumb").textContent=label[2];
 const subs={radar:"Pantau peluang awal dari 4 blockchain dengan data on-chain. Sinyal BUY hanya setelah validasi lengkap.",discovery:"Pelajari aktivitas pool dan awal momentum sebelum harga bergerak terlalu jauh.",signals:"Hanya sinyal BUY dengan seluruh pemeriksaan wajib yang boleh masuk jurnal.",security:"Kontrak, holder, bundler, sniper dan LP harus lolos validasi yang bisa diaudit.",learning:"Semua snapshot dan evaluasi dicatat untuk forward learning tanpa bias hasil.",integrations:"Pantau koneksi API dan tambahkan kredensial melalui Railway Variables.",settings:"Aturan Blueprint V2.0 terkunci. Autotrade tidak tersedia."};
 $("pageSubtitle").textContent=subs[v];
 $("refreshButton").style.display=["settings","integrations"].includes(v)?"none":"";
 $("exportButton").style.display=["radar","discovery"].includes(v)?"":"none";
 if(v==="integrations")renderIntegrations();
 if(v==="learning")loadHistory();
 if(innerWidth<1040)$("sidebar").classList.remove("open");
 window.scrollTo({top:0,behavior:"smooth"});
}
function getVisible(){
 const o=state.overview;
 if(!o)return [];
 return o.tokens.filter(t=>{
   if(state.network!=="all"&&t.network!==state.network)return false;
   if(state.mode==="trending"&&t.discovery!=="Trending 24H")return false;
   if(state.mode==="early"&&!(t.discovery==="New Pools"||["ACCUMULATION","NEW POOL","EARLY BREAKOUT"].includes(t.phase)))return false;
   const s=state.search.toLowerCase();
   return !s||[t.symbol,t.name,t.tokenAddress].some(x=>String(x||"").toLowerCase().includes(s));
 });
}
function tokenHtml(t,i,early=false){
 if(early)return `<tr data-token="${esc(t.id)}"><td><div class="coin-cell"><div class="token-logo">${esc(t.symbol.slice(0,2).toUpperCase())}</div><div><b>${esc(t.symbol)}</b><small>${esc(t.discovery)}</small></div></div></td><td><span class="chain-pill">${esc(chainLabel(t.network))}</span></td><td><strong>${compact(t.liquidity)}</strong></td><td>${compact(t.volume24h)}</td><td><span class="phase-pill early">${esc(t.phase)}</span></td><td><span class="waiting">WAIT / UNVERIFIED</span></td></tr>`;
 const phaseClass=["EARLY BREAKOUT","ACCUMULATION","NEW POOL"].includes(t.phase)?"early":t.phase==="DISTRIBUTION"?"risk":"";
 return `<tr data-token="${esc(t.id)}"><td><div class="coin-cell"><div class="token-logo">${esc(t.symbol.slice(0,2).toUpperCase())}</div><div><b>${esc(t.symbol)}</b><small>${esc(chainLabel(t.network))} · ${esc(t.discovery)}</small></div></div></td><td><strong>${compact(t.liquidity)}</strong></td><td>${compact(t.volume24h)}</td><td>${percent(t.change24h)}</td><td><span class="percent up">${n(t.buys).toLocaleString("id-ID")}</span> / <span class="percent down">${n(t.sells).toLocaleString("id-ID")}</span></td><td><span class="phase-pill ${phaseClass}">${esc(t.phase)}</span></td><td><span class="activity-wrap"><span class="activity-bar"><i style="width:${Math.max(0,Math.min(100,n(t.momentum)))}%"></i></span><small>${n(t.momentum)}/100</small></span></td><td><span class="waiting">WAIT</span></td><td class="row-arrow">›</td></tr>`;
}
function renderChart(tokens){
 const top=[...tokens].sort((a,b)=>b.liquidity-a.liquidity).slice(0,6);
 if(!top.length){$("liquidityChart").innerHTML="<div class='empty-mini'>Tidak ada data market. Periksa status API pada bagian atas.</div>";return;}
 const max=Math.max(1,...top.map(x=>x.liquidity));
 $("liquidityChart").innerHTML=top.map(t=>`<div class="liq-row"><div class="liq-name">${esc(t.symbol)}<small>${esc(chainLabel(t.network))}</small></div><div class="liq-bar-bg"><div class="liq-bar" style="width:${Math.max(3,Math.round(t.liquidity/max*100))}%"></div></div><div class="liq-value">${compact(t.liquidity)}</div></div>`).join("");
}
function renderOverview(){
 const o=state.overview;if(!o)return;
 $("metricObserved").textContent=n(o.metrics.observed).toLocaleString("id-ID");
 $("metricCandidates").textContent=n(o.metrics.liquidityCandidates).toLocaleString("id-ID");
 $("metricBuys").textContent="0";$("metricChains").textContent=o.metrics.chains||4;
 $("signalNavCount").textContent="0";
 $("lastScanText").textContent=o.lastScan?("Diperbarui "+fmtWib(o.lastScan)+" · "+ago(o.lastScan)):"Belum ada scan berhasil";
 $("tableFoot").textContent=o.sourceStatus==="LIVE"?"Data market publik · LIQUIDITY LOCK belum diverifikasi":o.sourceStatus==="PARTIAL"?"Sebagian sumber data tidak tersedia; jangan anggap daftar lengkap.":"Scanner source: "+o.sourceStatus;
 const s=$("connectionState");
 s.className="network-state"+(o.sourceStatus==="LIVE"?"":" stale");
 s.innerHTML='<span class="pulse"></span>'+esc(o.sourceStatus==="LIVE"?"MARKET LIVE":o.sourceStatus==="PARTIAL"?"PARTIAL DATA":o.sourceStatus==="STALE"?"STALE DATA":"API "+o.sourceStatus);
 $("gateMarket").textContent=o.tokens.length?"Active":"Pending";
 const filtered=getVisible();$("tableCount").textContent=filtered.length;
 $("tokenRows").innerHTML=filtered.length?filtered.slice(0,100).map((t,i)=>tokenHtml(t,i)).join(""):`<tr><td colspan="9" class="table-empty">${o.errors.length?"Sebagian sumber gagal: "+esc(o.errors[0]):"Tidak ada token yang memenuhi filter saat ini."}</td></tr>`;
 const early=(o.tokens||[]).filter(t=>t.discovery==="New Pools"||t.discovery==="DEX Profiles"||["ACCUMULATION","NEW POOL","EARLY BREAKOUT"].includes(t.phase));
 $("earlyRows").innerHTML=early.length?early.slice(0,55).map((t,i)=>tokenHtml(t,i,true)).join(""):"<tr><td colspan='6' class='table-empty'>Belum ada early discovery dalam snapshot saat ini.</td></tr>";
 renderChart(o.tokens);
}
function renderIntegrations(){
 const i=state.overview?.integrations;
 if(!i){$("integrationGrid").innerHTML="<div class='empty-mini'>Menunggu status integrasi...</div>";return;}
 const rows=[
  ["GeckoTerminal","Trending + New Pools","PUBLIC API",{configured:true,implemented:true}],
  ["DEX Screener","Latest profiles + token pool market","PUBLIC API",i.market.dexscreener],
  ["Helius","Solana paginated token account sampling; exclusions pending","HELIUS_API_KEY",i.solana.helius],
  ["Routescan","EVM top holders & transfer evidence (limited coverage)","ROUTESCAN_API_KEY",i.evm.routescan],
  ["Alchemy","EVM recent ERC20 evidence / exact V2 LP burn; not full index","ALCHEMY_API_KEY",i.evm.alchemy],
  ["GoPlus Security","Contract and LP holder risk data","GOPLUS_ACCESS_TOKEN",i.security.goplus],
  ["Honeypot.is","EVM simulated buy/sell","PUBLIC API",i.security.honeypot],
  ["StockGeist","Social sentiment","STOCKGEIST_API_KEY",i.social.stockgeist],
  ["Telegram Bot","Verified BUY alerts only","TELEGRAM_BOT_TOKEN",i.notifications.telegram],
  ["OpenAI API","Primary research analyst","OPENAI_API_KEY",{configured:i.ai.provider==="openai"&&i.ai.configured,implemented:true}],
  ["Claude AI","Optional alternative, paused while OpenAI active","ANTHROPIC_API_KEY",{configured:i.ai.provider==="anthropic"&&i.ai.configured,implemented:true}],
  ["9Router Combo AI","AISCANER alternative","AI_BASE_URL + AI_API_KEY",{configured:i.ai.provider==="router"&&i.ai.configured,implemented:true}],
  ["PostgreSQL","Snapshots + forward evaluation","DATABASE_URL",{configured:i.database.configured,implemented:true}]
 ];
 $("integrationGrid").innerHTML=rows.map(([name,desc,env,config])=>{
  const implemented=config?.implemented===true,configured=config?.configured===true;
  const state=implemented?(configured?"CONFIGURED":"KEY MISSING"):"INTEGRATION PENDING";
  return '<div class="integr-card"><div class="integr-top"><b>'+esc(name)+'</b><span class="integ-status '+(implemented&&configured?"connected":"")+'">'+state+'</span></div><p>'+esc(desc)+'</p><code>'+esc(env)+'</code></div>';
 }).join("");
}
async function loadHistory(){
 try{
  const h=await api("/api/history");state.history=h;
  $("snapshotCount").textContent=h.rows.length;
  $("aiReviewCount").textContent=h.reviews.length;
 if(h.summary){$("snapshotCount").title="Tracked unique tokens: "+h.summary.tracked+"; missing/stale: "+h.summary.stale;}

  if(!h.rows.length){$("historyChart").innerHTML=`<div class="empty-mini">${h.configured?"Belum ada snapshot yang tersimpan.":"Tambahkan PostgreSQL DATABASE_URL untuk menyimpan histori."}</div>`;}
  else{
   const rows=h.rows.slice(-24),max=Math.max(1,...rows.map(r=>Number(r.candidates)||0));
   const points=rows.map((r,i)=>`${30+i/(Math.max(1,rows.length-1))*900},${193-(Number(r.candidates)||0)/max*151}`).join(" ");
   const area="30,193 "+points+" 930,193";
   $("historyChart").innerHTML=`<svg class="history-svg" viewBox="0 0 960 225" preserveAspectRatio="none" role="img" aria-label="Jumlah kandidat per scan"><defs><linearGradient id="historyGrad" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#b4f66b" stop-opacity=".35"/><stop offset="1" stop-color="#b4f66b" stop-opacity="0"/></linearGradient></defs><line x1="28" y1="193" x2="940" y2="193" stroke="#35434e"/><line x1="28" y1="118" x2="940" y2="118" stroke="#263440" stroke-dasharray="4 7"/><line x1="28" y1="42" x2="940" y2="42" stroke="#263440" stroke-dasharray="4 7"/><polygon points="${area}" fill="url(#historyGrad)"/><polyline points="${points}" fill="none" stroke="#b4f66b" stroke-width="3" stroke-linejoin="round"/><text x="30" y="215" font-size="13" fill="#8194a3">Earliest scan</text><text x="835" y="215" font-size="13" fill="#8194a3">Latest</text><text x="20" y="28" font-size="13" fill="#a0b1bb">${max} candidates</text></svg>`;
  }
  if(h.summary){
    const list=h.summary.milestones||[];
    let target=$("learningOutcome");
    if(!target){target=document.createElement("div");target.id="learningOutcome";target.className="panel";
      $("historyChart").closest(".panel").after(target)}
    target.innerHTML='<div class="panel-head"><div><div class="overline">FORWARD MONITORING</div><h3>Token Outcome Observations</h3></div><span class="tiny-tag amber">UNVALIDATED</span></div>'+
      '<p class="hint">Tracked: '+esc(h.summary.tracked)+' · Lost/stale: '+esc(h.summary.stale)+
      ' · Inspections: '+esc(h.summary.inspections)+' — Price touch 2X/5X is NOT realized PnL.</p>'+
      (list.length?list.map(m=>'<div class="config-item"><span>'+esc(m.horizon)+' · '+esc(m.samples)+' samples</span><b>2X touch '+esc(m.hit_2x)+' · 5X touch '+esc(m.hit_5x)+'</b></div>').join(""):
       '<p class="hint">Menunggu cohort forward mencapai horizon pertama.</p>');
  }
  $("reviewList").innerHTML=h.reviews.length?h.reviews.map(x=>`<div class="review-row"><b>${esc(x.token_symbol)} · ${esc(chainLabel(x.chain))} — <span class="waiting">${esc(x.recommendation)}</span></b><small style="float:right">${fmtWib(x.created_at)}</small><p>${esc(x.explanation)}</p><small>Model: ${esc(x.model)} / ${esc(x.provider)}</small></div>`).join(""):"<div class='reviews-placeholder'>Belum ada AI review yang tersimpan. Hubungkan AI Provider dan PostgreSQL untuk mencatatnya.</div>";
 }catch(e){toast(e.message,true);}
}
function openToken(id){
 const t=state.overview?.tokens.find(x=>x.id===id);
 if(!t)return;state.selected=t;
 const rows=[["Liquidity Amount",t.liquidity>=100000?"MARKET PASS":"REJECT"],["LP Lock Status",t.liquidityLock||"UNVERIFIED"],["Holder ≤ 2.5%",t.holderMaxPct!=null?String(t.holderMaxPct.toFixed(2))+"% OBSERVED":"UNVERIFIED"],["Contract",t.security||"UNVERIFIED"],["Bundler / Wallet Cluster","UNVERIFIED"],["Sniper Analysis","UNVERIFIED"],["Smart Money","UNVERIFIED"],["Social Sentiment","INSUFFICIENT DATA"]];
 const safeUrl=/^https:\/\/(www\.)?(geckoterminal\.com|dexscreener\.com)\//.test(String(t.url||""))?t.url:"#";
 $("drawerContent").innerHTML=`<h2>${esc(t.symbol)} <span style="color:var(--green);font-size:12px">${esc(chainLabel(t.network))}</span></h2><div class="drawer-sub">${esc(t.tokenAddress)}</div><div class="drawer-grid"><div class="drawer-stat"><span>PRICE USD</span><b>${money(t.price)}</b></div><div class="drawer-stat"><span>LIQUIDITY</span><b>${compact(t.liquidity)}</b></div><div class="drawer-stat"><span>VOLUME 24H</span><b>${compact(t.volume24h)}</b></div><div class="drawer-stat"><span>PRICE CHANGE</span><b>${percent(t.change24h)}</b></div><div class="drawer-stat"><span>MARKET PHASE (rule-based)</span><b style="font-size:14px">${esc(t.phase)}</b></div><div class="drawer-stat"><span>ACTIVITY SCORE</span><b>${t.momentum}/100</b></div></div><h3>Security Validation — Blueprint V2.0</h3>${rows.map(([name,status])=>`<div class="checklist-item"><span>${esc(name)}</span><b>${esc(status)}</b></div>`).join("")}<div class="drawer-warning">⚠️ <b>WAIT — NOT VERIFIED.</b> Activity Score adalah metrik pasar sederhana, bukan AI Opportunity Score, Winrate, atau probabilitas TP. Tidak ada rekomendasi BUY sebelum seluruh pemeriksaan keamanan lolos.</div><div class="drawer-actions"><a class="btn btn-outline" href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">↗ GeckoTerminal</a><button class="btn btn-outline" id="inspectBtn">⬡ Periksa Security</button><button class="btn btn-outline" id="technicalBtn">▥ OHLCV MTF</button><button class="btn btn-primary" id="aiAnalyzeBtn">◇ Analisis AI</button></div><div id="inspectionEvidence" class="drawer-note">Memuat data on-chain terakhir...</div><div id="aiAnalysisResult" class="drawer-note">Analisis AI aktif setelah OPENAI_API_KEY dan DASHBOARD_ADMIN_KEY tersedia di Railway. AI hanya memberikan riset; sinyal tetap WAIT sampai validasi selesai.</div>`;
 $("tokenDrawer").classList.add("open");$("drawerOverlay").classList.add("open");$("tokenDrawer").setAttribute("aria-hidden","false");loadInspectionCache();
}
async function loadInspectionCache(){
 const t=state.selected;if(!t)return;
 try{
   const out=await api("/api/inspection?tokenId="+encodeURIComponent(t.id));
   if(state.selected?.id!==t.id)return;
   const panel=$("inspectionEvidence");if(!panel)return;
   if(!out.inspection){
     panel.innerHTML="<h3>On-Chain Security Intelligence</h3><p>Token belum masuk jadwal pemeriksaan atau hasil belum tersimpan. Gunakan tombol Periksa Security untuk pemindaian baru.</p>";
     return;
   }
   const x=out.inspection;
   const rows=[["GoPlus Contract",x.security],["Honeypot",x.honeypot],
      ["Exact LP Lock / Burn",x.liquidityLock],["Holder ≤ 2.5%",x.holders],
      ["Bundler",x.bundler],["Sniper",x.sniper],
      ["Wallet Clustering",x.walletClustering],["Smart Money",x.smartMoney],
      ["Social Sentiment",x.social]];
   const result=rows.map(([label,detail])=>{
      const status=detail?.status||"UNVERIFIED";
      const pct=detail?.topObservedPct!=null?" · sampled top "+Number(detail.topObservedPct).toFixed(2)+"%":"";
      const flag=detail?.sharedFundingCandidates?.length?" · shared funding candidates: "+detail.sharedFundingCandidates.length:"";
      const source=detail?.source?"Source: "+detail.source+" · ":"";
      return '<div class="checklist-item"><span><b>'+esc(label)+'</b>'+
        '<small style="display:block;color:#8da1ad;white-space:normal;margin-top:4px">'+
        esc(source+(detail?.reason||"Not inspected")+pct+flag)+'</small></span>'+
        '<b>'+esc(status)+'</b></div>';
   }).join("");
   const coverage=(x.sourceCoverage||[]).map(item=>
     '<span class="integrate-pill" style="margin:4px">'+esc(item.kind)+': '+(item.success?"RESPONDED":"NOT VERIFIED")+'</span>').join("");
   const alchemy=x.alchemy?('<p class="hint">Alchemy: '+esc(x.alchemy.status)+
     ' · recent transfers '+esc(x.alchemy.transferCount||0)+
     ' · wallets sampled '+esc(x.alchemy.sampledHolderCount||0)+
     ' · '+esc(x.alchemy.reason||"Recent chain evidence")+'</p>'):"";
   panel.innerHTML='<h3>Security Evidence — Blockchain Data</h3>'+
     '<p class="hint">Last inspect: '+esc(fmtWib(x.inspectedAt))+
     ' · Decision: '+esc(out.decision?.status||"WAIT")+'</p>'+
     alchemy+result+'<h3>Data Source Coverage</h3>'+coverage+
     '<p class="hint">PARTIAL / UNVERIFIED bukan PASS. Sampel transaksi tidak membuktikan identitas pengendali wallet; bukti LP V2 tidak berlaku otomatis untuk V3 atau CLMM.</p>';
 }catch(e){toast("Gagal memuat bukti: "+e.message,true)}
}
async function runInspection(kind){
 const t=state.selected,btn=$(kind==="technical"?"technicalBtn":"inspectBtn");if(!t||!btn)return;
 const key=sessionStorage.getItem("micin_admin_key");
 if(!key){closeToken();setView("settings");toast("Set DASHBOARD_ADMIN_KEY di Railway dan masukkan kunci sesi.",true);return;}
 btn.disabled=true;const old=btn.textContent;btn.textContent="Memeriksa...";
 try{
  const route=kind==="technical"?"/api/technical":"/api/inspect";
  const out=await api(route,{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Key":key},
    body:JSON.stringify({tokenId:t.id})});
  if(kind==="technical"){
    const tf=out.technical?.timeframes||{};
    const lines=Object.entries(tf).map(([name,v])=>name+": "+(v.structure||v.status)+" · "+(v.bars||0)+" candles");
    $("inspectionEvidence").innerHTML="<h3>OHLCV M5 / M15 / H1 / H4</h3><div class='drawer-note'>"+
      esc(lines.join("\n"))+"</div><p class='hint'>Entry/SL research scenario only. No calibrated TP probability or active BUY.</p>";
  }else{
   toast("Pemeriksaan selesai; status tidak terverifikasi tetap WAIT.");
   await loadInspectionCache();
  }
 }catch(e){toast("Gagal memeriksa: "+e.message,true)}
 finally{btn.disabled=false;btn.textContent=old}
}

function closeToken(){$("tokenDrawer").classList.remove("open");$("drawerOverlay").classList.remove("open");$("tokenDrawer").setAttribute("aria-hidden","true");}
async function analyzeSelected(){
 const t=state.selected,btn=$("aiAnalyzeBtn");if(!t||!btn)return;
 const key=sessionStorage.getItem("micin_admin_key");
 if(!key){toast("Masukkan DASHBOARD_ADMIN_KEY pada menu Configuration terlebih dahulu.",true);setView("settings");closeToken();return;}
 btn.disabled=true;btn.textContent="Menganalisis...";
 try{
  const d=await api("/api/ai/analyze",{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Key":key},body:JSON.stringify({tokenId:t.id})});
  const a=d.analysis;
  const positives=Array.isArray(a.data.positives)?a.data.positives:[];
  const risks=Array.isArray(a.data.risks)?a.data.risks:[];
  $("aiAnalysisResult").innerHTML=`<b>${esc(a.provider.toUpperCase())} / ${esc(a.model)}</b><p>${esc(a.explanation)}</p><b>Observasi</b><p>${esc(positives.join(" · ")||"Tidak tersedia")}</p><b>Risiko</b><p>${esc(risks.join(" · ")||a.gatingReason)}</p><p style="color:#ffbf77">DECISION: WAIT — verifikasi keamanan belum selesai.</p>`;
  toast("Analisis diterima. Keputusan tetap WAIT hingga semua syarat terpenuhi.");
 }catch(e){toast(e.message,true);$("aiAnalysisResult").textContent=e.message;}finally{btn.disabled=false;btn.textContent="◇ Analisis AI";}
}
async function loadOverview(silent=false){
 try {
  if(!silent)$("refreshButton").disabled=true;
  const o=await api("/api/overview");state.overview=o;renderOverview();renderIntegrations();
  if(o.sourceStatus!=="LIVE"&&!silent&&o.errors.length)toast("Beberapa API sumber belum merespons; data mungkin tidak lengkap.",true);
 }catch(e){$("connectionState").textContent="API OFFLINE";if(!silent)toast("Gagal memuat scanner: "+e.message,true);}finally{$("refreshButton").disabled=false;}
}
async function manualRefresh(){
 const key=sessionStorage.getItem("micin_admin_key");
 if(key)try{
  $("refreshButton").disabled=true;
  await api("/api/scan",{method:"POST",headers:{"X-Admin-Key":key}});
  await loadOverview(true);
  toast("Pemindaian baru selesai.");return;
 }catch(e){toast("Manual scan: "+e.message,true);}
 await loadOverview();toast("Menampilkan snapshot server. Scan otomatis setiap 5 menit.");
}
function exportCsv(){
 const tokens=getVisible();if(!tokens.length){toast("Belum ada data untuk diekspor.",true);return;}
 const header=["network","symbol","token_address","price_usd","liquidity_usd","volume_24h_usd","change_24h_pct","buy_count","sell_count","phase","momentum_activity_score","lp_status","signal","url"];
 const csv=[header.join(","),...tokens.map(t=>[t.network,t.symbol,t.tokenAddress,t.price,t.liquidity,t.volume24h,t.change24h,t.buys,t.sells,t.phase,t.momentum,t.liquidityLock,t.signal,t.url].map(v=>'"'+String(v??"").replace(/"/g,'""').replace(/^[=+\-@]/,"'$&")+'"').join(","))].join("\r\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="micin-radar-"+new Date().toISOString().slice(0,10)+".csv";a.click();URL.revokeObjectURL(url);toast("CSV berhasil diunduh.");
}
document.querySelectorAll(".nav-item").forEach(el=>el.addEventListener("click",()=>setView(el.dataset.view)));
document.querySelectorAll(".goto-radar").forEach(el=>el.addEventListener("click",()=>setView("radar")));
$("searchInput").addEventListener("input",e=>{state.search=e.target.value;renderOverview();});
$("chainSelect").addEventListener("change",e=>{state.network=e.target.value;renderOverview();});
$("modeSelect").addEventListener("change",e=>{state.mode=e.target.value;renderOverview();});
$("refreshButton").addEventListener("click",manualRefresh);
$("topRefresh").addEventListener("click",manualRefresh);
$("exportButton").addEventListener("click",exportCsv);
$("noticeClose").addEventListener("click",()=>{$("globalNotice").style.display="none";});
$("mobileMenu").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
$("drawerClose").addEventListener("click",closeToken);
$("drawerOverlay").addEventListener("click",closeToken);
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeToken();});
document.addEventListener("click",e=>{
 const tr=e.target.closest("tr[data-token]");if(tr)openToken(tr.dataset.token);
 if(e.target.closest("#aiAnalyzeBtn"))analyzeSelected();
 if(e.target.closest("#inspectBtn"))runInspection("security");
 if(e.target.closest("#technicalBtn"))runInspection("technical");
});
$("saveAdminKey").addEventListener("click",()=>{const key=$("adminKeyInput").value.trim();if(!key){toast("Key tidak boleh kosong.",true);return;}sessionStorage.setItem("micin_admin_key",key);$("adminKeyInput").value="";$("adminKeyState").textContent="Admin key tersedia untuk sesi browser ini.";toast("Key disimpan untuk sesi ini (belum diverifikasi ke server).");});
$("clearAdminKey").addEventListener("click",()=>{sessionStorage.removeItem("micin_admin_key");$("adminKeyInput").value="";$("adminKeyState").textContent="Belum ada key dalam sesi browser.";});
if(sessionStorage.getItem("micin_admin_key"))$("adminKeyState").textContent="Admin key tersedia untuk sesi browser ini.";
clock();setInterval(clock,30000);loadOverview();setInterval(()=>{if(!document.hidden)loadOverview(true);},60000);
