/**
 * Stage 11 post-stage handlers — RELOCATED VERBATIM from
 * lib/eva/stage-execution-worker.js (_postStageHook_S11_*) by
 * SD-ARCH-HOTSPOT-STAGE-WORKER-001 (FR-2). Only mechanical transforms applied:
 * this._supabase/this._logger -> ctx.*, dynamic imports re-pathed one level up.
 * Behavior preservation is proven by the frozen pre-refactor IO snapshot
 * (tests/fixtures/stage-worker-pre-refactor.snapshot.json) equivalence tests.
 *
 * ctx contract (mirrors lib/sweep/ctx.cjs convention): { supabase, logger }.
 * execute(ctx) preserves the registry's documented load-bearing hook ORDER.
 */

/**
 * S11 post-stage hook: promote the chosen brand name into ventures.name.
 *
 * SD-LEO-FEAT-VENTURE-BRAND-GROUNDED-001 / FR-1
 *
 * Source of truth: identity_brand_name.artifact_data.decision.selectedName.
 *
 * PROVENANCE GUARD (no schema change).
 * LEAD risk evidence: ventures.name has a large blast radius (it threads into
 * repo names, prompts, docs, marketing copy and chairman-facing surfaces) AND
 * the system has NO placeholder-name convention — at creation the name is
 * auto-derived (discovery synthesis) and stored ONLY in ventures.name, with no
 * separate original-name column, no name_source column, and no name-change audit
 * row (verified live 2026-05-22). A naive "looks like a placeholder" string check
 * is therefore unsafe, so this hook self-stamps its own provenance instead:
 *
 *   metadata.brand_name_promotion = { promoted_name, prior_name, promoted_at, sd,
 *                                     source_selected_name }
 *
 * Decision table:
 *   - No marker (first run): the auto-derived creation name has never been promoted.
 *     Promote selectedName -> ventures.name and stamp the marker (records prior_name
 *     for audit). This is the single intended promotion window; it runs early and
 *     automatically in the same pipeline pass that produced the brand, before any
 *     chairman name-edit surface exists.
 *   - Marker present AND ventures.name === marker.promoted_name: the current name is
 *     still exactly the value WE last wrote, so it is safe. Refresh to a changed
 *     selectedName if needed (no write when already equal -> idempotent).
 *   - Marker present AND ventures.name !== marker.promoted_name: a human/chairman
 *     deliberately changed the name after our promotion. STOP permanently and never
 *     overwrite. This is the chairman-edit detector that satisfies the FR-1 invariant.
 *
 * Residual risk (documented): a human edit made BETWEEN creation and the very first
 * S11 promotion cannot be distinguished from the auto-derived creation name because
 * no creation-name baseline is persisted anywhere. This is mitigated by promotion
 * running early/automatically in-pipeline and by the no-op short-circuit when
 * selectedName already equals the current name. Closing it fully would require a
 * schema change (a creation-name/name_source column), which is out of scope here.
 *
 * Non-throwing / non-blocking: mirrors the GvosProfile hook posture — any error is
 * logged and swallowed so it never blocks stage advancement.
 *
 * @param {string} ventureId
 */
