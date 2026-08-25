#!/usr/bin/env node
/**
 * One-off PLAN-phase TESTING evidence writer for SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A
 * (PLAN-TO-EXEC gate). This SD's deliverable (a census instrument) does not exist yet --
 * scripts/execute-subagent.js --code TESTING runs live build/test execution against
 * checked-out code, which is the wrong instrument for a pre-implementation PRD test-strategy
 * review. This follows the sanctioned direct-write pattern from
 * scripts/record-explore-evidence.js: storeSubAgentResults() + toCanonicalRepoPath() +
 * executed_from_cwd, sub_agent_code 'TESTING' exactly, phase 'PLAN'.
 */
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { toCanonicalRepoPath } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SD_ID = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const summary = [
  'TESTING sub-agent PLAN-TO-EXEC gate review of the PRD test strategy for this pre-implementation ',
  'infra/instrument SD (a table-data-aware stage 21-26 literal census sweeper). Reviewed the 7 ',
  'test_scenarios (TS-1..TS-7), 5 acceptance_criteria, 4 risks and 4 technical_requirements from ',
  'product_requirements_v2. VERDICT: CONDITIONAL_PASS.\n\n',
  'WHAT IS SOLID: TS-2 explicitly covers the negative-control FAILURE mode (stubbed findings with ',
  'one of the two known-live mismatches deliberately omitted must throw/exit non-zero), not just ',
  'the success path (TS-1). TS-3 turns the reproduced bracket-class-vs-\\d regex hazard into a ',
  'concrete unit test against a real fixture ("Stage22DistributionSetup.tsx" / "Stage21VisualAssets.tsx") ',
  'rather than leaving it as a design principle enforced only by code review -- this directly answers ',
  'the two things this gate review was asked to probe hardest. TS-5 covers the sibling-repo-missing ',
  'error path (loud throw, not a false "0 findings"). Test-type mix (mostly unit/integration, one ',
  'full-corpus run labeled "e2e") is appropriate for a headless CLI census instrument with no ',
  'user-facing UI -- this SD type is correctly exempt from mandatory browser/UAT E2E, and nothing in ',
  'the 7 scenarios requires it.\n\n',
  'GAPS (why CONDITIONAL_PASS, not PASS):\n',
  '1) TS-3\'s own "then" clause hedges: the naive \\d pattern is only "documented (via the self-test) ',
  'as the one that silently failed in the original VALIDATION reproduction" -- that phrasing allows ',
  'an implementation that merely asserts/comments on the historical finding rather than executing the ',
  'naive \\d pattern against the fixture in the same run and asserting it returns 0 rows. Recommend ',
  'EXEC harden TS-3 to a live comparison assertion (bracket-class query returns 2 matches AND naive ',
  '\\d query returns 0 on the identical fixture, in the same test run), not narrative documentation of ',
  'a prior finding.\n',
  '2) TS-6 (classification correctness) only exercises the generated-from-SSOT branch of a binary ',
  'classifier. No scenario exercises the hand-written branch. AC-4 requires every finding to carry an ',
  'explicit generated-from-SSOT OR hand-written label; a classifier that hard-codes one label for ',
  'everything would pass TS-6 as written. Recommend adding a companion case (or extending TS-6) with a ',
  'known hand-written literal (e.g. a stage-number string inside an e2e fixture or component filename ',
  'not traceable to scripts/generate-stage-config.cjs) asserting the hand-written label.\n',
  '3) AC-5 ("zero occurrences of \\d/\\w/\\s/\\m/\\M escapes... in any SQL-embedded regex within the ',
  'instrument source") is a mechanically-checkable static property of the instrument\'s own source, ',
  'but none of TS-1..TS-7 encodes it as an automated self-check -- TS-3 tests regex *behavior* on a ',
  'data fixture, which does not guarantee no forbidden escape exists elsewhere in the source that ',
  'never touches that fixture. Recommend an additional lint-style unit test that scans the instrument ',
  'source file(s) for the prohibited escape literals and fails on any occurrence, so AC-5 is enforced ',
  'by a running test per this program\'s own stated principle (PRD risk-1 mitigation: "enforced by a ',
  'running test rather than a code-review convention alone") rather than by convention only.\n',
  '4) Minor/non-blocking: TS-4 is labeled test_type "e2e" but is actually a full-corpus dogfood run of ',
  'a headless CLI script, not browser/UI E2E. Recommend relabeling to "integration" (or annotating) in ',
  'the PRD/EXEC test plan so a future E2E-specific gate check does not misread this SD as requiring ',
  'Playwright/UAT artifacts it is explicitly exempt from.\n\n',
  'None of these gaps are blocking -- the core scenarios (TS-1, TS-2, TS-5, TS-7) already give strong, ',
  'behaviorally-enforced coverage of the SD\'s two highest-severity documented risks (silent-blind regex, ',
  'silent-empty sibling-repo sweep). Recommend EXEC close gaps 1-3 while implementing rather than ',
  'reopening PLAN.'
].join('');

