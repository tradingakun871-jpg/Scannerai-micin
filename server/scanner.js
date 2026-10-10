const BASE = "https://api.geckoterminal.com/api/v2";
const NETWORKS = [
  { id: "solana", label: "Solana", code: "SOL" },
  { id: "eth", label: "Ethereum", code: "ETH" },
  { id: "bsc", label: "BNB Chain", code: "BSC" },
  { id: "base", label: "Base", code: "BASE" }
];
export const SCAN_INTERVAL_MS = 300000;
const asNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const readLink = (r, kind, network) => {
  const id = r?.relationships?.[kind]?.data?.id || "";
  return id.startsWith(network + "_") ? id.slice(network.length + 1) : id;
};
async function loadJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 13500);
  try {
    const response = await fetch(url, {
      headers: {"Accept":"application/json;version=20230203","User-Agent":"ScannerAI-Micin/2.0"},
      signal: controller.signal
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return await response.json();
  } finally { clearTimeout(timeout); }
}
function normalize(pool, network, source) {
  const a = pool.attributes || {};
  const liq = asNum(a.reserve_in_usd);
  const volume = asNum(a.volume_usd?.h24);
  const change24h = asNum(a.price_change_percentage?.h24);
  const tx = a.transactions?.h24 || {};
  const buys = asNum(tx.buys);
  const sells = asNum(tx.sells);
  const createdMs = Date.parse(a.pool_created_at || "") || 0;
  const ageHours = createdMs ? Math.max(0, (Date.now() - createdMs) / 3600000) : null;
  const poolAddress = readLink(pool, "pool", network) || (pool.id || "").replace(new RegExp("^" + network + "_"), "");
  const tokenAddress = readLink(pool, "base_token", network);
  const rawName = String(a.name || "Unknown / ?").split(" / ");
  const symbol = (rawName[0] || "UNKNOWN").trim().slice(0, 28);
  const price = asNum(a.base_token_price_usd);
  let phase = "DISCOVERY";
  if (change24h < -15 && sells > buys) phase = "DISTRIBUTION";
  else if (change24h > 28 && buys > sells) phase = "EARLY BREAKOUT";
  else if (ageHours !== null && ageHours < 36) phase = "NEW POOL";
  else if (change24h > -6 && change24h < 28 && buys >= sells * 1.2 && buys > 12) phase = "ACCUMULATION";
  else if (change24h > 0) phase = "TRENDING";
  // Market activity ranking, NOT AI prediction, safety score, or win probability.
  const liqScore = Math.min(23, Math.max(0, Math.log10(Math.max(1, liq)) - 4) * 13);
  const volScore = Math.min(26, Math.log10(Math.max(1, volume)) * 4);
  const buyersScore = Math.min(25, buys + sells > 0 ? (buys / (buys + sells)) * 34 : 0);
  const priceScore = Math.min(16, Math.max(0, change24h + 10) / 5);
  const youngScore = ageHours !== null && ageHours < 168 ? 10 : 3;
  const momentum = Math.round(Math.min(100, liqScore + volScore + buyersScore + priceScore + youngScore));
  return {
    id: network + ":" + (tokenAddress || poolAddress),
    network, networkName: NETWORKS.find(x => x.id === network)?.label || network,
    symbol, name: a.name || symbol, tokenAddress, poolAddress,
    price, liquidity: liq, volume24h: volume, change24h, buys, sells,
    marketCap: asNum(a.market_cap_usd), fdv: asNum(a.fdv_usd),
    ageHours, createdAt: createdMs ? new Date(createdMs).toISOString() : null,
    phase, momentum, discovery: source, source: "GeckoTerminal",
    url: "https://www.geckoterminal.com/" + network + "/pools/" + encodeURIComponent(poolAddress),
    liquidityCategory: liq > 1000000 ? "LOCK_REQUIRED" : liq >= 100000 ? "UNLOCKED_REQUIRED" : "BELOW_MINIMUM",
    liquidityLock: "UNVERIFIED",
    holderMaxPct: null, bundlerSupplyPct: null, sniperSupplyPct: null,
    security: "UNVERIFIED", social: "INSUFFICIENT DATA",
    signal: "WAIT", targetX: null, tpProbability: null, aiScore: null,
    checks: {
      liquidityAmount: liq >= 100000,
      liquidityLock: false, holder: false, contract: false,
      bundler: false, sniper: false, social: false, smartMoney: false
    }
  };
}
function summarize(tokens) {
  const unique = new Set(tokens.map(x => x.id));
  return {
    observed: unique.size,
    liquidityCandidates: tokens.filter(x => x.liquidity >= 100000).length,
    buys: 0,
    newPools: tokens.filter(x => x.discovery === "New Pools").length,
    chains: NETWORKS.length
  };
}
let cache = {
  tokens: [], scannedAt: null, scanStartedAt: null,
  loading: false, errors: [], metrics: summarize([]), lastScanDurationMs: null,
  sourceStatus: "INITIALIZING"
};
let inflight = null;
export function scanStatus() { return cache; }
export async function scanMarkets(force = false) {
  if (inflight) return inflight;
  if (!force && cache.scannedAt && Date.now() - Date.parse(cache.scannedAt) < SCAN_INTERVAL_MS) return cache;
  inflight = (async () => {
    cache = {...cache, loading: true, scanStartedAt: new Date().toISOString()};
    const start = Date.now();
    const jobs = NETWORKS.flatMap(n => [
      {n, type:"Trending 24H", url:`${BASE}/networks/${n.id}/trending_pools?duration=24h`},
      {n, type:"New Pools", url:`${BASE}/networks/${n.id}/new_pools`}
    ]);
    const results = await Promise.allSettled(jobs.map(j => loadJson(j.url)));
    const found = new Map(); const errors = [];
    for (let i = 0; i < results.length; i++) {
      const j = jobs[i]; const result = results[i];
      if (result.status === "rejected") {
        errors.push(j.n.label + " / " + j.type + ": " + String(result.reason?.message || "provider unavailable"));
        continue;
      }
      for (const row of result.value?.data || []) {
        const t = normalize(row, j.n.id, j.type);
        if (!t.tokenAddress || !t.poolAddress || !Number.isFinite(t.price) || t.price <= 0) continue;
        const prior = found.get(t.id);
        if (!prior || (t.liquidity > prior.liquidity)) found.set(t.id, t);
      }
    }
    const tokens = [...found.values()].sort((a,b) => b.momentum - a.momentum || b.volume24h - a.volume24h);
    // Never substitute demo tokens on a provider error.
    const keepPrevious = !tokens.length && cache.tokens.length;
    cache = {
      tokens: keepPrevious ? cache.tokens : tokens,
      scannedAt: keepPrevious ? cache.scannedAt : new Date().toISOString(),
      scanStartedAt: cache.scanStartedAt, loading: false,
      errors, metrics: summarize(keepPrevious ? cache.tokens : tokens),
      lastScanDurationMs: Date.now() - start,
      sourceStatus: tokens.length ? (errors.length ? "PARTIAL" : "LIVE") : (keepPrevious ? "STALE" : "UNAVAILABLE")
    };
    return cache;
  })();
  try { return await inflight; }
  finally { inflight = null; }
}
export {NETWORKS};
