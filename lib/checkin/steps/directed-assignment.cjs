// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 5: pending
// WORK_ASSIGNMENT pull, fitness/terminal/not_before gates, tryClaim + ack branches, base
// breadcrumbs) — SD-ARCH-HOTSPOT-CHECKIN-001. Only edits: locals -> ctx.* + helper destructuring.
// SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-1) — the WORK_ASSIGNMENT lane of the receipt
// contract. Safe as a top-level require: receipt-ledger.cjs imports nothing.
const { recordReceipt, LANES, STATES, DISPOSITIONS } = require('../../coordination/receipt-ledger.cjs');
// SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 (FR-3): claim-time premise-freshness verdict. This file
// previously carried ZERO handling of an instruction body — the prose a worker acts on was never
// inspected, bounded or re-validated, while every 'freshness' check on the dispatch path measured
// the RECIPIENT. Safe as a top-level require: premise-freshness.cjs imports nothing.
const { assessInstructionPremise, PREMISE_FRESHNESS_BOUND_MS } = require('../../coordination/premise-freshness.cjs');
// SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-LANES-001 (FR-1): the SAME shared completability predicate
// dispatch.cjs's assertSdDispatchable uses (FR-4). classifyDispatchIneligibility below refuses
// orchestrator_parent regardless of payload.kind -- assertSdDispatchable's exception only gates
// WA *creation* on the coordinator side; this worker-side CLAIM step is a second, independent
// consumer of the same classifier (named explicitly by TESTING finding TST-C3, evidence 00ae2ac0)
// and needs its own symmetric exception, or a parent_completion assignment would be created
// successfully and then immediately declined/purged here.
const { checkParentCompletable } = require('../../fleet/orchestrator-completion.cjs');

