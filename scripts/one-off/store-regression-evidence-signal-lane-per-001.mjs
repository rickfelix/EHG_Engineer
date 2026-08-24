// SD-LEO-INFRA-SIGNAL-LANE-PER-001 — REGRESSION sub-agent evidence writer (PLAN_VERIFICATION phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
// Backward-compatibility / call-site sweep across all 3 commits in the range
// (d0681203a77, 46c9d49b62b, 44cf25c719e), independent of TESTING/SECURITY/VALIDATION's
// own reviews of the same diff.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '944affe5-227f-453a-830b-8cc296b8fe4e';
const SD_KEY = 'SD-LEO-INFRA-SIGNAL-LANE-PER-001';
const PHASE = 'PLAN_VERIFICATION';
const CODE = 'REGRESSION';

const results = {
  verdict: 'PASS',
  confidence: 90,
  validation_mode: 'prospective',
  execution_time_ms: 0,
  summary:
    'No backward-compatibility regressions found across the 3-commit range (d0681203a77, 46c9d49b62b, ' +
    '44cf25c719e) touching pre-existing load-bearing fleet-coordination files. Every changed pre-existing ' +
    'function was repo-wide grepped for callers, not just tests. (1) stampRoutedToCoordinator: its ONLY caller ' +
    'anywhere is signal-router.cjs\'s own ackAndRouteLoneSignal (line 440); the sole test asserting the OLD ' +
    'disposing behavior (lib/coordinator/signal-router.fr4.test.js) was itself fixed in commit 46c9d49b — it ' +
    'now asserts `u.patch.acknowledged_at` is undefined. No other production code or test depends on the old ' +
    'behavior. (2) fetchOutstandingSignals: refactored into a thin wrapper around a new shared `_fetchOutstanding` ' +
    'core; diffed byte-for-byte against origin/main and confirmed the signature `(sb, sessionId, opts)`, the ' +
    '`if (!sessionId) return null` early return, query shape and return shape are all preserved exactly — the ' +
    'only change is WHERE the `!sb` guard is checked (moved into the shared core), which is behaviorally ' +
    'identical for every caller. Both real call sites (lib/checkin/steps/roll-call.cjs:41, scripts/worker-' +
    'checkin.cjs) use the unmodified signature and need no changes; the pre-existing, unmodified tests/unit/' +
    'fleet/outstanding-signals.test.js still exercises this exact contract and passes. (3) ' +
    'resolveLiveSessionForCallsign: extraction diffed as pure code motion (same query/cutoff/match rule, ' +
    'verified via git diff) out of the promotion-path SIGNAL_RESOLVED block into a shared helper used by both ' +
    'notifySignalResolvedByPromotion (the original call site) and the new notifySignalResolvedByDisposition. The ' +
    'only logic riding along in that extraction was the intentional .neq()->.or() null-safety fix and ' +
    '.order(\'id\')->.order(\'created_at\') fix, both documented in-line and covered by dedicated new tests. (4) ' +
    'runCoordinatorHousekeeping: its ONLY caller in the entire repo is scripts/stale-session-sweep.cjs\'s own ' +
    'main() tick (line 4333) -- confirmed by repo-wide grep excluding comments/docs. It is explicitly NOT a ' +
    'sweep-pass-registry member (tests/unit/lib/sweep/pass-registry.test.js\'s own comment says so) and has no ' +
    'lib/sweep/legacy-fallback.cjs twin. The restructuring (splitting its body into ' +
    'notifySignalResolvedByPromotion + notifySignalResolvedByDisposition, called in that exact order) is a pure, ' +
    'behavior-preserving extraction confirmed via diff. (5) ackAndRouteLoneSignal\'s "zero production callers" ' +
    'claim was independently re-verified true across all 3 commits: repo-wide grep finds it referenced only in ' +
    'its own definition/export inside signal-router.cjs, its own two test files, and prose (docs, PRD JSON, ' +
    'one-off scripts) -- no file under lib/sweep/passes/ or lib/sweep/legacy-fallback.cjs calls it. ' +
    'tests/ci/sweep-legacy-twin-parity.test.js was read in full and specifically interrogated per the review ' +
    'brief: it pins exactly 3 twins (intent-collision-detection, dead-letter-planning, coordination-detectors) ' +
    'and contains ZERO references to runCoordinatorHousekeeping / notifySignalResolvedByPromotion / ' +
    'notifySignalResolvedByDisposition / resolveLiveSessionForCallsign. The commits\' claim that this test ' +
    '"confirms the extraction did not change the sweep-registry/legacy-fallback call shape" is literally true ' +
    'but the housekeeping refactor is simply outside what this test measures -- it passes because it does not ' +
    'touch the pinned surface, not because it validated the housekeeping change (flagged as CONDITIONAL finding ' +
    'below; not blocking because direct dedicated coverage exists elsewhere). receipt-ledger.cjs\'s additions ' +
    '(DISPOSITIONS.PROMOTED/DEFERRED, SIGNAL_LANE_DISPOSITIONS, resolveSignalDisposition) are purely additive: ' +
    'all 5 original exports are unchanged, coordination_receipts.disposition is an untyped `text` column with no ' +
    'CHECK constraint (confirmed in database/migrations/20260731_coordination_receipt_ledger.sql), and the only ' +
    'other repo consumers of this specific DISPOSITIONS object (directed-assignment.cjs, adam-advisory-store.cjs) ' +
    'reference named keys, never an exhaustive enumeration -- unaffected by the 2 new values. (A same-named ' +
    'DISPOSITIONS constant in lib/eva/post-build-verdict-engine.js is a wholly separate, unrelated local object -- ' +
    'ruled out as a false lead.) fleet-dashboard.cjs\'s printInbox change and coordinator-ack-signal.cjs\'s ' +
    'rewrite are additive/fail-quiet; coordinator-ack-signal.cjs is never require()\'d by any other file in the ' +
    'repo (CLI-only), so its rewrite carries no cross-module regression surface beyond its own tests. Ran the ' +
    'full unit suite (`vitest run --project unit`): 42,376 passed / 9 failed / 205 skipped across 3,432 files. ' +
    'All 9 failures are in ONE unrelated file (scripts/hooks/__tests__/post-completion-tail-enforcement.test.js), ' +
    'asserting stderr===\'\'; root cause is a Node runtime warning ("NO_COLOR ignored due to FORCE_COLOR") because ' +
    'this environment has both FORCE_COLOR=1 and NO_COLOR=1 set (confirmed via `env`) -- that file touches none ' +
    'of this SD\'s changed code. tests/unit/scripts/lint-repo-resolution-drift.test.js failed only inside the ' +
    'full parallel run and passed cleanly (7/7) standalone -- a pre-existing order/pollution flake, unrelated to ' +
    'any file this SD touches. Reran tests/ci/sweep-legacy-twin-parity.test.js standalone (9/9 pass) and all 11 ' +
    'of the SD\'s own touched/added unit test files together (104/104 pass).',
  findings: [
    {
      id: 'R0-INFO-parity-test-does-not-cover-housekeeping-refactor',
      severity: 'low',
      note: 'tests/ci/sweep-legacy-twin-parity.test.js pins ONLY intent-collision-detection, ' +
        'dead-letter-planning and coordination-detectors twins -- it has zero assertions touching ' +
        'runCoordinatorHousekeeping, notifySignalResolvedByPromotion, notifySignalResolvedByDisposition, or ' +
        'resolveLiveSessionForCallsign. It passes for this SD\'s changes because those functions are outside its ' +
        'pinned surface, not because it validated the housekeeping extraction. Not blocking: the housekeeping ' +
        'refactor has its own direct, dedicated regression coverage (tests/unit/coordinator/signal-resolved-' +
        'promotion-path.test.js, signal-resolved-disposition-path.test.js) driving the real extracted functions ' +
        'against fixtures, including explicit primary-regression tests for the .neq()->.or() null-safety fix.',
      recommendation: 'When citing this parity test as evidence in future commit messages for this file, scope ' +
        'the claim precisely to the 3 registry/legacy-fallback twins it actually pins -- it says nothing about ' +
        'runCoordinatorHousekeeping or its two SIGNAL_RESOLVED sub-functions.'
    }
  ],
  recommendations: [
    'No code changes required. Optional: a future SD could add runCoordinatorHousekeeping / ' +
      'notifySignalResolvedByPromotion / notifySignalResolvedByDisposition to a parity-style pinning test if a ' +
      'legacy-fallback twin for the coordinator-housekeeping tail is ever introduced.'
  ],
  detailed_analysis:
    'SCOPE: git log d07741c680d..HEAD --stat (3 commits: d0681203a77 feat, 46c9d49b62b fix, 44cf25c719e test). ' +
    'Diffed against origin/main: lib/coordinator/signal-router.cjs, scripts/stale-session-sweep.cjs, ' +
    'lib/fleet/outstanding-signals.cjs, scripts/fleet-dashboard.cjs, lib/coordination/receipt-ledger.cjs, ' +
    'lib/coordinator/signal-router.fr4.test.js, tests/unit/session-coordination-consumption-census.test.js.\n\n' +
    'CALL-SITE SWEEP (repo-wide grep, not just tests/):\n' +
    '- stampRoutedToCoordinator: 1 caller total (signal-router.cjs:440, its own ackAndRouteLoneSignal). No ' +
    'external caller exists anywhere.\n' +
    '- fetchOutstandingSignals: 2 real callers (lib/checkin/steps/roll-call.cjs, scripts/worker-checkin.cjs), ' +
    'both unmodified by this SD, both compatible with the unchanged wrapper signature.\n' +
    '- fetchAllOutstandingSignals (new): 1 caller (scripts/fleet-dashboard.cjs, added by this SD).\n' +
    '- resolveLiveSessionForCallsign (new export): called from notifySignalResolvedByPromotion and ' +
    'notifySignalResolvedByDisposition only; no external caller.\n' +
    '- runCoordinatorHousekeeping: 1 caller (stale-session-sweep.cjs main() tick, line 4333); not a sweep-pass- ' +
    'registry member; no legacy-fallback.cjs twin exists for it.\n' +
    '- ackAndRouteLoneSignal: 0 production callers confirmed (only its own tests and prose references).\n\n' +
    'DB CHECK: coordination_receipts.disposition is `text`, no CHECK constraint (database/migrations/' +
    '20260731_coordination_receipt_ledger.sql) -- DISPOSITIONS.PROMOTED/DEFERRED write cleanly.\n\n' +
    'TEST RUNS:\n' +
    '- npx vitest run --project unit: 3415 files passed / 2 files failed (9 tests failed total), 42376/42593 ' +
    'tests passed.\n' +
    '- npx vitest run tests/ci/sweep-legacy-twin-parity.test.js: 9/9 pass (isolated).\n' +
    '- npx vitest run tests/unit/scripts/lint-repo-resolution-drift.test.js: 7/7 pass (isolated -- fails only ' +
    'under full-suite parallel run; pre-existing flake, unrelated file).\n' +
    '- 11 SD-touched/added test files run together: 104/104 pass.\n' +
    '- Failing file scripts/hooks/__tests__/post-completion-tail-enforcement.test.js: root-caused to ' +
    'FORCE_COLOR=1 + NO_COLOR=1 both set in this shell environment producing a Node stderr warning; unrelated to ' +
    'any file in this SD\'s diff.'
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: CODE,
  targetApplication: 'EHG_Engineer',
  fallback: 'EHG_Engineer'
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  CODE,
  SD_ID,
  { name: 'Regression Sub-Agent' },
  results,
  { sdKey: SD_KEY, phase: PHASE }
);

console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_CONFIDENCE=' + results.confidence);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('REPO_RESOLVED=' + results.metadata.repo_resolved);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