const findings = [
  'TS-2 (unit) correctly tests the negative-control ASSERTION FAILURE mode: stubbed findings missing '
    + 'one of the two known-live mismatches must throw/exit non-zero -- not merely the success path.',
  'TS-3 (unit) turns the reproduced bracket-class-vs-\\d regex hazard into a concrete fixture-based '
    + 'test rather than leaving it as a design-only principle -- but its "then" clause only requires the '
    + 'naive-pattern failure be "documented", not asserted live in the same run; recommend hardening to '
    + 'a real dual-query assertion before/at EXEC.',
  'TS-6 (unit) covers only the generated-from-SSOT classification branch; no scenario exercises the '
    + 'hand-written branch, so a classifier that always emits one label would pass TS-6 while violating AC-4.',
  'AC-5 (zero \\d/\\w/\\s/\\m/\\M escapes in instrument source) has no dedicated automated self-check '
    + 'test scenario among TS-1..TS-7; TS-3 tests regex behavior on one fixture, not the absence of '
    + 'forbidden escapes elsewhere in the source.',
  'TS-4 is test_type "e2e" but is a full-corpus CLI dogfood run, not browser/UI E2E; this SD is '
    + 'correctly exempt from mandatory E2E under the reduced infrastructure workflow -- recommend '
    + 'relabeling TS-4 to avoid confusing a future E2E-specific gate.',
  'Test-type distribution (unit/integration-heavy, no UAT/browser E2E requirement) is appropriate for '
    + 'a headless, no-UI infra census instrument.'
];

const recommendations = [
  'Harden TS-3 so the naive \\d-pattern failure is asserted live (0 matches on the fixture) in the '
    + 'same test run, not merely narrated as a documented historical finding.',
  'Add a hand-written-classification counterpart to TS-6 so both branches of the binary classifier '
    + 'are exercised before EXEC is considered done.',
  'Add a lint-style unit test that scans the committed instrument source for \\d/\\w/\\s/\\m/\\M regex '
    + 'escapes and fails on any occurrence, to make AC-5 enforced by a running test.',
  'Relabel TS-4\'s test_type from "e2e" to "integration" (or annotate it) so it is not mistaken for a '
    + 'browser/UAT E2E requirement this SD is exempt from.'
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 78,
  summary,
  findings,
  recommendations,
  conditions: [
    { action: recommendations[0], priority: 'medium', blocking: false },
    { action: recommendations[1], priority: 'medium', blocking: false },
    { action: recommendations[2], priority: 'medium', blocking: false },
    { action: recommendations[3], priority: 'low', blocking: false },
  ],
  justification: 'PRD test_scenarios (TS-1..TS-7) give strong behaviorally-enforced coverage of this '
    + 'SD\'s two highest-severity documented risks (silent-blind SQL regex; silent-empty sibling-repo '
    + 'sweep), including the negative-control failure mode and a concrete regex-hazard unit test as '
    + 'specifically probed for this gate review. Three concrete, non-blocking gaps remain (TS-3 '
    + 'assertion strength, one-sided TS-6 classification coverage, no automated AC-5 self-check) that '
    + 'should be closed during EXEC rather than by reopening PLAN.',
  metadata: {
    repo_path: toCanonicalRepoPath(repoRoot),
    executed_from_cwd: process.cwd(),
    recorded_by: 'scripts/record-testing-plan-strategy-evidence.mjs (one-off, PLAN-phase test-strategy review)',
    review_target: 'product_requirements_v2.test_scenarios / acceptance_criteria / risks / technical_requirements',
    prd_id: 'PRD-SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A',
    gate: 'PLAN-TO-EXEC',
    producer_note: 'Generic execute-subagent.js --code TESTING runs live build/test execution against '
      + 'checked-out code, which does not exist yet for this SD (pre-implementation instrument). This '
      + 'is a direct PLAN-phase strategy-review write, following the sanctioned pattern in '
      + 'scripts/record-explore-evidence.js.'
  }
};

async function main() {
  const stored = await storeSubAgentResults('TESTING', SD_ID, null, results, { phase: 'PLAN' });

  const client = await getSupabaseClient();
  const { data, error } = await client
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`\n  WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }
  console.log('\n  TESTING PLAN-strategy evidence recorded and read back:');
  console.log(`    id         ${data.id}`);
  console.log(`    code       ${data.sub_agent_code}`);
  console.log(`    phase      ${data.phase}`);
  console.log(`    verdict    ${data.verdict}`);
  console.log(`    confidence ${data.confidence}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
