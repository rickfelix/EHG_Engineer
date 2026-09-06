require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: prd } = await s.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C').maybeSingle();
  fs.writeFileSync(__dirname + '/prd-c.json', JSON.stringify(prd,null,2));
  console.log('=== acceptance_criteria ===');
  console.log(JSON.stringify(prd.acceptance_criteria,null,2));
  console.log('=== smoke_test_cmd ===', prd.smoke_test_cmd);
  console.log('=== activation_test_id ===', prd.activation_test_id);
  const { data: sd } = await s.from('strategic_directives_v2').select('*').eq('id','591400cf-7b88-4974-832a-6043e4f59152').maybeSingle();
  fs.writeFileSync(__dirname + '/sd-c.json', JSON.stringify(sd,null,2));
  console.log('=== SD cols with smoke ===', Object.keys(sd).filter(k=>/smoke|test/i.test(k)).join(','));
  console.log('=== sd.smoke_test_steps ===');
  console.log(JSON.stringify(sd.smoke_test_steps ?? sd.metadata?.smoke_test_steps ?? null,null,2));
})();
