// Snapshot-only UI pipeline. Observed data != verified security PASS.
// No network calls, no score promotion, never overrides Blueprint V2.0 BUY gate.
const evidenceStatus=x=>x?.status||"UNVERIFIED";
const sampled=x=>Number(x?.accountsInspected||x?.sampledCount||x?.observedCount||x?.sampledHolderCount||0);
export function summarizePipeline({tokens=[],focusId=null,sourceStatus="UNKNOWN",provider={},aiSuccessAt=null,aiErrorAt=null}={}){
  const eligible=tokens.filter(t=>t&&t.liquidity>=100000);
  const audited=eligible.filter(t=>!!t.inspection);
  const focus=eligible.find(t=>t.id===focusId)||
    [...audited].sort((a,b)=>Date.parse(b.inspection?.inspectedAt||0)-Date.parse(a.inspection?.inspectedAt||0))[0]||
    eligible[0]||null;
  const insp=focus?.inspection||null;
  const amount=Number(focus?.liquidity||0);
  const a=provider?.provider==="openai"?"OpenAI":provider?.provider==="anthropic"?"Claude":provider?.provider==="router"?"9Router":"AI";
  const status=(key,label,detail)=>({key,status:label,detail});
  const gates={};
  gates.market=sourceStatus==="LIVE"?status("market","ACTIVE","GeckoTerminal/DEX: sumber LIVE"):
    sourceStatus==="PARTIAL"?status("market","PARTIAL","Sebagian sumber market gagal; tidak semua pool tercakup"):
    status("market","WAITING","Data market belum siap");
  const lp=insp?.liquidityLock;
  if(!focus)gates.liquidity=status("liquidity","WAITING","Belum ada kandidat dengan liquidity ≥ $100K");
  else if(amount<100000)gates.liquidity=status("liquidity","REJECT","Liquidity di bawah batas minimum");
  else if(lp?.status==="PASS")gates.liquidity=status("liquidity","PASS","Liquidity nominal lolos; bukti LP sesuai exact pool");
  else if(!insp)gates.liquidity=status("liquidity","NOT CHECKED","Nominal liquidity lolos; LP belum diperiksa");
  else if(lp?.exactPoolEvidence||lp?.observedLpHolders>0)
    gates.liquidity=status("liquidity","PARTIAL","Data LP tersedia, tetapi lock/unlock exact pool belum terverifikasi");
  else gates.liquidity=status("liquidity","UNVERIFIED","Liquidity lolos nominal; bukti lock/unlock pool belum memadai");

  const holders=insp?.holders;
  if(!insp)gates.holder=status("holder","NOT CHECKED","Pemeriksaan holder token belum dilakukan");
  else if(holders?.status==="REJECT"||holders?.status==="CRITICAL")
    gates.holder=status("holder","BLOCKED","Pelanggaran holder terverifikasi");
  else if(holders?.status==="PASS")gates.holder=status("holder","PASS","Distribusi holder dan cluster terverifikasi");
  else if(sampled(holders)>0||holders?.topObservedPct!==null&&holders?.topObservedPct!==undefined)
    gates.holder=status("holder","PARTIAL",sampled(holders)+" akun/wallet sampel; pengecualian LP dan cluster belum lengkap");
  else gates.holder=status("holder","UNVERIFIED","Data holder belum lengkap atau tidak tersedia");
  
  const b=insp?.bundler, s=insp?.sniper, w=insp?.walletClustering;
  if(!insp)gates.wallet=status("wallet","NOT CHECKED","Bundler/sniper belum diperiksa");
  else if([b,s,w].some(x=>["CRITICAL","REJECT"].includes(evidenceStatus(x))))
    gates.wallet=status("wallet","BLOCKED","Risiko wallet kritis terkonfirmasi");
  else if([b,s,w].every(x=>x?.status==="PASS"))
    gates.wallet=status("wallet","PASS","Bundler, sniper dan cluster terverifikasi");
  else if(Number(b?.sameBlockTransfers||b?.sameBlockTransactionPeak||s?.recentTransferCount||w?.observedTransfers||0)>0)
    gates.wallet=status("wallet","PARTIAL","Transfer/indikasi wallet diamati; identitas dan transaksi launch belum terbukti");
  else gates.wallet=status("wallet","UNVERIFIED","Belum ada bukti launch/funding/wallet yang memadai");

  const success=!!aiSuccessAt,ready=provider?.configured===true;
  if(!ready)gates.socialAI=status("socialAI","WAITING",a+" belum siap; Social Sentiment belum terverifikasi");
  else if(insp?.social?.status==="PASS"&&success)
    gates.socialAI=status("socialAI","PARTIAL",a+" merespons; perlu keputusan dan Opportunity Score tervalidasi");
  else if(success)gates.socialAI=status("socialAI","PARTIAL",a+" berhasil analisis; Social Sentiment tetap belum cukup bukti");
  else gates.socialAI=status("socialAI","CONFIGURED",a+" dikonfigurasi; respons terbaru belum terkonfirmasi; Social belum lengkap");

  const complete=Object.values(gates).every(g=>g.status==="PASS");
  return {
    overall:complete?"CHECKS COMPLETE":"FAIL CLOSED",
    basis:focus?{id:focus.id,symbol:focus.symbol,network:focus.network,liquidity:focus.liquidity,inspectedAt:insp?.inspectedAt||null}:null,
    coverage:{total:eligible.length,inspected:audited.length,
      lpPass:audited.filter(t=>t.inspection?.liquidityLock?.status==="PASS").length,
      holderPass:audited.filter(t=>t.inspection?.holders?.status==="PASS").length},
    sourceStatus,
    ai:{provider:a,configured:ready,lastSuccessAt:aiSuccessAt,lastErrorAt:aiErrorAt},
    gates
  };
}
