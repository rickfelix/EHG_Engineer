import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const D='chairman_decision:6cb60a30-93d4-49a3-83b4-8e1ba1d49dd2';
const KEYS=['STAGE_GATE_PREDICATE_ARMED','LEO_HIGH_CONSEQUENCE_GATES_ENABLED','HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED'];

const {data:audit,error:ae} = await sb.from('leo_feature_flag_audit_log').select('id,flag_key,action,changed_by,environment,created_at').in('flag_key',KEYS).order('created_at',{ascending:false}).limit(25);
console.log('AUDIT ROWS err=',ae?.message); console.table(audit||[]);

const dup = (audit||[]).filter(r=>r.changed_by===D);
console.log('citation rows count:', dup.length, 'per-flag:', JSON.stringify(dup.reduce((a,r)=>{a[r.flag_key]=(a[r.flag_key]||0)+1;return a;},{})));

const {data:appr,error:pe} = await sb.from('leo_feature_flag_approvals').select('*').eq('flag_key','STAGE_GATE_PREDICATE_ARMED');
console.log('\nAPPROVALS err=',pe?.message); console.log(JSON.stringify(appr,null,1));

const {data:flags} = await sb.from('leo_feature_flags').select('flag_key,is_enabled,lifecycle_state,risk_tier,rolled_out_at').in('flag_key',KEYS);
console.log('\nFLAGS'); console.table(flags||[]);

const {data:dec,error:de} = await sb.from('chairman_decisions').select('id,status,decided_at,decision').eq('id','6cb60a30-93d4-49a3-83b4-8e1ba1d49dd2').maybeSingle();
console.log('\nDECISION err=',de?.message, JSON.stringify(dec));
const {data:rat,error:re} = await sb.from('chairman_ratifications').select('*').eq('id','b75ddfff-ea06-495d-a507-b887f1623eed').maybeSingle();
console.log('RATIFICATION err=',re?.message, JSON.stringify(rat).slice(0,600));
