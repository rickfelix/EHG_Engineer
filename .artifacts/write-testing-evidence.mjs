import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD = 'SD-LEO-INFRA-DEFERRED-STATE-ENTRANCE-001';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 85,
  execution_time_ms: 0,
  justification:
    'PLAN-gate testing-strategy review of PRD test_scenarios TS-1..TS-9. The 9 scenarios are individually well-formed and TS-7 is precisely targeted, but the strategy as written cannot produce runnable evidence for TS-1/TS-3/TS-4/TS-9 and half of TS-8: those depend on the DB tier, which is fail-closed by design (QF-20260726-459, DESIGNATED_NON_PROD_REFS is empty) and self-skips. Measured: vitest run --project db over tests/integration/sd-park.test.js and tests/integration/hold-state-sweep-live.db.test.js yielded 2 files skipped, 10 of 10 tests skipped, 0 executed. A green run of the PRD strategy as written would prove nothing about FR-2/FR-3/FR-4/FR-5. Separately, FR-5 names a backfill signal (metadata.parked_at proximity) that is inapplicable to 100 percent of its target population (measured: 0 of the 25 rows carry any park_* key), and the backfill has an unguarded blast radius into two live governance gauges. CONDITIONAL_PASS rather than FAIL because every gap has a concrete, in-repo remedy (the computeParkPlan pure-function precedent) that does not require re-planning the SD.',
  conditions: [
    'C1 (blocking): EXEC must extract a pure computeUnparkPlan(sd, {reason, actor, restoreStatus, writingSessionId, nowIso}) mirroring the existing computeParkPlan, and land TS-1/TS-2/TS-3/TS-4 assertions in tests/unit/ against it. The DB-tier integration file must not be the primary evidence for any of them - it does not execute in this environment.',
    'C2 (blocking): FR-5 backfill must write parked_from_status ONLY. A test must pin that it writes neither park_reason (would flip 25 live rows to exempt in lib/oversight/coordinator-health-sharpenings.mjs isChildHumanHeld, silently suppressing STUCK_WITHOUT_HOLD_REASON breaches) nor park_review_at (would move 25 rows into or out of the findOverdueHolds sd_park surface).',
    'C3 (blocking): FR-5 must replace the stated parked_at-proximity signal with the signals that actually exist on the 25 rows - metadata.deferred_at/deferred_by, metadata.deferral.{at,by,reason}, metadata.shelved/shelved_at, and current_phase. Measured phase split: LEAD=22, PLAN_PRD=1, EXEC=2; a blanket draft would regress the 2 EXEC rows (one carries an open PR).',
    'C4 (blocking): FR-2 adds a required arg to unpark(). tests/integration/sd-park.test.js:289 and :314 both call unpark() with no reason and will break. Add that file to FR-6 compat scope and update both call sites in the same PR.',
    'C5: TS-3/FR-4 must also cover parked_from_status PRESENT-but-not-in-WORKABLE (e.g. pending_approval, which is parkable since TERMINAL is only completed/cancelled). Currently 0 live rows, so latent not live - but the same silent draft downgrade applies. If the backfill writes an unknown sentinel, unpark must treat it as still-requires-restore or FR-4 is defeated for the exact 25 rows it protects.',
    'C6: TS-6 mechanism is unspecified. The established sd-start.js pattern is static source pinning (tests/unit/sd-start-terminal-target-no-fallback.test.js), which cannot prove the deferred-vs-completed BRANCH and so cannot jointly satisfy TS-6 and TS-7. Extract a pure refusal-message builder and unit test both branches.',
    'C7: TS-1 asserts stamped_by_session is written, but park() omits the key when writingSessionId is falsy and scripts/sd-park.js:64 does not pass writingSessionId to unpark() at all. Specify the null-session expectation and cover the CLI wiring.',
    'C8: no scenario covers a second park cycle. park() does not strip unparked_* (not in PARK_META_KEYS), so park -> unpark -> park leaves a stale unparked_at/unparked_by reading as current. FR-6 is ambiguous on whether adding unparked_* to PARK_META_KEYS is permitted - PLAN should rule.',
    'C9: add an unpark analogue of the existing security Q5 park test (caller cannot override stamped_by_session; control chars sanitized). FR-3 reuses buildProvenancedStamp specifically for those properties and no scenario exercises them.',
  ],
  findings: [
    { severity: 'HIGH', id: 'T-1', issue: 'DB-tier integration tests do not execute: 10 of 10 skipped, no designated non-production ref (DB_TIER_BLOCKED). TS-1/TS-3/TS-4/TS-9 and the hold-state-sweep half of TS-8 have no runnable home.', recommendation: 'Move the decision logic into a pure helper per the computeParkPlan precedent; treat the DB file as bonus coverage.' },
    { severity: 'HIGH', id: 'T-2', issue: 'FR-5 backfill signal inapplicable: 0 of 25 target rows carry parked_at or any park_* key (all 25 have updated_by=null and never went through park()).', recommendation: 'Use deferred_at/deferred_by, deferral.*, shelved_at, current_phase instead.' },
    { severity: 'HIGH', id: 'T-3', issue: 'FR-5 backfill blast radius into isChildHumanHeld (park_reason) and findOverdueHolds (park_review_at) is untested; FR-6/TS-8 guard only fixture-based unit tests, which cannot detect a live-row flip.', recommendation: 'Pin that the backfill writes parked_from_status only.' },
    { severity: 'HIGH', id: 'T-4', issue: 'FR-2 breaks tests/integration/sd-park.test.js:289 and :314 (both call unpark() with no reason); invisible because the file skips.', recommendation: 'Add to FR-6 compat scope; update both call sites.' },
    { severity: 'MEDIUM', id: 'T-5', issue: 'TS-6 static-pin mechanism cannot prove the deferred-vs-completed branch, so TS-6 and TS-7 cannot both be honestly satisfied by source pinning.', recommendation: 'Extract a pure refusal-message builder.' },
    { severity: 'MEDIUM', id: 'T-6', issue: 'FR-4/TS-3 cover only ABSENT parked_from_status; present-but-non-workable also silently maps to draft. 0 live rows today (measured), latent but reachable.', recommendation: 'Extend TS-3; define the backfill sentinel interlock.' },
    { severity: 'MEDIUM', id: 'T-7', issue: 'stamped_by_session on unpark: CLI does not pass writingSessionId; park() omits the key when falsy. TS-1 under-specifies.', recommendation: 'Specify null-session behaviour and cover CLI wiring.' },
    { severity: 'MEDIUM', id: 'T-8', issue: 'Re-park after unpark leaves stale unparked_* audit keys reading as current. No scenario covers a second cycle.', recommendation: 'Rule on PARK_META_KEYS extension; add a two-cycle scenario.' },
    { severity: 'LOW', id: 'T-9', issue: 'Third deferred-refusal surface at scripts/sd-start.js:635-651 (do_not_advance_without_trigger) prints SD is DEFERRED - cannot be claimed without naming sd:unpark. Outside FR-1 stated scope.', recommendation: 'PLAN scope decision: include or explicitly exclude with rationale.' },
    { severity: 'INFO', id: 'T-10', issue: 'CONFIRMED accurate: exactly 29 live deferred rows, exactly 25 missing parked_from_status. npm run sd:unpark exists. The 4 stamped rows all carry stamped_by_session.', recommendation: 'No action; PRD premise verified against live data.' },
  ],
  metrics: {
    test_scenarios_reviewed: 9,
    scenarios_with_runnable_home: 4,
    scenarios_blocked_on_db_tier: 5,
    named_test_files_verified_present: 4,
    unit_tests_executed: 62,
    unit_tests_passed: 62,
    db_tests_executed: 0,
    db_tests_skipped: 10,
    live_deferred_rows: 29,
    live_deferred_missing_parked_from_status: 25,
    blocking_conditions: 4,
  },
  metadata: {
    phase: 'PLAN_TO_EXEC',
    test_execution: buildTestExecution({ executed: 72, passed: 62, failed: 0, skipped: 10, runner: 'vitest@4.1.4', artifactPath: '.artifacts/testing-evidence/plan-gate-unit-run.json', artifactSha: 'f67499204a08b3fb2bc7df54d1dbb52bef59c54ada4f97dcbc838f36954c3e56', source: 'testing-agent PLAN-gate baseline run' }),
    db_tier_run_artifact: { path: '.artifacts/testing-evidence/plan-gate-db-run.json', sha256: '9a268509a65607d41719cbcb983c4bf93554e95b4858dab291dfb44833ac7c8a', numTotalTests: 10, numPassedTests: 0, numPendingTests: 10, note: 'runner-attested proof that the DB tier executes ZERO tests: DB_TIER_BLOCKED / no_designated_target' },
    review_type: 'plan_gate_testing_strategy_review',
    prd_id: 'PRD-SD-LEO-INFRA-DEFERRED-STATE-ENTRANCE-001',
    baseline_commands_run: [
      'vitest run tests/unit/sd-park.computeParkPlan.test.js tests/unit/oversight/coordinator-health-sharpenings.test.js tests/unit/sd-start-terminal-target-no-fallback.test.js => 3 files / 62 tests PASSED',
      'vitest run --project db tests/integration/sd-park.test.js tests/integration/hold-state-sweep-live.db.test.js => 2 files / 10 tests SKIPPED (DB_TIER_BLOCKED, no_designated_target)',
    ],
    files_reviewed: [
      'lib/sd-park.js', 'scripts/sd-park.js', 'lib/claim-guard.mjs:890-918', 'scripts/sd-start.js:635-652,1026-1038',
      'lib/governance/hold-state-contract.js', 'lib/governance/hold-state-sweep.js', 'lib/oversight/coordinator-health-sharpenings.mjs:296-310',
      'tests/unit/sd-park.computeParkPlan.test.js', 'tests/integration/sd-park.test.js',
      'tests/unit/oversight/coordinator-health-sharpenings.test.js:175-198', 'tests/integration/hold-state-sweep-live.db.test.js',
      'tests/unit/sd-start-terminal-target-no-fallback.test.js', 'tests/helpers/db-available.js',
    ],
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD, subAgentCode: 'TESTING', supabase, probeExistsRelative: 'lib/sd-park.js',
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('TESTING', SD, { metadata: { version: '2.4.0' } }, results, {
  sdKey: SD, phase: 'PLAN_TO_EXEC',
});
console.log('STORED:', JSON.stringify(stored, null, 2).slice(0, 800));
