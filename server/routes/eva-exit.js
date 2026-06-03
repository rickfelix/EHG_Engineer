/**
 * EVA Exit Readiness API Routes
 *
 * SD: SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-A
 *
 * CRUD for venture assets and exit profiles.
 * Mounted at /api/eva/exit
 *
 * @module server/routes/eva-exit
 */

import { Router } from 'express';
import { dbLoader } from '../config.js';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { isValidUuid, validateUuidParam, isValidStringLength } from '../middleware/validate.js';

const router = Router();

// ── Asset Registry ──────────────────────────────────────────────

/**
 * GET /api/eva/exit/assets?venture_id=<uuid>
 * List assets for a venture.
 */
router.get('/assets', asyncHandler(async (req, res) => {
  const { venture_id } = req.query;
  if (!venture_id || !isValidUuid(venture_id)) {
    return res.status(400).json({ error: 'venture_id query parameter is required and must be a valid UUID' });
  }

  const { data, error } = await dbLoader.supabase
    .from('venture_asset_registry')
    .select('*')
    .eq('venture_id', venture_id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

/**
 * GET /api/eva/exit/assets/:id
 * Get a single asset by ID.
 */
router.get('/assets/:id', validateUuidParam('id'), asyncHandler(async (req, res) => {
  const { data, error } = await dbLoader.supabase
    .from('venture_asset_registry')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Asset not found' });
  res.json(data);
}));

/**
 * POST /api/eva/exit/assets
 * Create a new asset.
 */
router.post('/assets', asyncHandler(async (req, res) => {
  const { venture_id, asset_name, asset_type, description, estimated_value, provenance } = req.body;

  if (!venture_id || !isValidUuid(venture_id)) {
    return res.status(400).json({ error: 'venture_id is required and must be a valid UUID' });
  }
  if (!asset_name || !isValidStringLength(asset_name, 500)) {
    return res.status(400).json({ error: 'asset_name is required and must be under 500 characters' });
  }
  if (!asset_type || !isValidStringLength(asset_type, 100)) {
    return res.status(400).json({ error: 'asset_type is required and must be under 100 characters' });
  }

  const { data, error } = await dbLoader.supabase
    .from('venture_asset_registry')
    .insert({
      venture_id,
      asset_name,
      asset_type,
      description: description || null,
      estimated_value: estimated_value || null,
      provenance: provenance || {},
      created_by: req.user?.id || null
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}));

/**
 * PATCH /api/eva/exit/assets/:id
 * Update an asset.
 */
router.patch('/assets/:id', validateUuidParam('id'), asyncHandler(async (req, res) => {
  const { asset_name, asset_type, description, estimated_value, provenance } = req.body;

  const updates = {};
  if (asset_name !== undefined) updates.asset_name = asset_name;
  if (asset_type !== undefined) updates.asset_type = asset_type;
  if (description !== undefined) updates.description = description;
  if (estimated_value !== undefined) updates.estimated_value = estimated_value;
  if (provenance !== undefined) updates.provenance = provenance;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await dbLoader.supabase
    .from('venture_asset_registry')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}));

/**
 * DELETE /api/eva/exit/assets/:id
 * Delete an asset.
 */
router.delete('/assets/:id', validateUuidParam('id'), asyncHandler(async (req, res) => {
  const { error } = await dbLoader.supabase
    .from('venture_asset_registry')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
}));

// ── Exit Profiles ───────────────────────────────────────────────

/**
 * GET /api/eva/exit/profiles?venture_id=<uuid>
 * Get current exit profile for a venture.
 */
router.get('/profiles', asyncHandler(async (req, res) => {
  const { venture_id, include_history } = req.query;
  if (!venture_id || !isValidUuid(venture_id)) {
    return res.status(400).json({ error: 'venture_id query parameter is required and must be a valid UUID' });
  }

  let query = dbLoader.supabase
    .from('venture_exit_profiles')
    .select('*')
    .eq('venture_id', venture_id);

  if (include_history !== 'true') {
    query = query.eq('is_current', true);
  }

  const { data, error } = await query.order('version', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

/**
 * POST /api/eva/exit/profiles
 * Set or change exit model for a venture (creates new version).
 */
router.post('/profiles', asyncHandler(async (req, res) => {
  const { venture_id, exit_model, notes, target_buyer_type } = req.body;

  if (!venture_id || !isValidUuid(venture_id)) {
    return res.status(400).json({ error: 'venture_id is required and must be a valid UUID' });
  }
  if (!exit_model || !isValidStringLength(exit_model, 200)) {
    return res.status(400).json({ error: 'exit_model is required and must be under 200 characters' });
  }

  // Get current version number
  const { data: existing } = await dbLoader.supabase
    .from('venture_exit_profiles')
    .select('version')
    .eq('venture_id', venture_id)
    .eq('is_current', true)
    .single();

  const nextVersion = (existing?.version || 0) + 1;

  // Mark previous as not current
  if (existing) {
    await dbLoader.supabase
      .from('venture_exit_profiles')
      .update({ is_current: false })
      .eq('venture_id', venture_id)
      .eq('is_current', true);
  }

  // Insert new profile
  const { data, error } = await dbLoader.supabase
    .from('venture_exit_profiles')
    .insert({
      venture_id,
      exit_model,
      version: nextVersion,
      notes: notes || null,
      target_buyer_type: target_buyer_type || null,
      is_current: true,
      created_by: req.user?.id || null
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}));

/**
 * GET /api/eva/exit/summary?venture_id=<uuid>
 * Get exit readiness summary (asset count + current profile).
 */
router.get('/summary', asyncHandler(async (req, res) => {
  const { venture_id } = req.query;
  if (!venture_id || !isValidUuid(venture_id)) {
    return res.status(400).json({ error: 'venture_id query parameter is required and must be a valid UUID' });
  }

  const [assetsResult, profileResult, ventureResult] = await Promise.all([
    dbLoader.supabase
      .from('venture_asset_registry')
      .select('id, asset_type', { count: 'exact' })
      .eq('venture_id', venture_id),
    dbLoader.supabase
      .from('venture_exit_profiles')
      .select('*')
      .eq('venture_id', venture_id)
      .eq('is_current', true)
      .single(),
    dbLoader.supabase
      .from('ventures')
      .select('pipeline_mode')
      .eq('id', venture_id)
      .single()
  ]);

  const assets = assetsResult.data || [];
  const assetsByType = {};
  for (const a of assets) {
    assetsByType[a.asset_type] = (assetsByType[a.asset_type] || 0) + 1;
  }

  res.json({
    venture_id,
    pipeline_mode: ventureResult.data?.pipeline_mode || null,
    asset_count: assetsResult.count || 0,
    assets_by_type: assetsByType,
    current_exit_profile: profileResult.data || null
  });
}));

// ── Portfolio Exit Readiness ────────────────────────────────────
// SD: SD-LEO-FEAT-ACQUISITION-READINESS-GAP-001 (ARG05:US-005)

/**
 * GET /api/eva/exit/portfolio-readiness
 * Aggregated exit readiness across all ventures owned by the user.
 * Returns venture array with separability scores, data room completion, and rehearsal dates.
 */
router.get('/portfolio-readiness', asyncHandler(async (req, res) => {
  // Get all ventures
  const { data: ventures, error: ventureError } = await dbLoader.supabase
    .from('ventures')
    .select('id, name, pipeline_mode')
    .order('name');

  if (ventureError) return res.status(500).json({ error: ventureError.message });
  if (!ventures || ventures.length === 0) return res.json([]);

  const ventureIds = ventures.map(v => v.id);

  // Parallel fetch: exit profiles, latest scores, asset counts, data room completeness
  const [profilesResult, scoresResult, assetsResult, dataRoomResult] = await Promise.all([
    dbLoader.supabase
      .from('venture_exit_profiles')
      .select('venture_id, exit_model, readiness_assessment, updated_at')
      .in('venture_id', ventureIds)
      .eq('is_current', true),
    dbLoader.supabase
      .from('venture_separability_scores')
      .select('venture_id, overall_score, scored_at')
      .in('venture_id', ventureIds)
      .order('scored_at', { ascending: false }),
    dbLoader.supabase
      .from('venture_asset_registry')
      .select('venture_id')
      .in('venture_id', ventureIds),
    dbLoader.supabase
      .from('venture_data_room_artifacts')
      .select('venture_id, is_current')
      .in('venture_id', ventureIds)
      .eq('is_current', true),
  ]);

  // Index profiles by venture_id
  const profileMap = {};
  for (const p of profilesResult.data || []) {
    profileMap[p.venture_id] = p;
  }

  // Index latest score per venture (first match per venture since ordered desc)
  const scoreMap = {};
  for (const s of scoresResult.data || []) {
    if (!scoreMap[s.venture_id]) scoreMap[s.venture_id] = s;
  }

  // Count assets per venture
  const assetCountMap = {};
  for (const a of assetsResult.data || []) {
    assetCountMap[a.venture_id] = (assetCountMap[a.venture_id] || 0) + 1;
  }

  // Count data room artifacts per venture (approximation for data_room_pct)
  const dataRoomCountMap = {};
  for (const d of dataRoomResult.data || []) {
    dataRoomCountMap[d.venture_id] = (dataRoomCountMap[d.venture_id] || 0) + 1;
  }

  // Assemble response
  const result = ventures.map(v => {
    const profile = profileMap[v.id];
    const score = scoreMap[v.id];
    const rehearsal = profile?.readiness_assessment;

    return {
      id: v.id,
      name: v.name,
      pipeline_mode: v.pipeline_mode || null,
      exit_model: profile?.exit_model || null,
      separability_score: score?.overall_score ?? null,
      data_room_pct: dataRoomCountMap[v.id] ? Math.min(Math.round((dataRoomCountMap[v.id] / 8) * 100), 100) : null,
      last_rehearsal: rehearsal ? profile.updated_at : null,
      asset_count: assetCountMap[v.id] || 0,
    };
  });

  res.json(result);
}));

// ── Separability Scores + Data Room Artifact read/generate routes (Phase 2) ──
// REMOVED by SD-LEO-REFAC-RECONCILE-EVA-EXIT-001 (FR-2): GET /scores/:ventureId,
// GET /scores/:ventureId/latest, GET /data-room/:ventureId, and
// POST /data-room/:ventureId/generate were zero-caller dead paths. The underlying
// tables (venture_separability_scores, venture_data_room_artifacts) and
// lib/eva/exit/data-room-generator.js persist; the internal scheduler
// (lib/eva/operations/domain-handler.js) drives generation directly, so the HTTP
// generate wrapper was redundant.

// ── Separation Rehearsal (Phase 3) ────────────────────────────
// SD: SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C

/**
 * POST /api/eva/exit/:ventureId/rehearsal
 * Trigger a separation rehearsal (dry_run or full).
 */
router.post('/:ventureId/rehearsal', validateUuidParam('ventureId'), asyncHandler(async (req, res) => {
  const { mode } = req.body;
  const validModes = ['dry_run', 'full'];
  const rehearsalMode = validModes.includes(mode) ? mode : 'dry_run';

  const { rehearseSeparation } = await import('../../lib/eva/exit/separation-rehearsal.js');
  const result = await rehearseSeparation(req.params.ventureId, rehearsalMode, dbLoader.supabase);
  res.json(result);
}));

/**
 * GET /api/eva/exit/:ventureId/rehearsal/latest
 * Get most recent rehearsal results (stored on exit profile).
 */
router.get('/:ventureId/rehearsal/latest', validateUuidParam('ventureId'), asyncHandler(async (req, res) => {
  const { data, error } = await dbLoader.supabase
    .from('venture_exit_profiles')
    .select('readiness_assessment, updated_at')
    .eq('venture_id', req.params.ventureId)
    .eq('is_current', true)
    .single();

  if (error) return res.status(404).json({ error: 'No exit profile found for this venture' });
  res.json({
    venture_id: req.params.ventureId,
    rehearsal_results: data.readiness_assessment || null,
    last_updated: data.updated_at
  });
}));

// ── Data Room Templates (Phase 3) ────────────────────────────

/**
 * GET /api/eva/exit/:ventureId/data-room/template
 * Get data room document checklist for venture's current exit model.
 */
router.get('/:ventureId/data-room/template', validateUuidParam('ventureId'), asyncHandler(async (req, res) => {
  const { generateDataRoomChecklist } = await import('../../lib/eva/exit/data-room-templates.js');
  const result = await generateDataRoomChecklist(req.params.ventureId, dbLoader.supabase);
  res.json(result);
}));

/**
 * GET /api/eva/exit/:ventureId/data-room/completeness
 * Get data room completion percentage and missing items.
 */
router.get('/:ventureId/data-room/completeness', validateUuidParam('ventureId'), asyncHandler(async (req, res) => {
  const { generateDataRoomChecklist } = await import('../../lib/eva/exit/data-room-templates.js');
  const checklist = await generateDataRoomChecklist(req.params.ventureId, dbLoader.supabase);

  const missing = checklist.items.filter(i => i.status === 'missing' && i.required);
  const stale = checklist.items.filter(i => i.status === 'stale');

  res.json({
    venture_id: req.params.ventureId,
    exit_model: checklist.exit_model,
    completion_pct: checklist.completion_pct,
    total_required: checklist.total_required,
    completed: checklist.completed,
    missing_required: missing.map(i => ({ document_type: i.document_type, title: i.title })),
    stale_documents: stale.map(i => ({ document_type: i.document_type, title: i.title })),
    warnings: checklist.warnings || []
  });
}));

// ── Business Readiness ─────────────────────────────────────────
// SD: SD-LEO-INFRA-EXIT-BUSINESS-READINESS-001
// REMOVED by SD-LEO-REFAC-RECONCILE-EVA-EXIT-001 (FR-2/FR-3): GET /readiness/:ventureId
// and PATCH /readiness/:ventureId were zero-caller dead paths. FR-1 (database-introspected)
// found venture_exit_readiness is the live CANONICAL table but has 0 rows and no inserter,
// so GET always 404'd and PATCH's .update() could never match a row. The PATCH route's
// non-duplicated scoring + chairman-escalation logic (computeReadinessScore + the
// 2-consecutive-period latch) was preserved — not lost — by porting it to the unit-tested
// lib/eva/exit/readiness-score.js (computeReadinessScore, shouldTriggerChairmanReview).
// (exit_readiness_tracking, referenced by the ehg useExitReadiness hook, does not exist —
// its migration was never applied; tracked as an M3 follow-on, out of scope here.)

export default router;
