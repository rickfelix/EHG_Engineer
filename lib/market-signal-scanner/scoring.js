/**
 * Market signal scanner scoring engine.
 * SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001 (FR-2)
 *
 * Implements the design doc's (Solomon design doc 8fee0f44 on qf-736, M2 section)
 * hard triangulation gate plus a v1 weighted NicheScore formula, per the PRD's FR-2
 * scope for this thin slice.
 *
 * SIMPLIFICATION (deliberate, documented -- NOT a silent omission): the design doc's
 * full formula is
 *   NicheScore = w_m*MoneyIn + w_s*Stickiness + w_a*Attention + w_x*Structural
 *                - P_gaming - P_staleness - P_correlation,  multiplied by T_entry and C_fit
 * The P_gaming / P_staleness / P_correlation penalty terms and the T_entry / C_fit
 * thesis-conditioned multipliers are OUT OF SCOPE for this first build (PRD FR-2
 * description + implementation_approach step "heavily unit tested" scopes only the
 * weighted-sum + hard-triangulation-gate + hard-screen pieces for v1). This file
 * implements exactly: nicheScore = 0.35*moneyIn + 0.30*stickiness + 0.15*attention
 * + 0.20*structural, with missing families contributing 0, gated by the hard
 * triangulation rule below. A future increment adds the penalty/multiplier terms.
 */

export const NO_DATA_MARKER =
  'NO-DATA: market-signal-scan found zero candidates clearing triangulation this cycle -- do not fabricate a nomination';

/** Weighted contribution of each signal family to nicheScore (design doc M2 weights). */
const FAMILY_WEIGHTS = Object.freeze({
  money_in: 0.35,
  stickiness: 0.3,
  attention: 0.15,
  structural: 0.2,
});

/** Hard triangulation rule (design doc M2, non-negotiable): */
const TRIANGULATION_MIN_DISTINCT_FAMILIES = 3;
const TRIANGULATION_REQUIRED_ANY_OF = Object.freeze(['money_in', 'stickiness']);

/**
 * Config-driven hard-screen denylist for v1. Each key is a rejection reason string
 * returned verbatim by isHardScreenFailed(); each value is a list of lowercase
 * keyword/phrase fragments that, if found in the candidate's category or free-text
 * metadata, trip that screen. A simple keyword/category denylist is documented as
 * sufficient for v1 (design doc's fuller thesis-fit reasoning is a later increment).
 */
const HARD_SCREEN_DENYLIST = Object.freeze({
  'brand-moat': ['brand-moat', 'brand moat', 'trademark-defensible', 'branded incumbent'],
  'paid-acquisition-dominated': [
    'paid-acquisition-dominated',
    'paid acquisition',
    'cac-dominated',
    'ad-spend-dependent',
  ],
  'network-effect': ['network-effect', 'network effect', 'winner-take-all', 'winner take all'],
  'platform-hostage': [
    'platform-hostage',
    'platform hostage',
    'app-store-gated',
    'platform-dependent distribution',
  ],
  'enterprise-motion': [
    'enterprise-motion',
    'enterprise motion',
    'enterprise sales cycle',
    'long enterprise sales',
  ],
});

/**
 * Simple keyword/category-based hard screen for v1 (config-driven denylist).
 * @param {{ category?: string, keywords?: string[], description?: string }} nicheMetadata
 * @returns {string|null} the rejection reason (denylist key) if screened out, else null
 */
export function isHardScreenFailed(nicheMetadata) {
  if (!nicheMetadata || typeof nicheMetadata !== 'object') return null;

  const category = String(nicheMetadata.category ?? '').toLowerCase().trim();
  const keywords = Array.isArray(nicheMetadata.keywords)
    ? nicheMetadata.keywords.map((k) => String(k).toLowerCase())
    : [];
  const description = String(nicheMetadata.description ?? '').toLowerCase();
  const haystack = [category, ...keywords, description].join(' | ');

  for (const [reason, terms] of Object.entries(HARD_SCREEN_DENYLIST)) {
    if (category === reason) return reason;
    if (terms.some((term) => haystack.includes(term))) return reason;
  }

  return null;
}

