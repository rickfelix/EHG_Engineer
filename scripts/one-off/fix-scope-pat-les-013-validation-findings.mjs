#!/usr/bin/env node
/**
 * Fix 4 VALIDATION-sub-agent-flagged defects in SD-LEARN-FIX-ADDRESS-PAT-LES-013's
 * strategic_directives_v2 row (LEAD-TO-PLAN evidence 4c2451d5-06b5-4e96-ad7c-a0cf7684b21d):
 * (1) ambiguous smoke_test_steps paths caused a silent vitest under-run (2 files/33 tests
 *     instead of the intended set); (2) success_metrics cited an inconsistent "41 passing
 *     regression tests" figure derived from a different file combination than the smoke step;
 *     (3) rationale/strategic_objectives still asserted the defect is live, contradicting the
 *     CONFIRMED STALE finding in description/key_changes; (4) key_changes omitted this SD's own
 *     one-off DB-update scripts.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-013';

const rationale = 'Pattern PAT-LES-f04ca2cf73c6 (1 recorded occurrence) claimed auto-generated '
  + 'retrospectives produce boilerplate that blocks PLAN-TO-LEAD gates. Verified against current '
  + 'main: the described defect no longer exists -- already fixed by 3 completed SDs '
  + '(SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001, SD-LEO-INFRA-WIRE-EXISTING-RETROSPECTIVEQUALITYRUBRIC-001, '
  + 'SD-LEO-INFRA-PLAN-LEAD-RETRO-001) and covered by 38 passing regression tests across 4 files. '
  + 'This SD closes the pattern honestly (verification, not reimplementation) and adds one narrow '
  + 'regression guard for the single previously-untested link in that already-fixed chain.';

const strategicObjectives = [
  'Verify PAT-LES-f04ca2cf73c6 against current main and confirm the described defect is stale (already resolved by prior completed SDs), closing the pattern without redundant rework',
  'Close the one genuinely untested link in the already-fixed chain: the boilerplate-penalty blend inside RetrospectiveQualityRubric.validateRetrospectiveQuality(), verified non-vacuous via mutation testing'
];

const smokeTestSteps = [
  {
    instruction: 'From the repo root, run: npx vitest run tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js',
    expected_outcome: 'Test file passes (1 file, 3 tests): a template retro is dragged below threshold despite a passing AI verdict, genuine SD-specific content is untouched, and an already-failing template retro stays failed'
  },
  {
    instruction: 'From the repo root, run: npx vitest run tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js tests/unit/retro-boilerplate-template-corpus.test.js tests/unit/retrospective-enricher.test.js tests/unit/handoff/executors/retro-whatwentwell-real-context.test.js',
    expected_outcome: 'All 4 files pass with a combined 38 tests (3 + 3 + 30 + 2) -- confirms no regression introduced in the pre-existing, already-fixed mechanism'
  }
];

const successMetrics = [
  {
    metric: 'PAT-LES-f04ca2cf73c6 recurrence rate',
    baseline: '1 occurrence recorded in issue_patterns (stale, from Feb 2026)',
    target: '0 new occurrences (structurally impossible to recur: the defect class no longer exists in the codebase, confirmed via repo-wide search and 38 passing regression tests across 4 files)',
    actual: '0 occurrences post-verification; pattern traced and confirmed already-resolved by 3 prior completed SDs',
    measurement: 'Query issue_patterns for pattern_id after SD completion; grep for the fleet-wide template-assertion phrases across retrospectives.js generators'
  },
  {
    metric: 'Boilerplate-penalty blend test coverage',
    baseline: '0 tests directly exercised RetrospectiveQualityRubric.validateRetrospectiveQuality()\'s penalty-subtraction blend (all pre-existing suites either test detectBoilerplate() in isolation or mock the whole rubric class away)',
    target: 'At least 1 test suite exercises the real blend with the network call stubbed',
    actual: '3 new tests added (tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js), verified non-vacuous via live mutation testing (2/3 correctly failed when the blend was locally disabled, independently re-verified by the VALIDATION sub-agent)',
    measurement: 'npx vitest run tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js'
  }
];

const keyChanges = [
  {
    type: 'verification',
    change: 'Verified PAT-LES-f04ca2cf73c6 against current main (found: superseded by 3 unrelated, already-completed SDs)',
    impact: 'Confirms the pattern is stale and closes it without reimplementing existing, working functionality'
  },
  {
    type: 'test',
    change: 'Added tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js: a real (non-mocked-away) regression guard for the detectBoilerplate-penalty blend inside RetrospectiveQualityRubric.validateRetrospectiveQuality()',
    impact: 'Closes the one narrow, previously-untested link in the already-fixed chain, verified non-vacuous via live mutation testing'
  },
  {
    type: 'chore',
    change: 'Added scripts/one-off/update-scope-pat-les-013.mjs and scripts/one-off/fix-scope-pat-les-013-validation-findings.mjs (guarded with isMainModule) to record the verified SD scope in the database',
    impact: 'Keeps the SD row honest and auditable; guarded per require-main-guard-in-one-off-lint'
  }
];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      rationale,
      strategic_objectives: strategicObjectives,
      smoke_test_steps: smokeTestSteps,
      success_metrics: successMetrics,
      key_changes: keyChanges,
    })
    .eq('sd_key', SD_KEY)
    .select('sd_key')
    .single();

  if (error) {
    console.error('FAILED:', error.message);
    process.exit(1);
  }

  console.log('UPDATED:', data.sd_key);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
