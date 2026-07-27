#!/usr/bin/env node
/**
 * Write TESTING (Enhanced QA Engineering Director) EXEC-phase RE-VERIFICATION verdict for
 * SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001, at branch commit 77fa5234614.
 *
 * Supersedes the prior TESTING row (id 2c4925ea-3108-4061-bab3-bcce352d935e, WARNING/88,
 * written against commit 451687af48b). This is a fresh, independent re-measurement requested
 * by the coordinator after 3 commits (d93d4a1ff88, 86093758cfd, 77fa5234614) addressed the
 * prior findings.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '137ad5d5-f542-4518-afb6-37789fd1546b';
const SD_KEY = 'SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001';
const COMMIT = '77fa5234614';

const findings = [
  {
    id: 'R1-prior-regression-fixed-verified',
    severity: 'INFO',
    summary: 'tests/unit/claim-validity-gate-foreign-claim-reconciliation.test.js — the deterministic regression I reported previously — is FIXED and verified. The fix replaces the fixed 5600-char search window with a semantic bound (from the reconciliation-attempt anchor to the pre-existing hard-fail throw text `reason: \'foreign_claim\',`), so future insertions inside the try block cannot break it again the way two prior insertions did (3600->5600->overflow). Ran this file in isolation and as part of the full unit tier: passes both times.',
  },
  {
    id: 'R2-new-regression-in-a-DIFFERENT-preexisting-test-not-mentioned-by-coordinator',
    severity: 'HIGH',
    summary: 'A NEW, deterministic (reproduced twice) failure exists on this branch that was NOT among the items the coordinator listed as fixed and was not caught by their "confirm no new ones" self-check: tests/unit/claim-write-fence.test.js > "claimGuard acquire lane consults the fence (QF-20260711-937...) > consults the fence BEFORE the acquire claim_sd RPC (Case 3), refusing with the fence named". Root cause verified precisely: this pre-existing test (source-pinned from an earlier QF, unrelated to the 5 new SD-specific test files) does `src.indexOf(\'await liveClaimWriteFenceReason(supabase, sdKey)\')` — an exact-string match against the OLD 2-argument call. Commit d93d4a1ff88 (item 2, "activate the SD lane") correctly changed lib/claim-guard.mjs:639 to `liveClaimWriteFenceReason(supabase, sdKey, sessionId)` to fix the real inert-fence defect, but that same fix broke this older test\'s literal string pin, since the exact substring it searches for no longer exists verbatim in the file. This is the SAME CLASS of brittleness as the regression I found and reported last time (a source-pin test whose search string/window does not survive an otherwise-correct nearby edit) — it just hit a different, older test file this time. It is a one-line fix (update the pinned substring to include the third argument, or search on a prefix like `liveClaimWriteFenceReason(supabase, sdKey,`), not a logic defect in claim-guard.mjs — the actual fence-before-RPC ordering and refusal behavior are unchanged and correct on read-through. But it means the branch is not fully green today.',
  },
  {
    id: 'R3-inert-sd-lane-fix-verified-including-both-named-exceptions',
    severity: 'INFO',
    summary: 'FR-2\'s SD/RPC-lane gap (my prior finding T3, independently corroborated by SECURITY S5) is fixed. Verified by reading the diffs directly: lib/claim-guard.mjs:639 and scripts/worker-checkin.cjs:377 now both pass sessionId as the third argument to liveClaimWriteFenceReason, activating the liveness sub-check on both lanes. Also independently verified the two claimed exceptions are legitimate, not silently-still-broken: (a) scripts/modules/handoff/executors/BaseExecutor.js:335 runs at a HANDOFF boundary (Step 1.9, coordinator-authority fence for human_action_required/needs_coordinator_review/not_before_hold) and writes no claim at all -- read the surrounding ~40 lines to confirm no .update({claiming_session_id...}) exists in that code path; (b) scripts/sd-start.js:1237 is a candidate pre-filter in the fallback lane (skip-polarity: on a fence hit it `continue`s to the next candidate rather than writing anything) -- the actual claim write for that same candidate happens a few lines later via `claimGuard(nextSD.sdKey, session.session_id, {...})`, which now correctly threads the claimant through the fixed 3-arg call. So a DEAD session that slips past the pre-filter (it does not, today, consult liveness) is still caught at the actual write by claimGuard -- no functional gap. Also verified the newly added surface-inventory arity-check test (tests/unit/claim-liveness-fence-surface-inventory.test.js, "every liveClaimWriteFenceReason call passes the CLAIMANT") correctly hard-codes exactly these two paths as its only exceptions and would flag any OTHER 2-arg call site.',
  },
  {
    id: 'R4-fourth-surface-session-conflict-checker-now-wired-and-reachability-confirmed',
    severity: 'INFO',
    summary: 'lib/session-conflict-checker.mjs:302 (the 4th PRD-named RPC-lane surface I found untouched last time, live/reachable via scripts/claude-session-coordinator.mjs:142) is now fenced. Verified the specific bug the coordinator described and fixed: their first draft used createRequire on a module that does not import createRequire, which would throw at runtime and be silently swallowed by the surrounding catch -- a fence that references the right function but never actually executes. The current code uses `await import(\'./fleet/claimant-liveness.cjs\')` (dynamic import) instead. I independently confirmed this resolves correctly at runtime by requiring/importing the file directly in a scratch node -e check equivalent to what the module does (the surface-inventory and other test suites that import claimant-liveness.cjs from this same relative depth all pass, and I read the import statement -- it is syntactically and path-correctly a dynamic import of an existing .cjs file, which Node resolves fine from an .mjs module). No test directly exercises claimSD() end-to-end with a DEAD session (this file has no dedicated liveness-fence test, mirroring the same source-level-trust gap as the other newly-wired surfaces), but the wiring itself is now structurally sound where it was previously absent entirely.',
  },
  {
    id: 'R5-mock-fidelity-gap-closed-and-caught-a-real-bug',
    severity: 'INFO',
    summary: 'tests/unit/claim-liveness-fence-real-probe.test.js is new and does exactly what I recommended last time: calls pidIsClaude(pid, undefined) with NO seam, against the real host tasklist, on Windows only (describe.skip elsewhere). It asserts the real invocation returns NO_MATCH (not PROBE_FAILED) for the current node process and for an impossible pid (0x7FFFFFFF), and separately re-asserts the command-injection defence directly against pidIsClaude. This test caught a genuine, if narrow, production footgun before I could: pidIsClaude(pid, execCmd) previously had no default parameter, so calling the EXPORTED function directly (as this new test now does, and as any future caller reasonably would) always returned PROBE_FAILED regardless of the real pid state. Production callers were unaffected because classifyClaimantLiveness always threads defaultExec down explicitly -- but it was a real defect in the module\'s public contract, now fixed (`function pidIsClaude(pid, execCmd = defaultExec)`). Ran this test file: 4/4 pass on this Windows host.',
  },
  {
    id: 'R6-path-traversal-fix-and-the-coordinators-own-vacuous-test-self-correction-both-verified',
    severity: 'INFO',
    summary: 'SECURITY finding S2 (unvalidated sessionId interpolated into a filesystem path in readTickPidfile) is fixed: isValidSessionId(sid) (same /^[a-zA-Z0-9_-]{1,128}$/ pattern already used elsewhere in the codebase per the code comment) now gates readTickPidfile before path.join. I independently verified the coordinator\'s self-reported vacuous-test catch is real and the rewrite fixes it: the described first draft (call readTickPidfile with a traversal id, assert null) would indeed still return null even with the guard REMOVED, because an unguarded path.join(repoRoot, \'.claude\', \'pids\', `tick-<traversal-sequence>.json`) resolves to a path that then ENOENTs inside readTickPidfile\'s own try/catch -- same observable outcome, guard doing zero work, classic vacuous assertion. The rewritten test (tests/unit/claim-liveness-fence-classifier.test.js, "S2 -- a session id is interpolated into a file path") instead calls isValidSessionId() directly with 8 hostile strings (traversal, NUL byte, empty, ".", "..", embedded space, 129-char overflow) plus 5 non-string types, and separately asserts 2 valid shapes accept -- this DOES fail if the predicate is weakened or removed, because it tests the guard\'s return value directly rather than an end-to-end outcome the guard does not actually influence.',
  },
  {
    id: 'R7-fr3-per-surface-compromise-judged-honest-and-adequate-but-not-equivalent-to-behavioral-proof',
    severity: 'LOW',
    summary: 'Requested judgement on item 4. tests/unit/claim-liveness-fence-qf-surfaces-order.test.js gives scripts/qf-start.js and scripts/create-quick-fix.js each a dedicated describe block asserting: the fence is called, it is called BEFORE the claim write (claim_sd RPC / the creator-self-claim update respectively), and the surrounding code fails open if the fence throws. It explicitly, prominently documents in its own header comment that these are source-order assertions, not behavioral ones, and names the reason (top-level CLI scripts with process.exit + real DB side effects, no harness). My judgement: this satisfies FR-3\'s LITERAL wording ("each of the three QF surfaces has its own test; a single shared test that exercises only one surface does not satisfy this") -- each surface now has file-specific test cases that would fail if that specific surface lost its fence or the fence moved after the write. It does NOT prove the thing FR-3\'s surrounding narrative actually cares about (a DEAD session is refused at runtime) for 2 of the 3 surfaces -- only lib/quick-fix-claim.mjs (via claim-liveness-fence-qf-lane.test.js) has that behavioral proof. The ordering check is not decorative, though: it specifically targets the exact failure shape of the original defect (a refusal that fires AFTER the write already pinned the row), which a naive "does it call the fence" presence check would miss entirely. Given the stated harness constraint is real (I confirmed both files are top-level scripts calling process.exit/safeExit and real supabase RPCs inline, not exported testable units), I consider this an acceptable, honestly-disclosed compromise for THIS SD, not a gap that should block -- but it should be tracked as a follow-on (build a lightweight harness or extract the claim logic into a testable function) rather than treated as equivalent to the behavioral coverage the other 8 surfaces have.',
  },
  {
    id: 'R8-two-low-severity-findings-from-prior-review-remain-open-unaddressed',
    severity: 'LOW',
    summary: 'Neither of my two LOW-severity findings from the prior review was addressed (not claimed as fixed by the coordinator either, so no discrepancy -- just re-confirming current state): (a) the classifier\'s `recorded_pid_name_match` decidingSignal branch (claimant-liveness.cjs:125-130 -- no pidfile, but the recorded claude_sessions.pid itself is a live, correctly-named claude.exe) still has zero test coverage anywhere (grepped, zero hits outside the one production reference); fail-direction is toward ALIVE (safe), so this is not a safety gap, just an untested branch. (b) tests/unit/claim-liveness-fence-classifier.test.js\'s AC5 forbidden-field grep still only checks [\'process_alive_at\', \'heartbeat_at\'], omitting \'status\' despite the describe-block title and FR-1\'s AC5 both naming all three fields; still harmless today (the word "status" appears exactly once in the module, inside a stripped comment) but the AC as literally written is not fully satisfied by the test that claims to satisfy it.',
  },
];

const warnings = [
  'R2: tests/unit/claim-write-fence.test.js has a new, deterministic failure on this branch (reproduced twice), caused by commit d93d4a1ff88\'s otherwise-correct fix to lib/claim-guard.mjs breaking an older test\'s exact-string source pin. This must be fixed (update the pinned substring, e.g. to `liveClaimWriteFenceReason(supabase, sdKey,` or similar prefix match) before this branch can be called fully unit-test-green. Same brittleness class as the regression fixed in R1 -- worth a broader pass checking for other exact-string pins on liveClaimWriteFenceReason call sites, since this is now the second one found across two review passes.',
];

const recommendations = [
  'Fix tests/unit/claim-write-fence.test.js:92 -- the pinned string `\'await liveClaimWriteFenceReason(supabase, sdKey)\'` needs to account for the (correct, intentional) third argument now present in lib/claim-guard.mjs. Trivial, same pattern as the R1 fix already applied elsewhere in this branch.',
  'Non-blocking follow-on: extract the claim-write logic in scripts/qf-start.js and scripts/create-quick-fix.js into testable functions (or build a thin CLI-script test harness) so FR-3\'s two source-order-only surfaces can eventually get the same behavioral proof lib/quick-fix-claim.mjs already has.',
  'Non-blocking: add a test for the recorded_pid_name_match branch and add \'status\' to the AC5 forbidden-field list, closing the two LOW findings carried over from the prior review.',
];

const summary = `CONCERNS (re-measured against commit ${COMMIT}). All 3 substantive gaps from my prior review are now genuinely fixed and independently re-verified by reading the diffs and running the tests, not just taking the coordinator\'s word: (1) the claim-validity-gate-foreign-claim-reconciliation.test.js regression is fixed with a semantic (not byte-count) window; (2) the SD/RPC self-claim lane is no longer inert -- lib/claim-guard.mjs and scripts/worker-checkin.cjs now thread the claimant through, and the two remaining 2-arg exceptions (BaseExecutor.js, sd-start.js) are legitimate on inspection, not silently-still-broken; (3) lib/session-conflict-checker.mjs, the 4th PRD-named surface, is now wired via a correctly-chosen dynamic import after the coordinator caught their own createRequire mistake. The mock-fidelity gap is closed with a real, unmocked tasklist test that caught an actual (if narrow) production footgun -- pidIsClaude lacked a default execCmd parameter. The path-traversal fix (SECURITY S2) is real and its accompanying test is now mutation-resistant, not vacuous. HOWEVER, re-running the full unit tier surfaced a NEW deterministic failure not mentioned in the coordinator\'s summary: tests/unit/claim-write-fence.test.js\'s pre-existing source-pin test for claim-guard.mjs now fails, because the correct 3-argument fence call no longer matches its old exact-string pin -- the same class of test brittleness as the regression I found and that got fixed this round, just surfacing in a different, older file. Root-caused precisely; it is a one-line test fix, not a logic defect, but the branch is not fully unit-test-green today. Separately, FR-3\'s "each of the three QF surfaces has its own test" is now literally satisfied for all three, but 2 of the 3 (qf-start.js, create-quick-fix.js) are source-order/fail-open assertions rather than behavioral proof of DEAD-session refusal -- I judge this an honest, adequately-disclosed compromise given the real CLI-script harness constraint, not equivalent to full coverage, and recommend tracking rather than blocking on it. Two LOW findings from the prior review (untested recorded_pid_name_match branch; AC5 grep omits \'status\') remain open and unaddressed, still harmless today.`;

const justification = [
  `CONCERNS — SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001 EXEC-phase RE-VERIFICATION at commit ${COMMIT}.`,
  '',
  'This is a fresh, independent re-measurement, not a rubber stamp of the coordinator\'s self-report. Every fix claim was checked by reading the actual diff (`git diff 451687af48b..77fa5234614`) and, where applicable, running the relevant test file(s) myself -- not by trusting the commit message.',
  '',
  '(a) FULL UNIT TIER, actual count: 2631 passed | 8 failed test files (2642 total), 31461 passed | 12 failed tests (31558 total, 83 skipped, 2 todo). The foreign-claim-reconciliation regression I reported previously is CONFIRMED GONE — it does not appear in this run\'s failure list, and I re-ran it in isolation to be sure. Of the 8 failing files, 7 are the same pre-existing/unrelated failures noted in my prior review (env-isolation ordering noise, tree-currency, singleton-relaunch, append-fleet-commit-trailer, cp3-restart-relaunch, spawn-control, witness-emitter-acceptance, session-register-created-emission — none touch any file in this SD\'s diff). ONE IS NEW since my last review and IS caused by this branch: tests/unit/claim-write-fence.test.js, root-caused in finding R2 above. So: the specific regression I flagged before is fixed; the coordinator introduced exactly one new one of the same class while fixing it.',
  '',
  '(b) AC-TO-TEST RE-MAPPING: FR-1 (classifier) — all 5 ACs covered as before, AC5\'s grep-list gap (missing \'status\') still open but harmless (R8). FR-2 (gate every write) — now genuinely met for the 4 RPC-lane surfaces named in the PRD: claim-guard.mjs and worker-checkin.cjs are wired (R3), session-conflict-checker.mjs is wired (R4), and the arity-check anti-rot test would catch a future regression to the inert state. The two 2-arg exceptions are legitimate, independently verified (R3). FR-3 (QF lane) — literally met (3/3 surfaces have dedicated tests) but with a disclosed, judged-acceptable coverage-type compromise (R7): 1/3 behavioral, 2/3 source-order. FR-4 (false-negative protection) — unchanged from before, still solidly covered (AC-N1/N2 named and tested; AC-N3 upheld structurally though not adversarially tested, as noted previously). FR-5 (refusal records) — unchanged, still thoroughly covered. TR-1/TR-2 (mock-fidelity, forbidden-fields) — TR-1\'s mock-fidelity gap is now closed with a real, unmocked probe test that already proved its worth by catching a real bug (R5).',
  '',
  '(c) JUDGEMENT ON THE FR-3 SOURCE-ORDER COMPROMISE (item 4): see finding R7. Acceptable given the real CLI-script harness constraint (verified: both scripts call process.exit/safeExit and issue supabase calls inline, not as exported testable units), and the ordering assertion targets the exact shape of the original defect (refusal-after-write). Recommend tracking a follow-on to extract testable claim logic from both scripts rather than leaving this as the permanent state, but do not consider it blocking for this SD.',
  '',
  'RATIONALE FOR CONCERNS (not FAIL, not PASS): the coordinator asked me not to launder a pass, and the honest measurement is that 3 of my prior 3 substantive findings are now genuinely fixed, the FR-3 compromise is a reasonable judgment call, and the mock-fidelity/path-traversal work is solid and caught real bugs along the way — but the branch introduced one new, deterministic, unit-test-red regression (R2) that was not mentioned in the coordinator\'s summary and is therefore worth surfacing plainly rather than silently absorbing into an upgraded verdict. It is a trivial fix (same pattern already applied elsewhere in this branch), so I expect this to resolve quickly, but as of commit 77fa5234614 the branch is not fully unit-test-green.',
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'CONCERNS',
    confidence: 90,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'Fix the new source-pin break in tests/unit/claim-write-fence.test.js (exact-string match against the old 2-arg liveClaimWriteFenceReason call, broken by the correct 3-arg fix in lib/claim-guard.mjs).',
    ],
    test_results: {
      full_unit_tier: { files_total: 2642, files_failed: 8, tests_total: 31558, tests_passed: 31461, tests_failed: 12, skipped: 83, todo: 2 },
      prior_regression_status: { file: 'tests/unit/claim-validity-gate-foreign-claim-reconciliation.test.js', status: 'FIXED, verified in isolation and in full run' },
      new_regression_found: {
        file: 'tests/unit/claim-write-fence.test.js',
        test: 'claimGuard acquire lane consults the fence (QF-20260711-937) > consults the fence BEFORE the acquire claim_sd RPC (Case 3), refusing with the fence named',
        deterministic: true,
        root_cause: 'exact-string source pin against the pre-fix 2-arg liveClaimWriteFenceReason(supabase, sdKey) call; lib/claim-guard.mjs:639 now correctly passes a 3rd arg (sessionId), so the literal pinned substring no longer exists',
        introduced_by: 'd93d4a1ff88 (SD-lane activation fix)',
        mentioned_by_coordinator: false,
      },
      sd_specific_suite_isolated: { files: 9, tests: 71, passed: 70, failed: 1, note: 'includes the pre-existing claim-write-fence.test.js and claim-validity-gate-foreign-claim-reconciliation.test.js alongside the 7 SD-owned files' },
    },
    metadata: {
      review_type: 'EXEC_PHASE_TEST_REVERIFICATION',
      supersedes_result_id: '2c4925ea-3108-4061-bab3-bcce352d935e',
      branch_commit: COMMIT,
      files_reviewed: [
        'lib/fleet/claimant-liveness.cjs',
        'lib/claim-guard.mjs',
        'scripts/worker-checkin.cjs',
        'lib/session-conflict-checker.mjs',
        'scripts/modules/handoff/executors/BaseExecutor.js',
        'scripts/sd-start.js',
        'tests/unit/claim-liveness-fence-classifier.test.js',
        'tests/unit/claim-liveness-fence-surface-inventory.test.js',
        'tests/unit/claim-liveness-fence-qf-surfaces-order.test.js',
        'tests/unit/claim-liveness-fence-real-probe.test.js',
        'tests/unit/claim-validity-gate-foreign-claim-reconciliation.test.js',
        'tests/unit/claim-write-fence.test.js',
      ],
      review_dimensions: {
        full_unit_tier: 'CONCERN — prior regression fixed and verified; one new deterministic regression found, not disclosed by coordinator',
        fr2_sd_lane_wiring: 'PASS — claim-guard.mjs, worker-checkin.cjs, session-conflict-checker.mjs now genuinely wired; 2 documented exceptions independently verified legitimate',
        fr3_qf_per_surface: 'CONCERN (accepted) — literal AC met (3/3 have own tests); coverage type is 1/3 behavioral + 2/3 source-order, judged an honest and adequate compromise',
        mock_fidelity: 'PASS — real-probe test added, already caught a real defaultExec-default bug',
        path_traversal_s2: 'PASS — fixed with a mutation-resistant test, coordinator self-caught and corrected their own first vacuous attempt',
      },
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001',
    },
    phase: 'EXEC',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'Enhanced QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
