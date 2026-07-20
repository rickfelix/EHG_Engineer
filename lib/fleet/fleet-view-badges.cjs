// SD-LEO-INFRA-FLEET-VIEW-BADGES-001 (FR-1/FR-2): pure chip/badge formatters for
// scripts/fleet-dashboard.cjs's printWorkers(). No DB/IO here — callers pass in
// already-fetched data (the account-capacity-gauge.cjs store, per-row fields already
// present in loadData()'s `d` object) so these stay unit-testable without a live DB.
//
// FR-2 is deliberately a ROLLUP of pre-existing columns (loop_state/p_alive/silent-until),
// NOT a new liveness-classification state machine -- SD-LEO-INFRA-FLEET-WATCHDOG-001 (SD-E)
// owns that (ALIVE/STOPPED/AUTH-LOST/CRASHED) on the same printWorkers() surface. This
// function is designed to be swapped for SD-E's classifyWatchdogState() later (same call
// site, same string-return contract) without a PRD amendment.

'use strict';

const { bindingWeeklyPct } = require('./account-capacity-gauge.cjs');

/**
 * Format the fleet's active-account capacity chip for the WORKERS header line.
 * The fleet currently runs under ONE account at a time (see lib/fleet/account-identity.cjs's
 * host-level acct= label) — this reads that SAME account's headroom from the capacity store,
 * rather than inventing a per-session account mapping that doesn't exist yet.
 * @param {{accountUuid8?: string}|null} identity - getAccountIdentity() result (or null)
 * @param {object} store - account-capacity-gauge.cjs loadStore() result
 * @returns {string} e.g. 'cap=62%' or 'cap=--' when no reading exists yet
 */
function formatCapacityChip(identity, store) {
  const entry = identity && identity.accountUuid8 && store ? store[identity.accountUuid8] : null;
  if (!entry) return 'cap=--';
  const headroom = 100 - bindingWeeklyPct(entry);
  return `cap=${Math.round(headroom)}%`;
}

/**
 * Roll up already-rendered per-session columns into one glance token.
 * @param {{loopState?: string|null, pAlive?: number|null, isSilent?: boolean, failCount?: number}} row
 * @returns {'SILENT'|'STRUGGLING'|'STALLED'|'HEALTHY'|'UNKNOWN'}
 */
function computeSessionBadge({ loopState, pAlive, isSilent, failCount } = {}) {
  if (isSilent) return 'SILENT';
  if (Number(failCount) > 3) return 'STRUGGLING';
  if (typeof pAlive === 'number' && Number.isFinite(pAlive)) {
    return pAlive < 0.4 ? 'STALLED' : 'HEALTHY';
  }
  if (!loopState || loopState === 'unknown') return 'UNKNOWN';
  return 'HEALTHY';
}

module.exports = { formatCapacityChip, computeSessionBadge };
