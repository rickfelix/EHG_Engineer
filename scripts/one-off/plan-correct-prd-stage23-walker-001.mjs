#!/usr/bin/env node
// PLAN-phase PRD correction for SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001, driven by
// testing-agent's PLAN_PRD review (sub_agent_execution_results b601e56a-9ce1-4424-9fcd-3eada68d391b,
// verdict FAIL, 12 defects, 2 CRITICAL). See scripts/one-off's v2 PRD content for the full corrected
// fields. Corrections: FR-12 moved off the unworkable vitest db-project design to a hard-gating cron
// step; FR-6 redesigned non-destructive; FR-13's nonexistent "canonical runner" corrected to a one-off
// invocation script; all 5 sibling venture SDs confirmed completed (removes the phased EXEC-hold);
// TS-1/2/3/4 fixture and premise corrections; TR-3 added (durable evidence-artifact requirement);
// executive_summary/TR-1 arithmetic correction (11 new overrides, not 8).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001';

async function main() {
  const content = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

  const { error } = await supabase
    .from('product_requirements_v2')
    .update({
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
    })
    .eq('id', PRD_ID);
  if (error) { console.error('❌ Update failed:', error.message); process.exit(1); }

  console.log('✅ PRD corrected per PLAN-phase testing-agent review.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
