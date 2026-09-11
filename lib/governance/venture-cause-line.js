/**
 * Venture cause-line renderer — SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001 FR-5.
 *
 * PURE (data-in / string-out), mirroring `lib/governance/venture-build-status.mjs`'s own
 * pure/IO split so the rendering rule is unit-testable with zero DB or network access.
 *
 * THREE-STATE CONTRACT (DESIGN evidence 1a71cf03, closing RISK finding R3): a leg — or the
 * whole `captured_cause` — that genuinely found nothing (absent:false, item_count:0) must
 * render text DISTINCT from one that could not be captured at all (absent:true). Collapsing
 * the two would defeat the SD's purpose: a RED walk with real evidence available would read
 * identically to one where the harness never even tried.
 *
 * Output is a single ASCII line, no markdown, no line breaks, <=160 chars — both
 * `scripts/adam-exec-summary.mjs` and `scripts/adam-decision-email.mjs` render into escaped
 * HTML plus a plain-text fallback, so anything richer than plain text would corrupt one path
 * or the other.
 */

const MAX_LINE_CHARS = 160;
const LEG_LABELS = Object.freeze({
  worker_logs: 'worker logs',
  venture_errors: 'venture errors',
  d1_failures: 'D1 failures',
});

/**
 * @param {object|null|undefined} capturedCause - the FR-1 `captured_cause` object, or
 *   absent entirely (a step/walk that never captured anything — distinct from every leg
 *   individually reporting absent:true, see below).
 * @returns {string} a single-line, <=160 char ASCII rendering
 */
export function formatCauseLine(capturedCause) {
  if (!capturedCause || typeof capturedCause !== 'object') {
    return 'cause: not captured for this walk';
  }

  const { worker_logs, venture_errors, d1_failures, summary } = capturedCause;
  const legs = { worker_logs, venture_errors, d1_failures };
  const legNames = Object.keys(legs);
  const knownLegs = legNames.filter((k) => legs[k] && typeof legs[k] === 'object');

  if (knownLegs.length === 0) {
    return 'cause: not captured for this walk';
  }

  const allAbsent = knownLegs.every((k) => legs[k].absent === true);
  if (allAbsent) {
    const reasons = knownLegs
      .map((k) => legs[k].absent_reason)
      .filter(Boolean);
    const reason = reasons[0] || 'unknown';
    return truncate(`cause: capture unavailable for all legs (${reason})`);
  }

  const populated = knownLegs.filter((k) => legs[k].absent === false && legs[k].item_count > 0);
  if (populated.length === 0) {
    // Every leg that ran returned zero matches — a real, successful capture that found
    // nothing, NOT the same as capture-unavailable above.
    return truncate('cause: no matching entries in window (capture succeeded)');
  }

  const producer = legs[populated[0]].producer;
  const runId = legs[populated[0]].run_id;
  const runIdShort = typeof runId === 'string' ? runId.slice(0, 12) : String(runId ?? '');
  const summaryText = typeof summary === 'string' && summary.length > 0
    ? summary
    : populated.map((k) => `${LEG_LABELS[k] || k}: ${legs[k].item_count}`).join(', ');

  return truncate(`cause: ${summaryText} (${producer}, ${runIdShort})`);
}

/**
 * Render one LEG's own line, for a surface that wants per-leg detail rather than the
 * single summary line above (e.g. a captured_cause inspection view). Same three-state
 * contract as formatCauseLine.
 * @param {string} legName - one of worker_logs | venture_errors | d1_failures
 * @param {object} leg - a LEG object from lib/apa/venture-cause-capture.js
 * @returns {string}
 */
export function formatLegLine(legName, leg) {
  const label = LEG_LABELS[legName] || legName;
  if (!leg || typeof leg !== 'object') {
    return truncate(`${label}: capture unavailable (${legName}_not_provided)`);
  }
  if (leg.absent === true) {
    return truncate(`${label}: capture unavailable (${leg.absent_reason || 'unknown'})`);
  }
  if (leg.item_count === 0) {
    return truncate(`${label}: no matching entries in window (capture succeeded)`);
  }
  return truncate(`${label}: ${leg.item_count} entr${leg.item_count === 1 ? 'y' : 'ies'} (${leg.producer}, ${String(leg.run_id ?? '').slice(0, 12)})`);
}

function truncate(text) {
  return text.length > MAX_LINE_CHARS ? `${text.slice(0, MAX_LINE_CHARS - 1)}…` : text;
}

export default { formatCauseLine, formatLegLine };
