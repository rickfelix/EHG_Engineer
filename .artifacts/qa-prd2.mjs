import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('product_requirements_v2')
  .select('functional_requirements, test_scenarios, acceptance_criteria')
  .eq('directive_id','SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001').single();
const fr = data.functional_requirements;
for (const f of fr) {
  if (!['FR-5','FR-6'].includes(f.id)) continue;
  console.log('=====', f.id, f.title);
  console.log((f.acceptance_criteria||[]).map((c,i)=>` AC${i+1}: ${c}`).join('\n'));
}
console.log('\n##### test_scenarios #####');
console.log(JSON.stringify(data.test_scenarios, null, 1)?.slice(0,6000));
console.log('\n##### top-level acceptance_criteria #####');
console.log(JSON.stringify(data.acceptance_criteria, null, 1)?.slice(0,4000));
