/**
 * lib/checkin/context-usage-sync-tick.cjs — SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C (FR-3).
 *
 * Folds the context-usage sync (scripts/sync-context-usage.js's syncToDatabase) into the
 * existing worker-checkin cadence rather than building new scheduler infra: no app-level
 * scheduler exists anywhere in this repo (confirmed, Explore evidence 8f71f505), and
 * worker-checkin.cjs already runs on every /loop iteration fleet-wide -- the natural,
 * already-frequent hook point. Mirrors lib/checkin/sms-outbound-tick.cjs's fail-soft
 * piggyback pattern: a sync failure must never block or fail the check-in itself.
 */

/**
 * @param {{ syncFn?: () => Promise<void> }} [opts] - injectable sync function for testing
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function tickContextUsageSync({ syncFn } = {}) {
  try {
    const run = syncFn || (async () => {
      const mod = await import('../../scripts/sync-context-usage.js');
      await mod.syncToDatabase();
    });
    await run();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

module.exports = { tickContextUsageSync };
