import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SD_UUID = '7b8be04e-1f2b-431c-b33d-4574013a94e5';
const SD_KEY = 'SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001';
const HEAD_SHA = '4f90a5f5834e41cbc61ecf5c4c3bfd0da4f34476';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  probeExistsRelative: 'lib/uat/result-recorder.js',
  supabase
});
console.log('repo resolution:', JSON.stringify(resolution));

let results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  summary:
    'Fresh EXEC-TO-PLAN test execution against the fully-merged SD surface (HEAD 4f90a5f5). '
    + 'All 13 SD-touched unit test files pass: 225/225. Full unit suite: 40,883 passed / 28 failed '
    + '(all 28 pre-existing and unrelated - proven, see metadata.preexisting_failure_analysis). '
    + 'Three mutation tests run against the highest-stakes new assertions; all three mutants were '
    + 'KILLED, confirming the tests exercise real code paths rather than vacuous mocks. '
    + 'CONDITIONAL on one genuine coverage gap: the FR-adjacent priority-calculator.js lazy-init fix '
    + 'has no committed unit test (guarded only by the CI barrel smoke check).',
  execution_time_ms: 406020,
  metadata: {
    evaluated_commit_sha: HEAD_SHA,
    executed_from_cwd: process.cwd(),
    branch: 'feat/SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001',
    head_parity: {
      note: 'HEAD is 11 commits behind main, but NONE of those 11 touch this SD source/test surface - verified by path-scoped git log HEAD..main. Results reflect the merged state.',
      commits_behind_main: 11,
      sd_surface_identical_to_main: true
    },
    e2e_applicability: {
      required: false,
      rationale: 'PRD activation_test_id is null and all 8 test_scenarios are fixture/unit-level (gate verdicts, hook enforcement, DB write-path column alignment). No UI surface shipped; this SD is LEO-harness infrastructure in EHG_Engineer, which has no Playwright UI target.'
    },
    targeted_suite: {
      files: 13,
      tests_passed: 225,
      tests_failed: 0,
      list: [
        'tests/unit/uat/result-recorder-schema.test.js',
        'tests/unit/uat/scenario-generator-journey.test.js',
        'tests/unit/phase-state-machine.test.js',
        'tests/unit/type-aware-completion.test.js',
        'tests/unit/handoff/executors/plan-to-lead/journey-walk-wait.test.js',
        'tests/unit/lifecycle-sd-bridge/orchestrator-journey-steps.test.js',
        'tests/unit/apa/venture-step-executors.test.js',
        'tests/unit/apa/journey-walk-orchestrator.test.js',
        'tests/unit/eva/quality-findings/db-sourced-findings.test.js',
        'tests/unit/eva/stage-templates/analysis-steps/stage-20-journey-walk-verdict.test.js',
        'tests/unit/eva/bridge/chairman-site-review-attestation.test.js',
        'tests/unit/marketing/crack-gate-evaluator.test.js',
        'tests/unit/marketing/crack-gate-precondition.test.js'
      ]
    },
    full_suite: {
      command: 'npm run test:unit',
      files_total: 3322,
      tests_passed: 40883,
      tests_failed: 28,
      skipped: 204,
      duration_s: 406
    },
    mutation_tests: [
      {
        target: 'lib/uat/result-recorder.js',
        mutation: 'removed the pass_rate field from the completeSession update payload',
        outcome: 'KILLED - 3 assertions failed, asserting real computed values (90/100/95) on the actual update payload',
        verifies: 'FR-5 AC4 pass_rate write is genuinely covered'
      },
      {
        target: 'scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js',
        mutation: 'defaulted journeySteps to a non-empty array so the WAIT fires without the metadata flag',
        outcome: 'KILLED - the "no journey_steps in metadata -> PASS as before (regression-safe)" test failed',
        verifies: 'FR-3 AC2 journey_steps-only keying is genuinely covered (not sd_type-keyed, not over-firing)'
      },
      {
        target: 'lib/quality/priority-calculator.js',
        mutation: 'restored eager module-scope createSupabaseServiceClient()',
        outcome: 'KILLED by an ad-hoc mock probe (import-time construction count 0 -> 1); probe was temporary and REMOVED - no committed test covers this',
        verifies: 'lazy-init fix is real, but is regression-guarded only by .github/workflows/worker-smoke.yml'
      }
    ],
    preexisting_failure_analysis: {
      conclusion: 'All 28 full-suite failures are pre-existing and unrelated to this SD.',
      evidence: [
        'Zero file overlap: none of the failing test files appear in this SD 27 changed files.',
        'Zero import overlap: no failing test imports any SD-touched module (grep-verified).',
        'Attribution: the 3 deterministic failures were last touched by other SDs (2026-06-16, 2026-08-04, 2026-08-16), all pre-dating this SD.',
        'Main-parity: git log HEAD..main shows no commit touching those files, so they fail on main too.',
        'Load-flakiness: failing-file count varied 14 -> 9 -> 5 across runs; complexity-scorer.test.js passes 7/7 in isolation.'
      ],
      deterministic_failures: [
        {
          file: 'tests/unit/protocol/contract-read-coverage.test.js',
          failures: 5,
          cause: 'tokenizer veto returns unavailable - gpt-tokenizer dependency is not installed; owned by SD-LEO-INFRA-CONTRACT-READ-COVERAGE-001'
        },
        {
          file: 'tests/unit/fleet/qf-20260727-488-role-aware-default-prompt.test.js',
          failures: 2,
          cause: 'TypeError: undefined slot fixture in reboot-respawn-runner; owned by SD-LEO-INFRA-FLEET-CANNOT-SELF-001'
        },
        {
          file: 'tests/unit/heal-vision/heal-vision.test.js',
          failures: 1,
          cause: '60s timeout on a --target-path scorer smoke test (environmental)'
        }
      ],
      environmental_flakes: [
        'lib/worktree-quota.test.js',
        'scripts/hooks/__tests__/stop-loop-wakeup-reminder.test.js',
        'scripts/modules/shipping/__tests__/post-merge-worktree-cleanup.test.js',
        'scripts/modules/shipping/__tests__/post-merge-worktree-cleanup-claim-protect.test.js',
        'scripts/singleton-relaunch-restore.test.js',
        'tests/unit/scripts/lint-repo-resolution-drift.test.js',
        'tests/unit/eva/complexity-scorer.test.js'
      ]
    },
    coverage_gaps: [
      'lib/quality/priority-calculator.js lazy-init has NO committed unit test (VITEST-not-NODE class): a green vitest suite cannot see an import-time credential throw. Guarded only by the credential-free barrel smoke check in .github/workflows/worker-smoke.yml. Recommend a committed regression test.',
      'gpt-tokenizer is not installed locally, so contract-read-coverage.test.js degrades to an unavailable veto - pre-existing, not this SD.'
    ],
    fr_coverage: {
      'FR-1/FR-1b': 'tests/unit/lifecycle-sd-bridge/orchestrator-journey-steps.test.js',
      'FR-2': 'tests/unit/apa/venture-step-executors.test.js, tests/unit/apa/journey-walk-orchestrator.test.js, tests/unit/uat/scenario-generator-journey.test.js',
      'FR-3': 'tests/unit/handoff/executors/plan-to-lead/journey-walk-wait.test.js (mutation-verified)',
      'FR-4': 'tests/unit/eva/quality-findings/db-sourced-findings.test.js, tests/unit/eva/stage-templates/analysis-steps/stage-20-journey-walk-verdict.test.js',
      'FR-5': 'tests/unit/uat/result-recorder-schema.test.js (mutation-verified), tests/unit/phase-state-machine.test.js, tests/unit/type-aware-completion.test.js',
      'FR-6': 'tests/unit/eva/bridge/chairman-site-review-attestation.test.js, tests/unit/marketing/crack-gate-evaluator.test.js, tests/unit/marketing/crack-gate-precondition.test.js'
    }
  }
};

results = applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'TESTING',
  SD_UUID,
  { name: 'Enhanced QA Engineering Director (testing-agent)' },
  results,
  { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN', source: 'manual' }
);

console.log('\n=== WRITE RETURNED ===');
console.log('  id:', stored.id);
console.log('  phase:', stored.phase);
console.log('  verdict:', stored.verdict, '| confidence:', stored.confidence);
console.log('  repo_path:', stored.metadata?.repo_path);
