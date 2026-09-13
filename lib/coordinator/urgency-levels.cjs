/**
 * Shared urgency-level constant for session_coordination payload.urgency.
 * SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001 (FR-1).
 *
 * The reader side (scripts/hooks/coordination-inbox.cjs) already merged via QF-20260912-269
 * and treats payload.urgency='interrupt' as an uncapped-fetch, cutMinutes:2 signal. This module
 * gives the WRITER side (lib/coordinator/dispatch.cjs) one importable source of truth instead of
 * a re-typed string literal at each call site -- the same drift already visible on the `topic`
 * field (coordinator-capacity-forecast.mjs's topic:'source_work' vs this SD's topic:'ruling',
 * with no shared enum) is the failure mode this guards against for urgency.
 */

const URGENCY_LEVELS = Object.freeze(['interrupt']);

/**
 * True only for a recognized urgency value. Never throws — null, undefined, non-strings, and
 * unrecognized strings all resolve to false so a caller can log-and-continue (fail-open),
 * matching coordination-inbox.cjs's own try/catch convention around its urgentRows fetch.
 */
function isKnownUrgency(value) {
  return typeof value === 'string' && URGENCY_LEVELS.includes(value);
}

module.exports = { URGENCY_LEVELS, isKnownUrgency };
