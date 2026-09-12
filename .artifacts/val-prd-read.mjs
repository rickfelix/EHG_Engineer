import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('product_requirements_v2')
  .select('id, sd_id, title, status, phase, functional_requirements, acceptance_criteria, test_scenarios, metadata')
  .eq('id','PRD-SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001').maybeSingle();
if (error) { console.error('ERR', error); process.exit(1); }
if (!data) { console.log('NO PRD ROW FOUND'); process.exit(0); }
console.log('ID:', data.id, '| sd_id:', data.sd_id, '| status:', data.status, '| phase:', data.phase);
console.log('TITLE:', data.title);
console.log('\n===== FUNCTIONAL_REQUIREMENTS =====');
console.log(typeof data.functional_requirements === 'string' ? data.functional_requirements : JSON.stringify(data.functional_requirements, null, 2));
console.log('\n===== ACCEPTANCE_CRITERIA =====');
console.log(typeof data.acceptance_criteria === 'string' ? data.acceptance_criteria : JSON.stringify(data.acceptance_criteria, null, 2));
