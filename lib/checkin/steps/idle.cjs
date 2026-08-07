// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 7: tier note +
// adaptive cadence + final idle return) — SD-ARCH-HOTSPOT-CHECKIN-001. This step ALWAYS
// returns. Only edits: locals -> ctx.* + helper destructuring.
const TIER_FAMILY_AXES = new Set([
  'above_worker_tier', 'tier_stamp_missing', 'fable_window_downward_claim_blocked', 'reserved_no_lower_backlog',
]);
// QF-20260719-144: format the idle "nothing claimable" note from the ACTUAL per-item ineligibility
// breakdown (belt_ineligibility_breakdown, tallied in merged-pool-self-claim via
// classifyDispatchIneligibility). The prior code blamed TIER whenever tiering was active, but the tier
// axis is near-LAST in precedence — a 0-claimable belt is usually orchestrator-parent / human-action /
// test-fixture / held, NOT a tier deficit. Blame the rung ONLY for items actually in the tier family.
// Fail-open: absent breakdown keeps the prior tiering-aware wording.
function formatIdleIneligibilityNote(rankedAgnostic, claimableAtTier, breakdown, tieringActive) {
  if (!(rankedAgnostic > 0 && claimableAtTier === 0)) return '';
  const entries = breakdown && typeof breakdown === 'object' ? Object.entries(breakdown) : [];
  if (!entries.length) {
    return tieringActive === true
      ? ` (${rankedAgnostic} ranked, but 0 claimable at your tier — all above your rung; a higher-tier worker must take them.)`
      : ` (${rankedAgnostic} ranked, but 0 claimable by any worker — orchestrator parents / clone build-trees / human-action / held, not tier-blocked.)`;
  }
  const tierCount = entries.filter(([r]) => TIER_FAMILY_AXES.has(r)).reduce((n, [, c]) => n + c, 0);
  const parts = entries.slice().sort((a, b) => b[1] - a[1]).map(([r, c]) => `${c}x ${r}`).join(', ');
  return tierCount > 0
    ? ` (${rankedAgnostic} ranked, 0 claimable to you: ${parts}; ${tierCount} above your rung — a higher-tier worker must take those.)`
    : ` (${rankedAgnostic} ranked, 0 claimable to you but NONE tier-blocked: ${parts} — a higher-tier worker could not take them either.)`;
}

