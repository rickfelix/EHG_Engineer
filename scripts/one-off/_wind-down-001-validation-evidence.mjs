/**
 * VALIDATION sub-agent evidence — SD-LEO-INFRA-WORKER-WIND-DOWN-001, phase LEAD_TO_PLAN.
 * Written by the VALIDATION sub-agent after reading scripts/hooks/stop-loop-wakeup-reminder.cjs,
 * tracing resolveCheckin's step ladder, and running the hook test suites.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-WORKER-WIND-DOWN-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'FAIL',
    confidence_score: 90,
    findings: [
      'BLOCKING (F-1) — CLAIM_ACTIONS is incomplete: two real claim-acquiring actions are classified as none-claimable. stop-loop-wakeup-reminder.cjs:225 sets CLAIM_ACTIONS = {self_claimed, self_claimed_qf, claimed_assignment}. The comment at :222-224 justifies the omission of resume/resume_final/resume_orphan by asserting they "require an existing mySd and are structurally unreachable here". MEASURED FALSE for two of the three: lib/checkin/steps/recover-stranded-final.cjs (rung 5.7) and lib/checkin/steps/adopt-orphan.cjs (rung 5.8) declare NO applies(ctx) gate — they run unconditionally in the ladder, independent of ctx.mySd. Both acquire a REAL claim via tryClaim and return only on claimed.ok (worker-checkin.cjs:1089-1093 resume_final; :1429-1432 resume_orphan). Only the plain resume action (lib/checkin/steps/resume.cjs:248) is genuinely mySd-gated, so the comment is correct for exactly 1 of the 3 actions it covers.',
      'BLOCKING (F-1 consequence) — the failure mode is orphan-creation, strictly worse than pre-SD behavior. On the exact target population (workerShaped && !hasActiveClaim), resolveCheckin can take a stranded-final or orphan claim, the hook then classifies it none-claimable, writes metadata.same_turn_claim_attempt={outcome:"none-claimable"}, emits the none-claimable stderr line, and falls through to parkSessionRecoverable + recordWindDown. Net: the SD is claimed by a session that is immediately parked as idle => a NEW orphan is manufactured, and the instrument reports the exact opposite of what happened. Before this SD no claim was taken at all on that path.',
      'BLOCKING (F-1 reachability) — not an edge case: rungs 5.7/5.8 run BEFORE every self-claim tier (lib/checkin/steps/index.cjs ladder order), so they win whenever the belt holds such work. Measured live at validation time: 4 adoptable orphans (status=in_progress, claiming_session_id null; ADOPTABLE_ORPHAN_STATUSES=[in_progress,active], worker-checkin.cjs:1329) and 5 stranded pending_approval SDs with no claim. A finisher entering the wind-down path today is more likely to hit a recovery rung than a self-claim rung.',
      'PASS — hasActiveClaim gate (SC gate #3 in the review brief) is correct. shouldAttemptSameTurnClaim({hasActiveClaim, workerShaped}) returns Boolean(workerShaped) && !hasActiveClaim (:191-193), and the single call site (:716) passes the same hasActiveClaim computed at :588-596 from strategic_directives_v2.claiming_session_id. A claim-holder can never reach attemptSameTurnNextClaim, so the "never grab a second SD" invariant holds. Covered by 4 unit tests including empty/undefined input.',
      'PASS — no claim predicate, guard, or priority rule is duplicated. attemptSameTurnNextClaim delegates exactly once to resolveCheckinFn (:214-217), injected at the call site as require("../worker-checkin.cjs").resolveCheckin (:719). Directed-assignment priority, sweep-claim safety, peer/foreign-claimant guards, tier gates, canary fence and quota locks are all inherited from the canonical 18-step ladder rather than reimplemented. This satisfies the SD scope item 2 and respects the explicit non-goal "any change to claim predicates themselves".',
      'PASS — claim-action key shapes verified against every producer: self_claimed -> .sd (worker-checkin.cjs:1018, merged-pool-self-claim.cjs:275), claimed_assignment -> .sd (directed-assignment.cjs:275), self_claimed_qf -> .qf (worker-checkin.cjs:735 and critical-qf-jump.cjs:122). The resolution.sd || resolution.qf key extraction (:227) is correct for all five call sites.',
      'PASS — tests green. tests/unit/hooks/stop-loop-same-turn-next-claim.test.js: 17 passed (the review brief said 14 — stale count). tests/unit/hooks/: 16 files / 134 passed. Suites that import the changed module (scripts/hooks/__tests__/ + tests/unit/fleet/stop-hook-role-text.test.js): 27 files / 401 passed + 1 todo. The four new exports are additive to module.exports (:760); no existing importer destructures a changed or removed name.',
    ],
    warnings: [
      'W-1 — the timeout budget makes the feature likely to no-op in production, and the no-op is indistinguishable from an empty belt. claimTimeoutMs = remainingBudgetMs() - TELEMETRY_RESERVE_MS (:717) against HOOK_WORK_BUDGET_MS=6000 and TELEMETRY_RESERVE_MS=2500, after stdin + 3 DB round trips + an arm-observation that may itself consume up to min(2500, remaining-2500). That leaves roughly 2s for the single heaviest operation in the hook — an 18-step ladder whose own v_sd_next_candidates query measured 451ms in isolation from this host. The file header already documents a measured 17x local-vs-CI spread (412ms -> 7198ms on the CHEAPEST path), so on loaded hardware this will time out routinely. A timeout returns the same {outcome:"none-claimable", key:null} as a genuinely empty belt (:209-221), so success criterion 4 ("chose-to-exit distinguishable from never-looked") is satisfied only in letter: none-claimable conflates belt-empty, timed-out, and threw. Recommend a distinct outcome value (e.g. not-attempted / timeout) carried into both the log line and metadata.',
      'W-2 — no test exercises the main() wiring. All 17 new tests target the 4 exported functions in isolation; nothing verifies that the call site passes the correct hasActiveClaim, that exactly ONE stderr line is emitted per wind-down (success criterion 4 is a call-site property), or that decision:"block" is emitted on a claimed outcome. This is the verify-the-wire-not-the-ends gap — and it is why F-1 was invisible to a green suite: every unit test feeds attemptSameTurnNextClaim a hand-written action string, so no test ever asks what resolveCheckin can actually return. Precedent for a spawn-based integration test exists in scripts/hooks/__tests__/stop-loop-wakeup-reminder.test.js ("wrapper fail-open (TS-6, spawn)").',
      'W-3 — timer leak on the fast path. The race timeout (:216) is neither cleared nor unref\'d, so a fast resolveCheckin leaves a pending timer for the remainder of claimTimeoutMs. shutdown() deliberately does NOT call process.exit and relies on the loop draining, so this can extend hook process lifetime by up to ~2.5s against the harness 10s timeout. readStdinPayload (:527) explicitly clears its timer for exactly this reason ("don\'t let the timeout pin the loop open at drain"); this new race should do the same.',
      'W-4 — resolveCheckin is not side-effect-free at Stop time. It registers roll-call, acks messages, merges model/effort into session metadata and can self-clear a quarantine before ever reaching a claim rung. Reusing the canonical ladder is the right call and is what the SD asks for, but PLAN should note that a Stop hook now performs coordination writes on the wind-down path.',
    ],
    recommendations: [
      'Fix F-1 before EXEC completion: add resume_final and resume_orphan to CLAIM_ACTIONS. Preferably invert the classifier so it is honest by construction — treat any resolution that carries an sd/qf key AND is not action:"idle"/"idle_fable_propose"/"error" as claimed, so a future ladder rung that acquires a claim cannot silently regress into none-claimable. Correct the stale comment at :222-224: only plain resume is mySd-gated.',
      'Add a regression test that pins CLAIM_ACTIONS against the ladder: enumerate every action string returned by lib/checkin/steps/** that sits behind a tryClaim(...).ok branch and assert each is classified claimed. That converts F-1 from a comment-level assumption into a measured invariant.',
      'Address W-1 by giving the claim attempt a real budget (it is the decision-critical work on this path, unlike the observational arm re-read that currently outranks it) and by emitting a third distinct outcome for timeout/not-attempted so the SC-4 instrument cannot conflate never-looked with looked-and-found-nothing.',
      'Add one spawn-based integration test over main() (W-2) covering: claim-holder never attempts; finisher with a claimable belt emits exactly one claimed:<key> line and a decision:"block"; empty belt emits exactly one none-claimable line and still parks.',
      'Clear or unref the race timer (W-3) to match readStdinPayload.',
    ],
    summary:
      'FAIL on one blocking correctness defect, with the rest of the implementation sound. The hasActiveClaim gate is correct (a claim-holder can never grab a second SD), no claim predicate or guard is duplicated (the change delegates once to worker-checkin.cjs resolveCheckin, inheriting directed-assignment priority and every existing guard), the kill switch and fail-open behavior are right, and all tests pass (17 new; 134 in tests/unit/hooks; 401 across suites importing the changed module). BLOCKING: CLAIM_ACTIONS omits resume_final and resume_orphan, justified by a comment asserting those actions are "structurally unreachable" because they require an existing mySd. That is measured false — lib/checkin/steps/recover-stranded-final.cjs and adopt-orphan.cjs have no applies() gate, run at rungs 5.7/5.8 ahead of every self-claim tier, and acquire real claims via tryClaim. Consequence on the exact target population: the ladder takes a claim, the hook reports none-claimable, stamps that outcome into metadata, and parks the worker — manufacturing a fresh orphan and reporting the opposite of what happened. Live-reachable now (4 adoptable orphans, 5 stranded pending_approval measured at validation time). The green suite did not catch it because every unit test hand-feeds attemptSameTurnNextClaim an action string, so nothing asks what resolveCheckin can actually return.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      files_reviewed: [
        'scripts/hooks/stop-loop-wakeup-reminder.cjs',
        'tests/unit/hooks/stop-loop-same-turn-next-claim.test.js',
        'scripts/worker-checkin.cjs',
        'lib/checkin/steps/index.cjs',
        'lib/checkin/steps/adopt-orphan.cjs',
        'lib/checkin/steps/recover-stranded-final.cjs',
        'lib/checkin/steps/resume.cjs',
        'lib/checkin/steps/directed-assignment.cjs',
        'lib/checkin/steps/merged-pool-self-claim.cjs',
        'lib/checkin/steps/critical-qf-jump.cjs',
      ],
      success_criteria_assessment: {
        'SC-1 attempts a next claim same-turn': 'PARTIAL — the attempt is wired into the ALLOW-PATH and unit-tested for a self_claimed resolution, but W-1 (sub-2s budget for the ladder) makes the production attempt likely to time out, and no test exercises the main() wiring.',
        'SC-2 existing guards + directed-assignment priority honored': 'PASS on delegation (single resolveCheckin call, zero duplicated predicates; directed-assignment rung 5 still outranks self-claim). FAIL on outcome handling — the recovery rungs 5.7/5.8 that outrank self-claim have their claims dropped on the floor (F-1).',
        'SC-3 empty-belt behavior unchanged except one log line': 'PASS — one attempt, no polling or busy-wait; timeout/error/timeoutMs<=0 all fail open to the existing park path.',
        'SC-4 chose-to-exit distinguishable from never-looked': 'FAIL — none-claimable currently conflates belt-empty, timed-out, threw (W-1) AND claim-actually-taken (F-1), which is the precise distinction this criterion exists to create.',
      },
      tests_run: {
        'tests/unit/hooks/stop-loop-same-turn-next-claim.test.js': '17 passed',
        'tests/unit/hooks/': '16 files, 134 passed',
        'scripts/hooks/__tests__/ + tests/unit/fleet/stop-hook-role-text.test.js': '27 files, 401 passed, 1 todo',
      },
      export_impact: 'Four new exports added to module.exports (isSameTurnClaimEnabled, shouldAttemptSameTurnClaim, attemptSameTurnNextClaim, recordSameTurnClaimAttempt). Additive only. Importers found: tests/unit/fleet/stop-hook-role-text.test.js, tests/unit/hooks/stop-loop-park-recoverable.test.js, scripts/hooks/__tests__/stop-loop-wakeup-reminder.test.js, scripts/hooks/__tests__/wakeup-arm-evidence.test.js, scripts/hooks/__tests__/stop-hook-uv-handle-closing.test.js — all pass; every other repo reference is a prose mention, not an import.',
      live_measurements: {
        adoptable_orphans_no_claim: 4,
        stranded_pending_approval_no_claim: 5,
        db_round_trip_ms: { sessions: 33, sd_claim: 70, session_coordination: 39, v_sd_next_candidates: 451 },
      },
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_KEY,
    { name: 'VALIDATION' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' }
  );
  console.log('VALIDATION EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message, e.stack);
    process.exit(1);
  });
}