/**
 * Group readings by family, keeping only readings with a real (non-null, finite)
 * slope_90d_vs_baseline. A family with slope_90d_vs_baseline: null (no history yet,
 * per the source-fetcher contract) is NOT "present" -- it must never be silently
 * treated as a zero/negative reading, and must never count toward triangulation.
 * When multiple readings share a family (e.g. more than one attention source), their
 * slopes are averaged before the family weight is applied -- documented v1 choice,
 * NOT multiple distinct families.
 * @param {Array} allReadings
 * @returns {Map<string, number[]>}
 */
function groupSlopesByFamily(allReadings) {
  const byFamily = new Map();
  const readings = Array.isArray(allReadings) ? allReadings : [];

  for (const reading of readings) {
    if (!reading || typeof reading.family !== 'string' || reading.family.length === 0) continue;
    const slope = reading.slope_90d_vs_baseline;
    // Strict real-number check: null, undefined, NaN, and non-numbers are all
    // "no reading yet" -- never coerced into 0.
    if (typeof slope !== 'number' || !Number.isFinite(slope)) continue;

    if (!byFamily.has(reading.family)) byFamily.set(reading.family, []);
    byFamily.get(reading.family).push(slope);
  }

  return byFamily;
}

/**
 * Score a candidate niche from its collected family readings.
 *
 * Hard triangulation rule (bulletproof, per design doc M2 -- the single most
 * safety-critical check in this file): >=3 DISTINCT families must have a real
 * (non-null) reading, AND at least one of those families must be 'money_in' or
 * 'stickiness'. An attention-only set of readings -- no matter how many distinct
 * attention-family observations, no matter their magnitude -- can NEVER pass,
 * because 'attention' is never a member of TRIANGULATION_REQUIRED_ANY_OF and
 * families.length alone is insufficient without that intersection check.
 *
 * @param {Array<{family: string, slope_90d_vs_baseline: number|null, observations?: Array}>} allReadings
 * @returns {{ triangulationPassed: boolean, families: string[], nicheScore: number|null, hardScreenFailed: string|null, reasoning: string }}
 */
export function scoreNiche(allReadings) {
  const byFamily = groupSlopesByFamily(allReadings);
  const families = Array.from(byFamily.keys());

  const distinctFamilyCount = families.length;
  const hasRequiredFamily = families.some((f) => TRIANGULATION_REQUIRED_ANY_OF.includes(f));
  const triangulationPassed =
    distinctFamilyCount >= TRIANGULATION_MIN_DISTINCT_FAMILIES && hasRequiredFamily;

  // scoreNiche() operates on family readings only, per the interface contract's
  // single-argument signature -- it has no access to candidate/niche category
  // metadata (brand-moat, enterprise-motion, etc.), so it never itself trips a hard
  // screen. Callers combine this result with a separate isHardScreenFailed(niche
  // metadata) call (using candidate-level metadata, not family readings) and merge
  // the two verdicts before nominating.
  const hardScreenFailed = null;

  if (!triangulationPassed) {
    const reasoning =
      `Triangulation FAILED: ${distinctFamilyCount} distinct famil${distinctFamilyCount === 1 ? 'y' : 'ies'} ` +
      `with a real (non-null) reading [${families.join(', ') || 'none'}] ` +
      `(need >= ${TRIANGULATION_MIN_DISTINCT_FAMILIES}), and ` +
      `${hasRequiredFamily ? 'a' : 'no'} money_in/stickiness family present ` +
      '(required). Attention-only and any sub-3-family combination never nominate, ' +
      'regardless of magnitude.';
    return { triangulationPassed: false, families, nicheScore: null, hardScreenFailed, reasoning };
  }

  let nicheScore = 0;
  const contributions = [];
  for (const [family, weight] of Object.entries(FAMILY_WEIGHTS)) {
    const slopes = byFamily.get(family);
    if (!slopes || slopes.length === 0) continue; // missing family contributes 0
    const avgSlope = slopes.reduce((sum, s) => sum + s, 0) / slopes.length;
    nicheScore += weight * avgSlope;
    contributions.push(`${family}=${avgSlope.toFixed(4)}*${weight}`);
  }

  const reasoning =
    `Triangulation PASSED: families=[${families.join(', ')}] ` +
    `(>= ${TRIANGULATION_MIN_DISTINCT_FAMILIES}, includes money_in/stickiness). ` +
    `nicheScore=${nicheScore.toFixed(4)} from weighted terms: ${contributions.join(' + ') || 'none'}.`;

  return { triangulationPassed: true, families, nicheScore, hardScreenFailed, reasoning };
}

export default { NO_DATA_MARKER, scoreNiche, isHardScreenFailed };
