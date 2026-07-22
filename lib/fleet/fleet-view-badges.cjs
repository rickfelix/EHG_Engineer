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
 * Roll up already-known per-session fields into one design-vocab glance token
 * (SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-D / FR-3, mockup-1). Replaces the old
 * SILENT/STRUGGLING/STALLED/HEALTHY/UNKNOWN vocabulary.
 *
 * DESIGN VOCABULARY — exactly these 7 labels:
 *   WORKING        — alive and doing work (the default for a live session with a signal)
 *   AWAITING INPUT — alive but silent (in a silent-until window → waiting on input)
 *   DEEP WORK      — working on the heaviest tier (model === 'opus' AND effort high/xhigh)
 *   IDLE           — loop_state === 'idle' (a sublabel, e.g. dwell reason, is out of scope
 *                    for this pass — note only, not derived)
 *   MECHANICAL     — PROXY: model === 'haiku' OR effort === 'low'. There is no dedicated
 *                    "mechanical work" signal, so the cheap model/effort tier stands in for it.
 *   PILOT WK1      — PLACEHOLDER: emitted ONLY when an explicit role === 'pilot' is passed.
 *                    There is NO real pilot-session signal source in the codebase today (the
 *                    only 'pilot' token is claim-eligibility.cjs's `pilot_throwaway`, a VENTURE
 *                    flag — not a session/account role), so in practice this is never emitted.
 *                    Do NOT fabricate one; wire this to a real pilot-session role when it exists.
 *   OFF            — released/stopped/offline, or p_alive < 0.2, or no signal at all (the safe
 *                    default that replaces the old UNKNOWN).
 *
 * Still a swappable rollup (same call site + string-return contract) — SD-E's
 * classifyWatchdogState() can replace it later without a PRD amendment. Widened to also accept
 * {computedStatus, role, model, effort}; every field is optional with a graceful default so
 * existing callers passing only the original signals still get a valid label. (Legacy `failCount`
 * is still accepted but no longer influences the label — STRUGGLING was retired.)
 *
 * @param {{loopState?:string|null, pAlive?:number|null, isSilent?:boolean, failCount?:number,
 *   computedStatus?:string|null, role?:string|null, model?:string|null, effort?:string|null}} row
 * @returns {'WORKING'|'AWAITING INPUT'|'DEEP WORK'|'IDLE'|'MECHANICAL'|'PILOT WK1'|'OFF'}
 */
function computeSessionBadge({
  loopState, pAlive, isSilent, computedStatus, role, model, effort,
} = {}) {
  const pAliveNum = typeof pAlive === 'number' && Number.isFinite(pAlive) ? pAlive : null;

  // OFF (highest priority): explicitly released/stopped/offline, or a decisively low p_alive.
  if (['released', 'stopped', 'offline'].includes(computedStatus)) return 'OFF';
  if (pAliveNum !== null && pAliveNum < 0.2) return 'OFF';

  // PILOT WK1 is a design-vocab placeholder — derived ONLY from an explicit role === 'pilot'
  // (never fabricated; there is no real pilot-session signal source yet).
  if (role === 'pilot') return 'PILOT WK1';

  // IDLE — loop_state says idle (sublabel/dwell-reason intentionally out of scope this pass).
  if (loopState === 'idle') return 'IDLE';

  // AWAITING INPUT — alive but silent = waiting on input.
  if (isSilent) return 'AWAITING INPUT';

  // MECHANICAL — PROXY for cheap/mechanical work via the model/effort tier.
  if (model === 'haiku' || effort === 'low') return 'MECHANICAL';

  // DEEP WORK — heaviest model/effort tier.
  if (model === 'opus' && (effort === 'xhigh' || effort === 'high')) return 'DEEP WORK';

  // No signal at all (no loop_state, no finite p_alive, no computed_status) → OFF is the safe
  // default (replaces the old UNKNOWN).
  if (!loopState && pAliveNum === null && !computedStatus) return 'OFF';

  return 'WORKING';
}

module.exports = { formatCapacityChip, computeSessionBadge };
