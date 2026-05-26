/**
 * Claim-holding session status set + pure helper.
 * SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 (FR-3)
 *
 * Single definition of which classified-session statuses count as "this session
 * is currently holding its SD claim". Used by stale-session-sweep.cjs in BOTH
 * the available-to-claim filter and the worker-render filter, so a holder is
 * never simultaneously rendered as a live worker AND advertised as available.
 *
 * Absorbed scope of QF-20260526-577 (the same fix targeted only the sweep's
 * available-filter; this module is the durable shared definition).
 *
 * Background: scripts/stale-session-sweep.cjs::classifySessions emits statuses
 *   ALIVE_SOURCE_SIDE | ACTIVE | ALIVE_NO_HEARTBEAT | STALE_UNKNOWN | DEAD
 * The first three indicate the holding session is still alive on some signal
 * (source-side / fresh heartbeat / live PID despite stale heartbeat), so its
 * SD must be excluded from the available-to-claim pool. STALE_UNKNOWN/DEAD
 * holders are eligible for reclamation by claim-guard (out of scope here).
 *
 * Pure: no DB, no fs, no process state. Safe to unit test with synthetic input.
 */

const CLAIM_HOLDING_STATUSES = new Set([
  'ACTIVE',
  'ALIVE_NO_HEARTBEAT',
  'ALIVE_SOURCE_SIDE',
]);

/**
 * Compute the set of sd_keys currently held by a live (claim-holding) session.
 * @param {Array<{sd_key?: string|null, status?: string}>} classified
 *   Output of classifySessions() — each item has a sd_key (may be null/empty
 *   for idle sessions) and a classified status string.
 * @returns {Set<string>} Set of sd_key strings held by live sessions.
 */
function computeClaimedSdKeys(classified) {
  const claimed = new Set();
  if (!Array.isArray(classified)) return claimed;
  for (const s of classified) {
    if (!s || !s.sd_key) continue;
    if (CLAIM_HOLDING_STATUSES.has(s.status)) claimed.add(s.sd_key);
  }
  return claimed;
}

module.exports = { CLAIM_HOLDING_STATUSES, computeClaimedSdKeys };