export async function namePromotion(ctx, ventureId) {
  const logger = ctx.logger;
  const SD_TAG = 'SD-LEO-FEAT-VENTURE-BRAND-GROUNDED-001';

  try {
    // Read the chosen name from the canonical identity_brand_name artifact.
    const { data: brandArtifact } = await ctx.supabase
      .from('venture_artifacts')
      .select('artifact_data')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'identity_brand_name')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const selectedName = brandArtifact?.artifact_data?.decision?.selectedName;
    if (!selectedName || typeof selectedName !== 'string' || !selectedName.trim()) {
      logger.log('[S11-NamePromotion] No decision.selectedName in identity_brand_name artifact — skipping');
      return;
    }
    const chosen = selectedName.trim();

    // Load current venture name + provenance marker.
    const { data: venture, error: ventureErr } = await ctx.supabase
      .from('ventures')
      .select('id, name, metadata')
      .eq('id', ventureId)
      .maybeSingle();

    if (ventureErr || !venture) {
      logger.warn('[S11-NamePromotion] venture load failed:', ventureErr?.message || 'venture not found');
      return;
    }

    const metadata = venture.metadata || {};
    const marker = metadata.brand_name_promotion || null;
    const currentName = venture.name || null;

    if (marker) {
      // Provenance guard: only the value we ourselves last promoted is safe to touch.
      if (currentName !== marker.promoted_name) {
        logger.log(
          '[S11-NamePromotion] Skipping — venture name was changed after promotion ' +
          `(deliberate/chairman edit detected). current=${JSON.stringify(currentName)} ` +
          `last_promoted=${JSON.stringify(marker.promoted_name)}`
        );
        return;
      }
      if (currentName === chosen) {
        logger.log('[S11-NamePromotion] Skipping — name already promoted to selected value (idempotent)');
        return;
      }
      // Safe refresh: name still equals our last promotion but selectedName changed.
    }

    // Promote (first run, or safe refresh).
    const newMarker = {
      promoted_name: chosen,
      prior_name: currentName,
      promoted_at: new Date().toISOString(),
      sd: SD_TAG,
      source_selected_name: chosen,
    };

    const { error: updateErr } = await ctx.supabase
      .from('ventures')
      .update({ name: chosen, metadata: { ...metadata, brand_name_promotion: newMarker } })
      .eq('id', ventureId);

    if (updateErr) {
      logger.warn('[S11-NamePromotion] ventures.name promotion update failed:', updateErr.message);
      return;
    }

    logger.log('[S11-NamePromotion] Promoted brand name', {
      ventureId,
      from: currentName,
      to: chosen,
    });
  } catch (err) {
    // Never throw — name promotion must never block stage advancement.
    logger.warn('[S11-NamePromotion] hook errored (non-fatal):', err.message);
  }
}

/**
 * S17 post-stage hook: Generate EVA vision + architecture plan documents.
 * @param {string} ventureId
 */
/**
 * S11 post-stage hook: Generate logo image from logoSpec via Imagen 3.
 * SD-EVA-FEAT-LOGO-IMAGEN-PIPELINE-001
 *
 * Viability gate: only renders for ventures past S7 (strategy formulation).
 * Idempotent: skips if logo already exists in venture_artifacts.
 */
