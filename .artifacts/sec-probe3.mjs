import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const K='SECURITY_SUBAGENT_PROBE_DO_NOT_USE';
async function t(label,payload){
  const {data,error}=await sb.from('leo_feature_flag_audit_log').insert(payload).select('id');
  console.log(`${label}: ${error? 'REJECTED -> '+error.message : 'ACCEPTED id='+data[0].id}`);
  if(!error){ await sb.from('leo_feature_flag_audit_log').delete().eq('id',data[0].id); console.log('   (cleaned up)'); }
}
await t('A) environment:null named   ', {flag_key:K,action:'update',changed_by:'probe',environment:null});
await t('B) environment:"production" ', {flag_key:K,action:'update',changed_by:'probe',environment:'production'});
await t('C) action:"created" no env  ', {flag_key:K,action:'created',changed_by:'probe'});
await t('D) action:"transition" no env', {flag_key:K,action:'transition',changed_by:'probe'});
await t('E) client-set created_at    ', {flag_key:K,action:'update',changed_by:'probe',created_at:'2020-01-01T00:00:00Z'});
const {data:left}=await sb.from('leo_feature_flag_audit_log').select('id').eq('flag_key',K);
console.log('leftover probe rows:', (left||[]).length);
