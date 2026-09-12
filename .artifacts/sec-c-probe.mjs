import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });

const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL });
await c.connect();
const q = async (label, sql) => {
  try { const r = await c.query(sql); console.log(`\n### ${label}\n` + JSON.stringify(r.rows, null, 1)); }
  catch (e) { console.log(`\n### ${label}\nERROR: ${e.message}`); }
};

await q('1. feedback snooze-related columns', `
 SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name='feedback'
   AND (column_name LIKE '%snooz%' OR column_name='metadata' OR column_name='status')
 ORDER BY column_name`);

await q('2. view exposes snoozed_until / metadata?', `
 SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='v_feedback_with_sensemaking'
   AND column_name IN ('snoozed_until','metadata','status','feedback_type','source_type')
 ORDER BY column_name`);

await q('3. view security_invoker reloption (MEASURED, not derived)', `
 SELECT c.relname, c.relkind, c.reloptions,
        pg_get_userbyid(c.relowner) AS owner
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='v_feedback_with_sensemaking'`);

await q('4. RLS enabled on feedback + policies', `
 SELECT relrowsecurity, relforcerowsecurity FROM pg_class
 WHERE oid='public.feedback'::regclass`);

await q('5. feedback policies (roles + cmd)', `
 SELECT polname, polcmd,
   (SELECT array_agg(pg_get_userbyid(r)) FROM unnest(polroles) r) AS roles,
   pg_get_expr(polqual, polrelid) AS using_expr
 FROM pg_policy WHERE polrelid='public.feedback'::regclass ORDER BY polname`);

await q('6. anon/authenticated grants on feedback + view', `
 SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
 FROM information_schema.role_table_grants
 WHERE table_schema='public' AND table_name IN ('feedback','v_feedback_with_sensemaking')
   AND grantee IN ('anon','authenticated')
 GROUP BY table_name, grantee ORDER BY table_name, grantee`);

await q('7. feedback_status_check allowed values', `
 SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
 WHERE conrelid='public.feedback'::regclass AND contype='c' AND conname LIKE '%status%'`);

await q('8. LIVE blast radius: rows that would be newly hidden by the .or() clause', `
 SELECT count(*) FILTER (WHERE snoozed_until IS NOT NULL) AS any_snoozed_until,
        count(*) FILTER (WHERE snoozed_until > now()) AS future_snoozed_until,
        count(*) FILTER (WHERE metadata->'snooze'->>'active' = 'true') AS marker_active,
        count(*) AS total
 FROM public.feedback`);

await q('9. anon-readable rows that carry a metadata.snooze marker today', `
 SELECT count(*) FILTER (WHERE feedback_type LIKE 'user_%' AND venture_id IS NOT NULL) AS anon_venture_readable,
        count(*) FILTER (WHERE source_type='telegram') AS anon_telegram_readable
 FROM public.feedback WHERE metadata ? 'snooze'`);

await c.end();
