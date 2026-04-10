/**
 * Stage 15 Template - Design Studio
 * Phase: THE BLUEPRINT (Stages 13-16)
 * Part of SD-RESTRUCTURE-STAGE-15-MOVE-ORCH-001-B
 *
 * Dedicated design materialization: wireframe generation from brand genome +
 * technical architecture, visual convergence (5 expert LLM passes), and
 * Google Stitch provisioning.
 *
 * Risk register analysis has been moved to Stage 14
 * (SD-RESTRUCTURE-STAGE-15-MOVE-ORCH-001-B).
 *
 * @module lib/eva/stage-templates/stage-15
 */

import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage15WireframeGenerator } from './analysis-steps/stage-15-wireframe-generator.js';
import { analyzeStage19VisualConvergence } from './analysis-steps/stage-19-visual-convergence.js';
import { writeArtifact } from '../artifact-persistence-service.js';
import { generateUserStoryPack } from './analysis-steps/stage-15-user-story-pack.js';

const wireframeGatingEnabled = process.env.EVA_WIREFRAME_GATING_ENABLED === 'true';

/**
 * Extract Product Hunt competitor references from S10 brand data.
 * Normalizes various S10 field locations where PH data may reside.
 * SD-S15-WIREFRAME-BESTPRACTICE-ORCH-001-A
 *
 * @param {Object} stage10Data - Stage 10 data with brandGenome, competitive landscape, etc.
 * @returns {Array<{name: string, tagline: string}>} Normalized PH refs
 */
function extractProductHuntRefs(stage10Data) {
  if (!stage10Data) return [];

  const refs = [];

  // Check competitive_landscape (most common location)
  const landscape = stage10Data.competitive_landscape || stage10Data.competitiveLandscape || stage10Data.brandGenome?.competitive_landscape;
  if (Array.isArray(landscape)) {
    for (const entry of landscape) {
      if (entry && (entry.source === 'product_hunt' || entry.source === 'producthunt' || entry.platform === 'product_hunt')) {
        refs.push({ name: String(entry.name || entry.title || ''), tagline: String(entry.tagline || entry.description || '') });
      }
    }
  }

  // Check product_hunt_products (direct field)
  const phProducts = stage10Data.product_hunt_products || stage10Data.productHuntProducts;
  if (Array.isArray(phProducts)) {
    for (const p of phProducts) {
      if (p && p.name) {
        refs.push({ name: String(p.name), tagline: String(p.tagline || p.description || '') });
      }
    }
  }

  return refs.filter(r => r.name.length > 0);
}

const TEMPLATE = {
  id: 'stage-15',
  slug: 'design-studio',
  title: 'Design Studio',
  version: '5.0.0',
  schema: {
    wireframes: { type: 'object', required: wireframeGatingEnabled },
    wireframe_convergence: { type: 'object', required: false },
  },
  defaultData: {
    wireframes: null,
    wireframe_convergence: null,
  },

  validate(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['data is required and must be an object'] };
    }
    // When wireframe gating is enabled, wireframes are required
    if (wireframeGatingEnabled && !data.wireframes) {
      return { valid: false, errors: ['wireframes are required when EVA_WIREFRAME_GATING_ENABLED=true'] };
    }
    return { valid: true, errors: [] };
  },

  computeDerived(data) {
    return { ...data };
  },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);

