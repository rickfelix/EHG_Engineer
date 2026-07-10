/**
 * Stage 15 post-stage handlers — RELOCATED VERBATIM from
 * lib/eva/stage-execution-worker.js (_postStageHook_S15_*) by
 * SD-ARCH-HOTSPOT-STAGE-WORKER-001 (FR-2). Only mechanical transforms applied:
 * this._supabase/this._logger -> ctx.*, dynamic imports re-pathed one level up.
 * Behavior preservation is proven by the frozen pre-refactor IO snapshot
 * (tests/fixtures/stage-worker-pre-refactor.snapshot.json) equivalence tests.
 *
 * ctx contract (mirrors lib/sweep/ctx.cjs convention): { supabase, logger }.
 * execute(ctx) preserves the registry's documented load-bearing hook ORDER.
 */

/**
 * S15 post-stage hook: Store wireframe screens as artifact for S17 generation.
 * SD-LEO-FIX-FIX-STAGE-VENTURE-001: Wire postStage15Hook into pipeline.
 */
export async function stitchProvision(ctx, ventureId) {
  // SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001-A: Store wireframe screen data
  // as venture_artifact instead of calling Stitch APIs. The archetype
  // generator reads this artifact directly for S17 design generation.
  const { writeArtifact } = await import('../artifact-persistence-service.js');

  // SD-LEO-INFRA-S15-WIREFRAME-SCREENS-REGRESSION-001 (FR-1): the S15 producer now emits
  // wireframe_screens in its typed batch (before the 15->16 boundary). This post-hook is now an
  // IDEMPOTENT FALLBACK for legacy/orchestrator-direct ventures — if a current wireframe_screens
  // already exists, skip (do not re-write / churn the row).
  const { data: existingScreens } = await ctx.supabase
    .from('venture_artifacts')
    .select('id')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 15)
    .eq('artifact_type', 'wireframe_screens')
    .eq('is_current', true)
    .maybeSingle();
  if (existingScreens) {
    ctx.logger.log('[Worker] S15 post-hook: wireframe_screens already current (producer-owned) — skipping fallback write');
    return;
  }

  // Read S15 data from venture_stage_work, falling back to venture_artifacts
  let s15Work = null;
  const { data: vsw } = await ctx.supabase
    .from('venture_stage_work')
    .select('advisory_data')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 15)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (vsw?.advisory_data && (vsw.advisory_data.wireframes || vsw.advisory_data.screens || vsw.advisory_data.ia_sitemap)) {
    s15Work = vsw;
  } else {
    // Fallback: read from blueprint_wireframes artifact
    const { data: artifact } = await ctx.supabase
      .from('venture_artifacts')
      .select('artifact_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 15)
      .eq('artifact_type', 'blueprint_wireframes')
      .eq('is_current', true)
      .maybeSingle();
    if (artifact?.artifact_data) {
      s15Work = { advisory_data: artifact.artifact_data };
    }
  }

  if (!s15Work?.advisory_data) {
    ctx.logger.warn('[Worker] S15 post-hook: no wireframe data found, skipping artifact creation');
    return;
  }

  const advisoryData = s15Work.advisory_data;

  // SD-LEO-INFRA-S15-WIREFRAME-SCREENS-REGRESSION-001 (FR-1): shared normalizer — identical screen
  // shape as the producer's typed-batch write, so the fallback can never drift from the primary path.
  const { buildWireframeScreensPayload } = await import('../stage-templates/stage-15-screens.js');
  const screensPayload = buildWireframeScreensPayload(advisoryData);
  const { screens } = screensPayload;

  // Write wireframe_screens artifact for archetype-generator consumption
  await writeArtifact(ctx.supabase, {
    ventureId,
    lifecycleStage: 15,
    artifactType: 'wireframe_screens',
    title: `Wireframe Screens (${screens.length} screens)`,
    content: JSON.stringify({ screens, source: 'S15_advisory_data' }),
    artifactData: screensPayload,
    qualityScore: 80,
    validationStatus: 'validated',
    source: 'stage-15-post-hook',
    metadata: {
      screenCount: screens.length,
      deviceTypes: [...new Set(screens.map(s => s.deviceType))],
    },
  });

  ctx.logger.log(`[Worker] S15 post-hook (fallback): stored ${screens.length} wireframe screens as artifact (Stitch bypassed)`);
}

export async function execute(ctx) {
  await stitchProvision(ctx, ctx.ventureId);
}
