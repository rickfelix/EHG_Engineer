import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const keys = ['QF-20260906-986','QF-20260906-282','QF-20260906-363','QF-20260906-687'];
const { data, error } = await sb.from('quick_fixes').select('*').in('qf_key', keys);
if (error) { console.error('ERR by qf_key:', error.message); }
console.log('=== EXACT QF ROWS:', (data||[]).length, '===');
for (const r of (data||[])) {
  console.log(JSON.stringify({qf_key:r.qf_key,status:r.status,title:r.title,tier:r.tier,disposition:r.disposition,escalated_to_sd:r.escalated_to_sd,claimed_by:r.claimed_by,created_at:r.created_at,completed_at:r.completed_at,pr_url:r.pr_url,commit_sha:r.commit_sha,target_application:r.target_application,deferred_blocker:r.deferred_blocker},null,1));
  console.log('   DESC:', String(r.description||'').slice(0,700));
  console.log('---');
}
const { data: all0906 } = await sb.from('quick_fixes').select('qf_key,status,title,disposition,escalated_to_sd,target_application,created_at').gte('created_at','2026-09-05').order('created_at',{ascending:false}).limit(80);
console.log('=== ALL QFs created >= 2026-09-05:', (all0906||[]).length, '===');
for (const r of (all0906||[])) console.log(`${r.qf_key} | ${r.status} | disp=${r.disposition||'-'} | esc=${r.escalated_to_sd||'-'} | app=${r.target_application||'-'} | ${String(r.title||'').slice(0,110)}`);
