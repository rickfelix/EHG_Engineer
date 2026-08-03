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

// ─── RUBRIC IDENTITY ──────────────────────────────────────────────────────────
// SD-FDBK-FIX-HEAL-BEFORE-COMPLETE-001 FR-1.
//
// eva_vision_scores.total_score is written by several incommensurable instruments and read as one
// number. Measured over the FULL table (6059/6059 rows, paginated):
//
//   n=2537   capabilities_present,key_changes_delivered,smoke_tests_pass,success_criteria_met,success_metrics_achieved
//   n=1646   A01..A07,V01..V11
//   n=1136   elapsed_ms,semantic,structural
//   n= 454   feasibility,impact,innovation,strategic_alignment,sustainability
//
// WHY IDENTITY IS DERIVED FROM THE KEY SET RATHER THAN A DECLARED FIELD. The PRD assumed a
// discriminator already exists in the data. It does not: only 290/6059 rows (4.8%) carry
// rubric_snapshot.rubric at all, and rubric_snapshot.mode='sd-heal' covers 3121 rows spanning
// ELEVEN distinct dimension counts (5d:1322, 3d:1139, 18d:638) — one label sitting on the heal
// rubric, the latency signature and the vision rubric simultaneously. The dimension KEY SET is the
// only discriminator actually present, so it is the one used here.
//
// NOTE that dimension COUNT alone is insufficient: two DIFFERENT 5-dimension rubrics exist
// (heal-completeness and eva-5dim). Matching on count would merge them.

/** Exact-key-set rubrics, transcribed from the census — not inferred from naming. */
const EXACT_RUBRICS = [
  ['sd-heal-5dim-v1', ['capabilities_present', 'key_changes_delivered', 'smoke_tests_pass', 'success_criteria_met', 'success_metrics_achieved']],
  ['eva-5dim-v1',     ['feasibility', 'impact', 'innovation', 'strategic_alignment', 'sustainability']],
];

/** A dimension key that is a DURATION, not a 0-100 quality score. */
const LATENCY_KEYS = new Set(['elapsed_ms']);

/** Vision-family keys are opaque ordinals: A01..A08, V01..V11. */
const VISION_KEY_RX = /^[AV]\d{2}$/;

/**
 * Name the instrument that produced a dimension_scores object.
 *
 * Returns a stable rubric id, or 'unregistered' when the signature is not one this registry knows.
 * 'unregistered' is a DELIBERATE outcome rather than a fallback to some default rubric: 76 distinct
 * signatures exist and quietly treating an unknown one as the vision rubric would reintroduce
 * exactly the cross-instrument comparison this function exists to prevent.
 *
 * @param {Object|null} dimensionScores
 * @returns {string} rubric id
 */
export function identifyRubric(dimensionScores) {
  if (!dimensionScores || typeof dimensionScores !== 'object' || Array.isArray(dimensionScores)) {
    return 'unregistered';
  }
  const keys = Object.keys(dimensionScores);
  if (keys.length === 0) return 'unregistered';

  // Latency FIRST. A signature carrying a millisecond duration is not a quality rubric no matter
  // what else it carries, and must be caught before any count- or family-based rule can claim it.
  if (keys.some(k => LATENCY_KEYS.has(k))) return 'latency-3dim';

  const sorted = [...keys].sort();
  for (const [id, expect] of EXACT_RUBRICS) {
    if (sorted.length === expect.length && sorted.every((k, i) => k === expect[i])) return id;
  }

  // Vision FAMILY, not a single fixed width. The 18-key form is the modal one but the same
  // instrument also emitted 11..17-key rows as it grew; they are one rubric at several widths, and
  // treating each width as its own rubric would fragment the registry for no behavioural gain.
  if (keys.every(k => VISION_KEY_RX.test(k))) return 'vision-av-v1';

  return 'unregistered';
}

/**
 * Rubrics whose scores are NOT quality measurements and must never be threshold-compared.
 * elapsed_ms is a duration in milliseconds sharing a JSONB column with 0-100 scores; dimScoreOf
 * returns it verbatim, so 1200 clears NARROW_FEATURE_DIM_FLOOR (50) and a stopwatch reading counts
 * as a fully-addressed dimension. 1136 rows carry this signature.
 */
export const NON_COMPARABLE_RUBRICS = new Set(['latency-3dim']);

// ─── PER-RUBRIC CALIBRATION ───────────────────────────────────────────────────
// Emitted by scripts/analysis/rubric-threshold-calibration.mjs, which imports identifyRubric from
// THIS file so the calibration and the runtime agree by construction. Re-run it to refresh.
//
// WHY THRESHOLDS ARE PER-RUBRIC AND NOT ONE NUMBER. The four instruments have measurably different
// score distributions — the medians span NINETEEN POINTS (heal 92.0, eva 82.0, vision 73.0). A
// single nominal threshold therefore means completely different things: 90 sits near the heal
// rubric's p40 (routine) and above the vision rubric's p90 (near-unreachable). One number against
// four distributions is not one standard, it is four different standards wearing one label.
//
// MEASURED 2026-08-03 over 6059 rows (full population, not a sample).
export const QUANTILE_GRID = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90];
export const RUBRIC_QUANTILES = {
  'sd-heal-5dim-v1': { n: 2537, q: [59.4, 89.0, 92.0, 92.0, 92.0, 95.0, 96.0, 96.0, 99.0] },
  'vision-av-v1':    { n: 1841, q: [44.0, 62.0, 67.0, 70.0, 73.0, 76.0, 79.0, 82.0, 85.0] },
  'latency-3dim':    { n: 1136, q: [76.0, 80.0, 85.0, 87.0, 88.0, 90.0, 90.0, 93.0, 97.0] },
  'eva-5dim-v1':     { n:  454, q: [72.0, 78.0, 78.0, 80.2, 82.0, 82.0, 83.0, 85.0, 87.0] },
};

