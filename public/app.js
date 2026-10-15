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
try{const r=await fetch("/api/inspect",{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Key":$("key").value},body:JSON.stringify({mint:b.dataset.mint})}),d=await r.json();$("detail").textContent=JSON.stringify(d,null,2)}
catch(e){$("detail").textContent="Gagal: "+e.message}finally{busy=false;b.disabled=false}});
refresh();setInterval(()=>{if(!document.hidden)refresh()},5000);
