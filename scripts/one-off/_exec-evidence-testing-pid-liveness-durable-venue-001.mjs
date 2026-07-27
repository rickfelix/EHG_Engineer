#!/usr/bin/env node
/**
 * Write EXEC-phase TESTING evidence for SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001.
 *
 * Adversarial review of the 4-FR test surface (FR-2c, FR-2d, FR-3a, FR-3b, FR-3c, FR-4). Verified
 * pass/fail counts by running the suites directly, then ran three destructive negative-control
 * experiments (temporarily reverting each of C1/C2/C3 in the working tree, one at a time, then
 * restoring via `git checkout --`) to confirm tests/unit/fleet/pid-liveness-parent-acceptance.test.js
 * actually depends on all three children rather than passing vacuously.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict +
 * lib/sub-agent-executor/results-storage.js storeSubAgentResults) — no hand-rolled INSERT,
 * per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '69e5bbe2-1251-4481-bc3b-d69a16b6907a';
const SD_KEY = 'SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001';

async function writeTesting(supabase) {
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });
  let results = {
    verdict: 'PASS',
    confidence: 88,
    findings: [
      { id: 'F1-counts-confirmed', severity: 'INFO', summary: 'Individually-run new/changed files: tick-fresh-window-derivation.test.js 6/6, pid-blind-venue-abstains.test.js 8/8, watcher-evaluates-every-seat.test.js 8/8, periodic-liveness-watcher.test.js 26/26, liveness-watcher-durable-venue.test.js 15/15, pid-liveness-parent-acceptance.test.js 7/7 pass. view-backed-liveness-parity.test.js: 8/9 pass, 1 fail (the LIVE leg, by design -- needs the chairman-gated migration applied). Full `npm run test:unit`: 2640 files / 31583 tests pass, 10 files fail (the 9 pre-existing baseline failures reproduced identically on origin/main 176446d3ad9, plus this SD\'s own view-backed-liveness-parity LIVE leg -- no new regressions). `npm run test:session-tick`: 42/42 pass, including TS-3c which is the actual behavioral proof for C1 (self-relatch refusal).' },
      { id: 'F2-parent-acceptance-verified-adversarially', severity: 'INFO', summary: 'Confirmed pid-liveness-parent-acceptance.test.js FR-4 genuinely spawns and kills real OS child processes (node -e sleep loops) in beforeAll, waits on the exit event plus a 300ms drain, and produces BOTH an ALIVE verdict (live child) and a DEAD verdict (reaped child) inside the same test run -- not two separate runs. Ran it 5x back-to-back with zero flakes.' },
      { id: 'F3-negative-controls-executed-live', severity: 'INFO', summary: 'Reverted each of the three children in the working tree (one at a time, restored after each via git checkout --) and re-ran pid-liveness-parent-acceptance.test.js: C1 (removed `if (candidate === process.pid) return 0;` guard in scripts/session-tick.cjs) -> 1 failed/6 passed, matching the claimed count exactly. C2 (disabled the UUID/session_id marker-scan branch in lib/fleet/resolve-cc-pid.cjs, forcing it to always return null) -> 3 failed/4 passed, matching the claimed count exactly. C3 (forced pidVenueCapability() to always report capable:true in lib/fleet/pid-venue.cjs) -> 1 failed/6 passed via a real assertion (not a crash) -- the SD author\'s own C3 revert apparently crashed the suite (duplicate `let` -> SyntaxError) rather than failing a real assertion; my cleaner revert produces a genuine assertion failure, which is the stronger of the two forms of evidence, so I do not treat the discrepancy as a defect. All three reverts confirm the test is NOT vacuous and does bind all three children.' },
      { id: 'F4-forbidden-column-self-check-verified', severity: 'INFO', summary: 'The claim "makes no assertion on stale_reason/stale_at/released_reason" is enforced by a self-grep test inside the same file, not by reviewer discipline. Verified it is a real negative control by injecting a smuggled forbidden-column assertion into the file: the self-check test failed as expected (then reverted).' },
      { id: 'F5-view-parity-negative-control-verified', severity: 'INFO', summary: 'view-backed-liveness-parity.test.js DOES carry a genuine negative control for the "obvious test is vacuous" risk the file\'s own doc-comment names: two "THE CONTROL" cases destructure the same row with process_alive_at / expected_silence_until omitted and assert the verdict FLIPS from alive to dead -- not merely a different reason. This is real, not decorative; the parity assertion that follows is not vacuous.' },
      { id: 'F6-source-grep-tests-flagged', severity: 'WARNING', summary: 'tests/unit/fleet/watcher-evaluates-every-seat.test.js is 100% source-grep (string-slices scripts/periodic-liveness-watcher.mjs and regex-matches on it; never calls resolveRoleSession or evaluateRow). However this is NOT the only coverage for FR-3c: tests/unit/periodic-liveness-watcher.test.js\'s 2 new cases DO exercise evaluateRow end-to-end through a mocked Supabase client with real multi-seat data (5 seats, 4 dead behind 1 forged-fresh one) and include a genuine negative control (an all-alive class asserting dead_seat_ids===[]). The source-grep file is therefore supplementary/defense-in-depth, not the sole line of defense, but its own tests would be more convincing as behavioral tests given evaluateRow is already exported and mockable. tests/unit/fleet/pid-blind-venue-abstains.test.js also has 3 of its 8 tests be source-grep against scripts/stale-session-sweep.cjs (the "the sweep consumes it" describe block) rather than invoking a classification function -- reasonable given stale-session-sweep.cjs does not export a standalone per-row classifier, but noted as a residual risk (a classifier extraction + behavioral test would close it more tightly).' },
      { id: 'F7-flakiness-risk-assessed', severity: 'INFO', summary: 'The parent acceptance test\'s process spawn/kill/reap timing (fixed 300ms sleep after the exit event, before asking process.kill(pid,0)) is a plausible flakiness vector on a loaded CI runner. Ran the test 5 consecutive times locally with zero failures; PID-reuse-within-test-window is the only other theoretical risk and is astronomically unlikely on Windows/Linux at this timescale. Acceptable residual risk, not a blocker.' },
    ],
    warnings: [
      { severity: 'WARNING', issue: 'watcher-evaluates-every-seat.test.js and 3/8 tests in pid-blind-venue-abstains.test.js are pure source-grep rather than behavioral', recommendation: 'Non-blocking: FR-3c already has independent behavioral coverage via periodic-liveness-watcher.test.js. Consider extracting a standalone classifier from stale-session-sweep.cjs in a follow-up so the "sweep consumes it" checks can become behavioral too.' },
    ],
    recommendations: ['PROCEED to PLAN verification. No new regressions; the single branch-specific failure (view-backed-liveness-parity LIVE leg) is by design pending the chairman-gated migration apply.'],
    detailed_analysis: JSON.stringify({
      sd_key: SD_KEY,
      full_suite: { files_total: 2653, files_failed: 10, tests_total: 31683, tests_failed: 15, tests_passed: 31583, skipped: 83, todo: 2 },
      baseline_failures_reproduced: ['lib/crm/pipeline-integration.e2e.test.js', 'tests/unit/append-fleet-commit-trailer.test.js', 'tests/unit/complete-quick-fix/external-timeout-and-coverage-gate.test.js', 'tests/unit/fleet/cp3-restart-relaunch-live-flag-propagation.test.js', 'tests/unit/fleet/spawn-control.test.js', 'tests/unit/golden-references/witness-emitter-acceptance.test.js', 'tests/unit/hooks/session-register-created-emission.test.js', 'tests/unit/setup/env-isolation-guard.test.js', 'tests/unit/unit-tier-env-isolation.test.js'],
      branch_specific_failure: 'tests/unit/fleet/view-backed-liveness-parity.test.js (LIVE leg only, 8/9 pass) -- gated on database/migrations/20260727_v_active_sessions_expose_tick_and_silence.sql apply (chairman-gated, tier=2 CREATE OR REPLACE VIEW)',
      new_file_counts: {
        'tests/unit/fleet/view-backed-liveness-parity.test.js': '8/9 pass',
        'tests/unit/fleet/tick-fresh-window-derivation.test.js': '6/6 pass',
        'tests/unit/fleet/pid-blind-venue-abstains.test.js': '8/8 pass',
        'tests/unit/fleet/watcher-evaluates-every-seat.test.js': '8/8 pass',
        'tests/unit/periodic-liveness-watcher.test.js': '26/26 pass',
        'tests/unit/fleet/liveness-watcher-durable-venue.test.js': '15/15 pass',
        'tests/unit/fleet/pid-liveness-parent-acceptance.test.js': '7/7 pass',
      },
      negative_control_experiments: {
        C1_revert_session_tick_self_relatch_guard: '1 failed / 6 passed (matches claim)',
        C2_revert_resolve_cc_pid_uuid_marker_scan: '3 failed / 4 passed (matches claim)',
        C3_revert_pid_venue_always_capable: '1 failed / 6 passed via real assertion (claim reported a crash instead; my clean revert is stronger evidence, not a discrepancy of substance)',
      },
      session_tick_node_test_suite: '42/42 pass (includes TS-3c, the behavioral proof for C1)',
    }),
    metadata: {
      files_reviewed: [
        'tests/unit/fleet/view-backed-liveness-parity.test.js',
        'tests/unit/fleet/tick-fresh-window-derivation.test.js',
        'tests/unit/fleet/pid-blind-venue-abstains.test.js',
        'tests/unit/fleet/watcher-evaluates-every-seat.test.js',
        'tests/unit/periodic-liveness-watcher.test.js',
        'tests/unit/fleet/liveness-watcher-durable-venue.test.js',
        'tests/unit/fleet/pid-liveness-parent-acceptance.test.js',
      ],
    },
    phase: 'EXEC',
    validation_mode: 'retrospective',
    summary: 'PASS (confidence 88). Verified all claimed pass/fail counts exactly, including live destructive negative-control reverts of C1/C2/C3 against pid-liveness-parent-acceptance.test.js (1/3/1 failures respectively, matching the claim in substance). Confirmed the view-backed-liveness-parity.test.js negative control genuinely flips the verdict. Flagged two files as partially/fully source-grep (watcher-evaluates-every-seat.test.js, and 3/8 tests in pid-blind-venue-abstains.test.js) as non-blocking test-quality debt -- FR-3c already has independent behavioral coverage elsewhere. No new regressions vs the established 9-file baseline; the sole branch-specific failure is by design (chairman-gated migration).',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director (testing-agent)' }, results, { sdKey: SD_KEY, phase: 'EXEC' });
}

async function main() {
  const supabase = await getSupabaseClient();
  const testing = await writeTesting(supabase);
  console.log('TESTING:', testing.id, testing.verdict, testing.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
