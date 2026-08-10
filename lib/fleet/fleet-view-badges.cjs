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
 *   computedStatus?:string|null, role?:string|null, model?:string|null, effort?:string|null,
 *   toolSilentMinutes?:number|null}} row
 * @returns {'WORKING'|'AWAITING INPUT'|'DEEP WORK'|'UNKNOWN'|'MECHANICAL'|'PILOT WK1'|'OFF'}
 */
function computeSessionBadge({
  loopState, pAlive, isSilent, computedStatus, role, model, effort, toolSilentMinutes,
} = {}) {
  const pAliveNum = typeof pAlive === 'number' && Number.isFinite(pAlive) ? pAlive : null;

  // OFF (highest priority): explicitly released/stopped/offline, or a decisively low p_alive.
  if (['released', 'stopped', 'offline'].includes(computedStatus)) return 'OFF';
  if (pAliveNum !== null && pAliveNum < 0.2) return 'OFF';

  // PILOT WK1 is a design-vocab placeholder — derived ONLY from an explicit role === 'pilot'
  // (never fabricated; there is no real pilot-session signal source yet).
  if (role === 'pilot') return 'PILOT WK1';

  // UNKNOWN — the seat claims to be mid-loop but has issued no tool call for a while.
  // SD-LEO-INFRA-SILENT-HOLDER-AUDIT-001: three frozen seats (60-83m tool-silent, loop_state
  // active) rendered "DEEP WORK" for an hour because the badge had no tool-silence input — an
  // affirmative false statement that let an experienced reader scan a half-frozen fleet as
  // healthy. Silence is judged from RAW last_tool_at age computed by the caller; loop_state is
  // the class label (active/awaiting_tick both freeze this way — awaiting_tick dominates,
  // measured at genuine-worker.cjs:89-97), never the detector. UNKNOWN is deliberately neutral:
  // the defect was the positive productivity claim, not the absence of a verdict.
  const silentMin = typeof toolSilentMinutes === 'number' && Number.isFinite(toolSilentMinutes)
    ? toolSilentMinutes : null;
  if (silentMin !== null && silentMin >= TOOL_SILENT_UNKNOWN_MINUTES
      && (loopState === 'active' || loopState === 'awaiting_tick')) {
    return 'UNKNOWN';
  }

  // IDLE branch DELETED (SD-LEO-INFRA-SILENT-HOLDER-AUDIT-001): it compared loopState against
  // 'idle', a value the writer enum (scripts/lib/sessions/loop-state-tracker.cjs:19-29 —
  // active|awaiting_tick|exited|unknown) never produces. Dead against production data since the
  // enum existed; a genuinely idle seat is identified by its claim surfaces, not loop_state.

  // AWAITING INPUT — alive but silent = waiting on input.
  if (isSilent) return 'AWAITING INPUT';

  // SD-LEO-INFRA-FLEET-MODEL-REGISTRY-001: these compared metadata.model by EXACT equality
  // against a bare family, which held only while the check-in writer coarsened every model
  // before storing it. Now that the exact API id is persisted, 'claude-opus-5[1m]' !== 'opus'
  // and DEEP WORK would never fire again. Resolve the family first. familyFromModelId is the
  // strict resolver (null when an id names no known family), so an unrecognized model matches
  // neither branch rather than being coerced into one.
  const modelFamily = require('./tier-ladder.cjs').familyFromModelId(model);

  // MECHANICAL — PROXY for cheap/mechanical work via the model/effort tier.
  if (modelFamily === 'haiku' || effort === 'low') return 'MECHANICAL';

  // DEEP WORK — heaviest model/effort tier.
  if (modelFamily === 'opus' && (effort === 'xhigh' || effort === 'high')) return 'DEEP WORK';

  // No signal at all (no loop_state, no finite p_alive, no computed_status) → OFF is the safe
  // default (replaces the old UNKNOWN).
  if (!loopState && pAliveNum === null && !computedStatus) return 'OFF';

  return 'WORKING';
}

/**
 * Minutes of tool silence after which an "active/awaiting_tick" seat renders UNKNOWN instead of
 * a productivity badge. Small on purpose: a healthy seat mid-reasoning rarely goes 10 minutes
 * without a tool call, and UNKNOWN costs nothing while a false DEEP WORK cost an hour of
 * fleet-wide misreading (measured 2026-08-01 freeze wave).
 */
const TOOL_SILENT_UNKNOWN_MINUTES = 10;

module.exports = { formatCapacityChip, computeSessionBadge, TOOL_SILENT_UNKNOWN_MINUTES };
