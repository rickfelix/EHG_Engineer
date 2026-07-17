/**
 * Market Signal Scanner — Honest-Idle Reporting
 * SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001 (FR-5)
 *
 * Mirrors the honest-idle convention established by
 * lib/eva/stage-zero/data-pollers/staleness.js (NO_DATA_MARKER) and
 * lib/agents/ghost-ceo-gauge.js (its own scoped NO_DATA_MARKER): each
 * gauge/scanner defines its OWN scoped, greppable, test-pinned
 * 'NO-DATA: <reason>' constant rather than sharing a single generic
 * honestIdle() helper. There is no repo-wide shared helper to call into.
 *
 * NOTE: at the time this file was written, lib/market-signal-scanner/scoring.js
 * did not yet exist (checked via repo-wide search before authoring this
 * constant). If scoring.js is added later and defines its own
 * NO_DATA_MARKER, that module owns the canonical export — re-export it from
 * here instead of keeping two independent strings in sync by hand.
 */

/** Stable prefix — pinned by tests and greppable downstream. */
export const NO_DATA_MARKER =
  'NO-DATA: market-signal-scan found zero candidates clearing triangulation this cycle -- do not fabricate a nomination';

/**
 * Logs the honest-idle marker for a scan cycle that produced zero
 * triangulated candidates. Never fabricates a nomination to fill the gap.
 *
 * @param {{ info?: Function, log?: Function }} logger - any logger exposing
 *   .info (preferred) or .log; falls back to console if neither is present.
 */
export function reportIdleCycle(logger) {
  const log = logger && typeof logger.info === 'function'
    ? logger.info.bind(logger)
    : logger && typeof logger.log === 'function'
      ? logger.log.bind(logger)
      : console.log.bind(console);

  log(NO_DATA_MARKER);
}

export default { NO_DATA_MARKER, reportIdleCycle };
