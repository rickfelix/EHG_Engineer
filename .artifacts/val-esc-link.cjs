require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  const {data:q}=await s.from('quick_fixes').select('id,status,escalated_to_sd_id,escalation_reason,resolution_sd_id,routing_tier,estimated_loc,claiming_session_id,created_at,started_at').in('id',['QF-20260906-162','QF-20260904-695','QF-20260904-724','QF-20260904-748','QF-20260904-283','QF-20260903-936']);
  for(const r of q||[]) console.log(JSON.stringify(r));
  console.log('\n-- resolve escalated_to_sd_id --');
  const ids=[...new Set((q||[]).map(r=>r.escalated_to_sd_id).filter(Boolean))];
  if(ids.length){
    const {data:sd}=await s.from('strategic_directives_v2').select('id,sd_key,status,current_phase').in('id',ids);
    for(const r of sd||[]) console.log(JSON.stringify(r));
  } else console.log('(none)');
  console.log('\n-- PRD for the FIX SD --');
  const {data:prd}=await s.from('product_requirements_v2').select('id,sd_key,status,created_at,title').or('sd_key.eq.SD-LEO-FIX-DELIVERY-RECEIPT-SEVERITY-001,sd_key.eq.SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001');
  console.log(JSON.stringify(prd,null,1));
  console.log('\n-- backlog map for RECEIPTS SD --');
  const {data:bl}=await s.from('sd_backlog_map').select('backlog_id,backlog_title,priority').eq('sd_id','e11ede7e-db45-467c-9372-26b67bee08ff');
  console.log('rows:',(bl||[]).length, JSON.stringify(bl));
  const {data:bl2}=await s.from('sd_backlog_map').select('backlog_id,backlog_title').eq('sd_id','SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001');
  console.log('by-key rows:',(bl2||[]).length, JSON.stringify(bl2));
})();
