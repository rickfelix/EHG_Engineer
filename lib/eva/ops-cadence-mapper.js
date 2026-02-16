/**
 * Ops Cadence Mapper — Risk-Adaptive Monitoring Frequency
 *
 * SD-MAN-ORCH-EVA-LIFECYCLE-COMPLETION-001-B
 *
 * Maps venture health scores to monitoring cadence (days between ops checks).
 * Healthier ventures are checked less frequently; struggling ventures more often.
 *
 * Tiers:
 *   0-25  → 7 days  (weekly)
 *   26-50 → 14 days (biweekly)
 *   51-75 → 30 days (monthly)
 *   76-100→ 90 days (quarterly)
 *
 * @module lib/eva/ops-cadence-mapper
 */

// ── Constants ───────────────────────────────────────────────

const CADENCE_TIERS = [
  { max: 25, days: 7 },
  { max: 50, days: 14 },
  { max: 75, days: 30 },
  { max: 100, days: 90 },
];

const DEFAULT_CADENCE_DAYS = 30;

const OVERRIDE_MAP = Object.freeze({
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
});

// ── US-001: Health Score to Cadence Mapping ─────────────────

/**
 * Map a health score (0-100) to an ops monitoring cadence in days.
 *
 * @param {number|null|undefined} healthScore - Venture health score (0-100)
 * @returns {number} Cadence in days
 */
export function getOpsCadenceDays(healthScore) {
  if (healthScore == null || typeof healthScore !== 'number' || Number.isNaN(healthScore)) {
    return DEFAULT_CADENCE_DAYS;
  }

  const clamped = Math.max(0, Math.min(100, healthScore));
  for (const tier of CADENCE_TIERS) {
    if (clamped <= tier.max) return tier.days;
  }
  return DEFAULT_CADENCE_DAYS;
}

// ── US-002: Cadence Override Support ────────────────────────

/**
 * Resolve the effective ops cadence, checking for a manual override first.
 *
 * @param {Object|null} ventureMetadata - Venture metadata JSONB (may contain ops_cadence_override)
 * @param {number|null} healthScore - Venture health score (0-100)
 * @returns {number} Cadence in days
 */
export function resolveOpsCadenceDays(ventureMetadata, healthScore) {
  const override = ventureMetadata?.ops_cadence_override;
  if (override && OVERRIDE_MAP[override] !== undefined) {
    return OVERRIDE_MAP[override];
  }
  return getOpsCadenceDays(healthScore);
}

// ── US-005: Health Score Retrieval ──────────────────────────

/**
 * Retrieve the most recent health score for a venture.
 * Queries venture_artifacts for the latest health_assessment artifact.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<number|null>} Health score (0-100) or null
 */
export async function getVentureHealthScore(supabase, ventureId) {
  try {
    const { data, error } = await supabase
      .from('venture_artifacts')
      .select('quality_score')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'health_assessment')
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return typeof data.quality_score === 'number' ? data.quality_score : null;
  } catch {
    return null;
  }
}

// ── Exports for testing ─────────────────────────────────────

export const _internal = {
  CADENCE_TIERS,
  DEFAULT_CADENCE_DAYS,
  OVERRIDE_MAP,
};