TEMPLATE.analysisStep = async function stage15DesignStudio(ctx) {
  const logger = ctx.logger || console;

  // Sub-step 1: User story pack generation (runs BEFORE wireframes so stories inform wireframe context)
  // SD-S15-WIREFRAME-BESTPRACTICE-ORCH-001-A: reordered from sub-step 3 to sub-step 1
  let userStoryResult = null;
  try {
    userStoryResult = await generateUserStoryPack(ctx);
    if (userStoryResult && ctx.supabase && ctx.ventureId) {
      await writeArtifact(ctx.supabase, {
        ventureId: ctx.ventureId,
        lifecycleStage: 15,
        artifactType: 'blueprint_user_story_pack',
        title: 'User Story Pack (Stage 15)',
        artifactData: userStoryResult,
        content: JSON.stringify(userStoryResult),
        qualityScore: 70,
        validationStatus: 'validated',
        source: 'stage-15-user-story-pack',
        visionKey: ctx.visionKey || null,
        planKey: ctx.planKey || null,
      });
      logger.log('[Stage15-DesignStudio] User story pack artifact persisted', {
        epicCount: userStoryResult?.epics?.length || 0,
      });
    }
  } catch (err) {
    logger.warn('[Stage15-DesignStudio] User story pack generation failed (non-fatal)', { error: err.message });
  }

  // Sub-step 2: Wireframe generation (conditional on Stage 10 brand data)
  // Now receives user stories and Product Hunt refs as additional context
  let wireframeResult = null;
  if (ctx.stage10Data?.customerPersonas?.length > 0 && ctx.stage10Data?.brandGenome) {
    // Build enriched context with user stories and Product Hunt refs
    const wireframeCtx = { ...ctx };
    if (userStoryResult) {
      wireframeCtx.userStoryPack = userStoryResult;
    }

    // Extract Product Hunt refs from S10 competitive landscape
    const phRefs = extractProductHuntRefs(ctx.stage10Data);
    if (phRefs.length > 0) {
      wireframeCtx.productHuntRefs = phRefs;
    }

    try {
      wireframeResult = await analyzeStage15WireframeGenerator(wireframeCtx);
      logger.log('[Stage15-DesignStudio] Wireframe generation complete', {
        screenCount: wireframeResult?.screens?.length || 0,
      });

      // Persist wireframes as a separate artifact
      if (wireframeResult && ctx.supabase && ctx.ventureId) {
        try {
          await writeArtifact(ctx.supabase, {
            ventureId: ctx.ventureId,
            lifecycleStage: 15,
            artifactType: 'blueprint_wireframes',
            title: 'Design Studio Wireframes (Stage 15)',
            artifactData: { wireframes: wireframeResult },
            content: JSON.stringify({ wireframes: wireframeResult }),
            qualityScore: 70,
            validationStatus: 'validated',
            source: 'stage-15-design-studio',
            visionKey: ctx.visionKey || null,
            planKey: ctx.planKey || null,
          });
          logger.log('[Stage15-DesignStudio] Wireframe artifact persisted');
        } catch (persistErr) {
          logger.warn('[Stage15-DesignStudio] Wireframe artifact persist failed (non-fatal)', { error: persistErr.message });
        }
      }
    } catch (err) {
      if (wireframeGatingEnabled) {
        logger.error('[Stage15-DesignStudio] Wireframe generation FAILED (fail-closed, EVA_WIREFRAME_GATING_ENABLED=true)', { error: err.message });
        throw new Error(`[Stage15] Wireframe generation failed under gating: ${err.message}`);
      }
      logger.warn('[Stage15-DesignStudio] Wireframe generation failed (non-fatal)', { error: err.message });
    }
  } else {
    logger.log('[Stage15-DesignStudio] Skipping wireframes — Stage 10 brand data not available');
  }

  // Sub-step 3: Visual convergence (5 expert LLM passes on wireframes)
  let convergenceResult = null;
  if (wireframeResult?.screens?.length > 0) {
    try {
      convergenceResult = await analyzeStage19VisualConvergence(
        ctx.ventureId,
        { stage15_data: wireframeResult },
        { logger },
      );
      logger.log('[Stage15-DesignStudio] Visual convergence complete', {
        score: convergenceResult?.overall_score,
        verdict: convergenceResult?.verdict,
      });
    } catch (err) {
      logger.warn('[Stage15-DesignStudio] Visual convergence failed (non-fatal)', { error: err.message });
    }
  }

  return { wireframes: wireframeResult, wireframe_convergence: convergenceResult, user_story_pack: userStoryResult };
};

ensureOutputSchema(TEMPLATE);

export default TEMPLATE;
