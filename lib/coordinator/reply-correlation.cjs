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

function hasCorrelatedReply(row, allRows) {
  if (!row || !Array.isArray(allRows)) return false;
  const ownCorrelationId = row.payload?.correlation_id || row.id;
  return allRows.some((other) => {
    if (!other || other.id === row.id) return false;
    const otherPayload = other.payload || {};
    return otherPayload.reply_to === row.id || otherPayload.correlation_id === ownCorrelationId;
  });
}

module.exports = { hasCorrelatedReply };
