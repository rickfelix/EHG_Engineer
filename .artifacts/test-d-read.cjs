require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: prd, error: e1 } = await s.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D').maybeSingle();
  if (e1) console.error('PRD err', e1.message);
  const { data: sd, error: e2 } = await s.from('strategic_directives_v2').select('*').eq('id','3f128d5c-8168-4415-86cc-ab5da4663d11').maybeSingle();
  if (e2) console.error('SD err', e2.message);
  fs.writeFileSync('.artifacts/testing-prd-d.json', JSON.stringify(prd, null, 2));
  fs.writeFileSync('.artifacts/testing-sd-d.json', JSON.stringify(sd, null, 2));
  console.log('PRD keys:', prd ? Object.keys(prd).join(',') : 'NULL');
  console.log('SD keys:', sd ? Object.keys(sd).join(',') : 'NULL');
  console.log('test_scenarios n=', Array.isArray(prd?.test_scenarios) ? prd.test_scenarios.length : typeof prd?.test_scenarios);
  console.log('acceptance_criteria n=', Array.isArray(prd?.acceptance_criteria) ? prd.acceptance_criteria.length : typeof prd?.acceptance_criteria);
  console.log('functional_requirements n=', Array.isArray(prd?.functional_requirements) ? prd.functional_requirements.length : typeof prd?.functional_requirements);
  console.log('activation_test_id=', prd?.activation_test_id);
})();
