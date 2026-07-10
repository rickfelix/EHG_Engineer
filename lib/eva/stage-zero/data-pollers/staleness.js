/**
 * app_rankings staleness honesty
 * SD-LEO-INFRA-RETIRE-DEAD-MONITORING-CHAIN-001 (Solomon 41a2e6da, Delta ledger H12/H13)
 *
 * Ranking figures must never render without their age: a reader showing numbers of
 * unknown vintage is a fresh-looking stale gauge (the divergence class). The stamp is
 * derived strictly from the rows' own timestamps — an empty result or unparseable
 * timestamp yields the explicit NO-DATA / unknown-age wording, never a fabricated
 * fresh claim.
 */

/** Stable prefix — pinned by tests and greppable downstream. */
export const NO_DATA_MARKER = 'NO-DATA: app_rankings has no rows for this query — do not fabricate market figures';

function humanAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Build the staleness stamp for a set of app_rankings rows.
 *
 * @param {Object[]|null|undefined} rows
 * @param {Object} [opts]
 * @param {string} [opts.field='scraped_at'] - timestamp column carrying observation time
 * @param {Date}   [opts.now] - injection point for tests
 * @returns {{isEmpty: boolean, stamp: string}} stamp is ALWAYS renderable
 */
export function stalenessStamp(rows, opts = {}) {
  const { field = 'scraped_at', now = new Date() } = opts;

  if (!Array.isArray(rows) || rows.length === 0) {
    return { isEmpty: true, stamp: NO_DATA_MARKER };
  }

  let newest = null;
  for (const r of rows) {
    const t = Date.parse(r?.[field]);
    if (Number.isFinite(t) && (newest === null || t > newest)) newest = t;
  }

  if (newest === null) {
    return {
      isEmpty: false,
      stamp: `data age UNKNOWN: ${rows.length} row(s) carry no parseable ${field} — treat as stale`,
    };
  }

  const age = humanAge(now.getTime() - newest);
  return {
    isEmpty: false,
    stamp: `data age: newest observation ${age ?? 'in the future?'} old (as of ${new Date(newest).toISOString()})`,
  };
}
