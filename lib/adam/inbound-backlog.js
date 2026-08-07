/**
 * Adam INBOUND-backlog selector + classifier — SD-LEO-INFRA-ADAM-INBOUND-BACKLOG-WATCHDOG-001.
 *
 * WITNESSED 2026-07-25: unacked inbound rows accumulated in the Adam lane while the
 * quiet-tick reported inbox counts of 1-5. Seven were substantial Solomon/coordinator
 * verdicts Adam never read; one reported that the CP3 hold and do_not_auto_dispatch flags
 * were INERT, leaving the chairman #1 item printing AVAILABLE FOR CLAIM while rank-4
 * workers arrived — an unsupervised-activation risk unacknowledged for ~7h.
 *
 * ROOT CAUSE: scripts/adam-quiet-tick.mjs surfaceInboxItems applies hasCorrelatedReply,
 * which suppresses any row belonging to a correlation chain Adam PARTICIPATED IN. Measured
 * on live data: 0 rows suppressed with an inbound-only window, 22/43 (51%) once Adam-SENT
 * rows enter the correlation window. So the tick reliably shows NEW traffic and reliably
 * HIDES ANSWERS TO ADAM'S OWN QUESTIONS.
 *
 * THIS MODULE IS THE SSOT for "unacked inbound row for Adam". It is consumed by BOTH the
 * cron watchdog and the quiet-tick, so their counts agree BY CONSTRUCTION rather than by
 * numeric reconciliation — criterion 3 is a RECURRENCE of
 * SD-LEO-INFRA-SESSION-COORDINATION-LANE-002, which closed claiming "ONE unified
 * consumption semantics across every role inbox" and did not achieve it.
 *
 * DELIBERATE NON-MIRRORS of lib/adam/outbound-silence-watchdog.js:
 *   - NEVER calls hasCorrelatedReply. Participation in a chain is NOT discharge of the ack
 *     obligation. A literal mirror ships GREEN and stays 51%-blind to its own regression rows.
 *   - No liveness gate. The mirror requires a live target; for INBOUND, "no live Adam" is the
 *     WORST backlog condition, not an exemption (SD criterion 4).
 *   - No probe emission. An inbound probe addressed to Adam would enter the very lane this
 *     measures; live precedent solomon_ledger_pending_resurface is already linted as
 *     resurface_dedup_drift by lib/coordination/lane-lint-gauge.cjs:24-28. Callers escalate
 *     via emitFeedback only and perform ZERO session_coordination writes.
 *   - No bare .limit(). session_coordination is ~3.8k rows and the PostgREST 1000-row cap
 *     makes length-counts lie.
 *
 * Boundary vs SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001: C6 ratified "no consumer keys
 * SLA/breach on bare ack-null" for METRIC consumers only, explicitly NOT the inbox-processing
 * contract. SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001 ratified `acknowledged_at IS NULL`
 * as the universal INBOUND recoverable-tier predicate. This module is inbound, so it is
 * consistent with both — not a C6 regression.
 */

import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
import { ADAM_EXCLUDED_KINDS, DRAIN_SETS } from '../fleet/worker-status.cjs';

/** Mirrored thresholds (lib/adam/outbound-silence-watchdog.js:31-32). Bimodal, same as the source. */
export const UNREAD_BREACH_MS = 30 * 60 * 1000;
export const UNACKED_BREACH_MS = 60 * 60 * 1000;

/**
 * Retention floor for the evidence this alarm depends on. CORRECTED at PLAN — the earlier
 * "min(read_at+7d, created_at+14d)" formulation was wrong. The cleanup RPC predicate
 * (database/migrations/20260713_fix_cleanup_expired_coordination_where_clause.sql:33-37) is a
 * CONJUNCTION: expires_at < now() AND (acknowledged_at IS NOT NULL OR (read_at IS NOT NULL
 * AND read_at <= now() - interval '7 days')). So deletion time is MAX(expires_at, read_at+7d)
 * and ONLY for rows where read_at IS NOT NULL. Rows with read_at NULL are never reaped by that
 * RPC — their path is convergeAckTTL stamping acknowledged_at at ACK_TTL_DAYS=14, after which
 * the first branch applies. 7d is therefore the TIGHTEST component, binding on the
 * read-but-unacked subset only. Breach thresholds must stay far below it (asserted by TS-17).
 */
