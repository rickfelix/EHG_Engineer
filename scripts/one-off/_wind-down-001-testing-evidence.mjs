/**
 * SD-LEO-INFRA-WORKER-WIND-DOWN-001 — TESTING sub-agent evidence (phase PLAN_TO_EXEC).
 * Independent QA verification: FR-by-FR test mapping, full-suite runs, an 9-mutation
 * adversarial harness (8 real mutations + 1 negative control), and a call-site sweep.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-WORKER-WIND-DOWN-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });

  let results = {
    verdict: 'PASS',
    confidence_score: 92,
    findings: [
      'SUITE GREEN (measured, not asserted): npx vitest run tests/unit/hooks/ => 16 files / 143 tests passed, 0 failed. npx vitest run tests/unit/checkin-pipeline.test.js (the read-only dependency this SD delegates into) => 5/5 passed, no regression. The 4 other suites that require() the modified hook (tests/unit/fleet/stop-hook-role-text.test.js, scripts/hooks/__tests__/stop-loop-wakeup-reminder.test.js, wakeup-arm-evidence.test.js, stop-hook-uv-handle-closing.test.js) => 111/111 passed.',
      'MUTATION TEST (9 mutants, independent of the VALIDATION agent\'s): 8/8 real mutations CAUGHT, and the 1 NEGATIVE CONTROL (a pure comment edit) SURVIVED with 143 passed -- the control is what makes the 8 CAUGHTs meaningful rather than an always-CAUGHT harness. Each mutant was killed by the semantically correct test, not by collateral damage: M1 allowlist-revert -> exactly 3 kills (the two resume_final/resume_orphan regressions + the future-action test), independently reproducing FR-4 AC-3\'s "fails exactly 3 targeted tests"; M2 dropping the !hasActiveClaim conjunct -> "never attempts when the session already holds an active claim"; M3 removing the timeoutMs>0 guard -> "timeoutMs<=0 skips the attempt entirely"; M4 kill-switch default flipped to off -> "defaults to enabled when unset"; M5 detaching the kill switch from the call site -> the wiring source-pin; M6 deleting the stderr line -> the exactly-one-log-line source-pin; M7 clobbering instead of merging metadata -> the sibling-key-preservation test; M8 rethrowing instead of fail-open -> the throwing-resolution test. The tests are load-bearing.',
      'FR-4 DENYLIST COMPLETENESS (my own check, beyond what the tests assert): enumerated every action string reachable from resolveCheckin across scripts/worker-checkin.cjs + lib/checkin/ -- the universe is exactly 9 values: idle (8 sites), error (3), idle_fable_propose (1), self_claimed (2), self_claimed_qf (2), claimed_assignment (1), resume_final (1), resume_orphan (1), resume (1). All 3 non-claim terminals are in NON_CLAIM_ACTIONS, and all 6 claim-acquiring actions fall through to outcome:claimed. So the denylist is complete in BOTH directions against the current ladder: no real claim is dropped (the original defect), and no non-claim terminal is misread as a claim (which would be the mirror-image defect -- it would emit decision:block and order a worker to build nothing).',
      'FR-4 PREMISE RE-MEASURED INDEPENDENTLY: lib/checkin/steps/recover-stranded-final.cjs and lib/checkin/steps/adopt-orphan.cjs declare NO applies() gate in their module.exports descriptors, confirming both rungs run unconditionally regardless of ctx.mySd -- so resume_final/resume_orphan are genuinely reachable for a claim-less caller and the denylist design is load-bearing, not defensive decoration. I verified this from the step files themselves rather than inheriting the VALIDATION agent\'s claim.',
      'FR-1 BRANCH-CONDITION CHANGE IS A PURE REFACTOR (checked because the diff looks semantic): the wiring changed `if (shouldParkRecoverable({loopState, hasActiveClaim, windDownSignaled}))` to `if (workerShaped)`. workerShaped is defined at line 649 as exactly that same call, already computed for the transcript-scan gate at line 652. Same value, no behavior change; the park+recordWindDown path is preserved verbatim inside the branch and the source-pin test asserts parkSessionRecoverable still appears textually after the new block.',
      'FR-3 DELEGATION VERIFIED AT THE WIRE, NOT JUST THE ENDS: scripts/worker-checkin.cjs exports resolveCheckin(sb, sessionId, opts={}) at line 1905/2031 -- the 2-arg call site is signature-compatible (third param defaults). The module is guarded by `if (require.main === module)` at line 2033, so the lazy require() inside main() is side-effect-free; I probed it directly (require ok, 61ms, resolveCheckin typeof function), confirming it neither runs the CLI nor blows the Stop hook budget. Tests assert toHaveBeenCalledTimes(1) for both the self-claim and directed-assignment cases, satisfying FR-3\'s "exactly one call, no separate self-claim attempt".',
      'FR-2 / FR-5 / FR-6 each map to passing assertions: shouldAttemptSameTurnClaim is a pure conjunct with both PRD acceptance-criteria cases tested plus an empty-input fail-closed case; timeoutMs<=0, slow-past-timeout, and throwing resolution all report none-claimable (3 tests); the log line is source-pinned to exactly one occurrence and recordSameTurnClaimAttempt is proven fail-open on a DB error. All 6 FRs have >=1 passing, mutation-verified test.',
      'CALL-SITE SWEEP (task item 4): module.exports gained 4 names additively; none removed or renamed. The only non-test consumer of the hook is .claude/settings.json, which invokes it as a CLI (require.main path), not via require(). Every require()-style importer is a test file, and all of them pass. Remaining repo references are prose (CHANGELOG, docs/protocol, CLAUDE_CORE/EXEC, gauge-registry comments) or one-off scripts, none of which bind to the export list. No breakage surface.',
    ],
    warnings: [
      'MY OWN FIRST HARNESS LIED, AND I AM RECORDING IT RATHER THAN QUIETLY FIXING IT: the initial mutation run reported 8/8 CAUGHT with "0 failed / null passed". The verdict rested entirely on a non-zero exit code, and the cause was that `--reporter=basic` was removed in Vitest 4 -- the runner threw during server setup before executing a single test, so every mutant was "caught" by a crashing harness, not by the suite. A control run on unmutated source reproduced the same crash, which is what exposed it. The reported 8/8 above is from the corrected harness (default reporter, parsed "Tests N failed | M passed", plus the negative control). Anyone re-running this must keep the negative control: without it, an always-CAUGHT harness is indistinguishable from a real one.',
      'main() itself is never executed end-to-end by any test -- the wiring is covered by 5 source-pin regexes over the file text. That is a deliberate and documented tradeoff (a spawned hook with a nonexistent session resolves to workerShaped=false and never reaches the branch, the same reason the pre-existing spawn suite only pins its own budget invariants). It is nonetheless a real residual gap: a refactor that preserves the pinned substrings while breaking the surrounding control flow would pass. Mutation M5/M6 confirm the pins fire on realistic detachments, so the gap is narrow, not open.',
      'The claimed-path branch (emitDecision block + shutdown) is exercised only through the exported function returning outcome:claimed; no test observes an actual stdout decision payload for the same-turn case. First live fleet traversal is the real proof; claude_sessions.metadata.same_turn_claim_attempt is the instrument to read it from.',
      'recordSameTurnClaimAttempt is raced against remainingBudgetMs(), so under budget pressure the metadata stamp can be silently dropped while the stderr line still prints. The dashboard field is therefore best-effort by design -- absence of the field is not evidence the worker never looked. Consumers must not treat it as a complete census.',
    ],
    recommendations: [
      'After the first fleet-wide traversal, query claude_sessions.metadata->same_turn_claim_attempt to confirm the instrument populates live and to measure the claimed vs none-claimable ratio -- that ratio is the actual proof this SD closed the ~40-minute idle-beside-claimable-work gap, and it is not something any unit test can establish.',
      'Keep the negative control in any future mutation harness for this file (see warning 1). Consider promoting the corrected harness pattern into a reusable helper rather than re-authoring it per SD.',
      'If a future checkin ladder rung adds a new NON-claim terminal action string, it must be added to NON_CLAIM_ACTIONS in the same change -- the inverted classifier is claim-by-default, which is the safe direction for claim actions but the unsafe direction for new idle terminals. A lint or a test asserting the denylist covers every non-claim action in lib/checkin/steps/ would make that coupling enforceable instead of conventional.',
    ],
    summary: 'PASS. Independently verified the same-turn next-claim implementation against all 6 PRD functional requirements. Measured: 143/143 tests pass in tests/unit/hooks/, 5/5 in the checkin-pipeline dependency, 111/111 across the four other suites importing the modified hook. Ran my own 9-mutant adversarial harness: 8/8 real mutations caught by the semantically correct tests (M1 allowlist-revert kills exactly the 3 tests FR-4 AC-3 predicts) with a negative control that correctly SURVIVED, proving the tests are load-bearing rather than decorative. Additionally established, beyond what the tests assert, that the NON_CLAIM_ACTIONS denylist is complete in both directions against the ladder\'s full 9-value action universe, that the two regression rungs really are ungated, that the require() of worker-checkin.cjs is side-effect-free (61ms, require.main-guarded), and that the branch-condition change to `if (workerShaped)` is a pure refactor of an already-computed value. The 4 new exports are additive and no non-test consumer binds to them. The implementation file was restored byte-identical after mutation testing (md5 abe70e0cdfab60b2a2a47f035205aa13, git diff unchanged at 128 insertions / 2 deletions). Recorded a self-inflicted harness defect in warnings: my first mutation run was a false 8/8 produced by a crashing runner, caught only by a control run.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN_TO_EXEC',
      files_reviewed: [
        'scripts/hooks/stop-loop-wakeup-reminder.cjs',
        'tests/unit/hooks/stop-loop-same-turn-next-claim.test.js',
        'scripts/worker-checkin.cjs',
        'lib/checkin/steps/recover-stranded-final.cjs',
        'lib/checkin/steps/adopt-orphan.cjs',
      ],
      test_runs: [
        { command: 'npx vitest run tests/unit/hooks/', files: 16, passed: 143, failed: 0 },
        { command: 'npx vitest run tests/unit/checkin-pipeline.test.js', files: 1, passed: 5, failed: 0 },
        { command: 'npx vitest run tests/unit/fleet/stop-hook-role-text.test.js scripts/hooks/__tests__/{stop-loop-wakeup-reminder,wakeup-arm-evidence,stop-hook-uv-handle-closing}.test.js', files: 4, passed: 111, failed: 0 },
      ],
      mutation_test: {
        harness: 'scripts/one-off/_wd001-mutation-harness.mjs (run then removed; results reproduced here)',
        score: '8/8 real mutations caught, 1/1 negative control survived',
        baseline_md5: 'abe70e0cdfab60b2a2a47f035205aa13',
        restored_md5: 'abe70e0cdfab60b2a2a47f035205aa13',
        file_byte_identical_after: true,
        mutants: [
          { id: 'M0-NOOP-CONTROL', kind: 'negative control (comment-only edit)', status: 'SURVIVED', failed: 0, passed: 143, note: 'required: proves the harness can report SURVIVED' },
          { id: 'M1-ALLOWLIST-REVERT', fr: 'FR-4', status: 'CAUGHT', failed: 3, passed: 140, killed: ["REGRESSION: 'resume_final' ... classified as claimed", "REGRESSION: 'resume_orphan' ... classified as claimed", 'a hypothetical FUTURE ladder action not yet denylisted is claimed-by-default'] },
          { id: 'M2-CLAIM-GATE-BREAK', fr: 'FR-2', status: 'CAUGHT', failed: 1, passed: 142, killed: ['never attempts when the session already holds an active claim'] },
          { id: 'M3-BUDGET-GUARD-REMOVE', fr: 'FR-5', status: 'CAUGHT', failed: 1, passed: 142, killed: ['timeoutMs<=0 (budget exhausted) skips the attempt entirely without calling resolveCheckinFn'] },
          { id: 'M4-KILLSWITCH-DEFAULT-OFF', fr: 'FR-1', status: 'CAUGHT', failed: 1, passed: 142, killed: ['defaults to enabled when unset'] },
          { id: 'M5-WIRING-DETACH', fr: 'FR-1', status: 'CAUGHT', failed: 1, passed: 142, killed: ['gates the attempt on both the kill switch and the same predicate this file exports'] },
          { id: 'M6-LOGLINE-REMOVE', fr: 'FR-6', status: 'CAUGHT', failed: 1, passed: 142, killed: ['emits exactly one same-turn-next-claim stderr line per allow-path traversal'] },
          { id: 'M7-METADATA-NO-MERGE', fr: 'FR-6', status: 'CAUGHT', failed: 1, passed: 142, killed: ['merges same_turn_claim_attempt={outcome,key,at} into metadata, preserving sibling keys'] },
          { id: 'M8-FAILOPEN-REMOVE', fr: 'FR-5', status: 'CAUGHT', failed: 1, passed: 142, killed: ['a throwing resolution fails open to none-claimable'] },
        ],
        harness_self_defect: 'First run used --reporter=basic (removed in Vitest 4); the runner threw before executing tests, producing a false 8/8 CAUGHT from exit codes alone. Detected by a control run on unmutated source. Corrected before the numbers above were taken.',
      },
      fr_coverage: {
        'FR-1': { status: 'covered', evidence: 'wiring source-pins (2 tests) + M5 mutation; branch condition verified a pure refactor of workerShaped (line 649)' },
        'FR-2': { status: 'covered', evidence: '4 shouldAttemptSameTurnClaim tests incl. both PRD ACs verbatim + M2 mutation' },
        'FR-3': { status: 'covered', evidence: 'toHaveBeenCalledTimes(1) on self-claim and directed-assignment paths; resolveCheckin export signature + require.main guard verified live' },
        'FR-4': { status: 'covered', evidence: '2 regression tests + future-action test; M1 kills exactly 3 as AC-3 predicts; denylist independently proven complete against the ladder 9-action universe' },
        'FR-5': { status: 'covered', evidence: 'timeoutMs<=0 (never-invoked assertion), slow-past-timeout, throwing-resolution; M3 + M8 mutations' },
        'FR-6': { status: 'covered', evidence: 'exactly-one-logline source-pin, metadata merge + key:null + fail-open tests; M6 + M7 mutations' },
      },
      export_impact: '4 additive exports (isSameTurnClaimEnabled, shouldAttemptSameTurnClaim, attemptSameTurnNextClaim, recordSameTurnClaimAttempt). Zero removals/renames. Only non-test consumer is .claude/settings.json via CLI invocation, which does not bind the export list. All require()-style importers are tests and all pass.',
      residual_risk: 'main() is never driven end-to-end; wiring coverage is source-pin only (documented tradeoff, narrowed by M5/M6). Metadata stamp is budget-raced and may be dropped, so the dashboard field is best-effort. First live traversal is the real proof.',
    },
    phase: 'PLAN_TO_EXEC',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('TESTING', SD_KEY, { name: 'TESTING' }, results, { sdKey: SD_KEY, phase: 'PLAN_TO_EXEC', source: 'manual' });
  console.log('TESTING EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
}
