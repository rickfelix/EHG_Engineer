/**
 * Canonical `lane` vocabulary for the sourcing engine.
 *
 * SD-LEO-INFRA-SOURCING-ENGINE-LEDGER-LANE-COLUMN-001 (FR-3) — the schema-foundation child.
 *
 * `lane` is the MUTABLE routing state the router (child 1) computes and every downstream writer
 * (register-first stamping, dedup-autostamp, populator) persists to conversion_ledger.lane /
 * roadmap_wave_items.lane. It is DISTINCT from the terminal `disposition` — do not overload the two.
 *
 * This module is the single source of truth for the lane set; the router and all writers import it,
 * and it stays in lockstep with the DB CHECK constraint in
 * database/migrations/20260619_sourcing_engine_lane_column.sql (the lane test pins both).
 *
 * 'blocked-on-X' is PARAMETRIC: the suffix names the blocker (e.g. 'blocked-on-SD-LEO-INFRA-FOO-001').
 * Build it with blockedLane(blocker); validate any value with isValidLane().
 */

// @wire-check-exempt: schema-foundation module landed before its consumer. This canonical lane
// vocabulary is imported by the sourcing-engine router (child 1, SD-LEO-INFRA-SOURCING-ENGINE-ROUTER-CORE-001,
// in flight) and the downstream register-first / dedup-autostamp / populator children once they merge.
// Per the engine design the schema foundation (child 2) lands first so siblings import ONE source of
// truth rather than each duplicating the lane set. Reachable from prod once the router merges; pinned
// today by tests/unit/sourcing-engine/lane.test.js.

/** Prefix for the parametric blocked lane. The suffix (the blocker id/name) must be non-empty. */
export const BLOCKED_LANE_PREFIX = 'blocked-on-';

/** The fixed (non-parametric) lanes plus the 'decline' terminal-route marker. Frozen. */
export const FIXED_LANES = Object.freeze(['belt-ready', 'chairman-gated', 'outcome-gated', 'dedup', 'decline']);

/** Named constants for the fixed lanes (blocked-on-<x> is built via blockedLane). Frozen. */
export const LANE = Object.freeze({
  BELT_READY: 'belt-ready',
  CHAIRMAN_GATED: 'chairman-gated',
  OUTCOME_GATED: 'outcome-gated',
  DEDUP: 'dedup',
  DECLINE: 'decline',
});

/**
 * Build a parametric blocked lane value, e.g. blockedLane('SD-X-001') => 'blocked-on-SD-X-001'.
 * @param {string} blocker - non-empty blocker id/name
 * @returns {string|null} the lane value, or null if the blocker is not a non-empty string
 */
export function blockedLane(blocker) {
  if (typeof blocker !== 'string' || blocker.trim().length === 0) return null;
  return `${BLOCKED_LANE_PREFIX}${blocker.trim()}`;
}

/**
 * Is `v` a valid lane value? True for any FIXED_LANES member or a 'blocked-on-<non-empty>' value.
 * Mirrors the DB CHECK exactly (NULL is handled by the DB as "absent", not by this function).
 * @param {*} v
 * @returns {boolean}
 */
export function isValidLane(v) {
  if (typeof v !== 'string' || v.length === 0) return false;
  if (FIXED_LANES.includes(v)) return true;
  // parametric: must carry at least one suffix char after the prefix (lockstep with `LIKE 'blocked-on-_%'`)
  return v.startsWith(BLOCKED_LANE_PREFIX) && v.length > BLOCKED_LANE_PREFIX.length;
}
