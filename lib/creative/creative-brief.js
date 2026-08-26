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
import { persistAssetPrivately } from './asset-storage.js';
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

export class VentureNotFoundError extends Error {
  constructor(ventureId) {
    super(`Venture ${ventureId || '(missing)'} does not exist — refusing to generate an asset for it`);
    this.name = 'VentureNotFoundError';
    this.code = 'VENTURE_NOT_FOUND';
  }
}

// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A (FR-2): the default venture-existence resolver.
// Injectable via deps.ventureExistsFn (mirrors generateAssetFn/runQualityGateFn) so unit tests
// never need a real DB round-trip. A malformed (non-UUID) ventureId is treated as "does not
// exist" rather than letting Postgres's raw 22P02 invalid_text_representation escape the typed
// VentureNotFoundError contract.
async function defaultVentureExists(supabase, ventureId) {
  const { data, error } = await supabase.from('ventures').select('id').eq('id', ventureId).maybeSingle();
  if (error) {
    if (error.code === '22P02') return false;
    throw error;
  }
  return Boolean(data);
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
 * @param {{
 *   generateAssetFn?: typeof generateAsset,
 *   runQualityGateFn?: typeof runQualityGate,
 *   persistAssetPrivatelyFn?: typeof persistAssetPrivately,
 *   ventureExistsFn?: typeof defaultVentureExists,
 * }} [deps]
 *   Injectable for testing (mirrors the fetchImpl-injection pattern in providers/gemini.js).
 * @returns {Promise<{id: string, capability: string, generator: string}>}
 * @throws {VentureNotFoundError} missing or nonexistent ventureId (SD-...-001-A FR-2)
 * @throws {TaskFailedError|ProviderNotConfiguredError} generation failed / no configured provider
 * @throws {QualityGateRejectedError} generation succeeded but failed the FR-2 quality gate
 * @throws {CreativeAssetsTableNotLiveError} the chairman-gated table isn't applied yet
 */
export async function requestCreativeAsset(supabase, brief, deps = {}) {
  const generateAssetFn = deps.generateAssetFn || generateAsset;
  const runQualityGateFn = deps.runQualityGateFn || runQualityGate;
  const persistAssetPrivatelyFn = deps.persistAssetPrivatelyFn || persistAssetPrivately;
  const ventureExistsFn = deps.ventureExistsFn || defaultVentureExists;
  const { ventureId, capability, prompt, brandSourceRefs = [], constraints = {} } = brief;

  if (!ventureId || !(await ventureExistsFn(supabase, ventureId))) {
    throw new VentureNotFoundError(ventureId);
  }

  const generationResult = await generateAssetFn(ventureId, capability, { prompt }, constraints, deps);

  const storedAsset = { brand_source_refs: brandSourceRefs };
  const gateResult = runQualityGateFn(generationResult, storedAsset);
  if (!gateResult.pass) {
    throw new QualityGateRejectedError(gateResult);
  }

  // SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A (FR-3): persist a PRIVATE storage path, not
  // the provider's own (public, unfenced) URL — see lib/creative/asset-storage.js.
  const storagePath = await persistAssetPrivatelyFn(supabase, ventureId, capability, generationResult, deps);

  // SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A (SECURITY correction): the two providers use
  // inconsistent provenance field names for the same concept — gemini.js sets `generator`,
  // runway.js sets `provider` — so a Runway-only read of `.generator` was always undefined,
  // which would have failed creative_assets' `generator TEXT NOT NULL` constraint for the one
  // real, working provider (FR-5). Pre-existing since SPINE-001-D; fixed here since this child
  // is the first path that can reach a real (non-stub) Runway generation.
  const generatorName = generationResult.provenance.generator || generationResult.provenance.provider;

  const { data, error } = await supabase
    .from('creative_assets') // schema-lint-disable-line: chairman-gated migration (20260712_creative_assets.sql, PR #5981 merged) not yet applied to the live snapshot
    .insert({
      venture_id: ventureId,
      capability,
      generator: generatorName,
      prompt,
      brand_source_refs: brandSourceRefs,
      cost: generationResult.cost,
      provenance: generationResult.provenance,
      storage_path: storagePath,
    })
    .select('id, capability, generator')
    .single();

  if (error) {
    // SECURITY correction (SEC-09): the object is already uploaded to private storage at this
    // point — best-effort remove it rather than leaving an orphaned, unlinked object behind
    // (unreachable via creative_assets, and never cleaned up by the venture-cascade delete since
    // there is no row to cascade from). A cleanup failure never masks the real DB error.
    try {
      const removeFn = deps.removeStorageObjectFn
        || (() => supabase.storage.from('creative-assets-private').remove([storagePath]));
      await removeFn();
    } catch {
      // best-effort only — never let cleanup mask the real DB error below
    }

    // 42P01 = undefined_table (Postgres) -- the honest, common case while the migration is
    // merged-but-unapplied. Any other error is a real write failure, propagated as-is.
    if (error.code === '42P01') throw new CreativeAssetsTableNotLiveError(error);
    throw error;
  }

  return data;
}
