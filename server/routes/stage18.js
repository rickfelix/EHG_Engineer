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
import { UPSTREAM_ARTIFACT_TYPES, STAGE_MAP } from '../../lib/eva/stage-templates/upstream-artifact-types.js';

const router = Router();

const VALID_SECTIONS = [
  'tagline', 'app_store_desc', 'landing_hero',
  'email_welcome', 'email_onboarding', 'email_reengagement',
  'social_posts', 'seo_meta', 'blog_draft',
];

function titleForSection(section) {
  return 'Marketing ' + section.replace(/_/g, ' ');
}

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
      title: titleForSection(section),
      lifecycle_stage: 18,
      artifact_data: copyResult[section],
    });
  }
  if (upserts.length === 0) return { error: null };
  const { error } = await supabase.from('venture_artifacts')
    .upsert(upserts, { onConflict: 'venture_id,artifact_type' });
  if (error) console.error('[stage18-route] artifact upsert error:', error.message);
  return { error };
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

  const { error: storageError } = await storeMarketingArtifacts(supabase, ventureId, result);
  if (storageError) {
    return res.status(500).json({
      error: 'Failed to persist marketing artifacts: ' + storageError.message,
      code: 'ARTIFACT_STORAGE_FAILED',
      data: result,
    });
  }

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
      title: titleForSection(section),
      lifecycle_stage: 18,
      artifact_data: sectionData,
    }, { onConflict: 'venture_id,artifact_type' });

  if (error) {
    console.error('[stage18-route] regenerate upsert error:', error.message);
    return res.status(500).json({
      error: 'Failed to persist regenerated section: ' + error.message,
      code: 'ARTIFACT_STORAGE_FAILED',
      data: { [section]: sectionData },
    });
  }

  return res.status(200).json({ status: 'success', data: { [section]: sectionData } });
}));

export default router;
