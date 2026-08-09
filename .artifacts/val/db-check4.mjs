import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log('=== retention_archive: is session_coordination history durable there? ===');
const r = await c.query(`SELECT source_table, count(*)::int n, min(row_timestamp) oldest, max(row_timestamp) newest
  FROM public.retention_archive GROUP BY 1 ORDER BY n DESC LIMIT 10`);
console.table(r.rows);

console.log('\n=== issue_patterns.trend — WHO writes it? last_updated distribution ===');
const t = await c.query(`SELECT trend, count(*)::int n, max(updated_at) newest FROM public.issue_patterns GROUP BY 1 ORDER BY n DESC LIMIT 5`);
console.table(t.rows);

console.log('\n=== sub_agent_execution_results: existing rows for this SD ===');
const ev = await c.query(`SELECT id, sub_agent_code, verdict, phase, created_at FROM public.sub_agent_execution_results WHERE sd_id ILIKE '%TREND-EYES%' ORDER BY created_at DESC LIMIT 10`);
console.table(ev.rows);

console.log('\n=== merge_witness_telemetry date span (T-source viability) ===');
const m = await c.query(`SELECT count(*)::int n, min(created_at) oldest, max(created_at) newest FROM public.merge_witness_telemetry`);
console.table(m.rows);

console.log('\n=== retrospectives + issue_patterns span ===');
for (const tb of ['retrospectives','issue_patterns','chairman_decisions']) {
  const q = await c.query(`SELECT count(*)::int n, min(created_at) oldest, max(created_at) newest FROM public.${tb}`);
  console.log(`${tb}: ${JSON.stringify(q.rows[0])}`);
}

console.log('\n=== sms_relay_staging span (T1 source; uses received_at NOT created_at) ===');
const s = await c.query(`SELECT count(*)::int n, min(received_at) oldest, max(received_at) newest FROM public.sms_relay_staging`);
console.table(s.rows);
const inb = await c.query(`SELECT date_trunc('day', received_at)::date d, count(*)::int n FROM public.sms_relay_staging GROUP BY 1 ORDER BY 1 DESC LIMIT 8`);
console.table(inb.rows);
await c.end();
