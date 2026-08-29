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
      'Committed diff ff22d588972 matches the declared implementation: 4 new functions (isSameTurnClaimEnabled, shouldAttemptSameTurnClaim, attemptSameTurnNextClaim, recordSameTurnClaimAttempt) added to scripts/hooks/stop-loop-wakeup-reminder.cjs and all 4 added to module.exports.',
      'Wiring verified in main(): the same-turn-claim block sits INSIDE the pre-existing workerShaped ALLOW-PATH branch (line ~724). workerShaped at line 649 is literally shouldParkRecoverable({loopState, hasActiveClaim, windDownSignaled}), so the refactor from `if (shouldParkRecoverable(...))` to `if (workerShaped)` is semantically identical -- NO widening of the park population.',
      'Delegation confirmed: resolveCheckinFn: require("../worker-checkin.cjs").resolveCheckin -- no claim predicates duplicated. Verified the export loads under plain node (typeof resolveCheckin === "function"), not just under vitest.',
      'Denylist classifier audited against the real action vocabulary. grep of lib/checkin/ + scripts/worker-checkin.cjs yields exactly 9 action strings: claimed_assignment, error, idle, idle_fable_propose, resume, resume_final, resume_orphan, self_claimed, self_claimed_qf. NON_CLAIM_ACTIONS = {idle, idle_fable_propose, error}; the complement is exactly the 6 claim-acquiring actions. Classifier is complete and correct -- including resume_final and resume_orphan, the two live rungs the prior allowlist dropped.',
      'Additive-not-replacement confirmed: parkSessionRecoverable + recordWindDown still run on the none-claimable fall-through; only the claimed outcome short-circuits via emitDecision({decision:"block"}) + shutdown().',
      'npx vitest run tests/unit/hooks/ -- 16 files, 143/143 tests PASS (5.85s). No skips, no quarantine.',
      'New test file tests/unit/hooks/stop-loop-same-turn-next-claim.test.js contains 26 tests across 5 describes (kill switch, predicate, attempt/timeout/fail-open, metadata stamp, main() wiring).',
      'Read-only dependency regression: npx vitest run tests/unit/checkin-pipeline.test.js -- 5/5 PASS. worker-checkin.cjs is unaffected by this change.',
      'Resource-leak guard reviewed: attemptSameTurnNextClaim clears the race timer in a finally block, so a fast claim cannot pin the event loop open for the remainder of timeoutMs (shutdown() does not process.exit() on the normal path).',
      'Guard-population correctness: shouldAttemptSameTurnClaim returns workerShaped && !hasActiveClaim, so a claim-holder ending its turn can never be diverted into acquiring a second SD.',
    ],
    warnings: [
      'The main() ALLOW-PATH integration is verified by SOURCE-PIN tests (regex + indexOf ordering over the hook source text), not by an end-to-end execution of main(). The pins are regex/index-based rather than fixed character slices, so they tolerate line movement, but they assert TEXT SHAPE rather than observed runtime behavior -- a refactor that preserved the text while breaking the dispatch would still pass. The 4 extracted functions themselves ARE execution-tested.',
      'No integration test exercises a real Supabase claude_sessions row for recordSameTurnClaimAttempt; the metadata read-modify-merge is covered with a mocked client only. It is fail-open by construction, so the blast radius of a defect there is a missing observability stamp, not a trapped worker.',
    ],
    recommendations: [
      'If the same-turn-claim block is ever moved or refactored, re-run tests/unit/hooks/stop-loop-same-turn-next-claim.test.js first -- the wiring pins are the only thing standing between a text-preserving refactor and a silently dead feature.',
      'Consider a follow-up harness test that drives main() through the workerShaped ALLOW-PATH with a stubbed resolveCheckin, converting the 5 source-pin wiring assertions into execution assertions.',
      'Post-merge, watch for the [same-turn-next-claim] stderr line and metadata.same_turn_claim_attempt on finisher seats -- that is the "chose to exit idle after looking" vs "never looked" discriminator; absence of the line on a wind-down means the branch is not being reached in production.',
    ],
    summary: 'PASS. Committed diff ff22d588972 matches the declared implementation exactly: 4 new exported functions wired into the pre-existing workerShaped ALLOW-PATH branch of stop-loop-wakeup-reminder.cjs, delegating claim resolution to worker-checkin.cjs resolveCheckin with a denylist action classifier. The park population is provably unchanged (workerShaped === the prior shouldParkRecoverable call), and the fix is additive -- park+recordWindDown still run on the none-claimable path. The denylist was audited against the full 9-value action vocabulary and is complete: its complement is exactly the 6 claim-acquiring actions, including the two (resume_final, resume_orphan) the reverted allowlist dropped. tests/unit/hooks/ 143/143 PASS across 16 files (26 of them new for this SD); read-only dependency tests/unit/checkin-pipeline.test.js 5/5 PASS. Two non-blocking warnings recorded: main() integration is source-pinned rather than execution-traced, and the metadata stamp is mock-only.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC_TO_PLAN',
      commit: 'ff22d588972',
      pr: 'https://github.com/rickfelix/EHG_Engineer/pull/7652',
      branch: 'feat/SD-LEO-INFRA-WORKER-WIND-DOWN-001',
      test_runs: [
        { command: 'npx vitest run tests/unit/hooks/', files: 16, passed: 143, failed: 0, skipped: 0, duration_s: 5.85 },
        { command: 'npx vitest run tests/unit/checkin-pipeline.test.js', files: 1, passed: 5, failed: 0, skipped: 0, duration_ms: 413 },
      ],
      new_test_file: { path: 'tests/unit/hooks/stop-loop-same-turn-next-claim.test.js', test_count: 26, describe_blocks: 5 },
      functions_verified: ['isSameTurnClaimEnabled', 'shouldAttemptSameTurnClaim', 'attemptSameTurnNextClaim', 'recordSameTurnClaimAttempt'],
      action_vocabulary_audit: {
        source: 'grep -rhoE "action: \'[a-z_]+\'" lib/checkin/ scripts/worker-checkin.cjs',
        all_actions: ['claimed_assignment', 'error', 'idle', 'idle_fable_propose', 'resume', 'resume_final', 'resume_orphan', 'self_claimed', 'self_claimed_qf'],
        non_claim_denylist: ['idle', 'idle_fable_propose', 'error'],
        classified_as_claim: ['claimed_assignment', 'resume', 'resume_final', 'resume_orphan', 'self_claimed', 'self_claimed_qf'],
        verdict: 'complete -- denylist complement equals the full set of claim-acquiring actions',
      },
      park_population_unchanged: 'line 649: const workerShaped = shouldParkRecoverable({ loopState, hasActiveClaim, windDownSignaled }); line 724: if (workerShaped) -- semantically identical to the pre-change condition',
      dependency_export_check: 'node -e require("./scripts/worker-checkin.cjs").resolveCheckin => typeof function (loads under plain node, not only vitest)',
    },
    phase: 'EXEC_TO_PLAN',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('TESTING', SD_KEY, { name: 'TESTING' }, results, { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' });
  console.log('TESTING EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}
if (isMainModule(import.meta.url)) { main().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); }); }