export const EVIDENCE_FLOOR_MS = 7 * 24 * 60 * 60 * 1000;

function toMs(ts) { const n = ts ? Date.parse(ts) : NaN; return Number.isFinite(n) ? n : 0; }

/**
 * Pure: the DERIVED two-part exclusion set. Decided at PLAN (TR-4) rather than deferred.
 *
 * Half 1 — ADAM_EXCLUDED_KINDS: terminal acknowledgements nobody ever acks. Its docstring in
 * lib/fleet/worker-status.cjs states these "must NEVER drain, list, or count in the
 * acknowledged_at IS NULL recovery tier".
 * Half 2 — kinds absent from DRAIN_SETS.adam: structurally undrainable in this lane. Live
 * 2026-07-25: solomon_ledger_pending_resurface was 12 of 54 unacked rows, is NOT in
 * DRAIN_SETS.adam, and is CONTINUOUSLY REPLENISHED on a GHA schedule — age-of-oldest over an
 * unfiltered set would pin the alarm ON from day one, permanently (alert fatigue -> muted
 * alarm -> worse than no watchdog).
 *
 * DERIVED, not hand-listed, so it self-heals as the drain-set registry evolves. Both halves are
 * IMPORTED and never re-declared. Excluding half 2 would otherwise hide a real drain-set gap,
 * so callers MUST emit a distinct `undrained_kind_in_lane` signal for it (see
 * partitionUndrained).
 */
export function isExcludedKind(kind) {
  if (kind == null || kind === '') return false; // untyped rows are real backlog, not excluded
  if (ADAM_EXCLUDED_KINDS.includes(kind)) return true;
  const adamDrainSet = DRAIN_SETS && DRAIN_SETS.adam;
  if (Array.isArray(adamDrainSet) && !adamDrainSet.includes(kind)) return true;
  return false;
}

/**
 * QF-20260727-934: kinds whose absence from DRAIN_SETS.adam has been REVIEWED and ACCEPTED.
 *
 * THE PROBLEM THIS SOLVES: the `undrained_kind_in_lane` signal exists so a drain-set gap
 * cannot hide silently. But a gap that is PERMANENT AND DELIBERATE re-fires forever — it
 * alarms every tick, auto-promotes at x3 into a high-severity QF, and consumes a worker seat
 * that can do nothing about it, because the "gap" is the intended design. Three identical
 * firings (2026-07-25/26/27) promoted into this QF; the underlying exclusion was correct
 * every time. An alarm nobody can ever action is how a lane teaches its readers to ignore it.
 *
 * WHY NOT JUST ADD THESE TO ADAM_EXCLUDED_KINDS (the one-line option): that set is consumed
 * by scripts/adam-advisory.cjs, where ADAM_INBOX_KINDS subtracts it from Adam's ACTUAL inbox
 * (:453), and by lib/coordination/lane-lint-gauge.cjs (:108). The solomon_ledger_* rows are
 * Adam's disposition queue, not terminal acknowledgements — filing them as "terminal-by-design"
 * would delete them from the surfaces Adam reads. That is a worse bug than the alarm.
 *
 * WHY THIS IS NOT THE "ALLOWLIST INSIDE A DETECTOR" ANTI-PATTERN: this detector's job is to
 * surface UNKNOWN gaps for triage, not to gate a destructive or safety-critical action. A
 * reviewed, justified declaration IS the intended resolution for a triage signal. An unlisted
 * kind still alarms exactly as before, so the signal keeps its whole purpose — it just stops
 * re-reporting the answers somebody already gave.
 *
 * ADDING TO THIS LIST IS A DECISION, NOT A SILENCER. Each entry must say why the kind is
 * legitimately undrainable in the Adam lane. If a kind SHOULD be drained, put it in
 * DRAIN_SETS.adam instead — do not park it here.
 */
