// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-1) — per-venture creative-brief seam.
// The single entry point VP_GROWTH invokes to request a generated asset: routes the brief
// through generateAsset() (provider-abstraction primitive), the FR-2 quality gate, and persists
// a creative_assets row -- or fails typed, never a silent partial write.
//
// SCOPE NOTE: this seam does NOT auto-discover S17 brand-source artifacts or the consuming
// channel step -- the caller (VP_GROWTH) supplies both (brandSourceRefs, and later sets
// consumed_at via whatever channel-execution hook exists once it's built; see signal
// 45638d20 -- that hook is genuinely separate, not-yet-specified work, not fabricated here).
//
// CHAIRMAN-GATED DEPENDENCY: creative_assets is chairman-gated (MERGED != LIVE until the
// apply lands). This module fails soft with a distinct, honest error rather than a generic
// DB exception, so callers can tell "the table isn't live yet" apart from "your write is
// invalid" (schema-lint pragma below: same reasoning as theater-guard.js).

import { generateAsset } from './generate-asset.js';
import { runQualityGate } from './quality-gate.js';
// TaskFailedError / ProviderNotConfiguredError are thrown by generateAsset() and documented in
// the @throws below by name only — no import needed, they're never referenced in code here.

export class CreativeAssetsTableNotLiveError extends Error {
  constructor(cause) {
    super('creative_assets table is not yet live (chairman-gated migration MERGED != LIVE)');
    this.name = 'CreativeAssetsTableNotLiveError';
    this.code = 'CREATIVE_ASSETS_TABLE_NOT_LIVE';
    if (cause) this.cause = cause;
  }
}

export class QualityGateRejectedError extends Error {
  constructor(gateResult) {
    super('Generated asset failed the FR-2 quality gate — not persisted, not usable');
    this.name = 'QualityGateRejectedError';
    this.code = 'QUALITY_GATE_REJECTED';
    this.gateResult = gateResult;
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   ventureId: string,
 *   capability: 'image'|'video',
 *   prompt: string,
 *   brandSourceRefs?: any[],
 *   constraints?: object,
 * }} brief
 * @param {{ generateAssetFn?: typeof generateAsset, runQualityGateFn?: typeof runQualityGate }} [deps]
 *   Injectable for testing (mirrors the fetchImpl-injection pattern in providers/gemini.js) —
 *   FR-2's gate currently fail-closes every real/test-mode result by honest design, so tests
 *   need a way to exercise the "gate passes" write path without fabricating working infra.
 * @returns {Promise<{id: string, capability: string, generator: string}>}
 * @throws {TaskFailedError|ProviderNotConfiguredError} generation failed / no configured provider
 * @throws {QualityGateRejectedError} generation succeeded but failed the FR-2 quality gate
 * @throws {CreativeAssetsTableNotLiveError} the chairman-gated table isn't applied yet
 */
export async function requestCreativeAsset(supabase, brief, deps = {}) {
  const generateAssetFn = deps.generateAssetFn || generateAsset;
  const runQualityGateFn = deps.runQualityGateFn || runQualityGate;
  const { ventureId, capability, prompt, brandSourceRefs = [], constraints = {} } = brief;

  const generationResult = await generateAssetFn(capability, { prompt }, constraints);

  const storedAsset = { brand_source_refs: brandSourceRefs };
  const gateResult = runQualityGateFn(generationResult, storedAsset);
  if (!gateResult.pass) {
    throw new QualityGateRejectedError(gateResult);
  }

  const { data, error } = await supabase
    .from('creative_assets') // schema-lint-disable-line: chairman-gated migration (20260712_creative_assets.sql, PR #5981 merged) not yet applied to the live snapshot
    .insert({
      venture_id: ventureId,
      capability,
      generator: generationResult.provenance.generator,
      prompt,
      brand_source_refs: brandSourceRefs,
      cost: generationResult.cost,
      provenance: generationResult.provenance,
    })
    .select('id, capability, generator')
    .single();

  if (error) {
    // 42P01 = undefined_table (Postgres) -- the honest, common case while the migration is
    // merged-but-unapplied. Any other error is a real write failure, propagated as-is.
    if (error.code === '42P01') throw new CreativeAssetsTableNotLiveError(error);
    throw error;
  }

  return data;
}
