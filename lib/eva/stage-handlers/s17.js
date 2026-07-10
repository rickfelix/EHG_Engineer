/**
 * Stage 17 post-stage handlers — RELOCATED VERBATIM from
 * lib/eva/stage-execution-worker.js (_postStageHook_S17_*) by
 * SD-ARCH-HOTSPOT-STAGE-WORKER-001 (FR-2). Only mechanical transforms applied:
 * this._supabase/this._logger -> ctx.*, dynamic imports re-pathed one level up.
 * Behavior preservation is proven by the frozen pre-refactor IO snapshot
 * (tests/fixtures/stage-worker-pre-refactor.snapshot.json) equivalence tests.
 *
 * ctx contract (mirrors lib/sweep/ctx.cjs convention): { supabase, logger, ensureS17StrategySelected }.
 * execute(ctx) preserves the registry's documented load-bearing hook ORDER.
 */

/**
 * S17 post-stage hook: freeze the GVOS design snapshot (GVOS FR-6).
 *
 * SD-LEO-REFAC-RETIRE-LEGACY-STAGE-001
 *
 * The frozen visual identity (archetype + tokens + substrate/accent/typography_voice)
 * was chosen at S11 (venture_gvos_profile). This writes the immutable
 * locked_prompt_snapshot + locked_at + locked_version at the S17 transition, the
 * point FR-6 specifies. Idempotent (skips if already locked) and non-throwing
 * (mirrors the S11 GvosProfile hook contract) so it never blocks stage advancement.
 *
 * Backend port of EHG/src/lib/gvos/snapshot-locker.ts (which is browser-client and was
 * never invoked → locked_at NULL for all ventures, incl. RPC-auto-advanced ones).
 * Compliance-category tokens are excluded from the lock (live propagation) by
 * buildLockedSnapshot.
 */
export async function gvosLock(ctx, ventureId) {
  const logger = ctx.logger;
  try {
    const { data: profile, error: profErr } = await ctx.supabase
      .from('venture_gvos_profile')
      .select('venture_id, archetype_id, token_overrides, locked_version, locked_at')
      .eq('venture_id', ventureId)
      .maybeSingle();

    if (profErr && profErr.code !== 'PGRST116') {
      logger.warn('[S17-GvosLock] profile load failed:', profErr.message);
      return;
    }
    if (!profile) {
      logger.warn(`[S17-GvosLock] no venture_gvos_profile for ${ventureId} — cannot lock (S17 renders the no-profile empty-state).`);
      return;
    }
    if (profile.locked_at) {
      logger.log(`[S17-GvosLock] Skipping — already locked for venture ${ventureId} (locked_version=${profile.locked_version}).`);
      return;
    }
    if (!profile.archetype_id) {
      logger.warn(`[S17-GvosLock] venture ${ventureId} has no archetype_id — cannot lock.`);
      return;
    }

    const { data: archetype, error: archErr } = await ctx.supabase
      .from('gvos_archetypes')
      .select('id, prompt_token, tokens_required, substrate, accent, typography_voice')
      .eq('id', profile.archetype_id)
      .maybeSingle();
    if (archErr || !archetype) {
      logger.warn(`[S17-GvosLock] gvos_archetypes load failed for ${profile.archetype_id}: ${archErr?.message || 'not found'}`);
      return;
    }

    const tokenNames = Array.isArray(archetype.tokens_required) ? archetype.tokens_required : [];
    let liveTokens = [];
    if (tokenNames.length > 0) {
      const { data: toks, error: tokErr } = await ctx.supabase
        .from('gvos_tokens')
        .select('name, category, version_major, version_minor, version_patch')
        .in('name', tokenNames);
      if (tokErr) {
        logger.warn('[S17-GvosLock] gvos_tokens load failed:', tokErr.message);
        return;
      }
      liveTokens = toks || [];
    }

    const { buildLockedSnapshot } = await import('../../../lib/gvos/snapshot-locker.js');
    const { locked, excluded_compliance_tokens } = buildLockedSnapshot(
      archetype,
      liveTokens,
      profile.token_overrides ?? {},
    );

    const newVersion = (profile.locked_version ?? 0) + 1;
    const lockedAt = new Date().toISOString();
    const { error: writeErr } = await ctx.supabase
      .from('venture_gvos_profile')
      .update({ locked_prompt_snapshot: locked, locked_at: lockedAt, locked_version: newVersion })
      .eq('venture_id', ventureId);

    if (writeErr) {
      // Surface loudly — a swallowed lock failure would leave FR-6 silently unsatisfied.
      logger.error('[S17-GvosLock] lock write FAILED:', writeErr.message);
      return;
    }

    logger.log('[S17-GvosLock] design snapshot locked', {
      ventureId,
      locked_version: newVersion,
      archetype: locked.archetype_prompt_token,
      tokens: locked.tokens_required.length,
      excluded_compliance: excluded_compliance_tokens.length,
    });
  } catch (err) {
    logger.warn(`[S17-GvosLock] lock hook failed (non-fatal): ${err.message}`);
  }
}

