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
    const { getCommsActivitySignals, computeAdaptiveCadence, DEFAULT_IDLE_WAKEUP_SECONDS } = ctx.helpers;
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
        message: `No Fable-fit work on the belt (${fencedList.length} item(s) fenced as non-creative${unclassified ? `, ${unclassified} unclassified — a coordinator can set metadata.work_class_override to admit them` : ''}). STANDING BY — per the Fable doctrine, propose a creative/design SD or await coordinator direction; do NOT pull general-harness work. Arm ScheduleWakeup(~${idleWakeupSeconds}s)${adaptiveCadenceNote} and proceed.`,
      };
    }
    return {
      ...ctx.base,
      action: 'idle',
      recommended_wakeup_seconds: idleWakeupSeconds,
      message: `No assignment and nothing claimable. IDLE.${tierNote} The /checkin skill must now call ScheduleWakeup(~${idleWakeupSeconds}s)${adaptiveCadenceNote} and proceed — never wait on a human.`,
    };
  },
};
