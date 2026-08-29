/**
 * SD-LEO-INFRA-WORKER-WIND-DOWN-001 — SECURITY sub-agent evidence (EXEC_TO_PLAN).
 * Reviews commit ff22d588972 (same-turn next-claim in the worker Stop hook).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-WORKER-WIND-DOWN-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'SECURITY', supabase });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 88,
    findings: [
      {
        severity: 'medium',
        title: 'Side-effecting resolveCheckin is invoked but its coordinator_messages[] output is discarded on BOTH branches — silent consumption of coordinator push rows',
        detail:
          'resolveCheckin runs the full CHECKIN_STEPS ladder. Step 4 (lib/checkin/steps/roll-call.cjs:23) unconditionally calls surfaceCoordinatorMessages (scripts/worker-checkin.cjs:529), which MUTATES session_coordination: it stamps read_at on first sight, and stamps acknowledged_at (= permanently CONSUMED, never re-surfaced) on any already-delivered NON-directive row when role !== adam. The Stop hook forwards only resolution.message; resolution.coordinator_messages[] (spread onto every resolution via ctx.base) is dropped on the claimed branch and the ENTIRE resolution is discarded on the none-claimable branch, where the worker then parks. Net effect: every same-turn claim attempt burns a delivery slot on this session pending coordinator push rows. Advisory rows already delivered once are marked acknowledged and LOST to the worker; directives keep re-surfacing (recoverable) but their read_at delivery telemetry is falsified — the row reads as delivered to a worker that parked without ever seeing it. This is a NEW side effect: pre-commit the Stop hook never called resolveCheckin. Frequency is high because the target population (worker-shaped, claim-less, winding down) is exactly the path this SD adds. Not an authorization or privilege issue — integrity/availability of the coordinator comms channel.',
        location: 'scripts/hooks/stop-loop-wakeup-reminder.cjs:729-748 (call site); lib/checkin/steps/roll-call.cjs:23; scripts/worker-checkin.cjs:549-557',
        recommendation:
          'Deliver what was consumed: (a) on outcome===claimed, append formatted resolution.coordinator_messages[] to the emitDecision block reason alongside resolution.message; (b) on outcome===none-claimable, when resolution.coordinator_messages is non-empty, emit a block delivering them instead of parking silently. Either is a small change confined to the new block.',
      },
    ],
    warnings: [
      'hasActiveClaim (stop-loop-wakeup-reminder.cjs:602-609) probes ONLY strategic_directives_v2.claiming_session_id. A worker holding an open quick_fixes claim but no SD claim reads as claim-less and will attempt a next claim. The stated invariant ("must never fire for a claim-holder, or a finisher could grab a SECOND SD") therefore leans on resolveCheckin own ladder guards for the QF-holder case rather than on this gate. Behaviour is identical to that worker running /checkin manually, and the probe is pre-existing (not introduced here), so this is a documentation/precision gap, not a new hole.',
      'Blast radius of a Stop-hook bug widened. The hook holds a service-role client (createSupabaseServiceClient, :589). Before this commit its writes were confined to claude_sessions telemetry/park state; via resolveCheckin it can now write strategic_directives_v2 claims, quick_fixes.owner, and session_coordination ack/read state. Mitigations present and verified: independent kill switch LEO_SAME_TURN_NEXT_CLAIM, narrow population gate, exactly one attempt (no polling), Promise.race timeout bound, and try/catch fail-open.',
      'The Promise.race around recordSameTurnClaimAttempt (:740-742) creates a setTimeout that is never cleared, unlike attemptSameTurnNextClaim which correctly clears its timer in a finally block. Since shutdown() deliberately never calls process.exit() on the normal path, a fast metadata write leaves the loop pinned for the remaining budget. Cosmetic latency only, and it mirrors the pre-existing race at :714-717 — but the new code shows the file already knows the correct pattern one function earlier.',
    ],
    recommendations: [
      'Address the medium finding by forwarding coordinator_messages[] into the emitted decision (or by not parking when messages are pending) before treating this CONDITIONAL_PASS as green.',
      'Optionally widen hasActiveClaim to include quick_fixes ownership, or amend the shouldAttemptSameTurnClaim docstring to state explicitly that QF-holders are gated by the ladder rather than by this predicate.',
      'Clear the recordSameTurnClaimAttempt race timer, matching the finally-block pattern in attemptSameTurnNextClaim.',
    ],
    summary:
      'No new attack surface, privilege escalation, or authorization bypass. The change delegates 100% of claim resolution to worker-checkin.cjs resolveCheckin (signature matches, unmodified, invoked with default options), so the full guard ladder applies unchanged: build-forbidden-guard, canary-claim-fence, directed-assignment-first priority, seat-busy-fence, tier-context + tier gates, drain-reservations, self-claim-gates (session opt-out + global stand-down), quarantine self-clear, and the foreign-claimant/stale-claim healing inside resume. Zero claim predicates are re-implemented in the hook; the only local logic is an inverted denylist classifier over the returned action string. No decision-channel injection: emitDecision uses JSON.stringify, which escapes quotes/newlines/control chars, so a DB-sourced SD title or resolution.message cannot break out of the decision JSON structure; stdout is muzzled at module load and restored only inside emitDecision, so transitive checkin console output cannot corrupt the document either. The content remains fleet-internal DB state with the same trust level the existing /checkin path already prints to the worker, so no new trust boundary is crossed. No credentials, API keys, or secrets are read, logged, or newly exposed: the pre-existing service-role client is reused, and the stderr line and metadata stamp carry only an outcome enum, an SD/QF key, and a timestamp. The claude_sessions.metadata merge in recordSameTurnClaimAttempt is a correct read-modify-write (select metadata, shallow-spread, set one key, update by session_id), preserving sibling keys and mirroring recordWindDown; it is last-write-wins rather than atomic, but it reads AFTER the claim so it observes post-claim metadata, and a missing row updates zero rows. Also verified the refactor of the park gate is behaviour-preserving: workerShaped at :649 is literally shouldParkRecoverable({loopState, hasActiveClaim, windDownSignaled}), so replacing the inline call with the hoisted variable neither widens nor narrows the park population. CONDITIONAL_PASS is driven by one medium non-authorization finding: resolveCheckin has message-delivery side effects (roll-call stamps read_at/acknowledged_at on session_coordination) whose coordinator_messages[] output the hook discards on both branches, silently consuming advisory coordinator pushes on a path that runs at every claim-less wind-down.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC_TO_PLAN',
      commit: 'ff22d588972',
      pr: 'https://github.com/rickfelix/EHG_Engineer/pull/7652',
      files_reviewed: [
        'scripts/hooks/stop-loop-wakeup-reminder.cjs',
        'scripts/worker-checkin.cjs',
        'lib/checkin/steps/index.cjs',
        'lib/checkin/steps/roll-call.cjs',
      ],
      checks: {
        delegates_to_resolveCheckin_no_reimplementation: 'PASS',
        guard_ladder_intact_directed_first_canary_tier_standdown_seatbusy: 'PASS',
        decision_channel_json_injection: 'PASS — JSON.stringify escaping + stdout muzzle',
        secrets_credentials_exposure: 'PASS — none touched',
        metadata_read_modify_write_no_clobber: 'PASS',
        park_gate_refactor_behaviour_preserving: 'PASS — workerShaped === shouldParkRecoverable(...)',
        side_effect_output_discarded: 'FINDING (medium) — coordinator_messages[] dropped',
      },
    },
    phase: 'EXEC_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('SECURITY', SD_KEY, { name: 'SECURITY' }, results, { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' });
  console.log('SECURITY EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
}
