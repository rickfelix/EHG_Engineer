import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('product_requirements_v2').select('*').eq('directive_id','SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C').maybeSingle();
if (error) { console.error('ERR', error); process.exit(1); }
if (!data) { console.log('NO PRD'); process.exit(0); }
console.log('COLUMNS:', Object.keys(data).join(', '));
for (const k of ['id','title','status','phase','functional_requirements','test_scenarios','acceptance_criteria','technical_requirements','risks','constraints','plan_checklist','exec_checklist','validation_checklist','content','metadata']) {
  if (!(k in data)) continue;
  const v = data[k];
  if (v === null || v === undefined) continue;
  console.log('\n===== ' + k + ' =====');
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
}
