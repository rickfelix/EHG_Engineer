import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('product_requirements_v2').select('id,title,status,functional_requirements,acceptance_criteria,metadata').eq('id','PRD-SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001');
if (error) { console.error('ERR', error.message); process.exit(1); }
const p = data?.[0];
if (!p) { console.log('NO PRD ROW'); process.exit(0); }
console.log('=== PRD ===', p.title, '| status:', p.status);
console.log('--- functional_requirements ---');
console.log(JSON.stringify(p.functional_requirements, null, 2));
