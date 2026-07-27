#!/usr/bin/env node
/**
 * Write TESTING (Enhanced QA Engineering Director) EXEC-phase verdict for
 * SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001.
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

const findings = [
  {
    id: 'T1-full-unit-tier-one-deterministic-regression',
    severity: 'HIGH',
    summary: 'npm run test:unit (vitest --project unit) on this branch: 2628 passed | 9 failed test files (14 failed tests) out of 2640 files, 31445/31544 individual tests passing. Of the 9 failing files, 8 are pre-existing/unrelated to this SD\'s diff (env-isolation ordering noise in tests/unit/setup/env-isolation-guard.test.js + tests/unit/unit-tier-env-isolation.test.js -- reproduced failing even run in isolation, touching zero files this SD changed; plus tree-currency, singleton-relaunch, append-fleet-commit-trailer, cp3-restart-relaunch-live-flag-propagation, spawn-control, witness-emitter-acceptance, session-register-created-emission, post-merge-worktree-cleanup -- none reference any file in this branch\'s 17-file diff). ONE IS A REAL, DETERMINISTIC REGRESSION CAUSED BY THIS SD: tests/unit/claim-validity-gate-foreign-claim-reconciliation.test.js > "is fail-safe: the whole reconciliation attempt is wrapped in try/catch..." fails 100% reproducibly (re-ran twice, same result). Root cause verified precisely: the test does `src.indexOf(\'foreign_claim reconciliation\')` then `.slice(idx, idx+5600)` to find the outer `catch { /* fail-safe: ... */ }` that wraps the whole reconciliation block, and asserts the fail-safe catch text is inside that window. This SD\'s FR-2 insertion (claim-validity-gate.js lines 601-619, ~20 lines / ~1470 chars) sits INSIDE that window, between the anchor and the catch it is supposed to find. Measured distance: 4479 chars on origin/main (comfortably inside the 5600 window, which a comment on the test says was itself already widened once from 3600->5600 for a prior insertion) vs 5950 chars on this branch -- 350 chars past the window. This is a pure source-pin brittleness issue (the test does not know or care WHAT is inserted, only how far away the target text ends up), not a logic defect in claim-validity-gate.js -- the actual try/catch nesting and fail-safe behavior are structurally unchanged and correct. But it is a real CI-red test on this branch today, and EXEC\'s own summary to me did not mention it.',
  },
  {
    id: 'T2-fr3-two-of-three-qf-surfaces-have-no-direct-test',
    severity: 'HIGH',
    summary: 'FR-3\'s acceptance criterion is explicit and literal: "Each of the three QF surfaces has its own test; a single shared test that exercises only one surface does not satisfy this." Checked all 5 new test files (grep for "qf-start" and "create-quick-fix"): zero matches. tests/unit/claim-liveness-fence-qf-lane.test.js exercises exactly ONE surface -- lib/quick-fix-claim.mjs\'s claimQuickFix() -- with 5 well-designed cases (refuses-before-CAS, distinguishes refusal from lost-CAS-race, AC-N1 stale-pid pass-through, AC-N2 no-pidfile pass-through, malformed-arg regression). scripts/qf-start.js and scripts/create-quick-fix.js each received a source-level wiring change (both call claimantLivenessFence(supabase, sessionId) directly, verified via git diff -- code looks correct on read-through: qf-start.js exits 4 on refusal before the RPC call, create-quick-fix.js returns printNextSteps(qfId, false, null) before the atomic claim update), but neither has ANY test -- unit or otherwise -- asserting a DEAD session is actually refused when going through those two entry points. This is not a source-pin substitute problem either: no test file references either script by path at all. Per the AC\'s own literal wording ("a single shared test that exercises only one surface does not satisfy this"), FR-3 is not met -- 1 of 3 required per-surface tests exists.',
  },
  {
    id: 'T3-fr2-sd-lane-and-a-4th-named-surface-are-unwired-not-just-untested',
    severity: 'HIGH',
    summary: 'This goes beyond a test gap: the underlying wiring itself is incomplete against FR-2\'s literal AC ("A claim write attempted by a session classified DEAD is refused on every enumerated surface"). liveClaimWriteFenceReason(sb, sdKey, claimantSessionId=null, ...) in lib/fleet/claim-eligibility.cjs only runs the new liveness sub-check when claimantSessionId is truthy (verified by reading the function). Grepped every call site in the repo: lib/claim-guard.mjs:635 calls it as liveClaimWriteFenceReason(supabase, sdKey) -- 2 args; scripts/worker-checkin.cjs:377 same -- 2 args; scripts/sd-start.js:1237 same -- 2 args; scripts/modules/handoff/executors/BaseExecutor.js:335 same -- 2 args. All four omit claimantSessionId, so the liveness gate is a complete, silent no-op on every one of them -- confirmed by this SD\'s OWN test (tests/unit/claim-liveness-fence-wiring.test.js:95-98, "is byte-identical when no claimant id is supplied (existing 2-arg call sites)"), and independently by the SECURITY sub-agent\'s prior EXEC-phase writeup for this SD (finding S5, CONCERN). claim-guard.mjs is the SD/QF claim-write choke point PRD FR-2 names FIRST ("the ONLY write path for scripts/sd-start.js"), and worker-checkin.cjs\'s tryClaim() is explicitly named as covering "every checkin lane -- resume_final, orphan-adopt, draft self-claim, directed assignment." None of those lanes are actually gated today. SEPARATELY, and NOT flagged in either EXEC\'s summary to me or the SECURITY writeup: lib/session-conflict-checker.mjs:302 -- the fourth RPC-lane surface PRD FR-2 names by exact line number -- was not touched at all in this branch\'s diff (confirmed: 0 references to claimantLivenessFence or liveClaimWriteFenceReason anywhere in that file). Its claimSD(sdId, sessionId) function calls the claim_sd RPC directly with zero liveness check, and it is NOT dead code: scripts/claude-session-coordinator.mjs:142 calls conflictChecker.claimSD(sdId, session.session_id) as a live, reachable claim path. So of the 4 RPC-lane surfaces FR-2 explicitly enumerates, 1 is genuinely wired end-to-end with a passing test (qf-start.js, via the QF-lane test\'s coverage of the shared helper -- though see T2, qf-start.js itself still has no direct test), and 3 (claim-guard.mjs, worker-checkin.cjs, session-conflict-checker.mjs) provide zero liveness protection against a DEAD claimant today. The top-level PRD acceptance_criteria[0] ("A session classified DEAD cannot acquire fresh work on ANY of the ten enumerated claim-write surfaces") is not met as written.',
  },
  {
    id: 'T4-mock-fidelity-confirmed-gap-but-empirically-not-broken',
    severity: 'MEDIUM',
    summary: 'Direct answer to the mock-fidelity question: NO test in any of the 5 new files exercises the real tasklist invocation string (grepped tests/unit/claim-liveness-fence-*.test.js for "defaultExec", "execSync", "child_process" -- zero matches). Every one of the 30 tests injects execCmd/readPidfile, so the classifier is verified against SCRIPTED tasklist output only, never against a real Windows tasklist call. I manually verified whether this gap is live by (a) running the exact command string pidIsClaude() constructs (`tasklist /FI "PID eq <pid>" /FI "IMAGENAME eq claude.exe" /NH /FO CSV`) via node child_process.execSync against a real live PID on this host -- it worked correctly, producing well-formed CSV the parser handles as written; (b) separately confirmed that running the SAME literal command directly inside the git-bash shell mangles it (`/FI` gets MSYS-path-translated into `C:/Program Files/Git/FI`, ERROR: Invalid argument/option) -- but this does not affect the actual code path, because defaultExec() calls node\'s child_process.execSync() directly (which shells out via cmd.exe on Windows by default, bypassing MSYS translation entirely), never through git-bash. So the specific failure mode the question named (bad quoting under git-bash) is NOT reachable through the code as written, and I found no evidence the real invocation is broken -- but this is an empirical spot-check by me, not a standing regression test. What WOULD close the gap: one non-mocked test calling classifyClaimantLiveness({sessionId: "test", recordedPid: process.pid, execCmd: undefined /* defaultExec */, readPidfile: () => null}) and asserting the verdict comes back INDETERMINATE (fail-open, since process.pid under a test runner is never literally claude.exe) rather than throwing or silently returning something wrong -- this would prove the real exec/parse pipeline runs end-to-end on the actual CI host without requiring a real claude.exe process to be present.',
  },
  {
    id: 'T5-classifier-recorded-pid-name-match-branch-has-zero-test-coverage',
    severity: 'LOW',
    summary: 'classifyClaimantLiveness has three verdict-producing branches: (1) pidfile pid MATCH -> ALIVE (tested), (2) pidfile pid NO_MATCH/PROBE_FAILED -> DEAD/INDETERMINATE (tested), (3) NO pidfile + recordedPid MATCHES -> ALIVE via decidingSignal="recorded_pid_name_match" (claimant-liveness.cjs:125-130) -- this third branch, the fallback path used when a session has no tick pidfile at all but its recorded claude_sessions.pid IS still a live, correctly-named claude.exe, has NO test anywhere in the 5 new files (grepped for "recorded_pid_name_match" across all test files: zero hits, only the one production-code reference). Low severity because the fail-direction here is toward ALIVE (the safe direction per this SD\'s own asymmetry design), but it is a genuine untested branch in the core classifier that a future refactor could silently break without any test going red.',
  },
  {
    id: 'T6-fr1-ac5-source-grep-test-checks-2-of-3-named-forbidden-fields',
    severity: 'LOW',
    summary: 'FR-1\'s AC5 reads: "Does NOT read process_alive_at, heartbeat_at, or status at any point -- asserted by a test that greps the module source for those identifiers" (three named fields). tests/unit/claim-liveness-fence-classifier.test.js:141-154 ("never references process_alive_at, heartbeat_at or status") only iterates `for (const forbidden of [\'process_alive_at\', \'heartbeat_at\'])` -- the literal string \'status\' is never checked, despite the describe-block title claiming it is. Verified this is currently harmless in practice: claimant-liveness.cjs contains the bare word "status" exactly once, inside a stripped block comment (line 16, "`status` is useless here..."), so adding \'status\' to the forbidden list today would still pass -- but the AC as literally written is not fully satisfied by the test that claims to satisfy it, and the gap would go unnoticed if a future edit added a `.status` property read.',
  },
  {
    id: 'T7-surface-inventory-negative-control-and-vacuous-test-check',
    severity: 'INFO',
    summary: 'Checked tests/unit/claim-liveness-fence-surface-inventory.test.js for vacuous-pass risk. It has a genuine, working negative control ("the detector can actually fail") that feeds synthetic claim/release fixture strings through the same claimWritesIn() parser used by the real scan and asserts both directions are classified correctly -- this is not decorative, it actually exercises the parser logic independent of any real file. It also asserts inventory.length >= 5 (guards against a silently-empty directory walk) and asserts releaseOnly.length > 0 (guards against every writer being misclassified as a claim). All three checks are real and would fail if the scan logic broke. HOWEVER (see T3 for the underlying gap this masks): FENCE_RE = /claimantLivenessFence|liveClaimWriteFenceReason/ only checks textual PRESENCE of either identifier anywhere in a file\'s source, not that the specific matched .update({claiming_session_id: ...}) call site is actually gated on the fence\'s return value, and not that a caller\'s specific INVOCATION passes a real session id. This is exactly why lib/claim-guard.mjs and scripts/worker-checkin.cjs pass this inventory test cleanly (both textually reference liveClaimWriteFenceReason) while being functionally unfenced per T3 -- the security sub-agent flagged the same mechanism independently as finding S6 ("presence not flow-checked"). Not vacuous, but its scope is narrower than what FR-2\'s AC implies it proves.',
  },
];

