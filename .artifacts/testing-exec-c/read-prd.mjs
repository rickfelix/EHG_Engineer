import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C').maybeSingle();
if(!data){console.log('NO PRD');process.exit(0);}
console.log('=== acceptance_criteria ===');
console.log(JSON.stringify(data.acceptance_criteria,null,1).slice(0,4000));
console.log('=== test_scenarios ===');
console.log(JSON.stringify(data.test_scenarios,null,1).slice(0,6000));
