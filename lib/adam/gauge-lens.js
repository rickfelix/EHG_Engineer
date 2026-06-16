/**
 * SD-LEO-INFRA-ADAM-GAUGE-ESTATE-SOURCING-001 (FR-1) — the gauge lens read helper.
 *
 * Reads the LIVE VDR vision build gauge (lib/vision/vdr-registry.js computeBuildGauge) and
 * exposes per-capability build% in a shape Adam's sourcing scorer (selectAdvisory's
 * capabilityGapTerm) can consume. This is the SPINE WIRE's read side — it turns the live
 * measurement into an ADDITIONAL sourcing lens (lower build% => higher rank), never a primary
 * anchor.
 *
 * HONEST GAUGE (anti-honesty-lie): a capability whose probe is 'unknown' (score null) is
 * NOT measurable and is EXCLUDED — it must never be treated as build%=0 (which would fabricate
 * a gap and inflate its rank). FAIL-SOFT: any gauge unavailability returns { available:false,
 * gaps:{} } so the capability_gap term self-gates to a 1.0 no-op — the sourcing hot path never
 * throws and never invents a gap.
 *
 * NOTE: the named table `vision_build_gauge` does NOT exist (its migration is dormant); this
 * reads the LIVE compute only. There is no historization/trend (no history table exists).
 */
import { computeBuildGauge, STATUS_SCORE } from '../vision/vdr-registry.js';

/**
 * Read per-capability build% from the live gauge.
 * @param {object} io - { supabase, grep } injected probe IO (forwarded to computeBuildGauge)
 * @param {object} [deps] - { computeBuildGauge } injection seam for hermetic unit tests
 * @returns {Promise<{ available: boolean, gaps: Record<string, number>, overall_pct: number|null }>}
 *          gaps maps capability label -> build% (0-100; built=100, partial=50, unbuilt=0).
 *          'unknown' capabilities are excluded (not present in gaps).
 */
export async function readCapabilityGaps(io = {}, deps = {}) {
  const compute = deps.computeBuildGauge || computeBuildGauge;
  try {
    const gauge = await compute({ io, visionSource: true });
    if (!gauge || !gauge.available || !Array.isArray(gauge.components)) {
      return { available: false, gaps: {}, overall_pct: null };
    }
    const gaps = {};
    for (const c of gauge.components) {
      // Exclude unknown (score null) — not measurable, never coerce to build%=0 (honest gauge).
      if (!c || c.score == null) continue;
      const score = STATUS_SCORE[c.status];
      if (score == null) continue; // defensive: unknown/invalid status excluded
      gaps[c.capability] = Math.round(score * 100); // built->100, partial->50, unbuilt->0
    }
    return { available: true, gaps, overall_pct: gauge.overall_pct ?? null };
  } catch {
    // Fail-soft: the sourcing scorer degrades to a no-op capability_gap term, never throws.
    return { available: false, gaps: {}, overall_pct: null };
  }
}
