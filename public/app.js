const $=s=>document.getElementById(s),safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let current=[],busy=false;const fmt=s=>s?new Date(s).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"}):"—";
async function refresh(){try{
const [a,h]=await Promise.all([fetch("/api/pumpfun").then(r=>r.json()),fetch("/api/health").then(r=>r.json())]);
$("feed").textContent=a.status;$("count").textContent=a.count;$("total").textContent=a.received;$("helius").textContent=h.heliusConfigured?"CONFIGURED":"MISSING";current=a.items||[];
const q=$("search").value.toLowerCase(),arr=current.filter(t=>(t.name+" "+t.symbol+" "+t.mint).toLowerCase().includes(q));
$("rows").innerHTML=arr.length?arr.map(t=>'<tr><td><b>'+safe(t.symbol)+'</b><div class="fine">'+safe(t.name)+'</div><a target="_blank" rel="noopener noreferrer" href="https://pump.fun/coin/'+encodeURIComponent(t.mint)+'">'+safe(t.mint.slice(0,8))+'… ↗</a></td><td>'+safe(t.creator?.slice(0,12)||"—")+'</td><td>'+safe(fmt(t.createdAt))+'</td><td class="warn">WAIT / UNVERIFIED</td><td><button data-mint="'+safe(t.mint)+'">Periksa On-chain</button></td></tr>').join(""):'<tr><td colspan="5">'+safe(a.status==="CONNECTED"?"Terhubung, menunggu launch berikutnya.":a.lastError||"Menunggu sambungan.")+'</td></tr>';
}catch(e){$("feed").textContent="API UNAVAILABLE";}}
$("search").addEventListener("input",refresh);
$("rows").addEventListener("click",async e=>{const b=e.target.closest("button[data-mint]");if(!b||busy)return;busy=true;b.disabled=true;$("detail").textContent="Mengambil bukti on-chain...";
try{const r=await fetch("/api/inspect",{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Key":$("key").value},body:JSON.stringify({mint:b.dataset.mint})}),d=await r.json();$("detail").textContent=JSON.stringify(d,null,2);if(d.holder)renderHolders(d);if(d.pumpAnalysis)renderPumpAnalysis(d.pumpAnalysis)}
catch(e){$("detail").textContent="Gagal: "+e.message}finally{busy=false;b.disabled=false}});
refresh();setInterval(()=>{if(!document.hidden)refresh()},5000);

function renderHolders(d){
 const h=d.holder||{},pct=x=>x===null||x===undefined?"—":Number(x).toFixed(2)+"%";
 document.getElementById("analyzed").textContent="1+";
 for(const [id,v] of [["top1",h.observedLargestPct],["top10",h.top10Pct],["top20",h.top20Pct]]){
   document.getElementById(id).textContent=pct(v);
 }
 document.getElementById("bundlerState").textContent=d.bundler?.status||"UNVERIFIED";
 document.getElementById("sniperState").textContent=d.sniper?.status||"UNVERIFIED";
 document.getElementById("bundlerNote").textContent=d.bundler?.reason||"Bukti belum tersedia";
 document.getElementById("sniperNote").textContent=d.sniper?.reason||"Bukti belum tersedia";
 const b=(h.bubbles||[]).slice(0,20);
 const creator=b.filter(x=>x.relatedToCreator).reduce((s,x)=>s+x.pct,0);
 document.getElementById("creatorPct").textContent=creator?pct(creator):"Tidak diketahui";
 document.getElementById("holderRows").innerHTML=b.length?b.map(x=>"<tr><td>"+safe(String(x.id).slice(0,18))+"…"+(x.relatedToCreator?" (creator)":"")+"</td><td>"+pct(x.pct)+"</td><td>"+x.accounts+"</td></tr>").join(""):"<tr><td colspan='3'>Data tidak tersedia</td></tr>";
 if(!b.length){document.getElementById("bubbles").textContent="Tidak ada data holder teramati";return}
 const W=800,H=310,pts=[];
 let svg='<svg viewBox="0 0 800 310" width="100%" role="img" aria-label="Bubbles holder berdasarkan persentase supply">';
 b.forEach((x,i)=>{
   const radius=Math.max(12,Math.min(48,Math.sqrt(x.pct)*12));
   let xx=radius+10+(i%7)*105,yy=radius+10+Math.floor(i/7)*100;
   for(let j=0;j<160;j++){
     const ax=radius+8+((i*79+j*47)%Math.max(1,W-2*radius-16));
     const ay=radius+8+((i*61+j*31)%Math.max(1,H-2*radius-16));
     if(pts.every(p=>Math.hypot(p.x-ax,p.y-ay)>p.r+radius+3)){xx=ax;yy=ay;break}
   }
   pts.push({x:xx,y:yy,r:radius});
   const color=x.relatedToCreator?"#f59e0b":x.owner?"#60a5fa":"#94a3b8";
   svg+='<circle cx="'+xx+'" cy="'+yy+'" r="'+radius+'" fill="'+color+'" fill-opacity=".40" stroke="'+color+'" stroke-width="2"><title>'+safe(x.id)+' '+pct(x.pct)+'</title></circle>';
   svg+='<text x="'+xx+'" y="'+(yy+4)+'" text-anchor="middle" font-size="11" fill="#fff">'+pct(x.pct)+'</text>';
 });
 document.getElementById("bubbles").innerHTML=svg+"</svg>";
}

function renderPumpAnalysis(a){
 $("aiDecision").textContent=a.decision||"WAIT";
 $("opportunityScore").textContent=a.score==null?"—":String(a.score)+"/100";
 $("scoreNote").textContent="Bukti "+a.observedWeight+"/"+a.requiredWeight+" poin tersedia; score tertahan sampai lengkap";
 $("buyDecision").textContent=a.buy?.status||"WAIT";
 $("sellDecision").textContent=a.sell?.status||"UNVERIFIED";
 for(const x of a.targets||[]){const id="p"+String(x.multiple).replace("X","");const e=$(id);if(e)e.textContent=x.probability==null?"—":(Number(x.probability)*100).toFixed(1)+"%";}
 $("aiReason").textContent=(a.reasons||[]).join(" ");
 $("analysisEvidence").innerHTML=(a.indicators||[]).map(x=>'<div class="card" style="margin:7px 0;padding:10px"><b>'+safe(x.name)+'</b> — '+safe(x.status)+(x.value!=null?' · '+Number(x.value).toFixed(2)+'%':'')+'</div>').join("");
 $("analysisRisks").innerHTML=(a.riskFlags||[]).length?(a.riskFlags||[]).map(x=>'<p class="warn">'+safe(x)+'</p>').join(""):'<p>Belum ada risiko tambahan terverifikasi; ini bukan bukti token aman.</p>';
}

async function refreshTrending(){
 try{
  const response=await fetch("/api/trending24h");if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  $("trendingStatus").textContent=data.status;
  $("trendingError").textContent=data.error||"Sumber: "+data.source+" · update "+fmt(data.updatedAt);
  $("trendingRows").innerHTML=(data.tokens||[]).length?data.tokens.map((t,i)=>'<tr><td>'+(i+1)+'</td><td><b>'+safe(t.symbol)+'</b> · '+safe(t.name)+'<br><a href="https://pump.fun/coin/'+encodeURIComponent(t.mint)+'" target="_blank" rel="noopener noreferrer">'+safe(t.mint.slice(0,12))+'… ↗</a></td><td>'+safe(t.volume24h==null?"—":t.volume24h.toLocaleString("id-ID"))+'</td><td>'+safe(t.marketCapSol==null?"—":t.marketCapSol.toLocaleString("id-ID"))+'</td><td>Periksa langsung di token launch bila tersedia</td></tr>').join(""):'<tr><td colspan="5">'+safe(data.error||"Tidak ada token trending tervalidasi")+'</td></tr>';
 }catch(e){$("trendingStatus").textContent="UNAVAILABLE";$("trendingError").textContent=e.message}
}
refreshTrending();setInterval(()=>{if(!document.hidden)refreshTrending()},300000);
