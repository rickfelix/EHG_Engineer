import pg from 'pg'; import dotenv from 'dotenv'; dotenv.config();
const url = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const c = new pg.Client({ connectionString: url, ssl:{rejectUnauthorized:false} }); await c.connect();
const cols = await c.query(`select column_name from information_schema.columns where table_name='sub_agent_execution_results' and column_name in ('sub_agent_code','verdict','phase','sd_id','confidence','created_at','summary')`);
console.log('cols present:', cols.rows.map(r=>r.column_name).join(', '));
const r = await c.query(`select id, sub_agent_code, verdict, phase, created_at,
  metadata->>'repo_path' repo_path, metadata->>'repo_resolved' repo_resolved,
  metadata->>'dedup_verdict' dedup, metadata->>'blocker_found' blocker,
  metadata->>'lead_recommendation' rec, metadata->>'lint_would_have_caught_of_3' lint_catch,
  left(summary,120) summary_head
  from sub_agent_execution_results where id='09ac5c83-847a-4420-ac9f-172308a26b97'`);
console.log(JSON.stringify(r.rows[0], null, 2));
// gate view check
try { const v = await c.query(`select * from v_sub_agent_repo_compliance where execution_id='09ac5c83-847a-4420-ac9f-172308a26b97'`); console.log('repo compliance view:', JSON.stringify(v.rows)); } catch(e){ console.log('view check:', e.message); }
await c.end();
