import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: ev } = await s.from('sub_agent_execution_results').select('metadata')
  .eq('id','2de37d89-7fb2-4ab3-a37e-8d7b8c531376').maybeSingle();
const m = ev.metadata;
console.log('findings_count:', m.findings_count);
console.log('findings type:', typeof m.findings, Array.isArray(m.findings));
const fs = m.findings;
if (Array.isArray(fs)) {
  fs.forEach((x,i)=>{
    if (typeof x === 'string') console.log(`\n--- [${i}] ---\n` + x.slice(0,900));
    else console.log(`\n--- [${i}] ${x.id||x.severity||''} ---\n` + JSON.stringify(x).slice(0,900));
  });
} else { console.log(JSON.stringify(fs,null,2).slice(0,6000)); }
console.log('\n=== test_execution (PLAN) ===', JSON.stringify(m.test_execution,null,2)?.slice(0,800));

// locate PRD
const { data: prds } = await s.from('product_requirements_v2').select('id,sd_id,title,metadata')
  .ilike('id','%AUDIT-FIX-FEEDBACK-001-C%');
console.log('\n=== PRD by id ilike ===', prds?.map(p=>({id:p.id,sd_id:p.sd_id})));
const { data: prds2 } = await s.from('product_requirements_v2').select('id,sd_id,title,metadata')
  .ilike('sd_id','%AUDIT-FIX-FEEDBACK-001-C%');
console.log('=== PRD by sd_id ilike ===', prds2?.map(p=>({id:p.id,sd_id:p.sd_id})));
const prd = (prds2&&prds2[0])||(prds&&prds[0]);
if (prd) {
  console.log('\nPRD metadata keys:', Object.keys(prd.metadata||{}).join(', '));
  console.log('\nfollowup_out_of_scope_finding:\n', JSON.stringify(prd.metadata?.followup_out_of_scope_finding,null,2));
}
