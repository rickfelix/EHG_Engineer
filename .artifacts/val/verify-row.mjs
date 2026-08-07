import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`SELECT id, sd_id, sub_agent_code, sub_agent_name, verdict, confidence, phase,
  executed_from_cwd,
  metadata->>'repo_path' AS meta_repo_path,
  metadata->>'repo_verdict' AS repo_verdict,
  length(detailed_analysis) AS analysis_len,
  jsonb_array_length(COALESCE(critical_issues,'[]'::jsonb)) AS n_critical,
  jsonb_array_length(COALESCE(warnings,'[]'::jsonb)) AS n_warnings,
  jsonb_array_length(COALESCE(recommendations,'[]'::jsonb)) AS n_recs,
  created_at
  FROM public.sub_agent_execution_results WHERE id='d539b2c6-4c21-4fc6-ab29-482f46f8262c'`);
console.log(JSON.stringify(r.rows[0], null, 2));

console.log('\n=== gate view compliance check ===');
try {
  const v = await c.query(`SELECT * FROM public.v_sub_agent_repo_compliance WHERE execution_id='d539b2c6-4c21-4fc6-ab29-482f46f8262c'`);
  console.log(v.rows.length ? JSON.stringify(v.rows[0], null, 2) : 'no row in view (checking alt key col)');
  if (!v.rows.length) {
    const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='v_sub_agent_repo_compliance'`);
    console.log('view cols:', cols.rows.map(x=>x.column_name).join(', '));
    const v2 = await c.query(`SELECT * FROM public.v_sub_agent_repo_compliance WHERE id='d539b2c6-4c21-4fc6-ab29-482f46f8262c'`);
    console.log(v2.rows.length ? JSON.stringify(v2.rows[0], null, 2) : 'still no row');
  }
} catch(e){ console.log('view err:', e.message.slice(0,150)); }

console.log('\n=== detailed_analysis head (confirm not lost to failed compression) ===');
const d = await c.query(`SELECT substring(detailed_analysis,1,220) AS head FROM public.sub_agent_execution_results WHERE id='d539b2c6-4c21-4fc6-ab29-482f46f8262c'`);
console.log(d.rows[0].head);
await c.end();
