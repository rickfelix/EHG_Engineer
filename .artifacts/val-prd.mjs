import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001').maybeSingle();
if (error) { console.error('ERR', error); process.exit(1); }
if (!data) { console.error('NO ROW'); process.exit(1); }
console.log('COLUMNS:', Object.keys(data).join(', '));
console.log('=== status:', data.status, '| phase:', data.phase, '| sd_id:', data.sd_id);
const fr = data.functional_requirements;
console.log('=== FR TYPE:', typeof fr, Array.isArray(fr) ? 'array len '+fr.length : '');
console.log(JSON.stringify(fr, null, 2));
