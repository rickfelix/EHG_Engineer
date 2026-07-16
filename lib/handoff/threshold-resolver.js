/**
 * Shared cross-gate threshold policy — single source of truth.
 * SD-PAT-FIX-WRITER-CONSUMER-ASYMMETRY-001 (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001)
 *
 * Extracted verbatim from scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js
 * so that sibling gates (LEAD-TO-PLAN vision-score, PLAN-TO-LEAD heal-before-complete)
 * consume ONE definition instead of dynamic-importing across executor directories.
 * vision-score.js re-exports these symbols for back-compat. Keep this module
 * dependency-free (no DB/network imports) so any gate can import it statically.
 */

/** Threshold per SD type. Exported for tests.
 *
 * NOTE on non-canonical keys: 'governance', 'maintenance', 'protocol' are NOT in
 * lib/sd-type-enum.js CANONICAL_SD_TYPES — they are domain groupings retained as
 * defensive aliases for legacy callers. The phantom 'fix' key was removed
 * (SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001); 'bugfix' is the canonical sd_type.
 * Future cleanup: drop the non-canonical aliases entirely once a caller-audit
 * confirms zero use. Out of scope for this SD per LEAD scope-lock.
 */
export const SD_TYPE_THRESHOLDS = {
  // Tier 1 — highest bar
  feature:        90,
  governance:     90,
  security:       90,
  // Tier 2 — standard bar
  infrastructure: 80,
  enhancement:    80,
  // QF-20260520-600: database (schema/migration) SDs are infra-class. Without this entry
  // they fell to _default 80 with no dimension narrowing (database absent from
  // SD_TYPE_ADDRESSABLE_DIMENSIONS too), hard-blocking LEAD-TO-PLAN and forcing a manual
  // metadata.vision_addressable_dimensions workaround (witnessed SD-FDBK-GEN-FIX-TRG-ENFORCE-001).
  database:       80,
  // Tier 3 — lower bar
  maintenance:    70,
  protocol:       70,
  bugfix:         70,
  documentation:  70,
  refactor:       70,
  orchestrator:   70,
  // Default (unknown types)
  _default:       80,
};

/** Minimum dimension score before a named warning is emitted. */
export const DIMENSION_WARNING_THRESHOLD = 75;

/** Minimum addressable dimensions for auto-scoring (floor rule). */
export const MIN_ADDRESSABLE_DIMENSIONS = 3;

/** Minimum average score for addressable dimensions (floor rule). */
export const FLOOR_MINIMUM_SCORE = 60;

/** Minimum ratio of base threshold the dynamic adjustment can reduce to (anti-abuse floor). */
export const MIN_ADJUSTED_THRESHOLD_RATIO = 0.6;

/**
 * SD-FDBK-INFRA-GATE-VISION-SCORE-001: a dimension scored at/above this floor is
 * "meaningfully addressed" by a focused null-pattern-type SD
 * (feature/governance/enhancement). Used to AUTO-DETECT addressable dimensions for
 * those types so a focused feature no longer needs manual
 * metadata.vision_addressable_dimensions tuning. Calibrated to the dimension
 * midpoint; paired with the FLOOR_MINIMUM_SCORE (60) addressable-average floor and
 * the MIN_ADJUSTED_THRESHOLD_RATIO (0.6) threshold floor for abuse-resistance.
 */
export const NARROW_FEATURE_DIM_FLOOR = 50;

/**
 * Dimension addressability by SD type.
 * Maps SD type to a Set of dimension name patterns that the type CAN address.
 * Dimensions not in this set are considered non-addressable for that SD type.
 * Pattern matching is case-insensitive substring match.
 *
 * null = all dimensions addressable (no adjustment needed).
 */
export const SD_TYPE_ADDRESSABLE_DIMENSIONS = {
  feature:        null, // features can address all dimensions
  governance:     null,
  security:       ['security', 'compliance', 'risk', 'architecture', 'reliability', 'data'],
  // SD-LEO-INFRA-EXPAND-GATE-VISION-001: added cli/workflow/protocol/governance
  // so EHG_Engineer CLI-first infra SDs score on real dim coverage instead of
  // silently floor-rule-passing. PAT-HF-LEADTOPLAN-1cbfab60 was the standing evidence.
  infrastructure: ['architecture', 'reliability', 'scalability', 'performance', 'security', 'maintainability', 'automation', 'observability', 'cli', 'workflow', 'protocol', 'governance'],
  // QF-20260520-600: database/migration SDs address schema/data/architecture dimensions, not
  // the full product vision — narrow like infrastructure so the adjusted threshold reflects
  // real dim coverage instead of demanding a full-vision score from a migration.
  database:       ['architecture', 'reliability', 'scalability', 'performance', 'security', 'maintainability', 'data', 'governance', 'compliance', 'observability'],
  enhancement:    null,
  maintenance:    ['reliability', 'maintainability', 'performance', 'security', 'architecture'],
  protocol:       ['process', 'governance', 'compliance', 'documentation', 'automation', 'quality'],
  bugfix:         ['reliability', 'quality', 'performance', 'security'],
  fix:            ['reliability', 'quality', 'performance', 'security'],
  documentation:  ['documentation', 'knowledge', 'compliance', 'process'],
  refactor:       ['architecture', 'maintainability', 'performance', 'scalability', 'reliability'],
  orchestrator:   null,
};

