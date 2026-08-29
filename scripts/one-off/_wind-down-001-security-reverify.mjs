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
    confidence_score: 90,
    findings: [
      {
        severity: 'low',
        id: 'REVERIFY-R1',
        title: 'formatCoordinatorMessagesForBlock throws on non-string kind or null array entry, contradicting its "Pure — never throws" contract',
        detail: 'Measured by direct invocation: formatCoordinatorMessagesForBlock([{kind:5}]) and ([{kind:{a:1}}]) throw TypeError ("(m.kind || \'message\').toUpperCase is not a function"); ([null]) throws TypeError reading \'chairman_directive\'. kind originates from session_coordination.payload->>kind (jsonb, writable by any fleet session/coordinator with service-role), so a non-string value is data-reachable, not merely theoretical. A throw here propagates out of main()\'s same-turn-claim branch into the outer catch at stop-loop-wakeup-reminder.cjs:794 -> fail-open shutdown(): the worker is never trapped, but BOTH the coordinator-message block AND (on the claimed branch) the "you just claimed <key>, continue building it" block are lost, while the message row has already been acked. Fix is one line: String(m.kind || \'message\').toUpperCase() plus a .filter((m) => m && typeof m === \'object\') on the input array.',
        file: 'scripts/hooks/stop-loop-wakeup-reminder.cjs:259-268',
      },
      {
        severity: 'medium',
        id: 'REVERIFY-R2',
        title: 'Timeout / throw path of attemptSameTurnNextClaim still burns a coordinator delivery slot silently (residual of original finding 4711ebbc)',
        detail: 'attemptSameTurnNextClaim returns NONE with resolution=null on (a) timeoutMs<=0, (b) the setTimeout arm of the Promise.race winning, and (c) resolveCheckinFn throwing. In cases (b)/(c) the in-flight resolveCheckin has usually ALREADY run its roll-call step (roll-call is early in the ladder), so surfaceCoordinatorMessages has already stamped read_at or acknowledged_at on the row -- yet resolution===null means pendingMessages=[] , messageDetail=\'\' , and control falls through to parkSessionRecoverable with nothing surfaced. This is the SAME defect class as the original finding, in a narrower (slow/erroring-checkin) window that the fix does not close. Not exploitable and fail-open by explicit design; closing it requires resolveCheckin to expose partial ctx.base on abort (out of scope for this SD). Recorded so it is not lost.',
        file: 'scripts/hooks/stop-loop-wakeup-reminder.cjs:209-227, 770-783',
      },
    ],
    warnings: [
      'Content injection (informational, NOT a new exposure): subject/body are interpolated verbatim into the Stop-hook block reason, and other fleet sessions can write session_coordination rows. Confirmed SAFE at the transport layer -- emitDecision() JSON.stringify()s the whole payload, so quotes, braces, newlines and NULs are escaped; a crafted subject of \'"}],"decision":"approve"\' round-trips as data (JSON.parse(...).decision === \'block\'), no structural breakout. The residual risk is prompt-level: the block reason is framed as an instruction ("act on these before going idle") the agent reads last. That trust boundary is pre-existing -- /checkin already surfaces the identical text to workers -- so this fix crosses no NEW boundary.',
      'A message with neither subject nor body renders as the bare line "  1. [MESSAGE]" -- confusing but harmless (measured), and the ordinal + header still tell the worker a delivery occurred.',
    ],
    recommendations: [
      'Harden formatCoordinatorMessagesForBlock per REVERIFY-R1 (String() coercion + non-object filter) -- 1-2 LOC, keeps the documented "never throws" contract honest.',
      'Track REVERIFY-R2 as a follow-up on the checkin resolution path (expose partial ctx.base on timeout/abort) rather than in this SD.',
    ],
    summary: 'Re-verification of SECURITY evidence 4711ebbc (SD-LEO-INFRA-WORKER-WIND-DOWN-001) against commit 490b9f7877b. ORIGINAL FINDING IS CLOSED for every path where attemptSameTurnNextClaim returns a resolution: formatCoordinatorMessagesForBlock (stop-loop-wakeup-reminder.cjs:259) exists, is exported, and is wired at :770-783 -- pendingMessages is read from resolution.coordinator_messages and appended to the claimed-branch block reason, AND a NEW decision:\'block\' is emitted on the none-claimable branch before parkSessionRecoverable, so nothing-claimable-but-a-message-was-consumed no longer parks silently. Verified the field actually exists on every outcome: roll-call.cjs:23 sets ctx.base.coordinator_messages and all 13 terminal returns across lib/checkin/steps/*.cjs and worker-checkin.cjs spread ...ctx.base, so both branches see it. Consumption semantics confirmed at worker-checkin.cjs:549-557 (first read -> read_at only; second read of a non-directive for a non-adam role -> acknowledged_at = permanently consumed), which is exactly the slot the fix now surfaces. Injection re-checked and SAFE (emitDecision JSON.stringify escapes all crafted subject/body content; confirmed by round-trip). Tests: npx vitest run tests/unit/hooks/ -> 16 files, 149/149 passing, including 5 formatter unit tests and 1 source-pin wiring test asserting the none-claimable+messages block precedes the park call. CONDITIONAL_PASS rather than PASS on two residuals, neither blocking and neither the original defect: (R1, low) the formatter throws on a non-string kind or a null entry despite documenting "never throws" -- data-reachable via session_coordination.payload jsonb, fail-open but silently drops the block it was added to emit; (R2, medium) the timeout/throw path of attemptSameTurnNextClaim returns resolution=null after roll-call has already acked the row, so the same delivery-slot burn survives in a narrower window the fix does not reach.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC_TO_PLAN',
      commit: '490b9f7877b',
      pr: 'https://github.com/rickfelix/EHG_Engineer/pull/7652',
      reverifies: '4711ebbc-6aff-4a0f-8bbb-7ee7ab351865',
      original_finding_status: 'CLOSED for both returning outcomes (claimed + none-claimable); residual R2 covers the null-resolution (timeout/throw) path only',
      evidence: {
        formatter_defined: 'scripts/hooks/stop-loop-wakeup-reminder.cjs:259-268',
        formatter_exported: 'scripts/hooks/stop-loop-wakeup-reminder.cjs:809',
        call_site_claimed_branch: 'scripts/hooks/stop-loop-wakeup-reminder.cjs:774',
        call_site_none_claimable_branch: 'scripts/hooks/stop-loop-wakeup-reminder.cjs:777-783',
        field_source: 'lib/checkin/steps/roll-call.cjs:23 sets ctx.base.coordinator_messages; all terminals spread ...ctx.base',
        consumption_semantics: 'scripts/worker-checkin.cjs:549-557',
        injection_transport: 'emitDecision -> JSON.stringify at scripts/hooks/stop-loop-wakeup-reminder.cjs:75-81 (verified escaping by round-trip probe)',
        tests: 'npx vitest run tests/unit/hooks/ => 16 files / 149 tests passed (2026-08-29)',
      },
      measured_probes: {
        'formatCoordinatorMessagesForBlock([{}])': 'OK, renders "  1. [MESSAGE]"',
        'formatCoordinatorMessagesForBlock([{kind:5}])': 'THREW TypeError',
        'formatCoordinatorMessagesForBlock([{kind:{a:1}}])': 'THREW TypeError',
        'formatCoordinatorMessagesForBlock([null])': 'THREW TypeError',
        'crafted subject/body through JSON.stringify': 'no breakout; JSON.parse(payload).decision === "block"; no raw newline in wire output',
      },
    },
    phase: 'EXEC_TO_PLAN',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('SECURITY', SD_KEY, { name: 'SECURITY' }, results, { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' });
  console.log('SECURITY EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}
if (isMainModule(import.meta.url)) { main().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); }); }
