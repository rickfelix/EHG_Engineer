import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
const sb = await getSupabaseClient();
const sql = `select 'POLICY' k, policyname n, roles::text r, cmd c, coalesce(qual,'-') q
             from pg_policies where schemaname='public' and tablename='eva_sync_state'
             union all
             select 'GRANT', grantee, privilege_type, '', ''
             from information_schema.role_table_grants
             where table_schema='public' and table_name='eva_sync_state'
             union all
             select 'RLS_ENABLED', relrowsecurity::text, '', '', ''
             from pg_class where oid='public.eva_sync_state'::regclass`;
for (const fn of ['exec_sql','execute_sql','run_sql']) {
  const { data, error } = await sb.rpc(fn, { query: sql }).then(r=>r, e=>({error:e}));
  if (!error) { console.log(`via ${fn}:`); console.log(JSON.stringify(data, null, 1)); process.exit(0); }
  console.log(`${fn}: ${error.message}`);
}