export const ACKNOWLEDGED_UNDRAINABLE_KINDS = Object.freeze([
  // Continuously replenished by .github/workflows/solomon-ledger-resurface-cron.yml (twice
  // hourly). Deliberately absent from DRAIN_SETS.adam so age-of-oldest cannot be pinned ON
  // permanently by a self-refilling queue — the rationale documented at :68-78 above.
  // Adam still SEES these (they are not in ADAM_EXCLUDED_KINDS); they are simply not part of
  // the generic drain, and their staleness is owned by lib/coordination/lane-lint-gauge.cjs's
  // resurface_dedup_drift check rather than by this backlog watchdog.
  'solomon_ledger_pending_resurface',
  // The batched digest form of the same producer (scripts/solomon-ledger-pending-resurface.cjs
  // DIGEST_KIND). Same lane, same owner, same rationale — listed explicitly rather than
  // prefix-matched so a NEW solomon_ledger_* kind still alarms and gets triaged.
  'solomon_ledger_pending_digest',
]);

/** Pure: split excluded rows into the two halves so callers can alarm on them differently. */
export function partitionUndrained(rows) {
  const undrainedKinds = new Set();
  for (const r of (rows || [])) {
    const kind = r && r.payload && r.payload.kind;
    if (kind == null || kind === '') continue;
    if (ADAM_EXCLUDED_KINDS.includes(kind)) continue; // terminal-by-design, not a gap
    // QF-20260727-934: reviewed-and-accepted absence — a decided gap, not an undiscovered one.
    if (ACKNOWLEDGED_UNDRAINABLE_KINDS.includes(kind)) continue;
    const adamDrainSet = DRAIN_SETS && DRAIN_SETS.adam;
    if (Array.isArray(adamDrainSet) && !adamDrainSet.includes(kind)) undrainedKinds.add(kind);
  }
  return { undrainedKinds: [...undrainedKinds].sort() };
}

/**
 * Pure: is this inbound row an unacked breach at nowMs?
 *
 * Bimodal exactly like the mirror (outbound-silence-watchdog.js:61-63) — note that
 * read_at-NULL is the MAJORITY branch on live data (30 of 54 rows at 2026-07-25), which the
 * PRD's original test set left entirely uncovered.
 *
 * NOTE the two deliberate divergences from the mirror:
 *   - NO hasCorrelatedReply call.
 *   - payload.auto_acked is NOT treated as converged: convergeAckTTL stamps acknowledged_at at
 *     14d on rows nobody ever actioned, which would otherwise let the alarm silently CLEAR
 *     because retention retired the evidence.
 */
export function isBreaching(row, nowMs) {
  if (!row) return false;
  if (isExcludedKind(row.payload && row.payload.kind)) return false;
  if (row.acknowledged_at && !(row.payload && row.payload.auto_acked === true)) return false;
  if (!row.read_at) return (nowMs - toMs(row.created_at)) >= UNREAD_BREACH_MS;
  return (nowMs - toMs(row.read_at)) >= UNACKED_BREACH_MS;
}

/**
 * Pure: the backlog verdict. Keys on AGE OF OLDEST breaching row — never count-within-window,
 * never correlation state (SD criterion 1).
 *
 * `oldestAgeMs` is computed over the FILTERED set. This matters: an implementation that filters
 * the breach predicate but computes age over the UNFILTERED set would still fire correctly while
 * reporting a permanently-wrong age — which then also defeats dedup, because a description
 * embedding a moving age changes the emitFeedback hash every tick (the live 66-row
 * fleet_dormancy storm, lib/governance/emit-feedback.js:205-218). TS-8 pins this.
 */
