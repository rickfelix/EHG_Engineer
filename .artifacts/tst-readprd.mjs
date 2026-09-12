import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001').single();
if (error) { console.error('ERR', error); process.exit(1); }
console.log('KEYS:', Object.keys(data).join(', '));
console.log('\n=== TITLE ===\n', data.title);
console.log('\n=== STATUS ===', data.status, '| sd_id:', data.sd_id, '| directive_id:', data.directive_id);
console.log('\n=== TEST_SCENARIOS ===\n', JSON.stringify(data.test_scenarios, null, 2));
console.log('\n=== ACCEPTANCE_CRITERIA ===\n', JSON.stringify(data.acceptance_criteria, null, 2));
