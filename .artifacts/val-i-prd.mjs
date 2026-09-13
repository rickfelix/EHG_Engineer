import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I').maybeSingle();
if (error) { console.error('ERR', error); process.exit(1); }
if (!data) { console.log('NO PRD ROW'); process.exit(0); }
console.log('COLUMNS:', Object.keys(data).join(', '));
console.log('\n=== TITLE ===', data.title);
console.log('=== STATUS ===', data.status, '| phase:', data.phase);
for (const k of ['functional_requirements','acceptance_criteria','test_scenarios','technical_requirements','non_functional_requirements','plan_checklist','exec_checklist','validation_checklist','risks','constraints','metadata']) {
  if (data[k] === undefined) continue;
  console.log(`\n########## ${k} ##########`);
  console.log(typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k], null, 2));
}
