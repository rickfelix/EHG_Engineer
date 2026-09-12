import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('product_requirements_v2').select('*').eq('sd_id','170637e5-c8e1-4d44-ab4e-206bf39c8c50');
if (error) { console.error('ERR', error); process.exit(1); }
console.log('ROWS:', data ? data.length : 'null');
for (const r of (data||[])) {
  console.log('=== PRD', r.id, r.title, 'status=', r.status);
  console.log('--- FUNCTIONAL_REQUIREMENTS ---');
  console.log(JSON.stringify(r.functional_requirements, null, 2));
  console.log('--- ACCEPTANCE_CRITERIA ---');
  console.log(JSON.stringify(r.acceptance_criteria, null, 2));
  console.log('--- TEST_SCENARIOS ---');
  console.log(JSON.stringify(r.test_scenarios, null, 2));
  console.log('--- KEYS ---', Object.keys(r).join(','));
}
