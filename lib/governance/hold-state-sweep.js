/**
 * Hold-state sweep — SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 (FR-6).
 *
 * Pure detection logic (no DB), following the codebase's established
 * fetch-then-detect split (mirrors countUnrankedClaimableLeaves()). The
 * gauge-runner.mjs resolver does the Supabase fetch and calls
 * findOverdueHolds() with the rows + `Date.now()`.
 *
 * Scoped to the 3 surfaces where a passed review_at does NOT auto-resolve and
 * genuinely needs a human/coordinator look: SD parks, exec_boundary_hold, and
 * the min_tier_rank explicit-override floor. QF defer is deliberately
 * EXCLUDED — its not_before already self-releases claimability once it
 * passes (the QF becomes claimable again automatically), so a QF defer never
 * gets silently "stuck" the way the other 3 surfaces can.
 */

const SURFACES = [
  {
    surface: 'sd_park',
    reviewAtKey: 'park_review_at',
    isActive: (row) => row.status === 'deferred',
  },
  {
    surface: 'exec_boundary_hold',
    reviewAtKey: 'exec_boundary_hold_review_at',
    isActive: (row) => (row.metadata || {}).exec_boundary_hold === true,
  },
  {
    surface: 'min_tier_rank',
    reviewAtKey: 'min_tier_rank_review_at',
    isActive: () => true, // a floor has no separate "active" boolean — its presence IS the hold
  },
];

/**
 * @param {Array<{id, sd_key, status, metadata}>} rows
 * @param {number} nowMs
 * @returns {{count:number, overdue:Array<{sd_key, surface, review_at}>}}
 */
export function findOverdueHolds(rows, nowMs) {
  const overdue = [];
  for (const row of rows || []) {
    const md = row.metadata || {};
    for (const { surface, reviewAtKey, isActive } of SURFACES) {
      const reviewAt = md[reviewAtKey];
      if (!reviewAt || !isActive(row)) continue;
      const parsed = Date.parse(reviewAt);
      if (Number.isFinite(parsed) && parsed < nowMs) {
        overdue.push({ sd_key: row.sd_key, surface, review_at: reviewAt });
      }
    }
  }
  return { count: overdue.length, overdue };
}

export default { findOverdueHolds };