const warnings = [
  'T1: tests/unit/claim-validity-gate-foreign-claim-reconciliation.test.js is RED on this branch today (100% reproducible), caused by this SD\'s ~1470-char insertion pushing a source-pin anchor-to-target distance from 4479 to 5950 chars against a 5600-char search window. The underlying try/catch structure is unchanged and correct -- this is a test-brittleness failure, not a logic defect -- but it must be fixed (widen the window, e.g. to 7000, or anchor differently) before this can be called a clean EXEC-TO-PLAN unit-test pass.',
  'T2/T3: FR-2 and FR-3\'s literal acceptance criteria ("every enumerated surface" / "each of the three QF surfaces has its own test") are not met. Of 10 PRD-enumerated claim-write surfaces: QF lane is 2/3 wired-and-directly-tested (quick-fix-claim.mjs) + 2/3 wired-but-untested (qf-start.js, create-quick-fix.js); SD/RPC lane is 0/4 actually gated (claim-guard.mjs, worker-checkin.cjs, sd-start.js fallback, session-conflict-checker.mjs all either pass claimantSessionId as omitted or were never touched); direct-write lane (claim-validity-gate.js, drain-orchestrator.mjs, claim-orchestrator-for-rollup.mjs, stale-session-sweep.cjs) is 4/4 wired but 0/4 have a dedicated behavioral test proving the refusal path fires (pre-existing test suites for these files were not extended). This matches the SECURITY sub-agent\'s independent EXEC-phase finding (S5) that the SD-claim lane is "currently inert," and adds that lib/session-conflict-checker.mjs was not addressed at all despite being named by line number in the PRD and being live, reachable code via scripts/claude-session-coordinator.mjs.',
];

