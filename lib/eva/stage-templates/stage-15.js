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

const TEMPLATE = {
  id: 'stage-15',
  slug: 'design-studio',
  title: 'Design Studio',
  version: '4.0.0',
  schema: {
    wireframes: { type: 'object', required: false },
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
    // Design Studio output is conditional — wireframes may be null if
    // Stage 10 brand data is not available. This is valid.
    return { valid: true, errors: [] };
  },

  computeDerived(data) {
    return { ...data };
  },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);

TEMPLATE.analysisStep = async function stage15DesignStudio(ctx) {
  const logger = ctx.logger || console;

  // Sub-step 1: Wireframe generation (conditional on Stage 10 brand data)
  let wireframeResult = null;
  if (ctx.stage10Data?.customerPersonas?.length > 0 && ctx.stage10Data?.brandGenome) {
    try {
      wireframeResult = await analyzeStage15WireframeGenerator(ctx);
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
      logger.warn('[Stage15-DesignStudio] Wireframe generation failed (non-fatal)', { error: err.message });
    }
  } else {
    logger.log('[Stage15-DesignStudio] Skipping wireframes — Stage 10 brand data not available');
  }

  // Sub-step 2: Visual convergence (5 expert LLM passes on wireframes)
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

  return { wireframes: wireframeResult, wireframe_convergence: convergenceResult };
};

ensureOutputSchema(TEMPLATE);

export default TEMPLATE;
