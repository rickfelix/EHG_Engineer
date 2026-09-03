// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 7: tier note +
// adaptive cadence + final idle return) — SD-ARCH-HOTSPOT-CHECKIN-001. This step ALWAYS
// returns. Only edits: locals -> ctx.* + helper destructuring.
// SD-FDBK-INFRA-RETIRE-SEAT-TIER-001 (chairman ratification 20dc072b): above_worker_tier,
// tier_stamp_missing, and reserved_no_lower_backlog were DELETED from classifyDispatchIneligibility
// -- they can never appear in a real breakdown again, so they are removed here too (leaving them
// would render a genuinely tier-blocked belt as "NONE tier-blocked", which is worse than stale).
// fable_window_downward_claim_blocked is a SEPARATE, still-live ruling (QF-20260709-881) and stays.
const TIER_FAMILY_AXES = new Set(['fable_window_downward_claim_blocked']);
// QF-20260719-144: format the idle "nothing claimable" note from the ACTUAL per-item ineligibility
// breakdown (belt_ineligibility_breakdown, tallied in merged-pool-self-claim via
// classifyDispatchIneligibility). The prior code blamed TIER whenever tiering was active, but the tier
// axis is near-LAST in precedence — a 0-claimable belt is usually orchestrator-parent / human-action /
// test-fixture / held, NOT a tier deficit. Blame the rung ONLY for items actually in the tier family.
// Fail-open: absent breakdown keeps the prior tiering-aware wording.
// QF-20260903-977: "nothing claimable" is only an honest sentence when the search actually SAW the
// whole population. It does not — the candidate pool is a union of CAPPED windows (see the
// cap-before-predicate note in merged-pool-self-claim.cjs), so a zero result from a partial sample
// means "none of the ones I examined", which is UNDETERMINED, not "none exist". Reporting the ratio is
// what makes exhaustion and emptiness separable to the reader; without it a seat parks for ten minutes
// against a belt that is full, and the park looks exactly like a correct idle.
//
// The null-total branch is deliberately the LOUDEST of the three: when the count could not be taken we
// know less than usual, and the one thing that must never happen is a missing measurement rendering as
// a confident empty.
function formatSamplingNote(examined, total) {
  // Neither value present => the pool step did not run at all. Say NOTHING: this helper reports on a
  // search that happened, and narrating coverage for a search that never ran would be its own invented
  // claim. Ordered FIRST because the loud branch below must not fire on a step that was simply absent.
  if (typeof examined !== 'number' && typeof total !== 'number') return '';
  if (typeof total !== 'number') {
    return ' (SAMPLE COVERAGE UNDETERMINED — the population count could not be taken, so this is NOT evidence of an empty belt.)';
  }
  if (typeof examined !== 'number') return '';
  if (examined >= total) {
    return ` (examined all ${total} candidate(s) — the belt is genuinely empty for you.)`;
  }
  return ` (UNDETERMINED: examined ${examined} of ${total} — the candidate windows are capped, so ${total - examined} were never looked at. This is NOT a known-empty belt.)`;
}

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
  // Exported so the coverage branches can be observed FAILING (QF-20260903-977). Driving them only
  // through run() would exercise them via whichever branch the fixture happens to take, which is how an
  // invariant ends up never able to go red — the shape this whole ticket is about.
  formatSamplingNote,
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const { getCommsActivitySignals, computeAdaptiveCadence, DEFAULT_IDLE_WAKEUP_SECONDS, ws } = ctx.helpers;

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
    // QF-20260817-962: this used to issue its OWN separate getMessagesForSession query — a
    // second DB read of the same "unacked coordinator push to this session" concept that
    // roll-call.cjs already fetched into ctx.base.coordinator_messages moments earlier in this
    // same checkin call. Two reads at two different instants meant a directive that arrived in
    // the gap could satisfy this query while the earlier roll-call read (surfaced verbatim as
    // coordinator_messages in this same JSON response) never saw it — count>0, rows=[] in one
    // response (measured live, session Golf-2, 2026-08-17). Deriving `pending` from the
    // already-fetched array instead (single query, single predicate, single point-in-time
    // snapshot) makes that disagreement structurally impossible rather than merely rarer.
    let directiveNote = '';
    try {
      const kinds = new Set(ws.DIRECTIVE_KINDS || []);
      const pending = (ctx.base.coordinator_messages || []).filter((m) => kinds.has(m.kind));
      if (pending.length) {
        const summary = pending.map((d) => d.kind).join(', ');
        directiveNote = ` PENDING DIRECTIVE${pending.length > 1 ? 'S' : ''} (${pending.length}): ${summary}`
          + ' — READ AND ACTION THEM NOW. You hold no claim, so nothing is competing with them.'
          // SD-LEO-INFRA-WORKER-REACHABLE-ACK-001: name BOTH lanes. Naming only the directive verb
          // is why advisory rows piled up — a worker who tried it on a coordinator_reply got a
          // (correct) refusal and had nowhere else to go, so rulings sat unacked until a later
          // /checkin drained them. A verb nobody is told about is not reachable in practice.
          + ' Ack a coordinator_directive with: node scripts/worker-ack-directive.cjs --id <id>.'
          + ' Ack a coordinator_reply / completion_nudge with: node scripts/worker-ack-advisory.cjs --id <id>.';
      }
    } catch { /* fail-open: no directive surfacing */ }
    // 7. idle -> recommend a wakeup (ScheduleWakeup is a HARNESS tool, not Node-callable)
    // SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-2): when the ranked pool is non-empty but NONE of
    // it is claimable at this worker's rung, say so explicitly — otherwise the agnostic count reads as
    // "work exists for me" and the idle looks like a bug rather than a tier deficit.
    // SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-D: read the RAW pool size here, not belt_ranked_claimable.
    // That field now reports ELIGIBLE depth (it is what the anti-winddown directive and the
    // coordinator belt-block verdict consume), so it is equal to belt_claimable_at_my_tier by
    // construction — and both the ineligibility note below and the SELF-IDENTIFY block gate on
    // `rankedAgnostic > 0 && claimableAtTier === 0`, a condition that equality makes UNSATISFIABLE.
    // Left unchanged, this change would have silently killed two shipped features (QF-20260719-144's
    // idle note and QF-20260831-738 SELF-IDENTIFY, chairman-proposed, ratification f48e0abf) while
    // every test stayed green, because the existing suite hand-builds ctx.base with a raw/eligible
    // split production can no longer produce. belt_ranked_pool_size is exactly the gap this note is
    // meant to explain. Fallback keeps pre-change ticks and any other producer working unchanged.
    const rankedAgnostic = ctx.base.belt_ranked_pool_size ?? ctx.base.belt_ranked_claimable ?? 0;
    const claimableAtTier = ctx.base.belt_claimable_at_my_tier ?? rankedAgnostic;
    // QF-20260719-144 (supersedes QF-20260630-761's tiering-flag heuristic): derive the idle note from
    // the ACTUAL per-item ineligibility breakdown (tallied upstream via classifyDispatchIneligibility),
    // so the message names the real blockers (human-action / orchestrator / test-fixture / held / tier)
    // instead of blaming "your rung" whenever tiering happens to be active.
    const tierNote = formatIdleIneligibilityNote(
      rankedAgnostic, claimableAtTier, ctx.base.belt_ineligibility_breakdown, ctx.base.belt_tiering_active);

    // QF-20260903-977: how much of the population this idle verdict actually saw. Written by
    // merged-pool-self-claim.cjs alongside the ranked pool; both may be undefined when that step did not
    // run, in which case the helper stays silent rather than inventing coverage it cannot vouch for.
    const samplingNote = formatSamplingNote(ctx.base.belt_sample_examined, ctx.base.belt_population_total);

    // QF-20260831-738 (chairman-proposed, ratification f48e0abf): SELF-IDENTIFY when this holderless
    // seat sees claimable items on the belt it did NOT claim — name them + why, upward to the
    // coordinator, instead of sitting silently idle. Fires once per condition-onset (a fingerprint of
    // the ineligibility breakdown), never per tick — a standing idle state emits ONE signal at
    // transition, not on every pass (level-vs-edge). Fail-open: never blocks idle resolution.
    if (rankedAgnostic > 0 && claimableAtTier === 0) {
      try {
        const breakdown = ctx.base.belt_ineligibility_breakdown || {};
        const fp = Object.keys(breakdown).sort().map((k) => `${k}:${breakdown[k]}`).join(',') || `n:${rankedAgnostic}`;
        if (fp !== (ctx.sessionMetadata && ctx.sessionMetadata.idle_self_identify_fp)) {
          const measuredAt = new Date().toISOString();
          const reasons = Object.entries(breakdown).map(([r, c]) => `${c}x ${r}`).join(', ') || 'no breakdown available';
          const body = `SELF-IDENTIFY: I am idle but see ${rankedAgnostic} claimable item(s) I did not claim — ${reasons}. `
            + `Is that right? Do you really want me to just sit here? premise_measured_at=${measuredAt}`;
          // Injectable for tests (ctx.helpers.spawnWorkerSignal); defaults to the real fire-and-forget
          // spawn used elsewhere for auto-emitted signals (lib/hooks/auto-signal-threshold.cjs callers).
          const spawnWorkerSignal = (ctx.helpers && ctx.helpers.spawnWorkerSignal) || ((sid, sigBody) => {
            const { spawn } = require('child_process');
            const path = require('path');
            spawn(process.execPath,
              [path.join(__dirname, '..', '..', '..', 'scripts', 'worker-signal.cjs'), 'feedback', sigBody, '--severity', 'low'],
              { detached: true, stdio: 'ignore', env: { ...process.env, CLAUDE_SESSION_ID: sid } }).unref();
          });
          spawnWorkerSignal(sessionId, body);
          const nextMeta = { ...(ctx.sessionMetadata || {}), idle_self_identify_fp: fp };
          sb.from('claude_sessions').update({ metadata: nextMeta }).eq('session_id', sessionId).then(() => {}, () => {});
          ctx.sessionMetadata = nextMeta;
        }
      } catch { /* fail-open: self-identify must never block idle resolution */ }
    }

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
      const { assessCoordinatorBeltBlock, formatCoordinatorBeltBlock, BELT_VERDICT } =
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
      } else if (belt.verdict === BELT_VERDICT.NOT_MEASURED) {
        // QF-20260729-685. NOT_MEASURED carries blocked:false, so the branch above skipped it and
        // an UNREAD belt rendered byte-identically to a healthy one: same silence, no note. The
        // assessor is careful to return NOT_MEASURED rather than OK precisely so the two stay
        // distinguishable, and the message threw that distinction away at the last step.
        //
        // THE WORDING ALREADY EXISTED AND WAS UNREACHABLE. formatCoordinatorBeltBlock has had a
        // NOT_MEASURED arm since it was written ("This is NOT a healthy belt; it is an unread
        // one"), but its only production caller sat inside `if (belt.blocked)`, which
        // NOT_MEASURED can never satisfy. Tests reached that arm; production could not. So this
        // is a wiring fix, not new prose — reuse the formatter rather than restate it, or the
        // two copies drift.
        beltBlockNote = ` ⚠️  ${formatCoordinatorBeltBlock(belt)}`;
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
        // QF-20260729-685: beltBlockNote is interpolated HERE TOO, and its absence was the wider
        // half of the defect. This terminal was computing the note and then dropping it, so a
        // Fable seat never saw the belt verdict at all — not the NOT_MEASURED case this QF names,
        // and not even the loud BLOCKED_ON_COORDINATOR case the gauge was originally built to
        // surface. On this path all three states collapsed, not two.
        //
        // Measured, not inferred: this seat resolves to idle_fable_propose on every pass, and its
        // checkin output carried a fully populated belt_block object in the JSON while the message
        // beside it said nothing about the belt. The structured verdict was never the thing that
        // was missing — the rendering was.
        // QF-20260807-368 keeps its ${directiveNote} at the end. Both notes belong: theirs answers
        // "why is there no work", mine answers "someone is waiting on you". Resolving this conflict
        // by taking either side alone would have silently dropped one of two independently-measured
        // fixes to the same terminal.
        message: `No Fable-fit work on the belt (${fencedList.length} item(s) fenced as non-creative${unclassified ? `, ${unclassified} unclassified — a coordinator can set metadata.work_class_override to admit them` : ''}).${beltBlockNote} STANDING BY — per the Fable doctrine, propose a creative/design SD or await coordinator direction; do NOT pull general-harness work. Arm ScheduleWakeup(~${idleWakeupSeconds}s)${adaptiveCadenceNote} and proceed.${directiveNote}`,
      };
    }
    return {
      ...ctx.base,
      action: 'idle',
      recommended_wakeup_seconds: idleWakeupSeconds,
      message: `No assignment and nothing claimable in the examined sample. IDLE.${samplingNote}${tierNote}${beltBlockNote} The /checkin skill must now call ScheduleWakeup(~${idleWakeupSeconds}s)${adaptiveCadenceNote} and proceed — never wait on a human.${directiveNote}`,
    };
  },
};
