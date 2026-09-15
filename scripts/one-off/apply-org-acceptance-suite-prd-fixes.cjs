require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001';
const contentPath = path.join(__dirname, 'org-acceptance-suite-prd-content.json');
const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

(async () => {
  const { data: before, error: readErr } = await sb
    .from('product_requirements_v2')
    .select('id, functional_requirements, technical_requirements, system_architecture, test_scenarios, integration_operationalization')
    .eq('id', PRD_ID)
    .single();
  if (readErr) { console.error('READ ERROR', readErr); process.exit(1); }

  // system_architecture / implementation_approach are stored as JSON-encoded strings in this row
  // (matches the existing shape read back from the DB), so re-encode consistently.
  const update = {
    functional_requirements: content.functional_requirements,
    technical_requirements: content.technical_requirements,
    system_architecture: JSON.stringify(content.system_architecture),
    test_scenarios: content.test_scenarios,
    integration_operationalization: content.integration_operationalization,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from('product_requirements_v2')
    .update(update)
    .eq('id', PRD_ID)
    .select('id, updated_at')
    .single();

  if (error) { console.error('UPDATE ERROR', error); process.exit(1); }
  console.log('Updated PRD row:', JSON.stringify(data));

  // Verify a few markers landed.
  const { data: after, error: verifyErr } = await sb
    .from('product_requirements_v2')
    .select('functional_requirements, technical_requirements, test_scenarios')
    .eq('id', PRD_ID)
    .single();
  if (verifyErr) { console.error('VERIFY ERROR', verifyErr); process.exit(1); }

  const fr3 = after.functional_requirements.find((f) => f.id === 'FR-3');
  const fr4 = after.functional_requirements.find((f) => f.id === 'FR-4');
  const tr6 = after.technical_requirements.find((t) => t.id === 'TR-6');
  console.log('FR-3 mentions templateToBaseRows:', /templateToBaseRows/.test(fr3.requirement));
  console.log('FR-4 mentions PGRST205:', /PGRST205/.test(fr4.description));
  console.log('TR-6 present:', !!tr6);
  console.log('TR count:', after.technical_requirements.length);
})();
