/**
 * Reply-correlation primitive — SD-LEO-INFRA-ACKSTAMP-FALSE-METRICS-C6-001.
 *
 * Closure map class C6: `acknowledged_at IS NULL` is not a reliable "unreplied"
 * signal — a reply routinely arrives as a FRESH row carrying payload.reply_to /
 * payload.correlation_id rather than an update to the original row's
 * acknowledged_at. Generalizes the correlation check already proven in
 * lib/adam/task-rehydrate.js's repliedCorr set and
 * lib/adam/stall-alert.js's isCorrelationTerminal() into one reusable primitive.
 *
 * Pure function, no I/O — callers supply the row window they already fetched.
 */

/**
 * @param {object} row
 * @param {object[]} allRows
 * @param {{ excludeKinds?: string[] }} [opts] - SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001
 *   FR-4: optional, additive, backward-compatible. When supplied, a candidate `other` row
 *   whose payload.kind is in excludeKinds is NOT counted as a correlated reply -- so a
 *   mechanical courtesy-ACK (e.g. kind='ack'/'coordinator_ack', per
 *   lib/fleet/worker-status.cjs's ADAM_EXCLUDED_KINDS) echoing the same correlation_id can
 *   never suppress the eventual genuine reply/verdict. Omitting opts (or excludeKinds)
 *   leaves behavior byte-identical to before this SD -- existing callers (fleet-dashboard,
 *   outbound-silence-watchdog, detectors) that intentionally want the broad "ANY reply"
 *   semantics are unaffected. Deliberately NOT a lane-wide dedup rewrite -- narrowly scoped
 *   per RISK sub-agent finding (no per-lane equivalence proof exists for a broader collapse).
 */
function hasCorrelatedReply(row, allRows, opts = {}) {
  if (!row || !Array.isArray(allRows)) return false;
  const ownCorrelationId = row.payload?.correlation_id || row.id;
  const excludeKinds = opts.excludeKinds;
  return allRows.some((other) => {
    if (!other || other.id === row.id) return false;
    const otherPayload = other.payload || {};
    if (excludeKinds && excludeKinds.includes(otherPayload.kind)) return false;
    return otherPayload.reply_to === row.id || otherPayload.correlation_id === ownCorrelationId;
  });
}

module.exports = { hasCorrelatedReply };
