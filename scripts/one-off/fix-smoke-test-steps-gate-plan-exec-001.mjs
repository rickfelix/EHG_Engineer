#!/usr/bin/env node
// Post-completion heal-flagged gap (heal score 5491511c-057e-4a50-9242-20adc43cdb2b,
// smoke_tests_pass 40/100): this SD's smoke_test_steps were left as generic auto-generated
// boilerplate ("Navigate to the relevant page/area...") that does not describe a meaningful
// test for a backend-only, non-UI gate-logic fix. Replaces them with concrete, CLI-executable
// steps mirroring the actual regression tests.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-GATE-PLAN-EXEC-001';

async function main() {
  const smoke_test_steps = [
    {
      step_number: 1,
      instruction: 'Run `npx vitest run tests/unit/plan-to-exec/gate1-prd-quality-leniency.test.js`',
      expected_outcome: 'All 11 tests pass (TS-1 through TS-9, covering the leniency fix, the unconditional-block guard, and the accepted PlanToExecVerifier divergences)'
    },
    {
      step_number: 2,
      instruction: 'Run `node scripts/one-off/measure-gate-plan-exec-001-regression.mjs` against the live database',
      expected_outcome: 'Reports 0 regressions and a nonzero newly-passing count across the full live PRD population'
    },
    {
      step_number: 3,
      instruction: 'Author or hold a PRD scoring >=70% (heuristic path, e.g. sd_type=bugfix) with exactly one placeholder/boilerplate-requirements issue, then run `node scripts/handoff.js precheck PLAN-TO-EXEC <SD-KEY>`',
      expected_outcome: 'The prdQualityValidation gate reports PASS (score >= threshold, issue reclassified to a warning) instead of the pre-fix unconditional FAIL'
    }
  ];

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ smoke_test_steps })
    .eq('sd_key', SD_KEY);

  if (error) { console.error('❌ Update failed:', error.message); process.exit(1); }
  console.log('✅ smoke_test_steps replaced with concrete, CLI-executable steps (heal gap closed).');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
