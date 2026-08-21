/**
 * SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001 / FR-1 — pure disposition classifier for a parked
 * chairman SMS row (lib/chairman/sms-bridge.js's parked_at/resolved_at lifecycle).
 *
 * WHY A SEPARATE, DB-FREE MODULE. 356 sms_relay_staging rows are real, verified-chairman-number
 * texts (sms-bridge.js:1040-1042 structurally guarantees this) that resolved to a PARK_OUTCOMES
 * value and were never explicitly dispositioned — including a real 2026-08-15 chairman directive
 * that sat unactioned for six days. The class is proven unsafe to presume handled, so this module
 * decides ONLY from injected evidence, never from a live DB call — the audit runner
 * (scripts/audit-parked-chairman-sms.mjs) owns fetching, this module owns the decision.
 *
 * EVIDENCE RULE: a parked row is EVIDENCE_HANDLED only if a LATER sms_inbound_log row for the
 * SAME from_phone has outcome==='answered' (created_at > row.parked_at). matched_decision_id is
 * NEVER trusted alone — per database/migrations/20260819_sms_inbound_log_considered_decision_id.sql,
 * it is diagnostic-only unless outcome IN ('answered','undone'), and the write-site fix for that
 * only applies from 2026-08-21 onward (sms-bridge.js:874) — roughly 327 pre-existing rows predate
 * it. Everything else classifies NEEDS_ADAM_REVIEW: routed to Adam, never auto-replied.
 */

/** @typedef {{id: string, from_phone: string, body_raw: string, parked_at: string}} ParkedSmsRow */
/** @typedef {{id: string, from_phone: string, outcome: string, created_at: string}} InboundLogRow */

/**
 * Classify one parked row's disposition from injected evidence. Pure — no DB access.
 * @param {ParkedSmsRow} row
 * @param {InboundLogRow[]} laterInboundLogRows - sms_inbound_log rows for row.from_phone (any order)
 * @returns {{disposition: 'EVIDENCE_HANDLED'|'NEEDS_ADAM_REVIEW', evidence: {logRowId: string, outcome: string, created_at: string}|null}}
 */
export function classifyParkedSmsDisposition(row, laterInboundLogRows = []) {
  const parkedAtMs = row?.parked_at ? new Date(row.parked_at).getTime() : NaN;
  const answered = (Array.isArray(laterInboundLogRows) ? laterInboundLogRows : [])
    .filter((r) => r && r.outcome === 'answered')
    .filter((r) => {
      const createdMs = r.created_at ? new Date(r.created_at).getTime() : NaN;
      return Number.isFinite(parkedAtMs) && Number.isFinite(createdMs) && createdMs > parkedAtMs;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (answered.length > 0) {
    const first = answered[0];
    return {
      disposition: 'EVIDENCE_HANDLED',
      evidence: { logRowId: first.id, outcome: first.outcome, created_at: first.created_at },
    };
  }
  return { disposition: 'NEEDS_ADAM_REVIEW', evidence: null };
}