/**
 * Count addressable dimensions for an SD type given the total dimension names.
 * Returns { addressable, total } counts.
 *
 * SD-level override (QF-20260505-102): when sdMetadata.vision_addressable_dimensions
 * is a non-empty array of pattern strings, it takes precedence over the type-level
 * SD_TYPE_ADDRESSABLE_DIMENSIONS lookup. This lets a narrow-domain SD (e.g. a
 * chairman-UI feature that structurally cannot address CLI/DFE/automation
 * dimensions) declare its addressable surface explicitly. Abuse is bounded by
 * MIN_ADDRESSABLE_DIMENSIONS floor (existing) and the threshold floor
 * MIN_ADJUSTED_THRESHOLD_RATIO in calculateDynamicThreshold (new).
 *
 * @param {string} sdType
 * @param {Object|null} dimensionScores - JSONB { dimName: score, ... }
 * @param {Object|null} sdMetadata - SD's metadata column (may carry per-SD override)
 * @returns {{ addressable: number, total: number }}
 */
/**
 * Numeric score of a dimension_scores value — the vision-scorer writes RICH
 * values ({ A01: { name, score, ... } }), not flat scores (QF-20260713-713).
 */
export function dimScoreOf(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value.score === 'number') return value.score;
  return null;
}

/** Matchable dimension name: rich values' .name, else the key (legacy flat shape). */
export function dimNameOf(key, value) {
  if (value && typeof value === 'object' && typeof value.name === 'string' && value.name) return value.name;
  return key;
}

/**
 * Resolve the array of addressable dimension KEYS for an SD. Single source of
 * truth for both countAddressableDimensions and the addressable-average floor.
 * Patterns match the dimension NAME (dimNameOf) — scorer rows are keyed by
 * opaque A01/V01 IDs no type pattern can substring-match (QF-20260713-713).
 * Returned strings are the KEYS so callers can index back into dimensionScores.
 * Precedence:
 *   1. Manual override: a non-empty sdMetadata.vision_addressable_dimensions pattern
 *      list (QF-20260505-102) — wins over everything.
 *   2. null-pattern types (SD_TYPE_ADDRESSABLE_DIMENSIONS[type] === null:
 *      feature/governance/enhancement/orchestrator) with NO manual override —
 *      SD-FDBK-INFRA-GATE-VISION-SCORE-001 carve-out: AUTO-DETECT addressable dims as
 *      those scored >= NARROW_FEATURE_DIM_FLOOR. A focused feature only "addresses"
 *      the dims it scored meaningfully on, so it no longer needs manual
 *      vision_addressable_dimensions tuning. A broad feature whose dims all clear the
 *      floor yields all-addressable → no narrowing → the full bar is preserved.
 *   3. Other types: case-insensitive substring match against the type's pattern list.
 *
 * @param {string} sdType
 * @param {Object|null} dimensionScores - JSONB { dimName: score, ... }
 * @param {Object|null} sdMetadata - SD's metadata column (may carry per-SD override)
 * @returns {string[]} addressable dimension names
 */
export function getAddressableDimNames(sdType, dimensionScores, sdMetadata) {
  if (!dimensionScores || typeof dimensionScores !== 'object') return [];
  const entries = Object.entries(dimensionScores);

  const sdLevelPatterns = sdMetadata?.vision_addressable_dimensions;
  if (Array.isArray(sdLevelPatterns) && sdLevelPatterns.length > 0) {
    return entries
      .filter(([key, value]) => {
        const name = dimNameOf(key, value).toLowerCase();
        return sdLevelPatterns.some(p => name.includes(String(p).toLowerCase()));
      })
      .map(([key]) => key);
  }

  const patterns = SD_TYPE_ADDRESSABLE_DIMENSIONS[sdType];
  if (patterns === null || patterns === undefined) {
    // Carve-out: auto-detect addressable dims from scores for null-pattern types.
    return entries
      .filter(([, value]) => {
        const score = dimScoreOf(value);
        return score !== null && score >= NARROW_FEATURE_DIM_FLOOR;
      })
      .map(([key]) => key);
  }

  return entries
    .filter(([key, value]) => {
      const name = dimNameOf(key, value).toLowerCase();
      return patterns.some(p => name.includes(p.toLowerCase()));
    })
    .map(([key]) => key);
}

/**
 * Count addressable dimensions for an SD type. Delegates to getAddressableDimNames.
 * Returns { addressable, total } counts.
 *
 * @param {string} sdType
 * @param {Object|null} dimensionScores - JSONB { dimName: score, ... }
 * @param {Object|null} sdMetadata - SD's metadata column (may carry per-SD override)
 * @returns {{ addressable: number, total: number }}
 */
export function countAddressableDimensions(sdType, dimensionScores, sdMetadata) {
  if (!dimensionScores || typeof dimensionScores !== 'object') {
    return { addressable: 0, total: 0 };
  }
  const total = Object.keys(dimensionScores).length;
  const addressable = getAddressableDimNames(sdType, dimensionScores, sdMetadata).length;
  return { addressable, total };
}

/**
 * Calculate dynamic threshold based on addressable dimension ratio.
 * Formula: adjusted = max(base * (addressable / total), base * MIN_ADJUSTED_THRESHOLD_RATIO)
 * Returns base threshold if all dims addressable or no dimension data.
 *
 * The MIN_ADJUSTED_THRESHOLD_RATIO floor (QF-20260505-102) prevents abuse of the
 * SD-level addressable-dimensions override: even a SD declaring 2 of 18
 * dimensions as addressable cannot drive the threshold below 60% of base.
 *
 * @param {number} baseThreshold
 * @param {number} addressable
 * @param {number} total
 * @returns {number} Adjusted threshold (rounded to nearest integer)
 */
export function calculateDynamicThreshold(baseThreshold, addressable, total) {
  if (total === 0 || addressable >= total) return baseThreshold;
  const ratioBased = baseThreshold * (addressable / total);
  const floor = baseThreshold * MIN_ADJUSTED_THRESHOLD_RATIO;
  return Math.round(Math.max(ratioBased, floor));
}
