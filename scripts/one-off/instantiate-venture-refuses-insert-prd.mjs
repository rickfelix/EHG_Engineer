#!/usr/bin/env node
/**
 * SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001 -- PRD insertion (inline-mode content).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const content = JSON.parse(readFileSync(new URL('./instantiate-venture-refuses-prd-content.json', import.meta.url), 'utf8'));

  const prdRow = {
    id: `PRD-${SD_KEY}`,
    sd_id: sdRow.id,
    title: 'instantiateVenture refuses a venture id that has no ventures row',
    status: 'approved',
    executive_summary: content.executive_summary,
    functional_requirements: content.functional_requirements,
    technical_requirements: content.technical_requirements,
    system_architecture: content.system_architecture,
    test_scenarios: content.test_scenarios,
    acceptance_criteria: content.acceptance_criteria,
    risks: content.risks,
    implementation_approach: content.implementation_approach,
    integration_operationalization: content.integration_operationalization,
    exploration_summary: content.exploration_summary,
  };

  const { data: inserted, error: insErr } = await supabase.from('product_requirements_v2').insert(prdRow).select('id').single();
  if (insErr) throw insErr;
  console.log('PRD INSERTED:', inserted.id);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
