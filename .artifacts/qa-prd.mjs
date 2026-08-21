import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_UUID='7b8be04e-1f2b-431c-b33d-4574013a94e5';
const SD_KEY='SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001';

const { data: prd, error: e1 } = await s.from('product_requirements_v2')
  .select('id, directive_id, sd_id, title, functional_requirements, test_scenarios, acceptance_criteria, activation_test_id')
  .or(`directive_id.eq.${SD_KEY},sd_id.eq.${SD_UUID}`);
if (e1) console.log('PRD ERR', e1.message);
for (const p of prd||[]) {
  console.log('=== PRD', p.id, '| directive_id', p.directive_id, '| sd_id', p.sd_id);
  console.log('activation_test_id:', p.activation_test_id);
  const fr = p.functional_requirements;
  console.log('FR count:', Array.isArray(fr)?fr.length:typeof fr);
  console.log(JSON.stringify(fr, null, 1).slice(0, 12000));
}