export async function logoGeneration(ctx, ventureId) {
  const logger = ctx.logger;

  // Viability gate: check venture has passed S7
  const { data: stages } = await ctx.supabase
    .from('venture_stage_work')
    .select('lifecycle_stage')
    .eq('venture_id', ventureId)
    .gte('lifecycle_stage', 7)
    .limit(1);
  if (!stages || stages.length === 0) {
    logger.log('[S11-Logo] Skipping — venture has not passed S7');
    return;
  }

  // Idempotency: check if logo already exists
  const { data: existing } = await ctx.supabase
    .from('venture_artifacts')
    .select('id')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'identity_logo_image')
    .limit(1);
  if (existing && existing.length > 0) {
    logger.log('[S11-Logo] Skipping — logo already exists');
    return;
  }

  // SD-LEO-FEAT-VENTURE-BRAND-GROUNDED-001/FR-3: read logoSpec from the canonical
  // identity_brand_name artifact, not venture_stage_work.stage_data. The S11 analysis
  // writer (stage-templates/analysis-steps/stage-11-visual-identity.js) persists logoSpec
  // inside identity_brand_name.artifact_data.logoSpec — it is NOT reliably mirrored into
  // stage_data, which silently skipped logo generation for ventures that had a valid spec.
  // The `artifact_data` JSONB column is the writeArtifact mapping (artifact-persistence-service.js).
  let logoSpec = null;
  const { data: brandArtifact } = await ctx.supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'identity_brand_name')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  logoSpec = brandArtifact?.artifact_data?.logoSpec || null;

  // SD-REFILL-007PVF5E: removed the dead legacy venture_stage_work.stage_data fallback — that
  // column does not exist live (the read threw), and logoSpec is canonically sourced from the
  // identity_brand_name artifact above (SD-LEO-FEAT-VENTURE-BRAND-GROUNDED-001/FR-3), so the
  // fallback could never have recovered a spec the canonical read missed.
  if (!logoSpec) {
    logger.log('[S11-Logo] No logoSpec in identity_brand_name artifact — skipping');
    return;
  }

  // Get venture name for fallback prompt
  const { data: venture } = await ctx.supabase
    .from('ventures')
    .select('name')
    .eq('id', ventureId)
    .single();

  // Render logo via Imagen 3
  const { renderLogo } = await import('../bridge/imagen-logo-renderer.js');
  const result = await renderLogo(logoSpec, {
    ventureName: venture?.name || 'Venture',
    maxRetries: 2,
    logger,
  });

  if (!result) {
    logger.warn('[S11-Logo] Logo generation failed — venture will use text fallback');
    return;
  }

  // Upload to Supabase Storage
  const storagePath = `logos/${ventureId}/logo.png`;
  const { error: uploadErr } = await ctx.supabase.storage
    .from('venture-logos')
    .upload(storagePath, result.buffer, {
      contentType: result.mimeType,
      upsert: true,
    });

  if (uploadErr) {
    // Bucket may not exist yet — try to create it
    if (uploadErr.message?.includes('not found') || uploadErr.statusCode === 404) {
      logger.log('[S11-Logo] Creating venture-logos bucket');
      await ctx.supabase.storage.createBucket('venture-logos', { public: true });
      const { error: retryErr } = await ctx.supabase.storage
        .from('venture-logos')
        .upload(storagePath, result.buffer, { contentType: result.mimeType, upsert: true });
      if (retryErr) {
        logger.warn('[S11-Logo] Upload failed after bucket creation:', retryErr.message);
        return;
      }
    } else {
      logger.warn('[S11-Logo] Upload failed:', uploadErr.message);
      return;
    }
  }

  // Get public URL
  const { data: urlData } = ctx.supabase.storage
    .from('venture-logos')
    .getPublicUrl(storagePath);

  const logoUrl = urlData?.publicUrl;

  // Write logo artifact
  const { writeArtifact } = await import('../artifact-persistence-service.js');
  await writeArtifact(ctx.supabase, {
    ventureId,
    lifecycleStage: 11,
    artifactType: 'identity_logo_image',
    title: 'Logo Image (Imagen 3)',
    artifactData: { logoUrl, logoSpec, storagePath, generatedAt: new Date().toISOString() },
    metadata: { source: 'post-stage-11-hook', renderer: 'imagen-3' },
    source: 'post-stage-11-logo-hook',
  });

  logger.log('[S11-Logo] Logo generated and stored', { logoUrl, storagePath });
}

/**
 * S11 post-stage hook: Write venture_gvos_profile row using the rule-only classifier.
 *
 * SD-LEO-FEAT-GVOS-ACTIVATION-REMEDIATION-001 / FR-4
 *
 * Guarantees: zero @anthropic-ai/sdk invocations (rule_only mode). Idempotent
 * via UPSERT on venture_id. If venture lacks the inputs the rule classifier
 * needs (business_model_class, industry_tags, audience_tags), falls through
 * to emergency_default with chairman_warning audit log.
 *
 * GvosS17Sections gates rendering on useVentureArchetype(ventureId).data !== null;
 * this hook is the producer that makes the activation chain visible at S17.
 */
