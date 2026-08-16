import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const A = fs.readFileSync('.artifacts/risk-fns.txt','utf8').trim().split(/\r?\n/);
const B = fs.readFileSync('.artifacts/risk-fns-b.txt','utf8').trim().split(/\r?\n/);
const C = ['check_feedback_rate_limit','fn_advance_pipeline_stage','fn_is_chairman','fn_relay_insert_sms_candidate','is_leo_admin','lhe_pending_migration_applied','record_venture_error','set_session_working_context','venture_exists_and_active'];
const all = [...A,...B,...C];
const list = all.map(n=>`'${n}'`).join(',');
const sql = `select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_x,
 has_function_privilege('authenticated',p.oid,'EXECUTE') auth_x,
 has_function_privilege('service_role',p.oid,'EXECUTE') svc_x,
 coalesce(array_to_string(p.proacl,','),'NULL_DEFAULT_ALL_PUBLIC') acl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (${list}) order by p.proname`;
const { data, error } = await s.rpc('exec_sql',{ sql_text: sql });
if(error){ console.error('ERR',error); process.exit(1); }
const rows = (Array.isArray(data)? (data[0]?.result ?? data[0]?.rows ?? data) : data);
const flat = Array.isArray(rows)? rows.flatMap(r=> r.result||r.rows||[r]) : [];
const byName = {}; for(const r of flat){ if(r.proname) (byName[r.proname] ||= []).push(r); }
const bucket = n => A.includes(n)?'A': B.includes(n)?'B':'C';
console.log('name,bucket,overloads,anon_x,auth_x,svc_x,secdef,acl_shape');
const missing=[];
for(const n of all){
  const rs = byName[n];
  if(!rs){ missing.push(n); continue; }
  for(const r of rs){
    const acl = r.acl;
    const shape = acl==='NULL_DEFAULT_ALL_PUBLIC' ? 'NULL(implicit PUBLIC)' :
      [acl.includes('=X/')&&/(^|,)=X\//.test(acl)?'PUBLIC':null, acl.includes('anon=X')?'anon':null, acl.includes('authenticated=X')?'auth':null, acl.includes('service_role=X')?'svc':null].filter(Boolean).join('+');
    console.log(`${n},${bucket(n)},${rs.length},${r.anon_x},${r.auth_x},${r.svc_x},${r.prosecdef},${shape}`);
  }
}
console.log('\nMISSING FROM CATALOG:', missing.join(', ')||'(none)');
