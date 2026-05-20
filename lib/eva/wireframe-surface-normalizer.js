/**
 * Canonical surface-tagging normalization for wireframe screens.
 * SD-SURFACEAWARE-WIREFRAME-GENERATION-MARKETING-ORCH-001-C
 *
 * Shared helper consumed by both generators:
 *   - lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js (canonical)
 *   - scripts/eva/srip/srip-wireframe-generator.js
 *
 * When EVA_SURFACE_AWARE_ENABLED=true, every screen in the output array receives
 * `surface` (marketing|auth|app) and `page_type` (slug).  Flag-off is a no-op so
 * both callers are regression-safe.
 *
 * Marketing-page count scaling is independent of the flag: marketingPageTargetFor()
 * is a pure helper used at generation time to size the required marketing surface pool.
 */

import { classifySurface } from './stage-templates/analysis-steps/stage-15-wireframe-generator.js';

// ── Business-model-class → target marketing-page counts ─────────────────────
// Bounded by a hard ceiling (callers should also respect their own MAX_SCREENS).
// Values represent minimum marketing-surface screens that should survive in a
// fully surface-tagged screen list.

const MARKETING_PAGE_TARGETS = {
  // Pure-play SaaS: landing + pricing + features = 3 minimum
  saas: 3,
  // Marketplace: landing + for-buyers + for-sellers = 3 minimum
  marketplace: 3,
  // Content / media: landing + features = 2 minimum
  content: 2,
  // E-commerce: landing + category-overview + features = 3 minimum
  'e-commerce': 3,
  // Fintech: landing + features (compliance limits heavy marketing) = 2 minimum
  fintech: 2,
  // Developer tools: landing = 1 (devs skip marketing pages)
  'developer-tools': 1,
  // Health / wellness: landing + features = 2 (regulated, limited pages)
  health: 2,
  // Productivity: landing + pricing = 2 minimum
  productivity: 2,
  // Default / unknown
  default: 2,
};

/**
 * Return the minimum number of marketing-surface screens a venture with the
 * given business_model_class should have in its generated screen set.
 *
 * Pure function — no side-effects, no I/O.
 *
 * @param {string|null|undefined} businessModelClass
 * @returns {number} Minimum marketing page target (≥1)
 */
export function marketingPageTargetFor(businessModelClass) {
  const key = typeof businessModelClass === 'string'
    ? businessModelClass.toLowerCase().trim()
    : 'default';
  return MARKETING_PAGE_TARGETS[key] ?? MARKETING_PAGE_TARGETS.default;
}

// ── Surface normalization ────────────────────────────────────────────────────

/**
 * Apply surface tagging (and page_type) to an array of screen objects.
 *
 * When EVA_SURFACE_AWARE_ENABLED=true (re-read per call so vi.stubEnv works):
 *   - Each screen receives `surface` and `page_type` from classifySurface().
 *   - INDETERMINATE screens that would receive `app` but are expected to be marketing
 *     due to businessModelClass requirements are NOT forcibly re-tagged; the caller
 *     (generator) is responsible for ensuring the correct screen names are present.
 *
 * When the flag is off, screens are returned unchanged.
 *
 * @param {Object[]} screens  Array of raw screen objects
 * @returns {Object[]}        Same array with surface/page_type merged in (flag-on)
 *                            or unchanged (flag-off)
 */
export function applySurfaceTags(screens) {
  if (process.env.EVA_SURFACE_AWARE_ENABLED !== 'true') {
    return screens;
  }
  return screens.map(screen => ({
    ...screen,
    ...classifySurface(screen),
  }));
}

/**
 * Assert that at least `target` screens have surface='marketing'.
 * Returns { ok: boolean, actual: number, target: number }.
 * Pure — does not throw.
 *
 * @param {Object[]} screens
 * @param {number} target
 * @returns {{ ok: boolean, actual: number, target: number }}
 */
export function assertMarketingSurvival(screens, target) {
  const actual = screens.filter(s => s.surface === 'marketing').length;
  return { ok: actual >= target, actual, target };
}
