import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const sd = (await c.query(`select sd_id from public.plan_critiques group by sd_id order by count(*) desc limit 1`)).rows[0].sd_id;
console.log('probe sd_id =', sd, '\n');
const ex = async (label, sql) => {
  const r = await c.query('EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ' + sql);
  console.log(`--- ${label} ---`); r.rows.forEach(x=>console.log('  '+x['QUERY PLAN'])); console.log();
};
await ex('findActiveOverride shape (TODAY, no content_hash)', `select id, findings, override_reason, override_by, created_at from public.plan_critiques
 where sd_id='${sd}' and overall_severity='block' and override_reason is not null and override_by is not null
 and created_at >= now()-interval '14 days' order by created_at desc limit 10`);
await ex('FR-B cache lookup shape via JSONB path (no index)', `select id, findings from public.plan_critiques
 where sd_id='${sd}' and token_usage->>'x' = 'deadbeef' and created_at >= now()-interval '10 minutes' order by created_at desc limit 1`);
await ex('bare sd_id lookup (has btree idx today)', `select id from public.plan_critiques where sd_id='${sd}'`);
console.log('--- planner sizing ---');
const p = await c.query(`select relpages, reltuples::bigint, pg_size_pretty(pg_relation_size('public.plan_critiques')) heap from pg_class where oid='public.plan_critiques'::regclass`);
console.log(' ', JSON.stringify(p.rows[0]));
const u = await c.query(`select indexrelname, idx_scan, idx_tup_read from pg_stat_user_indexes where relname='plan_critiques' order by idx_scan desc`);
console.log('--- index usage since stats reset ---'); u.rows.forEach(x=>console.log(`  ${x.indexrelname}: scans=${x.idx_scan} tup_read=${x.idx_tup_read}`));
await c.end();
