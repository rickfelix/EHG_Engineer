#!/usr/bin/env node
/**
 * SD-LEO-INFRA-APPLY-STATE-VERIFIER-002 -- apply PLAN-phase TESTING review fixes to the
 * already-inserted PRD (in-place update, same row).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-APPLY-STATE-VERIFIER-002';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const content = JSON.parse(readFileSync(new URL('./apply-state-verifier-002-prd-content.json', import.meta.url), 'utf8'));

  const { error } = await supabase.from('product_requirements_v2')
    .update({
      functional_requirements: content.functional_requirements,
      technical_requirements: content.technical_requirements,
      test_scenarios: content.test_scenarios,
      acceptance_criteria: content.acceptance_criteria,
    })
    .eq('id', `PRD-${SD_KEY}`);
  if (error) throw error;
  console.log('PRD UPDATED with PLAN-phase TESTING review fixes:', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
