import pg from "pg";
const {Pool}=pg;
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:6500,idleTimeoutMillis:20000}):null;
let ready=null,dbError=null;
async function init(){
  if(!pool)return false;
  if(!ready)ready=(async()=>{
    await pool.query(\`CREATE TABLE IF NOT EXISTS scanner_snapshots(
      id BIGSERIAL PRIMARY KEY,scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_status TEXT NOT NULL,total_tokens INTEGER NOT NULL,candidates INTEGER NOT NULL,
      errors JSONB NOT NULL DEFAULT '[]'::jsonb,sample JSONB NOT NULL DEFAULT '[]'::jsonb)\`);
    await pool.query(\`CREATE TABLE IF NOT EXISTS ai_reviews(
      id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      token_id TEXT NOT NULL,chain TEXT NOT NULL,token_symbol TEXT NOT NULL,
      provider TEXT NOT NULL,model TEXT NOT NULL,recommendation TEXT NOT NULL,
      explanation TEXT NOT NULL,raw_result JSONB)\`);
    await pool.query(\`CREATE TABLE IF NOT EXISTS token_discoveries(
      token_id TEXT PRIMARY KEY,network TEXT NOT NULL,symbol TEXT NOT NULL,first_seen TIMESTAMPTZ NOT NULL,
      first_price NUMERIC NOT NULL CHECK(first_price>0),last_seen TIMESTAMPTZ NOT NULL,
      last_price NUMERIC NOT NULL,max_price NUMERIC NOT NULL,min_price NUMERIC NOT NULL,
      last_liquidity NUMERIC,source TEXT,latest_phase TEXT)\`);
    await pool.query(\`CREATE TABLE IF NOT EXISTS token_observations(
      id BIGSERIAL PRIMARY KEY,observed_at TIMESTAMPTZ NOT NULL,token_id TEXT NOT NULL,
      price NUMERIC NOT NULL,liquidity NUMERIC NOT NULL,volume24h NUMERIC NOT NULL,
      phase TEXT NOT NULL,source TEXT NOT NULL)\`);
    await pool.query("CREATE INDEX IF NOT EXISTS idx_observations_token_time ON token_observations(token_id,observed_at DESC)");
    await pool.query(\`CREATE TABLE IF NOT EXISTS token_milestones(
      token_id TEXT NOT NULL,horizon TEXT NOT NULL,baseline TIMESTAMPTZ NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL,first_price NUMERIC NOT NULL,
      evaluation_price NUMERIC NOT NULL,max_price NUMERIC NOT NULL,min_price NUMERIC NOT NULL,
      PRIMARY KEY(token_id,horizon))\`);
    await pool.query(\`CREATE TABLE IF NOT EXISTS inspections(
      token_id TEXT PRIMARY KEY,inspected_at TIMESTAMPTZ NOT NULL,
      signal_status TEXT NOT NULL,payload JSONB NOT NULL)\`);
    return true;
  })().catch(e=>{ready=null;dbError=e.message;throw e});
  return ready;
}
export async function persistScan(state){
  if(!pool||!state?.tokens?.length||!["LIVE","PARTIAL"].includes(state.sourceStatus))return false;
  try{
    await init();
    const scanAt=new Date().toISOString();
    const rows=state.tokens.filter(t=>t.price>0&&t.tokenAddress).map(t=>({
      token_id:t.id,symbol:t.symbol,network:t.network,
      price:t.price,liquidity:t.liquidity,volume24h:t.volume24h,
      phase:t.phase,source:t.source
    }));
    const json=JSON.stringify(rows);
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      await client.query(\`INSERT INTO scanner_snapshots(source_status,total_tokens,candidates,errors,sample)
        VALUES($1,$2,$3,$4::jsonb,$5::jsonb)\`,
        [state.sourceStatus,state.tokens.length,state.metrics.liquidityCandidates,JSON.stringify(state.errors),
         JSON.stringify(rows.slice(0,75))]);
      await client.query(\`WITH incoming AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb)
          AS r(token_id TEXT,symbol TEXT,network TEXT,price NUMERIC,liquidity NUMERIC,volume24h NUMERIC,phase TEXT,source TEXT)
        ) INSERT INTO token_discoveries(token_id,network,symbol,first_seen,first_price,last_seen,last_price,max_price,min_price,last_liquidity,source,latest_phase)
        SELECT token_id,network,symbol,$2::timestamptz,price,$2::timestamptz,price,price,price,liquidity,source,phase FROM incoming
        ON CONFLICT(token_id) DO UPDATE SET last_seen=EXCLUDED.last_seen,last_price=EXCLUDED.last_price,
          max_price=GREATEST(token_discoveries.max_price,EXCLUDED.last_price),
          min_price=LEAST(token_discoveries.min_price,EXCLUDED.last_price),
          last_liquidity=EXCLUDED.last_liquidity,latest_phase=EXCLUDED.latest_phase\`,[json,scanAt]);
      await client.query(\`WITH incoming AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb)
        AS r(token_id TEXT,symbol TEXT,network TEXT,price NUMERIC,liquidity NUMERIC,volume24h NUMERIC,phase TEXT,source TEXT)
      ) INSERT INTO token_observations(observed_at,token_id,price,liquidity,volume24h,phase,source)
        SELECT $2::timestamptz,token_id,price,liquidity,volume24h,phase,source FROM incoming\`,[json,scanAt]);
      await client.query(\`WITH incoming AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb)
        AS r(token_id TEXT,symbol TEXT,network TEXT,price NUMERIC,liquidity NUMERIC,volume24h NUMERIC,phase TEXT,source TEXT)
      ) INSERT INTO token_milestones(token_id,horizon,baseline,observed_at,first_price,evaluation_price,max_price,min_price)
      SELECT d.token_id,h.label,d.first_seen,$2::timestamptz,d.first_price,i.price,d.max_price,d.min_price
      FROM incoming i JOIN token_discoveries d ON d.token_id=i.token_id
      CROSS JOIN (VALUES('1H',interval '1 hour'),('6H',interval '6 hours'),('12H',interval '12 hours'),
      ('24H',interval '24 hours'),('7D',interval '7 days'),('30D',interval '30 days')) AS h(label,delay)
      WHERE $2::timestamptz >= d.first_seen+h.delay
      ON CONFLICT(token_id,horizon) DO NOTHING\`,[json,scanAt]);
      await client.query("COMMIT");
    }catch(e){await client.query("ROLLBACK");throw e}
    finally{client.release()}
    dbError=null;return true;
  }catch(e){dbError=e.message;console.error("[store]",e.message);return false}
}
export async function saveInspection(token,inspection,decision){
  if(!pool)return false;
  try{await init();await pool.query(\`INSERT INTO inspections(token_id,inspected_at,signal_status,payload)
  VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT(token_id)
  DO UPDATE SET inspected_at=excluded.inspected_at,signal_status=excluded.signal_status,payload=excluded.payload\`,
  [token.id,inspection.inspectedAt,decision.status,JSON.stringify({inspection,decision})]);return true}
  catch(e){dbError=e.message;return false}
}
export async function saveReview(token,analysis){
  if(!pool)return false;
  try{await init();await pool.query(\`INSERT INTO ai_reviews(token_id,chain,token_symbol,provider,model,recommendation,explanation,raw_result)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)\`,
    [token.id,token.network,token.symbol,analysis.provider,analysis.model,analysis.recommendation,analysis.explanation,JSON.stringify(analysis.data||{})]);return true;}
  catch(e){dbError=e.message;console.error("[store AI]",e.message);return false}
}
export async function getHistory(){
  if(!pool)return {configured:false,rows:[],reviews:[],summary:null};
  try{
    await init();
    const [snap,reviews,tracked,milestones,inspections]=await Promise.all([
      pool.query("SELECT scanned_at,source_status,total_tokens,candidates FROM scanner_snapshots ORDER BY id DESC LIMIT 48"),
      pool.query("SELECT created_at,token_id,chain,token_symbol,provider,model,recommendation,explanation FROM ai_reviews ORDER BY id DESC LIMIT 30"),
      pool.query("SELECT count(*)::int tracked, count(*) FILTER(WHERE last_seen<now()-interval '12 hours')::int stale FROM token_discoveries"),
      pool.query(\`SELECT horizon,count(*)::int samples,
        avg((evaluation_price/NULLIF(first_price,0)-1)*100)::float avg_return_pct,
        count(*) FILTER(WHERE max_price>=first_price*2)::int hit_2x,
        count(*) FILTER(WHERE max_price>=first_price*5)::int hit_5x
        FROM token_milestones GROUP BY horizon ORDER BY CASE horizon WHEN '1H' THEN 1 WHEN '6H' THEN 2
        WHEN '12H' THEN 3 WHEN '24H' THEN 4 WHEN '7D' THEN 5 ELSE 6 END\`),
      pool.query("SELECT count(*)::int total FROM inspections")
    ]);
    dbError=null;
    return {configured:true,rows:snap.rows.reverse(),reviews:reviews.rows,
      summary:{...tracked.rows[0],milestones:milestones.rows,inspections:inspections.rows[0].total,
        calibrated:false,notice:"Observational history only. Forward holdout and price-executable validation not established."}};
  }catch(e){dbError=e.message;return {configured:true,rows:[],reviews:[],summary:null,error:"Database temporarily unavailable"}}
}
export function dbInfo(){return {configured:!!pool,error:dbError}}