const recommendations = [
  'Fix tests/unit/claim-validity-gate-foreign-claim-reconciliation.test.js: widen the 5600-char search window (it has already been widened once before, from 3600) or change the anchor/assertion to not depend on absolute character distance from a fixed comment string. This is the one item that must be true-green before EXEC-TO-PLAN can claim a clean unit-test pass.',
  'Add one direct test each for scripts/qf-start.js and scripts/create-quick-fix.js exercising the DEAD-claimant refusal path (mock supabase + injected liveness seams, similar structure to claim-liveness-fence-qf-lane.test.js), to satisfy FR-3\'s literal per-surface-test requirement.',
  'Either wire claimantSessionId through the 4 remaining liveClaimWriteFenceReason call sites (claim-guard.mjs, worker-checkin.cjs, sd-start.js, BaseExecutor.js) and lib/session-conflict-checker.mjs\'s claimSD(), or explicitly re-scope FR-2\'s acceptance criteria / split this into a tracked follow-on SD so "9 (or 10) fenced surfaces" is not read as complete when the SD/RPC self-claim lane and session-conflict-checker.mjs currently provide zero liveness protection.',
  'Add one real (non-mocked) test that runs classifyClaimantLiveness with the actual defaultExec against a real live non-claude PID (e.g. process.pid) to prove the tasklist invocation string and CSV parsing work end-to-end on the CI host, closing the mock-fidelity gap even though my manual spot-check found no live defect today.',
  'Low-priority: add a test for the recorded_pid_name_match branch (no pidfile, recorded pid itself matches); add \'status\' to the AC5 forbidden-field grep list to match the literal AC wording.',
];

