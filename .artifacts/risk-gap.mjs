import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const A = fs.readFileSync('.artifacts/risk-fns.txt','utf8').trim().split(/\r?\n/);
const B = fs.readFileSync('.artifacts/risk-fns-b.txt','utf8').trim().split(/\r?\n/);
const C = ['check_feedback_rate_limit','fn_advance_pipeline_stage','fn_is_chairman','fn_relay_insert_sms_candidate','is_leo_admin','lhe_pending_migration_applied','record_venture_error','set_session_working_context','venture_exists_and_active'];
const known = [...A,...B,...C,'set_coordinator_flag','clear_coordinator_flag','set_solomon_flag','clear_solomon_flag'];
const sql = `select p.proname, coalesce(array_to_string(p.proacl,','),'NULL') acl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')
 and p.proname not in (${known.map(x=>`'${x}'`).join(',')}) order by 1`;
const {data,error}=await s.rpc('exec_sql',{sql_text:sql});
if(error){console.error(error);process.exit(1);}
const rows=(data?.[0]?.result)||[];
console.log('ANON-EXECUTABLE SECDEF FNs IN *NO* BUCKET (untriaged residual exposure):', rows.length);
for(const r of rows) console.log(' -', r.proname, '|', r.acl);
