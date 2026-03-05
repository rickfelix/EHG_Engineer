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

const router = Router();

// ── Asset Registry ──────────────────────────────────────────────

/**
 * GET /api/eva/exit/assets?venture_id=<uuid>
 * List assets for a venture.
 */
router.get('/assets', asyncHandler(async (req, res) => {
  const { venture_id } = req.query;
  if (!venture_id) {
    return res.status(400).json({ error: 'venture_id query parameter is required' });
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
router.get('/assets/:id', asyncHandler(async (req, res) => {
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

  if (!venture_id || !asset_name || !asset_type) {
    return res.status(400).json({ error: 'venture_id, asset_name, and asset_type are required' });
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
router.patch('/assets/:id', asyncHandler(async (req, res) => {
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
router.delete('/assets/:id', asyncHandler(async (req, res) => {
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
  if (!venture_id) {
    return res.status(400).json({ error: 'venture_id query parameter is required' });
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

  if (!venture_id || !exit_model) {
    return res.status(400).json({ error: 'venture_id and exit_model are required' });
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
  if (!venture_id) {
    return res.status(400).json({ error: 'venture_id query parameter is required' });
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

// ── Separability Scores (Phase 2) ──────────────────────────────
// SD: SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-B

/**
 * GET /api/eva/exit/scores/:ventureId
 * Get separability score history for a venture.
 */
router.get('/scores/:ventureId', asyncHandler(async (req, res) => {
  const { data, error } = await dbLoader.supabase
    .from('venture_separability_scores')
    .select('*')
    .eq('venture_id', req.params.ventureId)
    .order('scored_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

/**
 * GET /api/eva/exit/scores/:ventureId/latest
 * Get most recent separability score.
 */
router.get('/scores/:ventureId/latest', asyncHandler(async (req, res) => {
  const { data, error } = await dbLoader.supabase
    .from('venture_separability_scores')
    .select('*')
    .eq('venture_id', req.params.ventureId)
    .order('scored_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return res.status(404).json({ error: 'No scores found' });
  res.json(data);
}));

// ── Data Room Artifacts (Phase 2) ──────────────────────────────

/**
 * GET /api/eva/exit/data-room/:ventureId
 * List current data room artifacts for a venture.
 */
router.get('/data-room/:ventureId', asyncHandler(async (req, res) => {
  const { data, error } = await dbLoader.supabase
    .from('venture_data_room_artifacts')
    .select('id, artifact_type, artifact_version, content, content_hash, is_current, generated_at')
    .eq('venture_id', req.params.ventureId)
    .eq('is_current', true)
    .order('artifact_type');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
}));

/**
 * POST /api/eva/exit/data-room/:ventureId/generate
 * Trigger data room artifact refresh.
 */
router.post('/data-room/:ventureId/generate', asyncHandler(async (req, res) => {
  const { generateDataRoom } = await import('../../lib/eva/exit/data-room-generator.js');
  const { types } = req.body;

  const result = await generateDataRoom(req.params.ventureId, {
    supabase: dbLoader.supabase,
    types: types || undefined,
  });

  res.json(result);
}));

export default router;
