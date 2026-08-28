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
import { resolveVentureCompanyAccess } from './venture-company-access.js';
import { pickAllowedAssetFields } from './asset-write-fields.js';

const sampler = createSampler();

export { resolveVentureCompanyAccess };

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
/**
 * EHG-callable read entry point. Wraps selectAssetVariant() (the SOLE scoring
 * implementation -- never re-implemented here) behind a user_company_access
 * authorization check, so a caller under the company-access model (not
 * ventures.created_by, which is NULL for every live venture) gets correct,
 * non-empty scoring data instead of a client-side embedded join silently
 * returning zero rows. Intended to be invoked from a service-role Edge Function
 * (e.g. supabase/functions/variant-scoring-bridge), never from a browser client
 * directly -- callerUserId must come from a verified JWT, not client-supplied input.
 *
 * @param {{supabase: object, callerUserId: string, ventureId: string}} params
 * @returns {Promise<{status: 'unauthorized', reason: string} | Awaited<ReturnType<typeof selectAssetVariant>>>}
 */
export async function bridgeReadForCaller({ supabase, callerUserId, ventureId }) {
  const access = await resolveVentureCompanyAccess({ supabase, userId: callerUserId, ventureId });
  if (!access.allowed) {
    return { status: 'unauthorized', reason: access.reason };
  }
  return selectAssetVariant({ supabase, ventureId });
}

/**
 * EHG-callable write entry point for FR-3's persistence: inserts one generated
 * variant as a creative_assets row (real uuid id, non-null campaign_id linking
 * sibling variants from the same generation run). Runs under service-role
 * (bypasses the creative_asset_variant_scores RLS ownership mismatch), gated by
 * the SAME user_company_access check as the read path -- an unauthorized caller
 * cannot plant rows against a venture they do not have access to.
 *
 * Deliberately does NOT write to creative_asset_variant_scores here: that table
 * is fail-closed for the `authenticated` role until the chairman-gated
 * cavs_variant_matches_venture RLS fix (database/chairman-gated/
 * 20260826_creative_asset_variant_scores_rls_fix.sql) is applied (FR-4, explicitly
 * OUT OF SCOPE for SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D) -- service-role
 * writes would succeed today but ship a second write path racing ahead of that
 * ceremony. The ehg-app caller (RunwayVideoService.ts) gates this entire function
 * behind VITE_ENABLE_VARIANT_PERSISTENCE_BRIDGE, default OFF, for the same reason.
 *
 * @param {{supabase: object, callerUserId: string, ventureId: string, campaignId: string, asset: object}} params
 * @returns {Promise<{status: 'unauthorized', reason: string} | {status: 'error', error: string} | {status: 'persisted', row: object}>}
 */
export async function bridgeWriteVariant({ supabase, callerUserId, ventureId, campaignId, asset }) {
  const access = await resolveVentureCompanyAccess({ supabase, userId: callerUserId, ventureId });
  if (!access.allowed) {
    return { status: 'unauthorized', reason: access.reason };
  }
  if (!campaignId) {
    return { status: 'error', error: 'missing_campaign_id' };
  }

  // SECURITY review db9a6d11 (SEC-1): explicit column allow-list, never a spread of caller
  // input. venture_id/campaign_id are always the server-resolved/validated values above, not
  // read from the caller's `asset` object even if a caller includes them there. Same
  // allow-list as the Edge Function's 'write' action (imported from asset-write-fields.js) --
  // one representation, not two copies to keep in sync.
  const insertPayload = {
    ...pickAllowedAssetFields(asset),
    venture_id: ventureId,
    campaign_id: campaignId,
  };

  const { data, error } = await supabase
    .from('creative_assets')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    return { status: 'error', error: error.message || String(error) };
  }

  return { status: 'persisted', row: data };
}

export async function selectAssetVariant({ supabase, ventureId }) {
  const authz = await checkAssetViewAuthorized({ supabase, ventureId });
  if (!authz.allowed) {
    return { status: 'gate_excluded', reason: authz.reason };
  }

  let bridgedRows;
  try {
    const { data, error } = await supabase
      .from('creative_asset_variant_scores')
      .select('creative_asset_id, variant_id, creative_assets!inner(venture_id)') // schema-lint-disable-line: the !inner embed hint suffix trips the relation-name extractor; creative_asset_variant_scores.creative_assets is a real FK-backed relation
      .eq('creative_assets.venture_id', ventureId)
      .limit(999);
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
      .in('variant_id', variantIds)
      .limit(999);
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
