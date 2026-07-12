/**
 * Maps a synthesis/path-output origin_type value to a valid ventures.origin_type value.
 *
 * ventures.origin_type is the Postgres enum venture_origin_type (see
 * database/migrations/20251201_venture_origin_tracking.sql +
 * 20260627_venture_origin_type_add_seeded_from_venture.sql: 'manual', 'competitor_clone',
 * 'blueprint', 'competitor_teardown', 'discovery', 'seeded_from_venture'). It does not
 * include 'nursery_reeval', which reactivateVenture (venture-nursery.js) sets on its path
 * output. Today the brief-synthesis LLM step independently re-maps 'nursery_reeval' to
 * 'discovery' before the ventures insert, at the cost of an extra LLM pass. This mapper
 * codifies that same, already-observed mapping deterministically.
 *
 * Part of SD-FDBK-FIX-ISFIXTUREVENTURE-FALSE-POSITIVES-001 (FR-4).
 */

const ORIGIN_TYPE_OVERRIDES = {
  nursery_reeval: 'discovery',
};

/**
 * Map an origin_type string to a valid venture_origin_type enum value.
 * Any value with no override entry passes through unchanged.
 * @param {string} originType
 * @returns {string}
 */
export function toVentureOriginType(originType) {
  return ORIGIN_TYPE_OVERRIDES[originType] ?? originType;
}
