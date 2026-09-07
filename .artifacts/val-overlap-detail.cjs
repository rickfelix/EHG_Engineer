require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  const keys=['SD-LEO-FIX-DELIVERY-RECEIPT-SEVERITY-001','SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001','SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D'];
  const {data,error}=await s.from('strategic_directives_v2').select('*').in('sd_key',keys);
  if(error) return console.log('ERR',error.message);
  for(const r of data||[]){
    console.log('\n================',r.sd_key,'================');
    console.log('id:',r.id,'| status:',r.status,'| phase:',r.current_phase,'| progress:',r.progress);
    console.log('created:',r.created_at,'| updated:',r.updated_at);
    console.log('is_working_on:',r.is_working_on,'| priority:',r.priority,'| type:',r.sd_type);
    const m=r.metadata||{};
    console.log('claim:',JSON.stringify({claimed_by:m.claimed_by,claim_session:m.claim_session,claimed_at:m.claimed_at,session_id:m.session_id}));
    console.log('needs_coordinator_review:',r.needs_coordinator_review,'| blocked_by_sd_key:',r.blocked_by_sd_key,'| review_hold_reason:',r.review_hold_reason);
    console.log('--- DESCRIPTION ---');
    console.log((r.description||'').slice(0,4000));
    if(r.scope) {console.log('--- SCOPE ---');console.log(String(r.scope).slice(0,2500));}
  }
  console.log('\n\n###### QF-20260906-162 ######');
  const {data:qf}=await s.from('quick_fixes').select('*').eq('id','QF-20260906-162');
  for(const q of qf||[]){
    console.log('status:',q.status,'| pr_url:',q.pr_url,'| commit_sha:',q.commit_sha,'| completed_at:',q.completed_at);
    console.log('escalated_to_sd:',q.escalated_to_sd||q.escalated_sd_key||'(n/a)','| disposition:',q.disposition);
    console.log('KEYS:',Object.keys(q).join(','));
    console.log('DESC:',(q.description||'').slice(0,2500));
  }
})();