module.exports = {
  name: 'idle',
  formatIdleIneligibilityNote,
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const { getCommsActivitySignals, computeAdaptiveCadence, DEFAULT_IDLE_WAKEUP_SECONDS,
      ws, ASSIGNMENT_RECENCY_WINDOW_MS } = ctx.helpers;

    // QF-20260807-368 — SURFACE PENDING DIRECTIVES ON THE IDLE PATH TOO.
    //
    // resume.cjs added this surfacing for a CLAIM-HOLDING worker, because directive kinds other
    // than WORK_ASSIGNMENT "had NO surfacing path" for one. That fixed the instance and left the
    // class: a worker with NO claim never reaches resume.cjs, so it never gets the count either —
    // and idle is precisely the state in which undrained directives accumulate.
    //
    // MEASURED on session 7c0540c2 (2026-08-07): three coordinator requests went unread, one a
    // release request nudged THREE times while a peer sat blocked. Every check-in that afternoon
    // returned idle_fable_propose and carried NO directive count; the backlog surfaced only when
    // an unrelated claim collision flipped the action to `resume`. The escalation that finally
    // worked was INCIDENTAL, not designed.
    //
    // The worker's own triage was also windowing the list — that half is the worker's to fix. But
    // an idle worker was blind on BOTH surfaces at once: truncated list AND no count to contradict
    // it. Closing this one means the harness always states the count, whatever the reader does.
    //
    // SAME CONTRACT AS resume.cjs, deliberately: SURFACE ONLY. We do NOT stamp read_at (read_at IS
    // NULL is the deliberate deliver-not-consume signal for DIRECTIVE_KINDS — forcing it
    // re-introduces a corrected regression), we do NOT touch the claim, and the whole block is
    // fail-open so a directive-query fault can never break a check-in.
    let directiveNote = '';
    try {
      const kinds = new Set(ws.DIRECTIVE_KINDS || []);
      const dmsgs = await ws.getMessagesForSession(sb, sessionId, {
        unackedOnly: true,
        sinceIso: new Date(Date.now() - ASSIGNMENT_RECENCY_WINDOW_MS).toISOString(),
      });
      const pending = (dmsgs || []).filter((m) => kinds.has((m.payload && m.payload.kind) || m.message_type));
      if (pending.length) {
        const summary = pending.map((d) => (d.payload && d.payload.kind) || d.message_type).join(', ');
        directiveNote = ` PENDING DIRECTIVE${pending.length > 1 ? 'S' : ''} (${pending.length}): ${summary}`
          + ' — READ AND ACTION THEM NOW. You hold no claim, so nothing is competing with them.'
          + ' Ack a coordinator_directive with: node scripts/worker-ack-directive.cjs --id <id>.';
      }
    } catch { /* fail-open: no directive surfacing */ }
    // 7. idle -> recommend a wakeup (ScheduleWakeup is a HARNESS tool, not Node-callable)
    // SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-2): when the ranked pool is non-empty but NONE of
    // it is claimable at this worker's rung, say so explicitly — otherwise the agnostic count reads as
    // "work exists for me" and the idle looks like a bug rather than a tier deficit.
    const rankedAgnostic = ctx.base.belt_ranked_claimable ?? 0;
    const claimableAtTier = ctx.base.belt_claimable_at_my_tier ?? rankedAgnostic;
    // QF-20260719-144 (supersedes QF-20260630-761's tiering-flag heuristic): derive the idle note from
    // the ACTUAL per-item ineligibility breakdown (tallied upstream via classifyDispatchIneligibility),
    // so the message names the real blockers (human-action / orchestrator / test-fixture / held / tier)
    // instead of blaming "your rung" whenever tiering happens to be active.
    const tierNote = formatIdleIneligibilityNote(
      rankedAgnostic, claimableAtTier, ctx.base.belt_ineligibility_breakdown, ctx.base.belt_tiering_active);
    // SD-LEO-INFRA-ADAPTIVE-COMMS-CADENCE-SHARED-PROTOCOL-001 (FR-6): opt-in tightening. A worker
    // idling on the belt but awaiting a reply on a live comms thread (e.g. a blocked-item question
    // to the coordinator) shouldn't wait a full baseline interval to notice the reply. ADDITIVE
    // ONLY — never loosens the existing belt-driven recommendation, never touches claim/heartbeat.
    // Fail-open: any error here falls through to the unchanged baseline recommendation.
    let idleWakeupSeconds = DEFAULT_IDLE_WAKEUP_SECONDS;
    let adaptiveCadenceNote = '';
    try {
      const signals = await getCommsActivitySignals(sb, sessionId);
      const cadence = computeAdaptiveCadence(signals);
      if (cadence.tight && cadence.intervalMs / 1000 < idleWakeupSeconds) {
        idleWakeupSeconds = Math.round(cadence.intervalMs / 1000);
        adaptiveCadenceNote = ` (tightened to ${idleWakeupSeconds}s — live comms thread: ${cadence.reason})`;
      }
    } catch { /* fail-open: keep the baseline recommendation */ }

    // QF-20260727-395: every fleet instrument measures whether WORKERS are talking; nothing
    // measured whether the COORDINATOR is answering. Measured 2026-07-27T20:38Z: 21 ranked, 0
    // claimable, none tier-blocked — 10 held on needs_coordinator_review — while the silent-holder
    // audit, unanswered_over_30m and unranked-claimable-leaves all read green, because a fully
    // COORDINATOR-FENCED belt is indistinguishable from a healthy one on every existing gauge.
    // This is the wiring, not just the emit: an unread signal is the defect this row sits inside.
    // Dynamic import because this file is CJS and the assessor is ESM; the whole block is
    // fail-open so a gauge fault can never break a check-in.
    let beltBlockNote = '';
    try {
      const { assessCoordinatorBeltBlock, formatCoordinatorBeltBlock } =
        await import('../../governance/coordinator-belt-block.js');
      const belt = assessCoordinatorBeltBlock({
        claimableDepth: claimableAtTier,
        ineligibilityBreakdown: ctx.base.belt_ineligibility_breakdown,
      });
      // Surfaced on ctx.base so a consumer other than this message can read the structured verdict.
      ctx.base.belt_block = belt;
      if (belt.blocked) {
        beltBlockNote =
          ` ⚠️  BELT BLOCKED ON THE COORDINATOR: ${belt.reason}. This is NOT "work ran out" —` +
          ` the largest bucket is a fence only the coordinator can clear. Holding a fence for a` +
          ` stated reason is correct; not NOTICING is the defect. ${formatCoordinatorBeltBlock(belt)}`;
      }
    } catch { /* fail-open: an unavailable gauge must not block the idle path */ }

    // SD-LEO-INFRA-WORK-CLASS-CLAIM-001 (FR-3, the recurrence fix): a restricted-capability
    // (fable) session that found NO fable-fit work must idle-and-propose — the fence above
    // already made general work invisible; this terminal makes the empty-lane state explicit
    // instead of implying a bug. Per the Fable doctrine a Fable seat's primary mode is
    // self-directed creative work. Non-fable sessions return the unchanged 'idle' below (C-AC5).
    const { modelWorkClasses } = require('../../fleet/work-class.cjs');
    const sessionModel = (ctx.sessionMetadata && typeof ctx.sessionMetadata.model === 'string')
      ? ctx.sessionMetadata.model : undefined;
    if (modelWorkClasses(sessionModel)) {
      const fencedList = Array.isArray(ctx.base.work_class_fenced) ? ctx.base.work_class_fenced : [];
      const unclassified = fencedList.filter((f) => f.reason === 'work_class_unclassified').length;
      return {
        ...ctx.base,
        action: 'idle_fable_propose',
        recommended_wakeup_seconds: idleWakeupSeconds,
        message: `No Fable-fit work on the belt (${fencedList.length} item(s) fenced as non-creative${unclassified ? `, ${unclassified} unclassified — a coordinator can set metadata.work_class_override to admit them` : ''}). STANDING BY — per the Fable doctrine, propose a creative/design SD or await coordinator direction; do NOT pull general-harness work. Arm ScheduleWakeup(~${idleWakeupSeconds}s)${adaptiveCadenceNote} and proceed.${directiveNote}`,
      };
    }
    return {
      ...ctx.base,
      action: 'idle',
      recommended_wakeup_seconds: idleWakeupSeconds,
      message: `No assignment and nothing claimable. IDLE.${tierNote}${beltBlockNote} The /checkin skill must now call ScheduleWakeup(~${idleWakeupSeconds}s)${adaptiveCadenceNote} and proceed — never wait on a human.${directiveNote}`,
    };
  },
};
