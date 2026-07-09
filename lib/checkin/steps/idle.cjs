// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 7: tier note +
// adaptive cadence + final idle return) — SD-ARCH-HOTSPOT-CHECKIN-001. This step ALWAYS
// returns. Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
  name: 'idle',
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const { getCommsActivitySignals, computeAdaptiveCadence, DEFAULT_IDLE_WAKEUP_SECONDS } = ctx.helpers;
    // 7. idle -> recommend a wakeup (ScheduleWakeup is a HARNESS tool, not Node-callable)
    // SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-2): when the ranked pool is non-empty but NONE of
    // it is claimable at this worker's rung, say so explicitly — otherwise the agnostic count reads as
    // "work exists for me" and the idle looks like a bug rather than a tier deficit.
    const rankedAgnostic = ctx.base.belt_ranked_claimable ?? 0;
    const claimableAtTier = ctx.base.belt_claimable_at_my_tier ?? rankedAgnostic;
    // QF-20260630-761: only blame TIER when tiering is actually active. When tiering is OFF (degrade-to-1,
    // <2 live workers) the tier axis is inert, so a 0-claimable belt with ranked>0 means the ranked items
    // are ineligible for NON-tier reasons (orchestrator parents / clone build-trees / human-action / held)
    // — a higher-tier worker could not take them either. Attributing it to "your rung" misdirects.
    const tierNote = (rankedAgnostic > 0 && claimableAtTier === 0)
      ? (ctx.base.belt_tiering_active === true
          ? ` (${rankedAgnostic} ranked, but 0 claimable at your tier — all above your rung; a higher-tier worker must take them.)`
          : ` (${rankedAgnostic} ranked, but 0 claimable by any worker — they are orchestrator parents / clone build-trees / human-action / held, not tier-blocked.)`)
      : '';
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

    return {
      ...ctx.base,
      action: 'idle',
      recommended_wakeup_seconds: idleWakeupSeconds,
      message: `No assignment and nothing claimable. IDLE.${tierNote} The /checkin skill must now call ScheduleWakeup(~${idleWakeupSeconds}s)${adaptiveCadenceNote} and proceed — never wait on a human.`,
    };
  },
};
