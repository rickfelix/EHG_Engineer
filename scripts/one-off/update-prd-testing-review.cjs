require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const content = require('./instantiate-venture-refuses-prd-content.json');

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const newSystemArchitecture = JSON.stringify(content.system_architecture);

  const update = {
    functional_requirements: content.functional_requirements,
    technical_requirements: content.technical_requirements,
    test_scenarios: content.test_scenarios,
    acceptance_criteria: content.acceptance_criteria,
    system_architecture: newSystemArchitecture,
    updated_at: new Date().toISOString(),
    updated_by: 'PLAN-TO-EXEC TESTING sub-agent review'
  };

  const { data, error } = await sb
    .from('product_requirements_v2')
    .update(update)
    .eq('id', 'PRD-SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001')
    .select('id, updated_at')
    .single();

  if (error) { console.error('update error', error); process.exit(1); }
  console.log('Updated PRD row:', JSON.stringify(data));
}

main();
