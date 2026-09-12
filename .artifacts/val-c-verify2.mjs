import pg from 'pg'; import dotenv from 'dotenv'; dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const r = await c.query(`SELECT id, sub_agent_code, verdict, phase, created_at,
  metadata->>'repo_path' AS repo_path, metadata->>'executed_from_cwd' AS cwd,
  metadata->>'duplicate_check' AS dupchk, metadata->>'validation_gate' AS gate,
  metadata->'claims_refuted' AS refuted,
  jsonb_array_length(COALESCE(results->'findings', metadata->'findings','[]'::jsonb)) AS n_find
  FROM sub_agent_execution_results WHERE sd_id='30a5f9e6-fa6c-47d2-abfc-5639745010f3' ORDER BY created_at DESC LIMIT 2`);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
