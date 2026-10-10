import pg from "pg";
const {Pool} = pg;
const url = process.env.DATABASE_URL;
let pool = url ? new Pool({connectionString:url,max:3,connectionTimeoutMillis:7000,idleTimeoutMillis:20000}) : null;
let ready = null;
let lastError = null;
async function initialize() {
  if (!pool) return false;
  if (!ready) ready = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS scanner_snapshots (
      id BIGSERIAL PRIMARY KEY,
      scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_status TEXT NOT NULL,
      total_tokens INTEGER NOT NULL,
      candidates INTEGER NOT NULL,
      errors JSONB NOT NULL DEFAULT '[]'::jsonb,
      sample JSONB NOT NULL DEFAULT '[]'::jsonb
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ai_reviews (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      token_id TEXT NOT NULL,
      chain TEXT NOT NULL,
      token_symbol TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      explanation TEXT NOT NULL,
      raw_result JSONB
    )`);
    return true;
  })().catch(e => {ready=null;lastError=e.message;throw e;});
  return ready;
}
export async function persistScan(state) {
  if (!pool || state.sourceStatus === "UNAVAILABLE") return false;
  try {
    await initialize();
    const sample = state.tokens.slice(0,75).map(({id,network,symbol,price,liquidity,volume24h,change24h,phase,momentum})=>({id,network,symbol,price,liquidity,volume24h,change24h,phase,momentum}));
    await pool.query(
      "INSERT INTO scanner_snapshots (source_status,total_tokens,candidates,errors,sample) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)",
      [state.sourceStatus,state.tokens.length,state.metrics.liquidityCandidates,JSON.stringify(state.errors),JSON.stringify(sample)]
    );
    lastError = null;
    return true;
  } catch (e) {lastError=e.message; console.error("[db scan]",e.message); return false;}
}
export async function getHistory() {
  if (!pool) return {configured:false,rows:[],reviews:[],error:null};
  try {
    await initialize();
    const [a,b] = await Promise.all([
      pool.query("SELECT scanned_at,source_status,total_tokens,candidates FROM scanner_snapshots ORDER BY id DESC LIMIT 48"),
      pool.query("SELECT created_at,token_id,chain,token_symbol,provider,model,recommendation,explanation FROM ai_reviews ORDER BY id DESC LIMIT 30")
    ]);
    lastError=null;
    return {configured:true,rows:a.rows.reverse(),reviews:b.rows,error:null};
  } catch(e){lastError=e.message;return {configured:true,rows:[],reviews:[],error:"Database temporarily unavailable"};}
}
export async function saveReview(token, analysis) {
  if (!pool) return false;
  try {
    await initialize();
    await pool.query(
      "INSERT INTO ai_reviews (token_id,chain,token_symbol,provider,model,recommendation,explanation,raw_result) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
      [token.id,token.network,token.symbol,analysis.provider,analysis.model,analysis.recommendation,analysis.explanation,JSON.stringify(analysis.data || {})]
    );
    return true;
  } catch(e){lastError=e.message;console.error("[db AI]",e.message);return false;}
}
export function dbInfo(){return {configured:!!pool,error:lastError};}