const summary = 'CONCERNS. All 5 new liveness-fence test files pass in isolation (30/30). Full unit tier (npm run test:unit): 31445/31544 tests passing, but ONE failure is a deterministic regression this SD\'s diff caused (claim-validity-gate-foreign-claim-reconciliation.test.js source-pin window overflow, verified root cause, not a logic defect but a real CI-red today) -- the remaining 8 failing files are pre-existing/unrelated, confirmed by diff-stat cross-reference and by reproducing 2 of them (env-isolation) in complete isolation. Beyond the unit-tier result, PRD-level acceptance-criteria verification surfaced two HIGH-severity coverage gaps that were not disclosed in EXEC\'s summary to me: FR-3\'s literal "each of the three QF surfaces has its own test" is met for only 1 of 3 (qf-start.js and create-quick-fix.js are wired but have zero direct tests); and FR-2\'s "refused on every enumerated surface" is not actually true today for the SD/RPC self-claim lane (claim-guard.mjs, worker-checkin.cjs, sd-start.js fallback all call the shared fence with claimantSessionId omitted, making the check a documented no-op there -- independently corroborated by SECURITY\'s prior finding S5) plus a 4th PRD-named surface, lib/session-conflict-checker.mjs, that was never touched and is live/reachable via scripts/claude-session-coordinator.mjs. The classifier itself (lib/fleet/claimant-liveness.cjs) is well-designed and its tested behavior is correct: fail-open on probe error is verified, the AC-N1 stale-pid/false-fence regression fixture is present and correctly named, PID-recycling is correctly refused as non-ALIVE, and the kill-switch/durable-refusal-record tests (FR-5) are thorough including the "unreadable config leaves fence ON" direction. Mock-fidelity: confirmed zero test exercises the real tasklist invocation; I independently verified by hand that the real invocation works correctly on this host (and that the git-bash quoting risk raised in the prompt does not apply, since defaultExec shells out via cmd.exe, not MSYS bash) -- but this remains an unguarded gap, not a proven defect. Recommend fixing the one deterministic regression and closing or explicitly re-scoping the FR-2/FR-3 per-surface gaps before EXEC-TO-PLAN.';

