/**
 * One-time: Fix integration_operationalization keys to match validator expectations.
 *
 * Root cause: Manual PRD creation used descriptive key names
 * (consumers_and_user_journeys, upstream_downstream_dependencies, etc.)
 * but the GATE_INTEGRATION_SECTION_VALIDATION validator expects:
 * consumers, dependencies, data_contracts, runtime_config, observability_rollout
 *
 * Also deletes the failed handoff record to prevent retry poisoning.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const KEY_MAP = {
  consumers_and_user_journeys: 'consumers',
  upstream_downstream_dependencies: 'dependencies',
  data_contracts_and_schema: 'data_contracts',
  runtime_configuration_and_environments: 'runtime_config',
  observability_rollout_and_rollback: 'observability_rollout'
};

const CORRECT_KEYS = ['consumers', 'dependencies', 'data_contracts', 'runtime_config', 'observability_rollout'];

async function main() {
  // 1. Get current integration data
  const { data: prd, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('id, integration_operationalization')
    .eq('sd_id', '8802887d-f9ec-47f9-8845-fec531c0d201')
    .single();

  if (fetchErr) { console.error('Fetch error:', fetchErr.message); return; }

  const old = prd.integration_operationalization;
  const oldKeys = Object.keys(old || {});
  console.log('Current keys:', oldKeys);

  // 2. Map old keys to correct keys
  const corrected = {};
  for (const correctKey of CORRECT_KEYS) {
    // Check if correct key already exists
    if (old[correctKey] !== undefined) {
      corrected[correctKey] = old[correctKey];
    } else {
      // Find the old key that maps to this correct key
      const oldKey = Object.entries(KEY_MAP).find(([_, v]) => v === correctKey)?.[0];
      corrected[correctKey] = oldKey ? old[oldKey] : null;
    }
  }

  console.log('Corrected keys:', Object.keys(corrected));
  const nonNull = Object.values(corrected).filter(v => v !== null && v !== undefined).length;
  console.log('Non-null values:', nonNull, '/ 5');

  // 3. Update PRD
  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ integration_operationalization: corrected })
    .eq('id', prd.id);

  if (updateErr) { console.error('Update error:', updateErr.message); return; }
  console.log('SUCCESS: PRD integration section updated with correct keys');

  // 4. Delete failed handoff record
  const { error: delErr } = await supabase
    .from('sd_phase_handoffs')
    .delete()
    .eq('id', 'eab59920-2d35-4bb5-aa10-ab2000374738');

  if (delErr) console.error('Delete handoff error:', delErr.message);
  else console.log('SUCCESS: Deleted failed handoff record eab59920');
}

main();
