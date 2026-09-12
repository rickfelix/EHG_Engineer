import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sd, error: e1 } = await sb.from('strategic_directives_v2').select('id,sd_key,title,status,current_phase,target_application,metadata').or('sd_key.eq.SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001,id.eq.SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001').maybeSingle();
console.log('SD:', JSON.stringify({id: sd?.id, sd_key: sd?.sd_key, title: sd?.title, status: sd?.status, phase: sd?.current_phase, app: sd?.target_application}, null, 2), e1?.message||'');
const { data: prd, error: e2 } = await sb.from('product_requirements_v2').select('*').or(`sd_id.eq.${sd?.id},id.eq.PRD-SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001`).limit(5);
console.log('PRD count:', prd?.length, e2?.message||'');
for (const p of prd||[]) {
  console.log('\n=== PRD', p.id, '| sd_id:', p.sd_id, '| status:', p.status, '===');
  console.log('KEYS:', Object.keys(p).join(', '));
}
