require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: prd, error: e1 } = await s.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C').maybeSingle();
  if (e1) console.error('PRD err', e1);
  if (!prd) { console.log('NO PRD by id'); }
  else {
    const fs=require('fs');
    fs.writeFileSync('/tmp/prd-c.json', JSON.stringify(prd,null,2));
    console.log('PRD keys:', Object.keys(prd).join(','));
    console.log('=== test_scenarios ===');
    console.log(JSON.stringify(prd.test_scenarios,null,2));
  }
  const { data: sd } = await s.from('strategic_directives_v2').select('id,sd_key,title,status,current_phase,metadata,scope,description').eq('id','591400cf-7b88-4974-832a-6043e4f59152').maybeSingle();
  require('fs').writeFileSync('/tmp/sd-c.json', JSON.stringify(sd,null,2));
  console.log('=== SD smoke_test_steps ===');
  console.log(JSON.stringify(sd?.metadata?.smoke_test_steps ?? sd?.metadata?.smokeTestSteps ?? null, null, 2));
})();
