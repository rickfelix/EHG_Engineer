import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-WORKER-WIND-DOWN-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase });

  let results = {
    verdict: 'PASS',
    confidence_score: 95,
    findings: [
      'RESOLVED (blocking defect from 0e479a8d): the CLAIM_ACTIONS allowlist in attemptSameTurnNextClaim is gone. scripts/hooks/stop-loop-wakeup-reminder.cjs:238-242 now uses NON_CLAIM_ACTIONS = new Set([idle, idle_fable_propose, error]) with an inverted predicate (resolution.action && !NON_CLAIM_ACTIONS.has(...)), so resume_final and resume_orphan classify as claimed.',
      'MUTATION-VERIFIED (not merely green): reverting the classifier to the old allowlist in-place caused exactly 3 targeted failures (resume_final, resume_orphan, future-unknown-action) out of 26 tests in tests/unit/hooks/stop-loop-same-turn-next-claim.test.js. The regression tests are load-bearing, not decorative. File restored byte-identical (md5 abe70e0cdfab60b2a2a47f035205aa13) and re-verified green afterward.',
      'ACTION UNIVERSE CLOSED AND RE-ENUMERATED INDEPENDENTLY: exhaustive grep of lib/checkin/ + scripts/worker-checkin.cjs yields exactly 9 action strings — idle, idle_fable_propose, error, self_claimed, self_claimed_qf, claimed_assignment, resume, resume_final, resume_orphan. No dynamic/template-literal action values exist; ctx.base carries no default action (worker-checkin.cjs:1933 base:null). The 3 denylisted are the only genuine non-claim terminals, so the denylist introduces NO false-positive "claimed" classification.',
      'Verified adopt-orphan.cjs and recover-stranded-final.cjs contain no action literal because they are thin wrappers delegating to worker-checkin.cjs helpers (resume_final at :1093, resume_orphan at :1432) — this CONFIRMS rather than weakens the original defect premise that both rungs are live and reachable.',
      'W-3 RESOLVED: the Promise.race setTimeout is captured in `timer` and cleared in a finally block (lines 216-226), mirroring readStdinPayload finish(). A fast claim no longer pins the event loop open for the remainder of timeoutMs on a shutdown() path that deliberately never calls process.exit().',
      'Stale comment corrected: lines 228-237 now state resume_final/resume_orphan ARE reachable (no ctx.mySd gate, both call tryClaim) and explain claimed-by-default. It also correctly notes plain `resume` (resume.cjs:248) IS mySd-gated and thus unreachable for a claim-less caller, while still classifying correctly if that gate is ever loosened.',
      'W-2 RESOLVED: a new describe("main() wiring") source-pin block covers the previously untested call site — kill-switch+predicate conjunction, delegation to worker-checkin.cjs resolveCheckin (not a hand-rolled query), exactly one [same-turn-next-claim] stderr line, decision:block routing on claim, and park+recordWindDown ordering on fall-through.',
      'Full suite tests/unit/hooks/ = 143/143 passing across 16 files (16 passed, 0 failed).',
    ],
    warnings: [
      'MINOR (non-blocking, no action required this SD): if a FUTURE ladder rung returns a claim-shaped action with neither .sd nor .qf, key resolves to null and the stderr instrument would read "claimed:null" and the block message "claimed null". Claimed-by-default is still the safe direction (a worker is told to continue rather than parked), but the log line would be uninformative. All 6 current claim actions carry .sd or .qf, so this is latent-only.',
      'W-1 ACCEPTED AS DOCUMENTED TRADEOFF: the ~2s residual budget for resolveCheckin will often time out in production. Re-affirmed acceptable — a timeout fails open to the identical none-claimable outcome as an empty belt, which is precisely success criterion 3 (a timeout and a genuinely empty belt are meant to be indistinguishable from the caller). Verified the timeoutMs<=0 path skips the call entirely without invoking resolveCheckinFn.',
      'W-4 ACCEPTED AS DOCUMENTED TRADEOFF: resolveCheckin performs coordination side-effects (roll-call, acks) on the wind-down path. In scope-boundary terms this follows from the SD non-goal excluding "any change to claim predicates themselves"; reusing the canonical ladder rather than forking it is the lower-risk choice.',
    ],
    recommendations: [
      'If a future rung adds a claim action, add an explicit case to the regression test alongside the existing resume_final/resume_orphan cases — the claimed-by-default fallback protects behavior but an explicit test documents intent.',
      'Consider (future SD, not this one) emitting a distinguishable log token when a claim action carries no key, so "claimed:null" cannot be misread as a successful keyed claim on the dashboard.',
    ],
    summary: 'RE-VERIFICATION of prior FAIL verdict 0e479a8d-6597-4fe5-b806-21b47086dd3e. The single blocking defect — the CLAIM_ACTIONS allowlist silently dropping the live, unconditionally-reachable resume_final (rung 5.7) and resume_orphan (rung 5.8) rungs, causing a session that took a real claim to be classified none-claimable and parked as idle (manufacturing a fresh orphan while logging the opposite) — is RESOLVED via an inverted denylist classifier. Confirmed by independent re-enumeration of the closed 9-string action universe (no false-positive claimed classification introduced) AND by mutation testing: reverting the classifier reproduces exactly 3 targeted test failures, proving the new regression tests actually catch the original defect rather than merely passing. W-3 (uncleared race timer) and W-2 (untested main() call site) also resolved. W-1 (budget) and W-4 (coordination side-effects) remain accepted, documented tradeoffs consistent with the SD non-goals and success criterion 3. Suite: 143/143 across tests/unit/hooks/. No new blocking defect found. Verdict PASS.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      reverifies: '0e479a8d-6597-4fe5-b806-21b47086dd3e',
      prior_verdict: 'FAIL',
      prior_confidence: 90,
      blocking_defect_status: 'RESOLVED',
      verification_methods: [
        'source re-read of attemptSameTurnNextClaim (lines 208-244) and its main() call site (lines 724-756)',
        'independent exhaustive enumeration of action string universe across lib/checkin/ and scripts/worker-checkin.cjs',
        'assertion-level review of tests (not test-name-level)',
        'MUTATION TEST: classifier reverted to allowlist -> 3 targeted failures -> restored byte-identical (md5 verified)',
        'full suite execution tests/unit/hooks/',
      ],
      action_universe: {
        non_claim_denylisted: ['idle', 'idle_fable_propose', 'error'],
        claim_classified: ['self_claimed', 'self_claimed_qf', 'claimed_assignment', 'resume', 'resume_final', 'resume_orphan'],
        dynamic_action_values_found: false,
        ctx_base_default_action: null,
      },
      mutation_test: {
        applied: 'NON_CLAIM_ACTIONS denylist -> CLAIM_ACTIONS allowlist (original defective form)',
        result: '3 failed | 23 passed (26)',
        failures: ['resume_final classified as claimed', 'resume_orphan classified as claimed', 'future unknown action claimed-by-default'],
        restored_md5: 'abe70e0cdfab60b2a2a47f035205aa13',
      },
      test_results: { suite: 'tests/unit/hooks/', files: '16 passed (16)', tests: '143 passed (143)' },
      accepted_tradeoffs: ['W-1 resolveCheckin budget/timeout', 'W-4 coordination side-effects on wind-down path'],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('VALIDATION', SD_KEY, { name: 'VALIDATION' }, results, { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' });
  console.log('VALIDATION EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
}
