import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const keys = ['QF-20260906-986','QF-20260906-282','QF-20260906-363','QF-20260906-687'];
const { data, error } = await sb.from('quick_fixes').select('*').in('id', keys);
if (error) console.error('ERR:', error.message);
console.log('=== EXACT QF ROWS:', (data||[]).length, '===');
for (const r of (data||[])) {
  console.log(JSON.stringify({id:r.id,status:r.status,type:r.type,severity:r.severity,title:r.title,routing_tier:r.routing_tier,disposition:r.disposition,disposition_reason_code:r.disposition_reason_code,escalated_to_sd_id:r.escalated_to_sd_id,resolution_sd_id:r.resolution_sd_id,duplicate_of_id:r.duplicate_of_id,claiming_session_id:r.claiming_session_id,created_at:r.created_at,completed_at:r.completed_at,pr_url:r.pr_url,commit_sha:r.commit_sha,target_application:r.target_application,files_changed:r.files_changed,not_before:r.not_before,owner:r.owner,factory_lane:r.factory_lane},null,1));
  console.log('  DESC:', String(r.description||'').slice(0,600));
  console.log('  EXPECTED:', String(r.expected_behavior||'').slice(0,300));
  console.log('  ACTUAL:', String(r.actual_behavior||'').slice(0,300));
  console.log('---');
}
console.log('\n=== QFs created 2026-09-05..09-08 ===');
const { data: recent, error: e2 } = await sb.from('quick_fixes').select('id,status,title,disposition,escalated_to_sd_id,resolution_sd_id,target_application,created_at,pr_url').gte('created_at','2026-09-05').lte('created_at','2026-09-09').order('created_at',{ascending:false}).limit(100);
if (e2) console.error('ERR2', e2.message);
for (const r of (recent||[])) console.log(`${r.id} | ${r.status} | disp=${r.disposition||'-'} | esc=${r.escalated_to_sd_id||'-'} | app=${r.target_application||'-'} | pr=${r.pr_url?'Y':'-'} | ${String(r.title||'').slice(0,105)}`);
