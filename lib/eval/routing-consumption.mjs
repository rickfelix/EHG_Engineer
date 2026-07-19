/**
 * routing-consumption.mjs — THE single routing-doctrine consumption seam
 * (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-D FR-4).
 *
 * ONE resolver for reality-graded routing scores from model_capability_reference.
 * Both named consumers delegate here — neither computes its own routing metric:
 *   - dispatch tiering: LIVE, via lib/fleet/tier-ladder.cjs resolveRoutingScore()
 *     (consumed at the lib/coordinator/dispatch.cjs tier-enforcement choke point).
 *   - Foresight Board §17 routing: DEFERRED-with-trigger (Phase-1 build not sourced
 *     yet per SD-LEO-INFRA-LAND-VENTURE-FORESIGHT-001); bound by the C2 consumption
 *     contract in ROUTING_DOCTRINE_CONSUMERS below, not live code. When §17 ships it
 *     MUST import resolveCapabilityRouting — forking a second doctrine violates the
 *     anti-fork guard test (tests/unit/eval/routing-consumption.test.js).
 *
 * FAIL-CLOSED TRUST (FR-4.2): only trusted_for_routing=true rows are consumed
 * (only child C's ground-truth gate flips that flag). Absent table (STAGED /
 * pre-ceremony, PGRST205) or zero trusted rows for the tuple → the FALLBACK is
 * returned and the resolver NEVER throws (CEREMONY_PENDING-safe).
 *
 * FALLBACK SSOT (FR-4.1): tier-ladder.cjs capabilityScore — imported, never a
 * re-derived ladder. With zero trusted rows the seam's output is therefore
 * byte-identical to the static path (parity-tested), so live wiring is a
 * behavior-preserving no-op until the reference table binds.
 *
 * CONTAMINATION GUARD (FR-4.4): reads ONLY results-only reference columns —
 * never golden-task text or grading keys — and NEVER writes trusted_for_routing
 * (read-only consumer; the flag's sole writer is scripts/eval/ground-truth-gate.mjs).
 */
import ladder from '../fleet/tier-ladder.cjs';

const { capabilityScore } = ladder;

/** Results-only column allow-list — the ONLY columns this seam may select. */
export const REFERENCE_RESULT_COLUMNS = Object.freeze([
  'problem_shape', 'model_id', 'effort', 'quality_score', 'cost_norm', 'trusted_for_routing',
]);

/** C2 consumption contract — durable anti-fork marker for both doctrine consumers. */
export const ROUTING_DOCTRINE_CONSUMERS = Object.freeze({
  'dispatch-tiering': Object.freeze({
    status: 'live',
    entry: 'lib/fleet/tier-ladder.cjs resolveRoutingScore()',
    wired_at: 'lib/coordinator/dispatch.cjs assertWorkerTierAllowed()',
  }),
  'foresight-board-section-17': Object.freeze({
    status: 'deferred-with-trigger',
    contract: 'C2',
    trigger: 'SD-LEO-INFRA-LAND-VENTURE-FORESIGHT-001 Phase-1 build sourced',
    entry: 'MUST call resolveCapabilityRouting() — no forked metric',
  }),
});

/**
 * Pure core: graded routing score from already-fetched TRUSTED rows.
 * Prefers cost_norm (the pairwise routing metric per capability-scorer.mjs);
 * falls back to quality_score per row. Returns null when no finite metric exists.
 */
export function gradedRoutingScore(rows) {
  const vals = (Array.isArray(rows) ? rows : [])
    .map((r) => (Number.isFinite(r?.cost_norm) ? r.cost_norm : r?.quality_score))
    .filter((v) => Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * THE routing-doctrine resolver (FR-4.1). Returns the reality-graded routing
 * score for a (shape, model, effort) tuple when trusted rows exist, else the
 * fallback (default: tier-ladder capabilityScore — the fallback SSOT).
 * Never throws (FR-4.2). fallback may be a number or a (model, effort) => number.
 */
export async function resolveCapabilityRouting({ supabase = null, shape = null, model, effort, fallback } = {}) {
  const fb = () => {
    if (typeof fallback === 'function') return fallback(model, effort);
    if (fallback !== undefined && fallback !== null) return fallback;
    return capabilityScore(model, effort);
  };
  if (!supabase || !shape || !model || !effort) return fb();
  try {
    const { data, error } = await supabase
      .from('model_capability_reference')
      .select(REFERENCE_RESULT_COLUMNS.join(','))
      .eq('problem_shape', shape)
      .eq('model_id', model)
      .eq('effort', effort)
      .eq('trusted_for_routing', true);
    if (error) return fb(); // PGRST205 / absent table / any read fault → fail-closed to fallback
    const graded = gradedRoutingScore(data);
    return graded === null ? fb() : graded;
  } catch {
    return fb(); // thrown client fault → still CEREMONY_PENDING-safe, never propagates
  }
}