export function classifyBacklog(rows, nowMs) {
  const breaching = (rows || []).filter((r) => isBreaching(r, nowMs));
  let oldest = null;
  for (const r of breaching) {
    const ref = r.read_at ? toMs(r.read_at) : toMs(r.created_at);
    if (!oldest || ref < oldest.ref) oldest = { ref, row: r };
  }
  return {
    breaching: breaching.length > 0,
    breachingCount: breaching.length,
    oldestAgeMs: oldest ? nowMs - oldest.ref : 0,
    oldestRowId: oldest ? oldest.row.id : null,
    rawBacklogCount: (rows || []).length,
    ...partitionUndrained(rows)
  };
}

/**
 * IO: fetch every unacked inbound row for EVERY historical role=adam session id.
 *
 * Scoped over ALL historical ids, not just the live-elected one: lib/coordinator/adam-identity.cjs
 * retargets only `sender_type='coordinator'` rows, so with a live distribution of solomon/
 * coordinator/sweep roughly 63% of rows would strand at a retired session_id across a role
 * handoff. Currently masked in production because only ONE historical role=adam session exists —
 * this bites at the next handoff (TS-11).
 *
 * FAIL-OPEN: never throws. Returns { rows, error } so a caller can exit with the INFRA code
 * rather than a false BREACH.
 */
export async function fetchInboundBacklog(supabase, adamSessionIds) {
  const ids = (adamSessionIds || []).filter(Boolean);
  if (!ids.length) return { rows: [], error: null };
  try {
    // maxRows is a DECLARED sampling cap, not the silent server clamp this module exists to
    // avoid (security-agent 5c5d559a SEC-6). It matters because adam-quiet-tick now calls this
    // selector on EVERY tick, at higher frequency than the */30 cron.
    //
    // Truncation safety, scoped precisely (the first draft of this comment overclaimed): the query
    // is ordered created_at ASCENDING, so head-truncation retains the OLDEST rows and the verdict
    // is unaffected FOR THE created_at BRANCH of classifyBacklog's ref. For the read_at-SET
    // branch, ordering on created_at does NOT bound read_at, so a dropped recent row could in
    // principle carry a lower ref than every retained row. That requires >20000 unacked rows on a
    // ~3.8k-row table AND every retained breaching row freshly read. The degradation direction is
    // UNDERSTATING age, never a false alarm (testing-agent 61d1a6e2).
    // queryFactory takes NO args and must NOT pre-range — fetchAllPaginated applies .range()
    // itself (lib/db/fetch-all-paginated.mjs:21-22,38). It must also return a FRESH builder per
    // call, because supabase builders are single-use.
    const rows = await fetchAllPaginated(() => supabase
      .from('session_coordination')
      .select('id, target_session, sender_type, message_type, subject, payload, created_at, read_at, acknowledged_at, expires_at')
      .in('target_session', ids)
      // NOT a bare `.is('acknowledged_at', null)`. isBreaching deliberately does not treat an
      // auto_acked row as converged — convergeAckTTL
      // (lib/retention/session-coordination-ack-convergence.js) stamps acknowledged_at AND
      // payload.auto_acked together at ACK_TTL_DAYS=14 on rows nobody ever actioned. With a bare
      // null-filter those rows are dropped SERVER-SIDE, so that protection could never fire and
      // the alarm would silently clear because retention retired the evidence — this SD's own
      // defect class, inside this module (validation-agent 3e9dbf0d V-2). The disjunction keeps
      // them reachable so the classifier, not the query, decides.
      .or('acknowledged_at.is.null,payload->>auto_acked.eq.true')
      .order('created_at', { ascending: true }), { maxRows: 20000 });
    return { rows: rows || [], error: null };
  } catch (e) {
    return { rows: [], error: e && e.message ? e.message : String(e) };
  }
}
