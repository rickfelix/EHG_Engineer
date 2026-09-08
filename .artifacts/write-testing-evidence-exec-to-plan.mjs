import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD = 'SD-LEO-INFRA-DEFERRED-STATE-ENTRANCE-001';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const results = {
  verdict: 'PASS',
  confidence: 92,
  execution_time_ms: 0,
  justification:
    'EXEC-TO-PLAN re-verification pass. Both regressions from the prior FAIL are independently confirmed fixed, and the fixes are real rather than weakened assertions. (1) The TARGET_ALREADY_TERMINAL message text is back INLINE in scripts/sd-start.js on both branches; only the literal `npm run sd:unpark` command string is shared via buildUnparkExitCommand() in lib/claim-guard.mjs. The QF-20260704-825 pinned test diff is exactly ONE line (slice window idx+700 -> idx+1050); no assertion regex was changed. I measured that the widening is legitimate and not a loosening: the pinned process.exit(1) is the SAME exit that closes the TARGET_ALREADY_TERMINAL block, displaced 350 chars by the new branch, and the extended window terminates ~85 chars past the block close with no stray process.exit(1) inside it. (2) The progress-column baseline rebase changed ONLY three line numbers for lib/sd-park.js (77->83, 90->100, 135->225) and added NO new baseline entries, so the ratchet was not loosened; I spot-checked all three against live source and each lands exactly on a client.query( call site whose SQL references the progress column (83->SELECT ... progress at 84; 100->UPDATE ... progress = CASE at 103; 225->UPDATE ... progress = COALESCE at 227). The live-ratchet test itself (every LIVE finding present in the frozen baseline, live count does not exceed baseline count) passes, which is the real proof. Red-green mutation check confirms the new static pin genuinely discriminates: reverting the deferred branch fails 2 of 3 pins, and re-extracting the Completed: label (the exact original regression class) fails the deferred-body pin. Both EXEC-TO-PLAN SECURITY findings verified real in source, not merely mocked. Full sweep is green with a runner-attested artifact.',
  findings: [
    { severity: 'INFO', id: 'V-1', issue: 'Regression 1 (QF-20260704-825 static pin, 4 failures) CONFIRMED FIXED. Message text restored inline in scripts/sd-start.js:1029-1042 with an if (claimResult.status === \'deferred\') / else split. Sole test diff is the slice window 700->1050, verified non-weakening.', recommendation: 'None.' },
    { severity: 'INFO', id: 'V-2', issue: 'Regression 2 (frozen progress-column baseline, stale lib/sd-park.js line numbers) CONFIRMED FIXED. 3 line numbers rebased, 0 entries added, all 3 spot-checked accurate against current source.', recommendation: 'None.' },
    { severity: 'INFO', id: 'V-3', issue: 'SECURITY C1 verified REAL in source at lib/sd-park.js:165-172 — an explicit --restore is validated against WORKABLE and throws UNPARK_RESTORE_STATUS_INVALID. Covered by 4 passing tests including explicit rejection of completed and cancelled (the completion-cascade escalation path) and acceptance of every WORKABLE value.', recommendation: 'None.' },
    { severity: 'INFO', id: 'V-4', issue: 'SECURITY C2 verified REAL in source at lib/sd-park.js:156 and :174 — parked_from_status_source===\'backfill_inferred\' is treated as if parked_from_status were absent, requiring an explicit --restore. Covered by 4 passing tests. Verified against LIVE data: 29 deferred rows total, exactly 25 carry the backfill_inferred marker (matching the 25 already-backfilled rows), and the 4 genuinely recorded parks (parked_by=LEAD/cli/worker) correctly carry no marker and still auto-resolve. scripts/one-off/backfill-parked-from-status.mjs:101 also writes the marker for any future run, so this is not a one-off retroactive patch.', recommendation: 'None.' },
    { severity: 'INFO', id: 'V-5', issue: 'SECURITY D2 (TOCTOU) verified REAL at lib/sd-park.js:229 — the final UPDATE carries WHERE sd_key=$1 AND status=$6 (PARK_STATUS) and throws an explicit no-write error when 0 rows match.', recommendation: 'None.' },
    { severity: 'INFO', id: 'V-6', issue: 'Prior PLAN-gate blocking conditions independently re-checked as satisfied: C1 (pure computeUnparkPlan with unit-tested TS-1..TS-4 — 25 passing unit tests), C4 (tests/integration/sd-park.test.js:289 and :314 both now pass reason, so FR-2 does not break them invisibly), C6 (pure buildDeferredRefusalLines builder covers the claim-guard surface via TS-5/TS-7; the sd-start surface uses a static pin that I proved discriminates by mutation), C7 (scripts/sd-park.js:70-72 now wires writingSessionId into unpark()).', recommendation: 'None.' },
    { severity: 'LOW', id: 'V-7', issue: 'Coverage limitation, PRE-EXISTING and NOT a regression from this SD: tests/integration/sd-park.test.js gained 77 lines of new FR-2/FR-3/FR-4 tests that DID NOT EXECUTE — the db-tier guard skips all live-DB integration tests (DB_TIER_BLOCKED, no_designated_target, target ref is production). Measured: 2 files / 15 tests skipped, 0 executed. The base commit of that file already carries the tier guard, and tests/integration/hold-state-sweep-live.db.test.js skips identically, so this is environmental. Materiality is LOW because the PLAN-gate C1 remedy was implemented: every security-critical decision path now has a runnable pure-function home (computeUnparkPlan) with 25 executing unit tests, so no assertion depends solely on the skipped file.', recommendation: 'No action for this SD. The integration file remains bonus coverage until a designated non-production ref is authorized via VITEST_DB_ALLOW_REF.' },
    { severity: 'INFO', id: 'V-8', issue: 'Unaffected-file check confirmed by git status: tests/unit/oversight/coordinator-health-sharpenings.test.js is UNMODIFIED and passes 42/42; tests/integration/hold-state-sweep-live.db.test.js is UNMODIFIED (skips for the same pre-existing db-tier reason).', recommendation: 'None.' },
  ],
  metrics: {
    suites_passed: 832,
    suites_failed: 0,
    tests_executed: 2634,
    tests_passed: 2622,
    tests_failed: 0,
    tests_skipped: 12,
    prior_pass_failures_reproduced: 0,
    prior_pass_failures_confirmed_fixed: 2,
    security_findings_verified_in_source: 3,
    mutation_pins_verified_discriminating: 2,
    live_deferred_rows: 29,
    live_rows_marked_backfill_inferred: 25,
    baseline_entries_added: 0,
    assertion_regexes_weakened: 0,
    db_tier_tests_skipped_preexisting: 15,
  },
  metadata: {
    phase: 'EXEC_TO_PLAN',
    test_execution: buildTestExecution({
      executed: 2634, passed: 2622, failed: 0, skipped: 12,
      runner: 'vitest@4.1.4',
      artifactPath: '.artifacts/testing-evidence/exec-to-plan-reverify-run.json',
      artifactSha: '323148d938f69240daf1215a72351b2ea5b0a930683fb7540f53974446dcfc7f',
      source: 'testing-agent EXEC-TO-PLAN independent re-verification sweep',
    }),
    review_type: 'exec_to_plan_reverification',
    prd_id: 'PRD-SD-LEO-INFRA-DEFERRED-STATE-ENTRANCE-001',
    supersedes_verdict: 'FAIL (prior EXEC-TO-PLAN TESTING pass, same session/worktree)',
    commands_run: [
      'vitest run tests/unit/sd-start-terminal-target-no-fallback.test.js tests/unit/sd-start-terminal-target-deferred-branch.test.js => 2 files / 9 tests PASSED',
      'vitest run tests/unit/hygiene/no-bare-progress-column.test.js => 1 file / 78 tests PASSED (incl. the live ratchet)',
      'vitest run tests/unit/sd-park.computeUnparkPlan.test.js tests/unit/claim-guard-deferred-refusal.test.js => 2 files / 30 tests PASSED (SECURITY C1 x4, C2 x4)',
      'vitest run tests/unit/claim tests/unit/governance tests/unit/harness tests/unit/hygiene + the 4 named files + oversight/coordinator-health-sharpenings => 832 suites / 2634 tests, 2622 PASSED, 0 FAILED, 12 skipped, success:true',
      'vitest run tests/integration/sd-park.test.js tests/integration/hold-state-sweep-live.db.test.js => 2 files / 15 tests SKIPPED (DB_TIER_BLOCKED, pre-existing)',
    ],
    independent_checks_beyond_rerun: [
      'Measured the QF-20260704-825 slice-window widening: confirmed the pinned process.exit(1) is the block own exit displaced 350 chars, and printed the exact 700..1050 extension text to confirm no second exit was pulled into scope.',
      'Mutation/red-green: reverted the deferred branch (2 of 3 pins go red) and re-extracted the Completed: label, i.e. the original regression class (deferred-body pin goes red). Pins are not tautological.',
      'Spot-checked all 3 rebased baseline line numbers against live lib/sd-park.js content; each lands on a client.query( call site with a progress reference in its SQL.',
      'Queried live strategic_directives_v2 for status=deferred: 29 rows, 25 marked backfill_inferred, 4 genuinely recorded parks correctly unmarked.',
      'Read lib/sd-park.js:150-237 directly to confirm C1/C2/D2 exist in production source rather than only in test mocks.',
      'git status confirmed coordinator-health-sharpenings.test.js and hold-state-sweep-live.db.test.js are unmodified.',
    ],
    files_verified: [
      'scripts/sd-start.js:1029-1042', 'lib/claim-guard.mjs:426-431,860-901,941-955', 'lib/sd-park.js:150-237',
      'scripts/sd-park.js:63-72', 'scripts/one-off/backfill-parked-from-status.mjs:101',
      'tests/unit/sd-start-terminal-target-no-fallback.test.js', 'tests/unit/sd-start-terminal-target-deferred-branch.test.js',
      'tests/unit/sd-park.computeUnparkPlan.test.js', 'tests/unit/claim-guard-deferred-refusal.test.js',
      'tests/unit/hygiene/progress-column-baseline.json', 'tests/integration/sd-park.test.js',
    ],
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase, probeExistsRelative: 'lib/sd-park.js',
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('TESTING', SD, { metadata: { version: '2.4.0' } }, results, {
  sdKey: SD, phase: 'EXEC_TO_PLAN',
});
console.log('VERDICT:', results.verdict, '| confidence:', results.confidence);
console.log('repo_resolved:', results.metadata.repo_resolved, '| probe_exists:', results.metadata.probe_exists);
console.log('STORED:', JSON.stringify(stored, null, 2).slice(0, 600));
