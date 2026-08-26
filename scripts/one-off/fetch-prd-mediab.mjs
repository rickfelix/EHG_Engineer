import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('product_requirements_v2').select('id,title,functional_requirements,test_scenarios,acceptance_criteria').eq('id','PRD-SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B').maybeSingle();
if (error) { console.error('ERR', error.message); process.exit(1); }
if (!data) { console.log('NO ROW'); process.exit(0); }
console.log('TITLE:', data.title);
console.log('\n=== FUNCTIONAL REQUIREMENTS ===');
console.log(JSON.stringify(data.functional_requirements, null, 1));
console.log('\n=== TEST SCENARIOS ===');
console.log(JSON.stringify(data.test_scenarios, null, 1));
