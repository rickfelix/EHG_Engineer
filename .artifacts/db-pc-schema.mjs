import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const q = async (label, sql) => {
  try { const r = await c.query(sql); console.log(`\n=== ${label} ===`); console.log(JSON.stringify(r.rows, null, 1)); }
  catch (e) { console.log(`\n=== ${label} ERROR === ${e.message}`); }
};
await q('COLUMNS', `select column_name, data_type, is_nullable, column_default
 from information_schema.columns where table_schema='public' and table_name='plan_critiques' order by ordinal_position`);
await q('RLS_AND_ROWS', `select c.relrowsecurity, c.relforcerowsecurity, c.reltuples::bigint est_rows,
 (select count(*) from public.plan_critiques) actual_rows
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='plan_critiques'`);
await q('POLICIES', `select policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname='public' and tablename='plan_critiques'`);
await q('INDEXES', `select indexname, indexdef from pg_indexes where schemaname='public' and tablename='plan_critiques'`);
await q('CONSTRAINTS', `select conname, contype, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.plan_critiques'::regclass`);
await q('TRIGGERS', `select tgname from pg_trigger where tgrelid='public.plan_critiques'::regclass and not tgisinternal`);
await q('GRANTS', `select grantee, string_agg(privilege_type,',' order by privilege_type) privs from information_schema.role_table_grants where table_schema='public' and table_name='plan_critiques' group by grantee`);
await q('SIZE', `select pg_size_pretty(pg_total_relation_size('public.plan_critiques')) total, pg_size_pretty(pg_relation_size('public.plan_critiques')) heap`);
await q('DEPENDENT_VIEWS', `select distinct dv.relname view_name from pg_depend d join pg_rewrite r on r.oid=d.objid
 join pg_class dv on dv.oid=r.ev_class join pg_class st on st.oid=d.refobjid join pg_namespace sn on sn.oid=st.relnamespace
 where sn.nspname='public' and st.relname='plan_critiques' and dv.relname<>'plan_critiques'`);
await q('ROW_STATS', `select count(*) total,
 count(*) filter (where created_at >= now()-interval '1 day') last_24h,
 count(*) filter (where created_at >= now()-interval '14 days') last_14d,
 count(*) filter (where overall_severity='block') blocks,
 count(*) filter (where override_reason is not null and override_by is not null) overridden,
 count(*) filter (where overall_severity='block' and override_reason is not null and override_by is not null and created_at >= now()-interval '14 days') active_override_candidates,
 min(created_at) oldest, max(created_at) newest from public.plan_critiques`);
await q('BURST_PATTERN', `select sd_id, count(*) n, min(created_at) first, max(created_at) last,
 extract(epoch from (max(created_at)-min(created_at)))::int span_sec
 from public.plan_critiques group by sd_id having count(*)>1 order by n desc limit 8`);
await c.end();
