// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 5: pending
// WORK_ASSIGNMENT pull, fitness/terminal/not_before gates, tryClaim + ack branches, base
// breadcrumbs) — SD-ARCH-HOTSPOT-CHECKIN-001. Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
  name: 'directed-assignment',
  async run(ctx) {
    const { sb, sessionId, sessionRole } = ctx;
    const {
      ws, tryClaim, ackMessage, extractSdFromAssignment, isInformationalNudge,
      classifyDispatchIneligibility, antiWinddownDirective,
      ASSIGNMENT_RECENCY_WINDOW_MS, TERMINAL_CLAIM_ERRORS,
    } = ctx.helpers;
    // 5. pending WORK_ASSIGNMENT -> claim via claim_sd RPC
    // QF-20260703-476: unackedOnly, not unreadOnly -- see ASSIGNMENT_RECENCY_WINDOW_MS above. A
    // consumed-but-unactioned row (read_at set, acknowledged_at NULL, no claim recorded) must still
    // reach the claim step instead of being permanently hidden by an unreadOnly filter.
    let assignment = null;
    const assignmentSinceIso = new Date(Date.now() - ASSIGNMENT_RECENCY_WINDOW_MS).toISOString();
    try {
      // SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 / FR-1: excludeExpired so a TTL'd
      // WORK_ASSIGNMENT (e.g. a 1h chairman-priority dispatch) stops being pulled
      // and re-attempted for the rest of the 24h recency window once it lapses.
      const msgs = await ws.getMessagesForSession(sb, sessionId, { unackedOnly: true, sinceIso: assignmentSinceIso, excludeExpired: true });
      // QF-20260705-914: informational completion nudges are never claimable assignments.
      assignment = (msgs || []).find(m => m.message_type === 'WORK_ASSIGNMENT' && !isInformationalNudge(m));
      if (!assignment) {
        // QF-20260703-806: the unacked pull can miss a row whose acknowledged_at got stamped by a
        // path OTHER than a genuine claim outcome (the ack-before-claim race). Claim outcome, not
        // ack, is the terminal state -- widen to the same bounded window WITHOUT the ack filter.
        // The terminal/ineligible/tryClaim checks below already re-verify the target SD's LIVE
        // state and are idempotent, so resurrecting an already-genuinely-resolved row is harmless.
        const wider = await ws.getMessagesForSession(sb, sessionId, { sinceIso: assignmentSinceIso, excludeExpired: true });
        assignment = (wider || []).find(m => m.message_type === 'WORK_ASSIGNMENT' && !isInformationalNudge(m));
      }
    } catch { /* fail-open */ }
    if (assignment) {
      const sdKey = extractSdFromAssignment(assignment);
      if (sdKey) {
        // SD-LEO-FIX-CLAIM-RPC-TERMINAL-001: purge a STALE assignment whose target SD reached a
        // terminal status (completed/cancelled/deferred) AFTER the assignment was created — the
        // in_progress->terminal race. claim_sd now refuses terminal claims, but a never-ACKed
        // assignment would re-fire every tick (the "retried on every tick" symptom), so ACK it
        // here and fall through to self-claim.
        // QF-20260704-602: this strategic_directives_v2 lookup is intentionally SD-only. A
        // directed QF key (sdKey starting 'QF-') always misses here (assignedSdRow stays null),
        // which correctly skips terminalStatus/ineligibleReason below (both SD-specific concerns
        // with no QF equivalent yet) and falls straight to tryClaim() — the claim_sd RPC is
        // already QF-aware (p_sd_id LIKE 'QF-%' branches to the quick_fixes table) and does not
        // need this fetch to succeed.
        let terminalStatus = null;
        let assignedSdRow = null;
        let assignedSdFetchFailed = false;
        try {
          const { data: tgt, error: tgtErr } = await sb.from('strategic_directives_v2')
            .select('status, sd_type, sd_key, metadata, target_application').eq('sd_key', sdKey).maybeSingle();
          // QF-20260703-151: a query ERROR is distinct from a genuine not-found and must NOT be
          // silently discarded — the prior code destructured only `data`, so a failed fetch left
          // assignedSdRow=null, which the ineligibleReason ternary below then treated as "nothing
          // to check" (fail-open), admitting an orchestrator-parent / repo-mismatched SD straight
          // through to tryClaim (live-hit: SD-EHG-PRODUCT-UIUX-REMEDIATION-001, audit flag c71c3a54).
          if (tgtErr) {
            assignedSdFetchFailed = true;
          } else {
            assignedSdRow = tgt || null;
            if (tgt && ['completed', 'cancelled', 'deferred'].includes(tgt.status)) terminalStatus = tgt.status;
          }
        } catch { assignedSdFetchFailed = true; }
        // QF-20260705-429 (residual of QF-20260705-460): directed QF assignments must honor
        // quick_fixes.not_before (durable time-gated defer). The SD lookup above intentionally
        // misses for QF- keys and the claim_sd RPC never reads not_before, so without this gate
        // a directed assignment claims a deferred QF hours early (specimen: QF-20260704-348,
        // ~2.6h before its gate). Deferral is TRANSIENT: on gate, do NOT ack — the assignment
        // stays live and succeeds once not_before passes. Read error = FAIL CLOSED via
        // assignedSdFetchFailed, mirroring the QF-20260703-151 semantics above.
        // QF-20260705-115: same query also carries `status`, so a directed assignment whose QF
        // already reached a terminal status is purged HERE instead of relying on claim_sd's RPC
        // rejection to land in TERMINAL_CLAIM_ERRORS (it doesn't always -- live specimen:
        // QF-20260705-436 resurfaced 5+ checkins post-completion). Reuses `terminalStatus` so it
        // takes the SAME ack+stale_assignment_purged branch as the SD terminal case below.
        // Terminal set mirrors the existing quick_fixes staleness check at line ~1386.
        let qfDeferredUntil = null;
        if (!assignedSdFetchFailed && /^QF-/.test(sdKey)) {
          try {
            const { data: qfRow, error: qfErr } = await sb.from('quick_fixes')
              .select('status, not_before').eq('id', sdKey).maybeSingle();
            if (qfErr) {
              assignedSdFetchFailed = true;
            } else if (qfRow && ['completed', 'cancelled', 'escalated', 'closed'].includes(qfRow.status)) { // QF-20260719-702
              terminalStatus = qfRow.status;
            } else {
              const nb = qfRow && qfRow.not_before ? Date.parse(qfRow.not_before) : NaN;
              if (Number.isFinite(nb) && nb > Date.now()) qfDeferredUntil = qfRow.not_before;
            }
          } catch { assignedSdFetchFailed = true; }
        }
        // QF-20260703-091 (RCA-confirmed): mirror the self-claim paths' shared fitness/premise gate
        // (classifyDispatchIneligibility, incl. the repo-match axis) onto this DIRECTED-assignment
        // path too. Previously only sd-start.js caught a repo-mismatched directed assignment, AFTER
        // the claim had already churned (coordinator re-dispatch -> checkin claims unconditionally ->
        // sd-start releases -> repeats every tick). No tierCtx: an explicit coordinator directive
        // should not be second-guessed by the WORK-DOWN-NEVER-UP self-claim preference, only the hard
        // fitness/premise axes (repo mismatch, terminal/superseded premise, orchestrator parent, etc).
        const ineligibleReason = (!terminalStatus && assignedSdRow)
          ? classifyDispatchIneligibility(assignedSdRow, { cwd: process.cwd() })
          : null;
        if (assignedSdFetchFailed) {
          // QF-20260703-151: FAIL CLOSED — could not confirm fitness for this assignment. Never
          // ack (the assignment stays live for a retry once the transient fetch issue clears) and
          // never fall through to tryClaim on an unconfirmed target.
          ctx.base.assignment_claim_error = 'fitness_check_query_failed';
        } else if (terminalStatus) {
          await ackMessage(sb, assignment.id, { role: sessionRole, kind: assignment.payload?.kind, messageType: assignment.message_type });
          ctx.base.stale_assignment_purged = { sd: sdKey, status: terminalStatus };
        } else if (ineligibleReason) {
          await ackMessage(sb, assignment.id, { role: sessionRole, kind: assignment.payload?.kind, messageType: assignment.message_type });
          ctx.base.assignment_ineligible_purged = { sd: sdKey, reason: ineligibleReason };
        } else if (qfDeferredUntil) {
          // No ack: transient — re-attempted next tick; claims automatically once the gate passes.
          ctx.base.assignment_deferred_not_before = { qf: sdKey, not_before: qfDeferredUntil };
        } else {
          const claimed = await tryClaim(sb, sdKey, sessionId);
          if (claimed.ok) {
            await ackMessage(sb, assignment.id, { role: sessionRole, kind: assignment.payload?.kind, messageType: assignment.message_type });
            // SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 (FR-5): surface the coordinator's
            // ADVISORY effort recommendation so the worker banner can render it.
            const effortRec = assignment.payload?.effort_recommendation || null;
            return { ...ctx.base, action: 'claimed_assignment', sd: sdKey,
              ...(effortRec ? { effort_recommendation: effortRec, effort_recommendation_reason: assignment.payload?.effort_recommendation_reason || null } : {}),
              message: `Claimed assigned ${sdKey} via claim_sd.${effortRec ? ` Recommended effort: ${effortRec} (advisory).` : ''} Run: node scripts/sd-start.js ${sdKey}. ${antiWinddownDirective(ctx.base.belt_ranked_claimable)}` };
          }
          // QF-20260703-780: a terminal-class RPC verdict means this assignment can NEVER
          // succeed (unlike e.g. claimed_by_live_peer, which may resolve next tick) -- ack it
          // now so it stops being re-selected, mirroring the stale_assignment_purged /
          // assignment_ineligible_purged branches above. Distinct breadcrumb so callers can
          // tell "permanently resolved" apart from assignment_claim_error's "retryable" meaning.
          if (TERMINAL_CLAIM_ERRORS.has(claimed.error)) {
            await ackMessage(sb, assignment.id, { role: sessionRole, kind: assignment.payload?.kind, messageType: assignment.message_type });
            ctx.base.assignment_claim_terminal_purged = { sd: sdKey, error: claimed.error };
          } else {
            // could not claim the assigned SD -> fall through to self-claim
            ctx.base.assignment_claim_error = claimed.error;
          }
        }
      }
    }
  },
};
