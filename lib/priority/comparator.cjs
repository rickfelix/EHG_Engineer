/**
 * Priority comparator — SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-B (Child B).
 *
 * SHADOW-MODE ONLY. This module never replaces or reorders anything a caller already
 * sorted — scripts/coordinator-backlog-rank.mjs's 11-band claimable.sort() (its own
 * transitivity-documented comparator, ~line 363) and scripts/worker-checkin.cjs's
 * sortQfCandidatesBySeverity (~line 189) / orderByFleetCriticalThenRank (~line 805) remain
 * the live, binding dispatch order. Callers compute a shadow score from this module purely
 * to log disagreements for a future calibration decision — see lib/priority/shadow-logger.cjs.
 *
 * A missing component input reads the literal string UNSCORED, never a fabricated 0 — a
 * 0 would silently rank an item with no data below every genuinely low-scored item, which
 * is a different (and false) claim. See the PRD's FR-1 for the acceptance criteria this
 * guards.
 *
 * CJS by design (not the package's default ESM .js), so worker-checkin.cjs can `require()`
 * it synchronously; Node's ESM loader can still `import` a CJS module's named exports via
 * static analysis (cjs-module-lexer), so coordinator-backlog-rank.mjs consumes it too —
 * mirrors every other lib/*.cjs module already require()'d from worker-checkin.cjs.
 */

'use strict';

/** Sentinel for "this component's input was not supplied" — never conflate with 0. */
const UNSCORED = 'UNSCORED';

/** Bumped on any change to the scoring formula, so a stamped pick_reason (future Child E) is traceable to the formula that produced it. */
const COMPARATOR_VERSION = '1.0.0';

const COMPONENT_KEYS = ['criticality', 'alignment', 'leverage', 'age'];

function normalizeComponent(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : UNSCORED;
}

/**
 * Pure. Never throws, never performs I/O.
 * @param {*} _item — the SD/QF row this score is for (unused by the formula itself; accepted
 *   so callers can pass the row through without a separate parallel array, and so a future
 *   formula version can read row fields without changing every call site's signature).
 * @param {{criticality?: number, alignment?: number, leverage?: number, age?: number}} [inputs]
 * @returns {{score: number|'UNSCORED', components: Record<string, number|'UNSCORED'>, comparatorVersion: string}}
 */
function computePriorityScore(_item, inputs = {}) {
  const safeInputs = inputs && typeof inputs === 'object' ? inputs : {};
  const components = {};
  for (const key of COMPONENT_KEYS) {
    components[key] = normalizeComponent(safeInputs[key]);
  }
  const numericValues = COMPONENT_KEYS
    .map((key) => components[key])
    .filter((value) => typeof value === 'number');
  const score = numericValues.length > 0
    ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
    : UNSCORED;
  return { score, components, comparatorVersion: COMPARATOR_VERSION };
}

/**
 * Pure comparator over two already-computed score objects (from computePriorityScore),
 * descending by score. An UNSCORED score sorts last, consistently for both operands, so
 * an all-UNSCORED comparison is stable (returns 0) rather than order-dependent.
 * @param {{score: number|'UNSCORED'}} scoreA
 * @param {{score: number|'UNSCORED'}} scoreB
 * @returns {number}
 */
function compareByPriorityScore(scoreA, scoreB) {
  const aIsNumeric = typeof scoreA?.score === 'number';
  const bIsNumeric = typeof scoreB?.score === 'number';
  if (!aIsNumeric && !bIsNumeric) return 0; // both UNSCORED (or malformed) -- stable, not NaN
  if (!aIsNumeric) return 1; // a sorts after b
  if (!bIsNumeric) return -1; // b sorts after a
  return scoreB.score - scoreA.score;
}

module.exports = {
  UNSCORED,
  COMPARATOR_VERSION,
  computePriorityScore,
  compareByPriorityScore,
};
