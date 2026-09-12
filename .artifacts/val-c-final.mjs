import pg from 'pg'; import dotenv from 'dotenv'; dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const r = await c.query(`SELECT id, sub_agent_code, verdict, phase, confidence, created_at, updated_at,
  metadata->>'content_hash' AS hash, metadata->>'supersede_reason' AS sup,
  jsonb_array_length(metadata->'findings') AS nf, jsonb_array_length(recommendations) AS nr
  FROM sub_agent_execution_results WHERE sd_id='30a5f9e6-fa6c-47d2-abfc-5639745010f3'`);
console.log(JSON.stringify(r.rows,null,2).slice(0,1500));
const f = await c.query(`SELECT metadata->'findings'->3->>'detail' AS v4 FROM sub_agent_execution_results WHERE id='ab9b70a1-18f0-4191-bc04-26b48859029e'`);
console.log('\nV-4 now reads (tail):', String(f.rows[0].v4).slice(-330));
await c.end();
