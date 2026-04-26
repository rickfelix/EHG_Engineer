/**
 * Stage 18 Marketing Copy Studio API Routes
 *
 * Path: /api/stage18
 *
 * Endpoints:
 *   POST /:ventureId/generate-copy      - Generate all 9 marketing copy sections
 *   POST /:ventureId/regenerate/:section - Regenerate a single section
 *
 * SD-MAN-ORCH-S18-S26-PIPELINE-001-A
 *
 * @module server/routes/stage18
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { isValidUuid } from '../middleware/validate.js';
import { analyzeStage18MarketingCopy } from '../../lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js';

const router = Router();

const VALID_SECTIONS = [
  'tagline', 'app_store_desc', 'landing_hero',
  'email_welcome', 'email_onboarding', 'email_reengagement',
  'social_posts', 'seo_meta', 'blog_draft',
];

const UPSTREAM_ARTIFACT_TYPES = [
  'truth_idea_brief', 'truth_competitive_analysis',
  'engine_pricing_model', 'engine_business_model_canvas',
  'identity_persona_brand', 'identity_brand_guidelines',
  'identity_naming_visual', 'identity_brand_name',
  'identity_gtm_sales_strategy', 'blueprint_product_roadmap',
  'blueprint_user_story_pack', 'blueprint_financial_projection',
];

const STAGE_MAP = {
  truth_idea_brief: 1, truth_competitive_analysis: 4,
  engine_pricing_model: 7, engine_business_model_canvas: 8,
  identity_persona_brand: 10, identity_brand_guidelines: 10,
  identity_naming_visual: 11, identity_brand_name: 11,
  identity_gtm_sales_strategy: 12, blueprint_product_roadmap: 13,
  blueprint_user_story_pack: 15, blueprint_financial_projection: 16,
};

async function fetchUpstreamAndVenture(supabase, ventureId) {
  const [{ data: venture }, { data: artifacts }] = await Promise.all([
    supabase.from('ventures').select('name').eq('id', ventureId).single(),
    supabase.from('venture_artifacts')
      .select('artifact_type, artifact_data')
      .eq('venture_id', ventureId)
      .in('artifact_type', UPSTREAM_ARTIFACT_TYPES),
  ]);

  const params = { ventureName: venture?.name || 'Unknown Venture' };
  for (const art of (artifacts || [])) {
    const stageNum = STAGE_MAP[art.artifact_type];
    if (stageNum) {
      const key = `stage${stageNum}Data`;
      params[key] = params[key] || {};
      params[key].__byType = params[key].__byType || {};
      params[key].__byType[art.artifact_type] = art;
    }
  }
  return params;
}

async function storeMarketingArtifacts(supabase, ventureId, copyResult) {
  const upserts = [];
  for (const section of VALID_SECTIONS) {
    if (!copyResult[section]) continue;
    upserts.push({
      venture_id: ventureId,
      artifact_type: `marketing_${section}`,
      stage_number: 18,
      artifact_data: copyResult[section],
    });
  }
  if (upserts.length === 0) return;
  const { error } = await supabase.from('venture_artifacts')
    .upsert(upserts, { onConflict: 'venture_id,artifact_type' });
  if (error) console.error('[stage18-route] artifact upsert error:', error.message);
}

/**
 * POST /api/stage18/:ventureId/generate-copy
 * Generates all 9 marketing copy sections from upstream artifacts.
 */
router.post('/:ventureId/generate-copy', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const supabase = req.app.locals.supabase || req.supabase;
  const params = await fetchUpstreamAndVenture(supabase, ventureId);
  const result = await analyzeStage18MarketingCopy(params);

  await storeMarketingArtifacts(supabase, ventureId, result);

  return res.status(200).json({ status: 'success', data: result });
}));

/**
 * POST /api/stage18/:ventureId/regenerate/:section
 * Regenerates a single marketing copy section.
 */
router.post('/:ventureId/regenerate/:section', asyncHandler(async (req, res) => {
  const { ventureId, section } = req.params;

  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }
  if (!VALID_SECTIONS.includes(section)) {
    return res.status(400).json({
      error: 'Invalid section. Must be one of: ' + VALID_SECTIONS.join(', '),
      code: 'INVALID_SECTION',
    });
  }

  const supabase = req.app.locals.supabase || req.supabase;
  const params = await fetchUpstreamAndVenture(supabase, ventureId);
  const result = await analyzeStage18MarketingCopy(params);

  const sectionData = result[section];
  if (!sectionData) {
    return res.status(500).json({ error: 'Failed to generate section: ' + section, code: 'GENERATION_FAILED' });
  }

  const { error } = await supabase.from('venture_artifacts')
    .upsert({
      venture_id: ventureId,
      artifact_type: 'marketing_' + section,
      stage_number: 18,
      artifact_data: sectionData,
    }, { onConflict: 'venture_id,artifact_type' });

  if (error) console.error('[stage18-route] regenerate upsert error:', error.message);

  return res.status(200).json({ status: 'success', data: { [section]: sectionData } });
}));

export default router;
