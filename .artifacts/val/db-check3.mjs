import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log('=== archive tables (durable source for expired coordination rows) ===');
const a = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%archive%' OR table_name ILIKE '%retention%') ORDER BY 1`);
console.log(a.rows.map(r=>r.table_name).join('\n') || '(none)');

for (const t of ['coordination_archive','retention_archive','session_coordination_archive']) {
  try { const r = await c.query(`SELECT count(*)::int n FROM public.${t}`); console.log(`  ${t}: ${r.rows[0].n} rows`); } catch(e) { console.log(`  ${t}: ABSENT`); }
}

console.log('\n=== calculate_pattern_trends() live? (the dormant issue_patterns trend detector) ===');
const f = await c.query(`SELECT proname, pg_get_function_identity_arguments(oid) args FROM pg_proc WHERE proname IN ('calculate_pattern_trends','cleanup_expired_coordination')`);
console.table(f.rows);

console.log('\n=== issue_patterns.trend column + live distribution ===');
try {
  const r = await c.query(`SELECT trend, count(*)::int n FROM public.issue_patterns GROUP BY 1 ORDER BY n DESC`);
  console.table(r.rows);
} catch(e){ console.log('no trend column:', e.message.slice(0,100)); }

console.log('\n=== sub_agent_execution_results columns (confirm NO top-level repo_path) ===');
const s = await c.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='sub_agent_execution_results' ORDER BY ordinal_position`);
console.log(s.rows.map(r=>`${r.column_name}:${r.data_type}${r.is_nullable==='NO'?' NOT NULL':''}`).join(' | '));

console.log('\n=== existing VALIDATION evidence rows for this SD? ===');
const ev = await c.query(`SELECT id, sub_agent_code, status, created_at FROM public.sub_agent_execution_results WHERE sd_id::text ILIKE '%TREND-EYES%' ORDER BY created_at DESC LIMIT 5`);
console.table(ev.rows);
await c.end();