module.exports = {
  name: 'directed-assignment',
  async run(ctx) {
    const { sb, sessionId, sessionRole } = ctx;
    const {
      ws, tryClaim, stampDirectedAssignment, ackMessage, extractSdFromAssignment, isInformationalNudge,
      classifyDispatchIneligibility, antiWinddownDirective,
      ASSIGNMENT_RECENCY_WINDOW_MS, TERMINAL_CLAIM_ERRORS,
    } = ctx.helpers;
    // 5. pending WORK_ASSIGNMENT -> claim via claim_sd RPC
    // QF-20260703-476: unackedOnly, not unreadOnly -- see ASSIGNMENT_RECENCY_WINDOW_MS above. A
    // consumed-but-unactioned row (read_at set, acknowledged_at NULL, no claim recorded) must still
    // reach the claim step instead of being permanently hidden by an unreadOnly filter.
    let assignment = null;
    const assignmentSinceIso = new Date(Date.now() - ASSIGNMENT_RECENCY_WINDOW_MS).toISOString();

    // SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (FR-8 + FR-7): pick the newest CLAIMABLE
    // assignment, not merely the newest one.
    //
    // Rows arrive newest-first (worker-status.cjs orders {ascending:false}), and this used to
    // stop at the first non-nudge WORK_ASSIGNMENT. If that row's target could not be resolved,
    // the branch below was skipped entirely — and because the row stays unacked, it was picked
    // again on every subsequent tick. One unreadable row therefore shadowed every good dispatch
    // to that seat indefinitely. The coordinator hit this while clearing the incident that
    // produced this SD and had to ack two inert rows by hand before a corrected dispatch landed.
    //
    // Skipping is also never silent (FR-7): a WORK_ASSIGNMENT exists solely to carry a target,
    // so failing to find one is always worth saying out loud. That silence is why three
    // instances of this defect went undiagnosed.
    const pickClaimable = (rows) => {
      const skipped = [];
      for (const m of (rows || [])) {
        if (m.message_type !== 'WORK_ASSIGNMENT' || isInformationalNudge(m)) continue;
        if (extractSdFromAssignment(m)) return { picked: m, skipped };
        skipped.push(m);
      }
      return { picked: null, skipped };
    };
    const reportSkipped = (skipped) => {
      for (const m of skipped) {
        try {
          console.warn(JSON.stringify({
            event: 'checkin.assignment_target_unresolvable',
            message_id: m.id,
            payload_keys: m.payload && typeof m.payload === 'object' ? Object.keys(m.payload) : [],
            subject: String(m.subject || '').slice(0, 120),
            note: 'skipped as unclaimable; continuing to older assignments instead of stopping here'
          }));
        } catch { /* logging must never break the claim path */ }
      }
    };
    try {
      // SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 / FR-1: excludeExpired so a TTL'd
      // WORK_ASSIGNMENT (e.g. a 1h chairman-priority dispatch) stops being pulled
      // and re-attempted for the rest of the 24h recency window once it lapses.
      const msgs = await ws.getMessagesForSession(sb, sessionId, { unackedOnly: true, sinceIso: assignmentSinceIso, excludeExpired: true });
      // QF-20260705-914: informational completion nudges are never claimable assignments.
      { const r = pickClaimable(msgs); assignment = r.picked; reportSkipped(r.skipped); }
      if (!assignment) {
        // QF-20260703-806: the unacked pull can miss a row whose acknowledged_at got stamped by a
        // path OTHER than a genuine claim outcome (the ack-before-claim race). Claim outcome, not
        // ack, is the terminal state -- widen to the same bounded window WITHOUT the ack filter.
        // The terminal/ineligible/tryClaim checks below already re-verify the target SD's LIVE
        // state and are idempotent, so resurrecting an already-genuinely-resolved row is harmless.
        const wider = await ws.getMessagesForSession(sb, sessionId, { sinceIso: assignmentSinceIso, excludeExpired: true });
        // Same claimability filter on the widened pull — a row that is unreadable in the unacked
        // set is equally unreadable here, and stopping on it would re-create the shadow.
        { const r = pickClaimable(wider); assignment = r.picked; }
      }
    } catch { /* fail-open */ }
    if (assignment) {
      const sdKey = extractSdFromAssignment(assignment);
      if (sdKey) {
        /**
         * FR-1: ack AND record, through ONE door.
         *
         * MEASURED BEFORE THIS CHANGE: 116 WORK_ASSIGNMENT rows in the retention window, ZERO with
         * acknowledged_at, ZERO receipts on this lane. The coordinator's first-hand finding was that
         * a fulfilled assignment is never stamped even when the target seat claims AND ships it — so
         * the lane's answered-rate was not low, it was unwritten, which reads identically to
         * "no assignment was ever answered".
         *
         * WRAPPING ackMessage RATHER THAN ADDING FOUR RECEIPT BLOCKS IS THE POINT. This file has four
         * distinct ack branches (stale-purge, ineligible-purge, claimed, terminal-claim-purge) and
         * they were added at different times by different SDs. Four copies of a receipt call is four
         * chances to add a fifth ack branch later and forget one — which is precisely how this lane,
         * and the contract enumerating it, ended up half-wired in the first place. One door makes
         * "acked but unrecorded" hard to write by accident.
         *
         * Non-fatal and after the ack, matching the other lanes: the ack stands regardless. A lost
         * receipt under-counts answers, the safe direction.
         */
        const ackWithReceipt = async (disposition, extra) => {
          const ack = await ackMessage(sb, assignment.id, { role: sessionRole, kind: assignment.payload?.kind, messageType: assignment.message_type });
          // A RECEIPT ASSERTS A TRANSITION HAPPENED, so it is gated on the ack ACTUALLY landing —
          // the same asymmetry adam-advisory-store.cjs already had via `if (!error)`, which this
          // lane could not express until ackMessage returned a verdict.
          //
          // TWO PROVEN FAILURES THIS CLOSES (SECURITY, by execution):
          //  1. A failed ack UPDATE wrote a disposal anyway (acked=0, receipts=1) — and because the
          //     row stays unacked it is re-selected next tick and receipts AGAIN, once per
          //     check-in, unbounded. Nothing dedupes at the DB.
          //  2. An adam-role session stamps read_at ONLY by design, and got a DISPOSED receipt for
          //     it — recording "delivered" as "answered", which is verbatim the defect this SD
          //     exists to remove, reintroduced inside the lane meant to measure it.
          if (!ack || ack.acknowledged !== true) {
            if (ack && ack.reason) console.error('NOTE: no work_assignment receipt — ack did not land (' + ack.reason + ').');
            return;
          }
          const r = await recordReceipt(sb, {
            coordinationId: assignment.id,
            lane: LANES.WORK_ASSIGNMENT,
            state: STATES.DISPOSED,
            disposition,
            actorSession: sessionId,
            actorRole: sessionRole || 'worker',
            isRetention: false,
            sourceCreatedAt: assignment.created_at,
            nowMs: Date.now(),
            metadata: { sd: sdKey, ...(extra || {}), via: 'checkin/directed-assignment' },
          });
          if (!r.ok) console.error('NOTE: work_assignment receipt skipped (' + (r.error || r.skipped) + ') — ack still stands.');
        };
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
            .select('id, status, sd_type, sd_key, metadata, target_application').eq('sd_key', sdKey).maybeSingle();
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
        let ineligibleReason = (!terminalStatus && assignedSdRow)
          ? classifyDispatchIneligibility(assignedSdRow, { cwd: process.cwd() })
          : null;
        // SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-LANES-001 (FR-1): symmetric exception to FR-4's
        // dispatch.cjs one. NARROW on purpose: only payload.kind==='parent_completion', only when
        // the classifier's verdict is specifically orchestrator_parent (never overrides any other
        // ineligibility reason), and only when independently re-verified completable -- never
        // fail-open on a could-not-check or not-completable result.
        if (ineligibleReason === 'orchestrator_parent' && assignment.payload?.kind === 'parent_completion' && assignedSdRow) {
          try {
            const check = await checkParentCompletable(sb, { id: assignedSdRow.id, sd_key: sdKey, status: assignedSdRow.status });
            if (!check.couldNotCheck && check.completable) {
              ineligibleReason = null;
            }
          } catch { /* leave ineligibleReason as orchestrator_parent -- never fail-open on a thrown check */ }
        }
        if (assignedSdFetchFailed) {
          // QF-20260703-151: FAIL CLOSED — could not confirm fitness for this assignment. Never
          // ack (the assignment stays live for a retry once the transient fetch issue clears) and
          // never fall through to tryClaim on an unconfirmed target.
          ctx.base.assignment_claim_error = 'fitness_check_query_failed';
        } else if (terminalStatus) {
          await ackWithReceipt(DISPOSITIONS.SUPERSEDED, { purge: 'stale_target_terminal', status: terminalStatus });
          ctx.base.stale_assignment_purged = { sd: sdKey, status: terminalStatus };
        } else if (ineligibleReason) {
          await ackWithReceipt(DISPOSITIONS.DECLINED, { purge: 'ineligible', reason: ineligibleReason });
          ctx.base.assignment_ineligible_purged = { sd: sdKey, reason: ineligibleReason };
        } else if (qfDeferredUntil) {
          // No ack: transient — re-attempted next tick; claims automatically once the gate passes.
          ctx.base.assignment_deferred_not_before = { qf: sdKey, not_before: qfDeferredUntil };
        } else {
          const claimed = await tryClaim(sb, sdKey, sessionId);
          if (claimed.ok) {
            await ackWithReceipt(DISPOSITIONS.ACTIONED, { fulfilled: true });
            // QF-20260727-978: this branch IS the directed-dispatch path, so it is the honest
            // site to stamp the marker the coordinator-health gauge reads (see
            // stampDirectedAssignment in scripts/worker-checkin.cjs for why it had no writer).
            // SD-only by construction: assignedSdRow is null for QF- keys, which is exactly the
            // population limit deriveDispatchReasons now names. Fail-open — a bookkeeping write
            // must never turn a good claim into a failed one.
            if (assignedSdRow) {
              try { await stampDirectedAssignment(sdKey); } catch { /* fail-open */ }
            }
            // SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 (FR-5): surface the coordinator's
            // ADVISORY effort recommendation so the worker banner can render it.
            const effortRec = assignment.payload?.effort_recommendation || null;
            // SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 (FR-3): claim-time is the moment the worker
            // is about to act on the instruction, so it is where a stale or unstamped premise
            // must stop reading as current fact. The directive LEADS the message — a caveat
            // trailing the instruction lands where attention no longer is. Fresh premises and
            // instruction-less assignments add zero noise. The verdict is computed HERE, at
            // read-time, never persisted at dispatch — a persisted verdict would itself go stale.
            const premise = assessInstructionPremise(assignment.payload, Date.now());
            return { ...ctx.base, action: 'claimed_assignment', sd: sdKey,
              ...(effortRec ? { effort_recommendation: effortRec, effort_recommendation_reason: assignment.payload?.effort_recommendation_reason || null } : {}),
              ...(premise.directive ? { premise_reverify: { verdict: premise.verdict, measured_at: premise.measuredAt, bound_ms: PREMISE_FRESHNESS_BOUND_MS } } : {}),
              message: `${premise.directive ? `${premise.directive} ` : ''}Claimed assigned ${sdKey} via claim_sd.${effortRec ? ` Recommended effort: ${effortRec} (advisory).` : ''} Run: node scripts/sd-start.js ${sdKey}. ${antiWinddownDirective(ctx.base.belt_ranked_claimable)}` };
          }
          // QF-20260703-780: a terminal-class RPC verdict means this assignment can NEVER
          // succeed (unlike e.g. claimed_by_live_peer, which may resolve next tick) -- ack it
          // now so it stops being re-selected, mirroring the stale_assignment_purged /
          // assignment_ineligible_purged branches above. Distinct breadcrumb so callers can
          // tell "permanently resolved" apart from assignment_claim_error's "retryable" meaning.
          if (TERMINAL_CLAIM_ERRORS.has(claimed.error)) {
            await ackWithReceipt(DISPOSITIONS.DECLINED, { purge: 'claim_terminal', error: claimed.error });
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
