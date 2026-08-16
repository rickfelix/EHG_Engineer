import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sql = `select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_x,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_x,
  has_function_privilege('service_role',p.oid,'EXECUTE') as svc_x,
  coalesce(array_to_string(p.proacl,','),'NULL_DEFAULT') as acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('fn_stage_artifact_precondition','claim_sd','fn_is_chairman') limit 10`;
for (const fn of ['exec_sql','execute_sql']) {
  for (const param of ['sql','query','sql_text','p_sql']) {
    const { data, error } = await s.rpc(fn, { [param]: sql });
    if (!error) { console.log(`OK via ${fn}(${param}):`); console.log(JSON.stringify(data,null,1).slice(0,1500)); process.exit(0); }
    console.log(`${fn}(${param}) -> ${error.message.slice(0,90)}`);
  }
}