const justification = [
  'CONCERNS — SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001 EXEC-phase test verification.',
  '',
  '1. UNIT TEST RESULT (as requested, plainly stated): the 5 new liveness-fence test files pass 30/30 in isolation. The FULL unit tier (npm run test:unit) is NOT fully green: 9 test files / 14 tests fail out of 2640 files / 31544 tests. 8 of the 9 failing files are unrelated to this SD (confirmed against the 17-file branch diff; 2 reproduced failing in complete isolation of the rest of the suite, ruling out cross-file pollution as the SD\'s doing). 1 IS caused by this SD: tests/unit/claim-validity-gate-foreign-claim-reconciliation.test.js fails 100% reproducibly because this SD\'s FR-2 insertion into claim-validity-gate.js pushed a source-pin search window from 4479 to 5950 chars against a 5600-char limit. Root-caused precisely; not a logic defect, but genuinely red today.',
  '',
  '2. AC-TO-TEST MAPPING, including the FR-4 credit-check requested: FR-4\'s AC-N1 (stale recorded pid, live tick pidfile) IS genuinely covered — tests/unit/claim-liveness-fence-classifier.test.js names both pids (21864 stale / 7440 live) exactly as the AC requires and asserts ALIVE + decidingSignal="tick_pidfile_name_match". AC-N2 (no pidfile is not death) is covered in the same file and again at the qf-lane integration level. AC-N3 (keyed on SESSION_ID never callsign) is upheld structurally — the classifier signature takes sessionId only, no callsign parameter exists anywhere in the module — but there is no explicit adversarial test proving a callsign string could not be substituted; this is a minor documentation-vs-test gap, not a functional one. FR-1\'s 5 ACs are covered except the AC5 grep test omits \'status\' from its forbidden-field list (harmless today, see T6). FR-5\'s 2 ACs are thoroughly covered including both fail-directions. FR-2 and FR-3\'s per-surface ACs are NOT met as literally written — see findings T2/T3.',
  '',
  '3. MOCK-FIDELITY QUESTION (direct answer): no test in the new suite touches the real tasklist invocation. I hand-verified the real command string against a live PID via node execSync and it works correctly; I also confirmed the git-bash quoting risk named in the prompt does not apply to the actual code path (defaultExec never shells through git-bash/MSYS). So today there is no live defect, but there is no regression test protecting the real exec/parse pipeline either — a future change could silently break it and nothing would go red.',
  '',
  '4. FAIL-OPEN/FAIL-CLOSED DIRECTIONS: all three requested directions are correctly implemented and tested. Classifier fails OPEN on probe error (TS-5, verified). The pre-existing SD-axis eligibility check still fails CLOSED on lookup error (tests/unit/claim-write-fence.test.js, unchanged, still passing). Kill-switch config-unreadable leaves the fence ON (claim-liveness-fence-killswitch-audit.test.js, explicit test with the exact reasoning stated in-code and in-test).',
  '',
  '5. VACUOUS-TEST CHECK: the surface-inventory negative control is real and functional (verified by reading the parser + its self-test fixtures), not decorative. Its scope, however, is narrower than what FR-2 implies — it checks textual presence of the fence identifier in a file, not that the matched write is actually gated by it, which is exactly the blind spot that lets claim-guard.mjs and worker-checkin.cjs pass the inventory test while being functionally unfenced (see T3/T7).',
  '',
  'RATIONALE FOR CONCERNS (not FAIL, not PASS): the classifier itself and the QF-lane\'s primary surface (quick-fix-claim.mjs) are solidly built and tested, including the load-bearing false-negative (AC-N1) case. But (a) there is one real, reproducible test regression on this branch today, and (b) two of the PRD\'s own explicit, literal per-surface acceptance criteria (FR-2, FR-3) are not met, with a fourth PRD-named surface never addressed at all — and this was not surfaced in EXEC\'s summary to me. These are fixable in a follow-up pass without redesigning the classifier, but they should not be waved through as complete.',
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
    confidence: 88,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'Fix the source-pin window overflow in tests/unit/claim-validity-gate-foreign-claim-reconciliation.test.js (currently red, deterministic).',
      'Add direct behavioral tests for scripts/qf-start.js and scripts/create-quick-fix.js DEAD-claimant refusal (FR-3 literal requirement).',
      'Wire or explicitly re-scope the SD/RPC self-claim lane (claim-guard.mjs, worker-checkin.cjs, sd-start.js, BaseExecutor.js) and lib/session-conflict-checker.mjs before treating FR-2\'s "every enumerated surface" AC as satisfied.',
    ],
    test_results: {
      new_suite_isolated: { files: 5, tests: 30, passed: 30, failed: 0 },
      full_unit_tier: { files_total: 2640, files_failed: 9, tests_total: 31544, tests_passed: 31445, tests_failed: 14, skipped: 83, todo: 2 },
      regression_caused_by_this_sd: {
        file: 'tests/unit/claim-validity-gate-foreign-claim-reconciliation.test.js',
        test: 'TS-4: foreign_claim reconciliation fires BEFORE the hard-fail throw > is fail-safe: the whole reconciliation attempt is wrapped in try/catch so any error falls through to the original hard-fail',
        deterministic: true,
        root_cause: 'source-pin indexOf/slice window (5600 chars) no longer reaches the fail-safe catch after this SD\'s ~1470-char FR-2 insertion; measured distance 4479 (main) vs 5950 (this branch)',
      },
      unrelated_preexisting_failures: [
        'tests/unit/fleet/tree-currency.test.js',
        'lib/singleton-relaunch.test.js',
        'tests/unit/append-fleet-commit-trailer.test.js',
        'tests/unit/unit-tier-env-isolation.test.js',
        'tests/unit/fleet/cp3-restart-relaunch-live-flag-propagation.test.js',
        'tests/unit/fleet/spawn-control.test.js',
        'tests/unit/golden-references/witness-emitter-acceptance.test.js',
        'tests/unit/hooks/session-register-created-emission.test.js',
        'tests/unit/setup/env-isolation-guard.test.js',
        'scripts/modules/shipping/__tests__/post-merge-worktree-cleanup.test.js',
      ],
    },
    metadata: {
      review_type: 'EXEC_PHASE_TEST_VERIFICATION',
      files_reviewed: [
        'lib/fleet/claimant-liveness.cjs',
        'lib/fleet/claim-eligibility.cjs',
        'lib/claim-guard.mjs',
        'scripts/worker-checkin.cjs',
        'lib/session-conflict-checker.mjs',
        'lib/quick-fix-claim.mjs',
        'scripts/qf-start.js',
        'scripts/create-quick-fix.js',
        'lib/claim-validity-gate.js',
        'lib/drain-orchestrator.mjs',
        'scripts/claim-orchestrator-for-rollup.mjs',
        'scripts/stale-session-sweep.cjs',
        'tests/unit/claim-liveness-fence-classifier.test.js',
        'tests/unit/claim-liveness-fence-killswitch-audit.test.js',
        'tests/unit/claim-liveness-fence-qf-lane.test.js',
        'tests/unit/claim-liveness-fence-surface-inventory.test.js',
        'tests/unit/claim-liveness-fence-wiring.test.js',
        'tests/unit/claim-validity-gate-foreign-claim-reconciliation.test.js',
      ],
      review_dimensions: {
        full_unit_tier: 'CONCERN — 1 deterministic regression caused by this SD, root-caused; 8 unrelated pre-existing failures',
        ac_to_test_mapping: 'CONCERN — FR-2/FR-3 per-surface ACs not literally met; FR-1/FR-4/FR-5 well covered',
        mock_fidelity: 'CONCERN — real tasklist invocation never exercised by any test; manually verified no live defect today',
        fail_directions: 'PASS — classifier fail-open, SD-axis fail-closed, kill-switch fail-safe-on all verified and tested',
        vacuous_test_check: 'PASS — surface-inventory negative control is real and functional, though narrower in scope than FR-2 implies',
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
