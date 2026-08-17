/**
 * Watchdog-body discriminator — SD-LEO-FIX-QUIET-HOURS-GATE-001.
 *
 * Relocated here (from scripts/adam-quiet-tick.mjs, its original home under QF-20260810-590) so
 * it has a single source of truth, importable by both adam-quiet-tick.mjs (unchanged behavior,
 * re-exported) and presence-reply-window.js's resolvePresenceReplyWindow() (the new consumer —
 * closes the gap where a watchdog-template inbound could be used as measured-presence evidence
 * for the quiet-hours reply exemption, exactly the risk Solomon oracle 9cbe7c25 flagged before
 * SD-LEO-INFRA-QUIET-HOURS-GATE-001 shipped without a discriminator).
 *
 * QF-20260810-590 provenance, preserved verbatim: the automated "are you still there?" watchdog
 * is NOT the chairman (witnessed 2026-08-11 01:58Z: it fired the full CHAIRMAN SMS CHANNEL DUTY
 * reply path during quiet hours, burning the presence window diagnosing a bot message).
 * EXACT-PREFIX match on the canonical body, deliberately narrow — an ambiguous/non-matching body
 * must default to the existing hard interrupt (fail-toward-chairman), never the reverse.
 *
 * DELIBERATELY NOT widened to the two broader existing automated-message detectors (the WATCHDOG
 * regex in scripts/solomon/measure-chairman-sms-invisibility.mjs, isAutomatedMessage in
 * scripts/solomon/trend-eyes-sweep.mjs) — both are measured (LEAD-phase VALIDATION, 2026-08-17)
 * to false-positive on genuine chairman messages that merely discuss automation. This narrowness
 * is a preserved safety property, not a gap to close by consolidation.
 */
export const WATCHDOG_BODY_PREFIX = "I haven't received any text messages from you in over an hour.";

/**
 * @param {unknown} body - raw message body (sms_relay_staging.body_raw, or the equivalent
 *   whitespace-collapsed display form used by adam-quiet-tick.mjs's console output — both are
 *   measured to agree on the live corpus, see PRD TR-5). undefined/null/non-string safely
 *   returns false (kept, not excluded) rather than throwing.
 * @returns {boolean}
 */
export function isWatchdogBody(body) {
  return typeof body === 'string' && body.startsWith(WATCHDOG_BODY_PREFIX);
}
