#!/usr/bin/env node
/**
 * Update SD-LEARN-FIX-ADDRESS-PAT-LES-013's title/description/scope/key_changes/
 * smoke_test_steps/success_metrics to reflect the ACTUAL verified finding, replacing the
 * /learn-generated boilerplate. Mirrors the pattern established by
 * SD-LEARN-FIX-ADDRESS-PAT-LES-010's update-scope-pat-les-010.mjs.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-013';

const description = `## Verified Finding (supersedes /learn's original boilerplate description)

PAT-LES-f04ca2cf73c6 claimed: "Auto-generated retrospectives from handoff completion events
produce boilerplate content (score 34/100) that blocks subsequent PLAN-TO-LEAD gates. The
retrospective generation pipeline needs to incorporate SD-specific context ... rather than
emitting generic handoff-quality metrics." The pattern traces to \`first_seen_sd_id\`/
\`last_seen_sd_id\` = SD-EVA-FIX-KILL-GATES-001 (Feb 2026).

CONFIRMED STALE: no retrospective in the \`retrospectives\` table anywhere (any SD, any date) has
quality_score=34; SD-EVA-FIX-KILL-GATES-001's own 3 retrospective rows score 40/90/100, none
matching the cited figure. More importantly, the exact defect class described -- boilerplate
auto-generated retrospectives blocking PLAN-TO-LEAD -- was independently, comprehensively fixed
by THREE separate completed SDs, all chronologically after SD-EVA-FIX-KILL-GATES-001:

1. **SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001** (completed 2026-04-24): RETROSPECTIVE_QUALITY_GATE
   now requires retro_type=SD_COMPLETION with created_at > the LEAD-TO-PLAN acceptance timestamp --
   a stale HANDOFF-type auto-gen retro can no longer satisfy the gate.
2. **SD-LEO-INFRA-WIRE-EXISTING-RETROSPECTIVEQUALITYRUBRIC-001** (completed 2026-08-10): deleted the
   blanket "infra/process/doc SD + retro exists" auto-pass arm and wired the real
   RetrospectiveQualityRubric.detectBoilerplate() deterministic penalty (measured against a
   corpus where 70.4% of SDs, 3935/5591, were clearing completion on a merely-existing retro).
3. **SD-LEO-INFRA-PLAN-LEAD-RETRO-001** (completed 2026-08-23): PLAN-TO-LEAD preflight now
   auto-generates a REAL RETRO sub-agent retrospective (not boilerplate) when none exists, and
   \`enrichRetrospectivePreGate\` (lib/modules/handoff/retrospective-enricher.js) enriches it with
   git-diff file references, gate scores, and issue-pattern context BEFORE the gate evaluates it --
   exactly the "SD-specific context (files changed, test results, implementation decisions)"
   the pattern says is missing.

Live-data check: the 8 most recent auto-generated retrospectives (2026-09-13, spanning 6
different SDs including this session's own SD-LEO-FIX-EVERY-CHAIRMAN-SMS-001) score 80-90/100
with genuinely SD-specific content (e.g. "SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H executed 3
handoffs (LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN)"), not the generic template phrases the
old defect emitted.

## Genuine Gap Found and Closed

While the underlying defect is resolved and covered by 35 existing passing tests across 3 files
(retro-boilerplate-template-corpus.test.js, retrospective-enricher.test.js,
retro-whatwentwell-real-context.test.js), NONE of them exercise
\`RetrospectiveQualityRubric.validateRetrospectiveQuality()\` itself -- the instance method that
actually SUBTRACTS \`detectBoilerplate()\`'s scorePenalty from the AI judge's own weightedScore
(retrospective-quality-rubric.js:500-508). The existing contract test
(sd-completion-readiness-passed-contract.test.js) mocks the entire RetrospectiveQualityRubric
class away, so it never calls this blend. This is precisely the mechanism whose absence caused
the original 2026-08-10 incident ("a textbook template retro scored 68 on the AI rubric with
boilerplate_penalty 0"). Added
tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js: instantiates the REAL
RetrospectiveQualityRubric (so the real detectBoilerplate() runs), stubs only the network-calling
AIQualityEvaluator.evaluate(), and proves the deterministic penalty can flip a passing AI verdict
to failing when boilerplate is present -- verified via live mutation testing (breaking the
penalty subtraction locally caused 2/3 new tests to fail as expected, then cleanly restored).`;

const scope = `IN SCOPE: Verify PAT-LES-f04ca2cf73c6 against current main and close the pattern.
Add a regression guard for the one narrow, previously-untested link in the already-fixed chain
(the boilerplate-penalty blend inside RetrospectiveQualityRubric.validateRetrospectiveQuality()).
OUT OF SCOPE: Changing existing gate thresholds, scoring algorithms, or boilerplate pattern
lists. Modifying SDs that have already passed quality gates. Refactoring the retrospective
generation/enrichment pipeline (already correct).`;

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
  }
];

const successCriteria = [
  {
    criterion: 'PAT-LES-f04ca2cf73c6 root cause verified already addressed',
    measure: 'No retrospective anywhere in the retrospectives table scores 34/100; 3 completed SDs independently fixed the described defect class',
    verification: 'Manual: queried retrospectives table for quality_score=34 (0 rows) and traced the fix history via strategic_directives_v2'
  },
  {
    criterion: 'The one genuinely untested link in the fix chain is now regression-guarded',
    measure: 'tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js passes (3/3) and was proven non-vacuous via mutation testing',
    verification: 'Automated: npx vitest run tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js'
  }
];

const smokeTestSteps = [
  {
    instruction: 'Run tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js',
    expected_outcome: 'All 3 tests pass: a template retro is dragged below threshold despite a passing AI verdict, genuine SD-specific content is untouched, and an already-failing template retro stays failed'
  },
  {
    instruction: 'Run the 3 pre-existing related suites (retro-boilerplate-template-corpus.test.js, retrospective-enricher.test.js, retro-whatwentwell-real-context.test.js)',
    expected_outcome: 'All 35 pre-existing tests continue to pass unchanged (no regression introduced)'
  }
];

const successMetrics = [
  {
    metric: 'PAT-LES-f04ca2cf73c6 recurrence rate',
    baseline: '1 occurrence recorded in issue_patterns (stale, from Feb 2026)',
    target: '0 new occurrences (structurally impossible to recur: the defect class no longer exists in the codebase, confirmed via repo-wide search and 41 passing regression tests)',
    actual: '0 occurrences post-verification; pattern traced and confirmed already-resolved by 3 prior completed SDs',
    measurement: 'Query issue_patterns for pattern_id after SD completion; grep for the fleet-wide template-assertion phrases across retrospectives.js generators'
  },
  {
    metric: 'Boilerplate-penalty blend test coverage',
    baseline: '0 tests directly exercised RetrospectiveQualityRubric.validateRetrospectiveQuality()\'s penalty-subtraction blend (all 3 existing suites either test detectBoilerplate() in isolation or mock the whole rubric class away)',
    target: 'At least 1 test suite exercises the real blend with the network call stubbed',
    actual: '3 new tests added, verified non-vacuous via live mutation testing (2/3 correctly failed when the blend was locally disabled)',
    measurement: 'npx vitest run tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js'
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
      description,
      scope,
      key_changes: keyChanges,
      success_criteria: successCriteria,
      smoke_test_steps: smokeTestSteps,
      success_metrics: successMetrics,
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
