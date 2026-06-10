/**
 * Fail-loud guard for fire-and-forget audit writes — SD-LEO-FIX-FIX-PHANTOM-COLUMN-001.
 *
 * The phantom-column class: governance/audit/learning writers emitted columns that don't
 * exist, PostgREST rejected every call (42703), and the surrounding catch blocks swallowed
 * the error — so daily audit/escalation/learning writes silently did NOTHING (some for
 * months). Fire-and-forget is the right contract for audit writes (logging must never break
 * the host flow), but silent is not: route the catch through this guard so the failure is
 * VISIBLE in logs.
 *
 * Contract:
 *  - NEVER throws.
 *  - Logs console.error with site name + error + the payload's key list (keys only — no
 *    values, so no sensitive data leaks into logs).
 *  - Dedup latch: one log per (site, error-code) per process — a hot loop can't flood the
 *    log, but a SECOND DISTINCT error at the same site still surfaces.
 */

const loggedOnce = new Set();

/**
 * Report a failed audit write, loudly, once per (site, error-code) per process.
 *
 * @param {string} site - short identifier of the writing site (e.g. 'ship-review-findings-populator')
 * @param {unknown} error - the Supabase/PostgREST error (or thrown exception)
 * @param {object} [payload] - the attempted insert payload; only its KEYS are logged
 * @returns {boolean} true if logged, false if deduped (same site+code already reported)
 */
export function logAuditWriteFailure(site, error, payload = undefined) {
  try {
    const err = /** @type {{code?: string, message?: string}} */ (error) || {};
    const code = err.code || 'ERR';
    const latch = `${site}:${code}`;
    if (loggedOnce.has(latch)) return false;
    loggedOnce.add(latch);
    const keys = payload && typeof payload === 'object' ? Object.keys(payload).join(',') : '';
    console.error(
      `[audit-write-guard] ${site}: audit write FAILED (${code}: ${err.message || String(error)})` +
      (keys ? ` payload_keys=[${keys}]` : '')
    );
    return true;
  } catch { /* the guard itself must never throw */ return false; }
}

/** Test hook: clear the dedup latch. Not for production use. */
export function _resetAuditWriteGuardForTests() { loggedOnce.clear(); }
