import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const q = async (label,sql)=>{ const {data,error}=await s.rpc('exec_sql',{sql_text:sql}); console.log('=== '+label+' ==='); if(error) return console.log('ERR',error.message); console.log(JSON.stringify(data).slice(0,2200)); };
await q('pg_default_acl (existing ALTER DEFAULT PRIVILEGES config)',
 `select pg_get_userbyid(d.defaclrole) as for_role, n.nspname as schema, d.defaclobjtype as objtype,
   array_to_string(d.defaclacl,',') as acl
  from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace order by 1,2,3`);
await q('owners of the 42 (ADP FOR ROLE scoping target)',
 `select pg_get_userbyid(p.proowner) as owner, count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef group by 1 order by 2 desc`);
await q('anon-executable SECDEF fns in public (true residual exposure count)',
 `select count(*) filter (where has_function_privilege('anon',p.oid,'EXECUTE')) as anon_exec,
         count(*) filter (where has_function_privilege('authenticated',p.oid,'EXECUTE')) as auth_exec,
         count(*) as total_secdef
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef`);