/** Score standing at percentile `p` of a rubric's measured distribution (linear interpolation). */
export function quantileFor(rubric, p) {
  const entry = RUBRIC_QUANTILES[rubric];
  if (!entry) return null;
  const grid = QUANTILE_GRID, q = entry.q;
  if (p <= grid[0]) return q[0];
  if (p >= grid[grid.length - 1]) return q[q.length - 1];
  for (let i = 1; i < grid.length; i++) {
    if (p <= grid[i]) {
      const t = (p - grid[i - 1]) / (grid[i] - grid[i - 1]);
      return q[i - 1] + (q[i] - q[i - 1]) * t;
    }
  }
  return q[q.length - 1];
}

/**
 * Target percentile per sd_type tier — the STRINGENCY the type demands, expressed independently of
 * any one rubric's number line. Derived from the existing SD_TYPE_THRESHOLDS tiers (90 / 80 / 70)
 * so the ordering of types is preserved exactly; only the scale it is expressed on changes.
 */
export function targetPercentile(sdType) {
  const base = SD_TYPE_THRESHOLDS[sdType] ?? SD_TYPE_THRESHOLDS._default;
  if (base >= 90) return 0.75;   // Tier 1 — top quartile of its own instrument
  if (base >= 80) return 0.60;   // Tier 2
  return 0.45;                   // Tier 3
}

/**
 * COVERAGE BANDS — an explicit policy decision, recorded as one rather than left to emerge.
 *
 * A 5-dimension instrument can only express coverage in fifths; an 18-dimension one in eighteenths.
 * Under continuous ratio-narrowing the two therefore land on different rungs for identical work,
 * and any agreement between them is arithmetic coincidence (12/18 and 2/3 agree; 14/18 and 4/5 do
 * not). Banding makes agreement STRUCTURAL: any two coverages inside one band are treated
 * identically, whatever granularity produced them.
 *
 * THE COST, STATED PLAINLY: banding introduces cliffs. Coverage 0.749 and 0.750 fall either side of
 * a rung and receive different thresholds. That is inherent to quantisation and is the price of
 * removing instrument-driven spread; it is not a defect to be discovered later.
 *
 * Chairman/coordinator-facing: the rung boundaries below are the tunable policy. Alternatives
 * considered were (b) continuous ratios, accepting instrument-driven spread, and (c) per-rubric
 * calibrated bases — (c) is in fact ALSO implemented above, because the calibration data turned out
 * to exist once the full population was measured.
 */
export const COVERAGE_BANDS = [
  { minCoverage: 0.90, factor: 1.00 },
  { minCoverage: 0.75, factor: 0.85 },
  { minCoverage: 0.60, factor: 0.70 },
  { minCoverage: 0.00, factor: MIN_ADJUSTED_THRESHOLD_RATIO },
];

export function coverageBandFactor(coverage) {
  for (const band of COVERAGE_BANDS) if (coverage >= band.minCoverage) return band.factor;
  return MIN_ADJUSTED_THRESHOLD_RATIO;
}

/**
 * The STRINGENCY a piece of work is actually held to, as a percentile of its own rubric.
 *
 * This is the quantity that must agree across rubrics. Its numeric threshold DELIBERATELY does not:
 * forcing two instruments with a 19-point median gap onto one number would re-create the
 * incommensurability this module exists to remove.
 */
export function effectiveStringency(sdType, addressable, total) {
  const coverage = total > 0 ? addressable / total : 1;
  return targetPercentile(sdType) * coverageBandFactor(coverage);
}

/** Base threshold for a (sd_type, rubric) pair — AC-2's discriminating resolver. */
export function resolveThreshold(sdType, rubric) {
  const v = quantileFor(rubric, targetPercentile(sdType));
  return v === null ? (SD_TYPE_THRESHOLDS[sdType] ?? SD_TYPE_THRESHOLDS._default) : Math.round(v);
}

/**
 * The number a score is ACTUALLY compared against, end to end. This is the seam gates should call.
 *
 * Two distinct refusals, named separately rather than collapsed into one "cannot score" — a policy
 * refusal and a coverage gap are different facts and a caller may reasonably treat them differently:
 *   - NON_COMPARABLE: the rubric is not a quality measurement at all (latency).
 *   - UNREGISTERED:   the signature is not in the registry, so nothing is known about its scale.
 *
 * DELIBERATELY NOT WIRED INTO ANY GATE IN THIS COMMIT. Existing callers keep using
 * SD_TYPE_THRESHOLDS + calculateDynamicThreshold, so no gate changes behaviour on merge. Migrating
 * a gate is a separate change with its own stated blast radius.
 */
export function resolveEffectiveThreshold(sdType, dimensionScores, sdMetadata = null) {
  const rubric = identifyRubric(dimensionScores);
  if (NON_COMPARABLE_RUBRICS.has(rubric)) {
    throw new Error(
      `resolveEffectiveThreshold: rubric '${rubric}' is a latency measurement, not a quality score — ` +
      `refusing to threshold-compare it (elapsed_ms is milliseconds; it clears a 0-100 quality floor by magnitude alone)`
    );
  }
  if (!RUBRIC_QUANTILES[rubric]) {
    throw new Error(
      `resolveEffectiveThreshold: unregistered rubric signature — nothing is known about its score ` +
      `scale, so no threshold is meaningful. Add it to RUBRIC_QUANTILES via ` +
      `scripts/analysis/rubric-threshold-calibration.mjs.`
    );
  }
  const { addressable, total } = countAddressableDimensions(sdType, dimensionScores, sdMetadata);
  return Math.round(quantileFor(rubric, effectiveStringency(sdType, addressable, total)));
}
