/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-E — the INBOUND SLA watcher.
 *
 * ── THE DIRECTION, WHICH PLAN SETTLED BY MEASUREMENT ────────────────────────────────────────
 * The SD scope said this "reduces to a window parameter" because checkAndPingOverdueReplies
 * already exists. Measured at lib/coordinator/reply-class.cjs:203, that sweep selects
 * `target_session` from rows THIS session SENT and pings the target — it answers
 * "I ASKED AND NOBODY ANSWERED". An inbox-SLA watcher answers the inverse: "SOMEONE ASKED ME
 * AND I HAVE NOT ANSWERED". Same table, same window, DIFFERENT POPULATION. Reusing the sender
 * sweep for the inbound direction would produce a working watcher aimed at the wrong side, and
 * it would look correct in review — which is why TS-7 pins the direction explicitly.
 *
 * WHAT IS REUSED AND WHAT IS NOT. findOverdueReplyNeeded is PURE and direction-agnostic: it
 * filters rows on reply_class / reply_expected_by / ping_sent_at without caring who sent them.
 * So the DIRECTION LIVES IN THE CANDIDATE QUERY, NOT THE PREDICATE. This module supplies
 * recipient-scoped rows and reuses the predicate and computeReplyExpectedBy untouched (TR-3) —
 * a second window definition is exactly the sibling-drift that lib/fleet/belt-depth.cjs exists
 * to abolish.
 *
 * ── NO LIVENESS GATE, AND THAT IS DELIBERATE ────────────────────────────────────────────────
 * The SD scope says "while Adam is engaged". PLAN struck that phrase on the evidence of a
 * shipped sibling, lib/adam/inbound-backlog-watchdog.js:
 *   "NO liveness gate. The mirror skips targets without a fresh heartbeat; for INBOUND, 'no
 *    live Adam session' is the WORST backlog condition, not an exemption — the witnessed
 *    incident had Adam's recurring loops dead overnight. The gate is INVERTED by simply not
 *    having one."
 * A liveness gate here disarms the watcher in precisely the incident it exists to catch. There
 * is therefore no heartbeat predicate anywhere in this file, and TS-6 drives it with ZERO live
 * sessions to prove the absence is real rather than incidental.
 */
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { findOverdueReplyNeeded } = require_('../coordinator/reply-class.cjs');

/**
 * Rows addressed TO `sessionId` that are overdue for a reply FROM it.
 *
 * @param {object} supabase
 * @param {string} sessionId  the seat whose INBOX is being measured
 * @param {{nowMs?:number, answeredCorrelationIds?:Set<string>}} [opts]
 * @returns {Promise<{overdue:object[], scanned:number}>}
 */
export async function findInboundOverdue(supabase, sessionId, opts = {}) {
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    throw new TypeError(`[inbox-sla] sessionId must be a non-empty string, received ${JSON.stringify(sessionId)}`);
  }

  // THE DIRECTION, expressed as the one filter that distinguishes it: target_session, not
  // sender_session. Everything else about the sweep is identical to the outbound one, which is
  // why the two are so easy to confuse and why this line carries the whole distinction.
  //
  // NOTE the absence: there is no join to claude_sessions and no heartbeat filter. See header.
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, target_session, sender_session, subject, payload, created_at')
    .eq('target_session', sessionId);

  if (error) throw new Error(`[inbox-sla] DB error scanning inbox for ${sessionId}: ${error.message}`);

  const rows = data || [];
  const overdue = findOverdueReplyNeeded(rows, opts.nowMs ?? Date.now(), opts.answeredCorrelationIds);
  return { overdue, scanned: rows.length };
}

/**
 * Shape an overdue inbound row as a stall the ladder can rung.
 *
 * `ticks` is supplied by the caller (the sweep owns tick accounting); this only adapts shape.
 */
export function asStall(row, ticks) {
  return {
    id: row.id,
    stall_type: 'inbox_sla',
    owner: row.target_session,
    ticks,
    asked_by: row.sender_session,
    subject: row.subject,
    expected_by: row?.payload?.reply_expected_by ?? null,
  };
}