export async function gvosProfile(ctx, ventureId) {
  const logger = ctx.logger;

  try {
    // Idempotency: skip if profile row already exists
    const { data: existing, error: existErr } = await ctx.supabase
      .from('venture_gvos_profile')
      .select('id, archetype_id')
      .eq('venture_id', ventureId)
      .maybeSingle();

    if (existErr && existErr.code !== 'PGRST116') {
      logger.warn('[S11-GvosProfile] existence check failed:', existErr.message);
      return;
    }

    if (existing && existing.archetype_id) {
      logger.log('[S11-GvosProfile] Skipping — profile already exists for venture', ventureId);
      return;
    }

    // Load venture inputs for the rule-based classifier
    const { data: venture, error: ventureErr } = await ctx.supabase
      .from('ventures')
      .select('id, business_model_class, industry, vertical_category, tags, target_market')
      .eq('id', ventureId)
      .maybeSingle();

    if (ventureErr || !venture) {
      logger.warn('[S11-GvosProfile] venture load failed:', ventureErr?.message || 'venture not found');
      return;
    }

    // Call rule-only classifier (JS port of EHG/src/lib/gvos/auto-classifier.ts mode='rule_only').
    // Cross-repo parity contract documented in lib/gvos/rule-classifier.js.
    const { classifyArchetypeRuleOnly } = await import('../../lib/gvos/rule-classifier.js');
    const { buildClassifierInputFromVenture } = await import('../../lib/gvos/venture-classifier-inputs.js');
    const result = await classifyArchetypeRuleOnly(
      buildClassifierInputFromVenture(venture),
      ctx.supabase,
    );

    // archetype_selection_method enum (schema CHECK):
    // rule_based | llm_fallback | rule_fallback_below_threshold | emergency_default | chairman_override.
    // Pass through the classifier's method verbatim — no normalization needed.
    const profileRow = {
      venture_id: ventureId,
      version: 1,
      archetype_id: result.archetypeId || null,
      archetype_selection_method: result.method,
      archetype_selection_confidence: result.confidence,
      archetype_selection_rationale: result.rationale,
      business_model_class: venture.business_model_class || null,
    };

    // onConflict MUST match the table's actual unique constraint (venture_id, version).
    // Using 'venture_id' alone threw Postgres 42P10 and wrote 0 rows, which — combined
    // with the swallowed error below — left every new venture without a GVOS profile and
    // blanked Stage 17 (RCA 2026-05-22).
    const { error: upsertErr } = await ctx.supabase
      .from('venture_gvos_profile')
      .upsert(profileRow, { onConflict: 'venture_id,version' });

    if (upsertErr) {
      // Surface loudly: a silently-swallowed write here previously hid a 100%-reproducible
      // failure that blanked Stage 17 for all new ventures.
      logger.error('[S11-GvosProfile] profile upsert FAILED:', upsertErr.message);
      return;
    }

    // Low-confidence path → chairman_warning audit row (visible for manual override
    // via SQL runbook until the S11 chairman-override UI ships in a follow-up SD).
    if (result.confidence < 0.85) {
      // SD-REFILL-007PVF5E: conform to the live audit_log schema (mirrors lib/eva/forward-gate.js):
      // event_subtype/venture_id/details do not exist as columns; entity_type/entity_id are NOT NULL.
      // Fold the former phantom fields into metadata and address the row to the venture entity.
      const { error: warnErr } = await ctx.supabase.from('audit_log').insert({
        event_type: 'chairman_warning',
        entity_type: 'venture',
        entity_id: ventureId,
        severity: 'warning',
        metadata: {
          event_subtype: 'gvos_low_confidence_archetype',
          venture_id: ventureId,
          archetype_prompt_token: result.archetypePromptToken,
          confidence: result.confidence,
          rationale: result.rationale,
          sd: 'SD-LEO-FEAT-GVOS-ACTIVATION-REMEDIATION-001',
        },
      });
      if (warnErr && !/audit_log/i.test(warnErr.message || '')) {
        // audit_log may not exist in all environments; non-fatal
        logger.warn('[S11-GvosProfile] chairman_warning insert failed:', warnErr.message);
      }
    }

    logger.log('[S11-GvosProfile] profile written', {
      ventureId,
      archetype: result.archetypePromptToken,
      method: result.method,
      confidence: result.confidence,
    });
  } catch (err) {
    // Never throw — S11-LogoGeneration must remain the chairman-visible path.
    logger.warn('[S11-GvosProfile] hook errored (non-fatal):', err.message);
  }
}

/**
 * S11 execute — order is load-bearing (relocated comment):
 * NamePromotion runs first so the promoted brand name is in place for the logo
 * fallback prompt and downstream consumers (SD-LEO-FEAT-VENTURE-BRAND-GROUNDED-001/FR-1);
 * GvosProfile runs AFTER logo so classifier errors do not block logo rendering
 * (SD-LEO-FEAT-GVOS-ACTIVATION-REMEDIATION-001/FR-4). Each hook is independently
 * non-throwing, so ordering is failure-safe.
 */
export async function execute(ctx) {
  await namePromotion(ctx, ctx.ventureId);
  await logoGeneration(ctx, ctx.ventureId);
  await gvosProfile(ctx, ctx.ventureId);
}
