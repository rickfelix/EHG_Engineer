// CANARY CLAIM FENCE — SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E (FR-3).
//
// A canary is a PROBE session that must never acquire real work. Before this step existed, nothing
// stopped one: the self-claim fence (self-claim-gates.cjs) sits at position 13 of 17, while THREE
// acquiring tiers run ahead of it — directed-assignment (8), recover-stranded-final (10) and
// adopt-orphan (11) — and resume.cjs (6) short-circuits the whole pipeline once a session already
// holds a claim. So metadata.self_claim=false could never have been a complete canary fence, which
// is the finding this step is built on.
//
// ── WHY THIS SLOT ─────────────────────────────────────────────────────────────────────────────
// Registered adjacent to build-forbidden-guard (7), i.e. BEFORE every acquisition tier. Verified
// coverage: that position already gates 8, 10, 11, 14 (critical-qf-jump), 15 (merged-pool-self-claim)
// and 16 (self-claim-qf). The only tier it does not cover is 6 (resume) — and resume is reachable
// ONLY when the canary already holds a claim, which is precisely what this fence prevents. One step
// here is therefore materially cheaper, and easier to reason about, than gating each of the eight
// individual claim sites.
//
// ── WHY IT ACKS-AND-DECLINES INSTEAD OF JUST SHORT-CIRCUITING ─────────────────────────────────
// Returning a truthy resolution stops the pipeline (pipeline.cjs:14-22), so directed-assignment (8)
// never runs and a WORK_ASSIGNMENT aimed at this canary would sit unacked forever. That is the exact
// shape dispatch.cjs:472-481 refuses to create, citing incident b8eb6111: an assignment left
// invisible to every claim path. The canary MUST stay dispatchable — reachability is the whole point
// of a probe, and making it undispatchable (non_fleet / role=adam) would hide it from
// fleet-dashboard, rollcall, capacity-forecast and the liveness set. So it accepts the message and
// declines it explicitly, satisfying both invariants: addressable canary, no stranded assignment.
//
// The verdict reason is carried into the message deliberately. A fence that short-circuits silently
// is indistinguishable from an idle seat, and "the canary just looked idle" is how this class of
// defect hides.
//
// ── KNOWN RESIDUAL: THE RPC-SIDE CLAIM PATH (PRD AC-6 / TR-4) ─────────────────────────────────
// THIS FENCE IS CHECK-IN-SCOPED, AND THAT IS A REAL LIMIT, NOT AN OVERSIGHT. It gates the eight
// acquisition tiers that run inside the check-in pipeline. It does NOT sit inside the `claim_sd` RPC,
// so it cannot stop a claim issued by any path that calls that RPC without coming through here —
// scripts/sd-start.js run by hand, a coordinator-side directed claim, or any future caller. A canary
// that reached one of those would still take real work.
//
// Why it is accepted rather than closed here: the defence-in-depth that matters most is UPSTREAM of
// any claim path — FR-4 stamps the canary at spawn time so every consumer can identify it, and the
// canary's own loop reaches work only through check-in. Pushing the predicate into the RPC would mean
// a DB-side function reading session metadata on every claim in the fleet, which is a materially
// larger blast radius (and gated DDL) than the defect justifies today.
//
// What would change that calculus: a canary observed acquiring work while this fence reports it
// fenced. That is the signal the residual has become a live defect rather than a documented gap, and
// it is worth a follow-up SD at that point — not a silent widening of this step.
module.exports = {
  name: 'canary-claim-fence',
  async run(ctx) {
    const { sb, sessionId, sessionMetadata, sessionRole } = ctx;
    const { ws, ackMessage, isInformationalNudge, ASSIGNMENT_RECENCY_WINDOW_MS, DEFAULT_IDLE_WAKEUP_SECONDS } = ctx.helpers;

    // canary-session.js is ESM; this step is CJS. Dynamic import is the established idiom here
    // (lib/coordinator/reply-class.cjs does the same for fetch-all-paginated.mjs).
    let isCanarySession;
    try {
      ({ isCanarySession } = await import('../../fleet/canary-session.js'));
    } catch {
      // A module-resolution failure must NOT silently disable the fence. Fail CLOSED: if we cannot
      // evaluate canary-ness we do not let this session proceed to an acquisition tier.
      return {
        ...ctx.base,
        action: 'idle',
        recommended_wakeup_seconds: DEFAULT_IDLE_WAKEUP_SECONDS || 1200,
        message: 'Canary claim fence could not load its predicate — failing CLOSED and not self-claiming. This is a harness fault, not an idle seat: report it rather than waiting it out.',
      };
    }

    const verdict = await isCanarySession(sb, { sessionId, metadata: sessionMetadata });
    if (!verdict || !verdict.isCanary) return; // not a canary — fall through to the normal ladder

    // ACK-AND-DECLINE any directed WORK_ASSIGNMENT so none is stranded (incident b8eb6111).
    // Best-effort and non-fatal: failing to ack must never convert the fence into a pass-through,
    // so this is deliberately INSIDE its own try and AFTER the canary verdict.
    let declined = 0;
    try {
      const sinceIso = new Date(Date.now() - ASSIGNMENT_RECENCY_WINDOW_MS).toISOString();
      const msgs = await ws.getMessagesForSession(sb, sessionId, { unackedOnly: true, sinceIso, excludeExpired: true });
      for (const m of (msgs || [])) {
        if (m.message_type !== 'WORK_ASSIGNMENT' || isInformationalNudge(m)) continue;
        await ackMessage(sb, m.id, { role: sessionRole, messageType: m.message_type, kind: m.payload && m.payload.kind });
        declined += 1;
      }
    } catch { /* the fence stands regardless; a failed decline is reported below, never swallowed silently */ }

    const declinedNote = declined > 0
      ? ` Declined ${declined} directed WORK_ASSIGNMENT(s) explicitly so none is left unclaimed and invisible (incident b8eb6111).`
      : '';
    return {
      ...ctx.base,
      action: 'idle',
      recommended_wakeup_seconds: DEFAULT_IDLE_WAKEUP_SECONDS || 1200,
      canary_fence_reason: verdict.reason,
      message: `Canary probe session (${verdict.reason}): claim acquisition is FENCED — a canary must never take real work. All acquisition tiers (directed assignment, stranded-final recovery, orphan adoption, critical-QF jump, self-claim, QF self-claim) are skipped.${declinedNote} This session remains dispatchable and visible to the fleet on purpose; it simply does not claim.`,
    };
  },
};