export async function docGen(ctx, ventureId) {
  const { data: ventureRow } = await ctx.supabase
    .from('ventures').select('name').eq('id', ventureId).single();
  const { generateDocs } = await import('../stage-templates/analysis-steps/stage-17-doc-generation.js');
  await generateDocs({
    ventureId,
    ventureName: ventureRow?.name,
    supabase: ctx.supabase,
    logger: ctx.logger,
  });
  ctx.logger.log('[Worker] S17 post-stage hook: vision + architecture docs generated');

  // SD-S17-WORKER-STRATEGY-GATE-ORCH-001-A: Strategy gate — block until chairman selects strategy.
  // Required regardless of the design path: the GVOS composer renders S17 from
  // venture_gvos_profile after strategy approval.
  // SD-LEO-REFAC-EXTRACT-S17-ARCHETYPE-001: legacy archetype-generator invocation removed
  // (GVOS composer is the live path; s17_use_gvos_composer is globally enabled).
  await ctx.ensureS17StrategySelected(ventureId);
}

/**
 * SD-LEO-INFRA-RELIABLE-S19-BUILD-001 / FR-1: auto-draft a draft_seed L2 vision.
 *
 * Runs AFTER _postStageHook_S17_DocGen. Only fires for leo_bridge ventures (the
 * seeded_repo path does NOT use the LEO-SD bridge, so it never needs an L2 vision).
 * seedDraftL2Vision is idempotent (no-op if any L2 doc already exists) and writes
 * status='draft_seed' / chairman_approved=false — never active/approved. Non-throwing.
 *
 * @param {string} ventureId
 */
export async function seedDraftVision(ctx, ventureId) {
  const logger = ctx.logger;
  try {
    // Resolve build_model via the SINGLE arbiter; skip unless leo_bridge.
    const { data: s19Work } = await ctx.supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 19)
      .maybeSingle();
    const { data: ventureRow } = await ctx.supabase
      .from('ventures').select('name, build_model').eq('id', ventureId).maybeSingle();
    const { resolveBuildModel } = await import('../bridge/resolve-build-model.js');
    const buildModel = resolveBuildModel({
      ventureBuildModel: ventureRow?.build_model,
      legacyBuildMethod: s19Work?.advisory_data?.build_method,
    });
    if (buildModel !== 'leo_bridge') {
      logger.log(`[Worker] S17 SeedDraftVision: build_model=${buildModel} — skipping (only leo_bridge ventures need an L2 vision for the bridge).`);
      return;
    }

    const { seedDraftL2Vision } = await import('../stage-templates/analysis-steps/stage-17-doc-generation.js');
    await seedDraftL2Vision({
      supabase: ctx.supabase,
      ventureId,
      ventureName: ventureRow?.name,
      logger,
    });
  } catch (err) {
    logger.warn(`[Worker] S17 SeedDraftVision hook failed (non-fatal): ${err.message}`);
  }
}

/**
 * S17 execute — order is load-bearing (relocated comment): GvosLock freezes the
 * design snapshot at the S17 transition (idempotent, non-throwing) BEFORE doc-gen,
 * so the lock fires regardless of the S17 strategy gate (SD-LEO-REFAC-RETIRE-LEGACY-STAGE-001
 * GVOS FR-6); SeedDraftVision runs last (SD-LEO-INFRA-RELIABLE-S19-BUILD-001/FR-1).
 */
export async function execute(ctx) {
  await gvosLock(ctx, ctx.ventureId);
  await docGen(ctx, ctx.ventureId);
  await seedDraftVision(ctx, ctx.ventureId);
}
