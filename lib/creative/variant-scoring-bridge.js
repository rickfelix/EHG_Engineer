/**
 * Bridges creative_assets to the existing marketing_content_variants/daily_rollups
 * variant-scoring substrate via creative_asset_variant_scores, and reuses the SOLE
 * canonical Thompson sampler for produced-media variant selection.
 * SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-3, FR-4, FR-5)
 *
 * Canonical sampler: lib/marketing/ai/thompson-sampler.js. There is a SECOND, unrelated
 * Thompson-sampling implementation at lib/eva/experiments/experiment-assignment.js (over the
 * unrelated experiment_assignments table) -- it is explicitly OUT OF SCOPE for this module and
 * MUST NOT be imported here (TR-4, enforced by a static regression test).
 *
 * Taste-gate: reuses lib/creative/asset-view-gate.js's existing S23+S24 predicate
 * (checkAssetViewAuthorized) rather than re-implementing eligibility (TR-3). That predicate is
 * keyed by venture_id, not per-asset -- exclusion from the candidate pool is venture-uniform
 * (FR-4), not evaluated independently per creative_asset.
 */

import { createSampler } from '../marketing/ai/thompson-sampler.js';
import { checkAssetViewAuthorized } from './asset-view-gate.js';
import { deriveVariantOutcomes } from '../marketing/ai/variant-outcome-derivation.js';

const sampler = createSampler();

/**
 * @param {{supabase: object, ventureId: string|null|undefined}} params
 * @returns {Promise<
 *   {status: 'selected', selection: object, candidateCount: number} |
 *   {status: 'gate_excluded', reason: string} |
 *   {status: 'no_bridged_rows'} |
 *   {status: 'no_outcome_data', candidateCount: number} |
 *   {status: 'query_error', error: string}
 * >}
 */
export async function selectAssetVariant({ supabase, ventureId }) {
  const authz = await checkAssetViewAuthorized({ supabase, ventureId });
  if (!authz.allowed) {
    return { status: 'gate_excluded', reason: authz.reason };
  }

  let bridgedRows;
  try {
    const { data, error } = await supabase
      .from('creative_asset_variant_scores')
      .select('creative_asset_id, variant_id, creative_assets!inner(venture_id)')
      .eq('creative_assets.venture_id', ventureId);
    if (error) throw error;
    bridgedRows = data || [];
  } catch (err) {
    return { status: 'query_error', error: err?.message || String(err) };
  }

  if (bridgedRows.length === 0) {
    return { status: 'no_bridged_rows' };
  }

  const variantIds = [...new Set(bridgedRows.map((row) => row.variant_id))];
  const creativeAssetByVariant = new Map(bridgedRows.map((row) => [row.variant_id, row.creative_asset_id]));

  let dailyRollupsRows;
  try {
    const { data, error } = await supabase
      .from('daily_rollups')
      .select('variant_id, impressions, conversions')
      .in('variant_id', variantIds);
    if (error) throw error;
    dailyRollupsRows = data || [];
  } catch (err) {
    return { status: 'query_error', error: err?.message || String(err) };
  }

  const outcomes = deriveVariantOutcomes(dailyRollupsRows);

  if (outcomes.length === 0) {
    return { status: 'no_outcome_data', candidateCount: variantIds.length };
  }

  const selection = sampler.selectVariant(outcomes);
  return {
    status: 'selected',
    selection: {
      ...selection,
      creativeAssetId: creativeAssetByVariant.get(selection.variantId) || null,
    },
    candidateCount: outcomes.length,
  };
}
