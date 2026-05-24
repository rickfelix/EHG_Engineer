/**
 * Ventures API Routes
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { dbLoader } from '../config.js';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { isValidUuid, validateUuidParam, isValidStringLength } from '../middleware/validate.js';
import { deleteVentureFully } from '../../lib/deleteVentureFully.js';

const router = Router();

// Resolve a service-role Supabase client. Prefers an injected client
// (req.app.locals.supabase) so route tests can supply a mock; falls back to a
// fresh service-role client for the running server.
function resolveServiceClient(req) {
  return (
    req?.app?.locals?.supabase ||
    createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
  );
}

/**
 * Aggregate an array of deleteVentureFully() results into the master-reset
 * cleanup summary shape (preserves the pre-refactor response contract).
 */
function aggregateTeardownResults(results) {
  return {
    repos_deleted: results.filter(r => r.phases?.github_repo?.status === 'deleted').length,
    repos_failed: results.filter(r => r.phases?.github_repo?.status === 'failed').length,
    credentials_revoked: results.reduce((n, r) => n + (r.phases?.credentials?.revoked?.length || 0), 0),
    credentials_failed: results.reduce((n, r) => n + (r.phases?.credentials?.failed?.length || 0), 0),
    credentials_skipped: results.reduce((n, r) => n + (r.phases?.credentials?.skipped?.length || 0), 0),
    registry_cleaned: results.some(r => r.phases?.registry?.cleaned),
  };
}

// Get all ventures
router.get('/', asyncHandler(async (req, res) => {
  const { data, error } = await dbLoader.supabase
    .from('ventures')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching ventures:', error);
    return res.status(500).json({ error: error.message });
  }

  const ventures = data || [];

  res.json(ventures);
}));

// Get single venture by ID
router.get('/:id', validateUuidParam('id'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data, error } = await dbLoader.supabase
    .from('ventures')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching venture:', error);
    return res.status(404).json({ error: 'Venture not found' });
  }

  res.json(data);
}));

// Get artifacts for a venture
router.get('/:id/artifacts', validateUuidParam('id'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { stage } = req.query;

  let query = dbLoader.supabase
    .from('venture_artifacts')
    .select('*')
    .eq('venture_id', id)
    .eq('is_current', true)
    .order('lifecycle_stage', { ascending: true });

  if (stage) {
    query = query.eq('lifecycle_stage', parseInt(stage));
  }

  const { data: artifacts, error: artifactsError } = await query;

  if (!artifactsError && artifacts && artifacts.length > 0) {
    const formattedArtifacts = artifacts.map(a => ({
      id: a.id,
      venture_id: a.venture_id,
      stage: a.lifecycle_stage,
      type: a.artifact_type,
      title: a.title,
      content: a.content,
      summary: a.metadata?.summary || a.title,
      file_url: a.file_url,
      version: a.version,
      epistemic_classification: a.epistemic_classification,
      created_at: a.created_at,
      updated_at: a.updated_at
    }));
    return res.json(formattedArtifacts);
  }

  // Fallback to venture_stage_work table for stage progress info
  const { data: stageWork, error: stageError } = await dbLoader.supabase
    .from('venture_stage_work')
    .select('*')
    .eq('venture_id', id)
    .order('lifecycle_stage', { ascending: true });

  if (stageError) {
    console.error('Error fetching stage work:', stageError);
    return res.json([]);
  }

  const formattedWork = (stageWork || []).map(sw => ({
    id: sw.id,
    venture_id: sw.venture_id,
    stage: sw.lifecycle_stage,
    type: sw.work_type || 'stage_work',
    title: `Stage ${sw.lifecycle_stage} Work`,
    status: sw.stage_status,
    health_score: sw.health_score,
    advisory_data: sw.advisory_data,
    started_at: sw.started_at,
    completed_at: sw.completed_at
  }));

  res.json(formattedWork);
}));

// Kill gate stages that require chairman approval before entry
const GATE_STAGES = [3, 5, 10, 22, 23, 24];

// Update venture stage
router.patch('/:id/stage', validateUuidParam('id'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;

  if (!stage || stage < 1 || stage > 26) {
    return res.status(400).json({ error: 'Invalid stage. Must be 1-26.' });
  }

  // Gate enforcement: if target stage is a gate, require chairman approval
  if (GATE_STAGES.includes(stage)) {
    const { data: approval } = await dbLoader.supabase
      .from('chairman_decisions')
      .select('id')
      .eq('venture_id', id)
      .eq('lifecycle_stage', stage)
      .eq('status', 'approved')
      .is('deleted_at', null) // SD-FIX-STAGE-TIMING-ZEROS-ORCH-001-B: exclude soft-deleted
      .in('decision', ['pass', 'go', 'proceed', 'approve', 'conditional_pass', 'conditional_go', 'continue', 'release'])
      .limit(1);

    if (!approval || approval.length === 0) {
      return res.status(403).json({
        error: 'Gate stage requires chairman approval',
        gate_stage: stage
      });
    }
  }

  const { data, error } = await dbLoader.supabase
    .from('ventures')
    .update({
      current_lifecycle_stage: stage
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating venture stage:', error);
    return res.status(500).json({ error: error.message });
  }

  // Emit event for observability
  console.log(`[VentureStage] Venture ${id} advanced to stage ${stage} via API`);

  res.json(data);
}));

// Create or update artifact for a venture stage
router.post('/:id/artifacts', validateUuidParam('id'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { stage, artifact_type, title, content, metadata } = req.body;

  if (!stage || !artifact_type || !title) {
    return res.status(400).json({
      error: 'Missing required fields: stage, artifact_type, title'
    });
  }

  // Mark existing artifacts of this type as not current
  await dbLoader.supabase
    .from('venture_artifacts')
    .update({ is_current: false })
    .eq('venture_id', id)
    .eq('lifecycle_stage', stage)
    .eq('artifact_type', artifact_type);

  // Get next version number
  const { data: existing } = await dbLoader.supabase
    .from('venture_artifacts')
    .select('version')
    .eq('venture_id', id)
    .eq('lifecycle_stage', stage)
    .eq('artifact_type', artifact_type)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = (existing?.[0]?.version || 0) + 1;

  // Insert new artifact
  const { data, error } = await dbLoader.supabase
    .from('venture_artifacts')
    .insert({
      venture_id: id,
      lifecycle_stage: stage,
      artifact_type,
      title,
      content,
      metadata: metadata || {},
      version: nextVersion,
      is_current: true
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating artifact:', error);
    return res.status(500).json({ error: error.message });
  }

  // Post-INSERT dedup: demote any concurrent duplicate is_current=true rows that snuck in
  // during the mark-then-insert TOCTOU window.
  await dbLoader.supabase
    .from('venture_artifacts')
    .update({ is_current: false })
    .eq('venture_id', id)
    .eq('lifecycle_stage', stage)
    .eq('artifact_type', artifact_type)
    .eq('is_current', true)
    .neq('id', data.id);

  res.status(201).json({
    id: data.id,
    venture_id: data.venture_id,
    stage: data.lifecycle_stage,
    type: data.artifact_type,
    title: data.title,
    content: data.content,
    version: data.version,
    created_at: data.created_at
  });
}));

// Create new venture — Routes through Stage 0 queue for chairman review
// SD-LEO-INFRA-UNIFIED-VENTURE-CREATION-001-A: Stage 0 Gate Enforcement
router.post('/', asyncHandler(async (req, res) => {
  const ventureData = req.body;

  // SD-LEO-FIX-API-ROUTE-AUTH-001: Input validation
  if (!ventureData.name || !isValidStringLength(ventureData.name, 500)) {
    return res.status(400).json({ error: 'name is required and must be under 500 characters' });
  }
  if (ventureData.problem_statement && !isValidStringLength(ventureData.problem_statement, 5000)) {
    return res.status(400).json({ error: 'problem_statement must be under 5000 characters' });
  }
  if (ventureData.origin_type && !['manual', 'competitor_clone', 'blueprint'].includes(ventureData.origin_type)) {
    return res.status(400).json({ error: 'origin_type must be one of: manual, competitor_clone, blueprint' });
  }

  // Route to Stage 0 queue instead of direct INSERT into ventures
  const prompt = [
    ventureData.name,
    ventureData.problem_statement,
    ventureData.solution,
    ventureData.target_market
  ].filter(Boolean).join('. ');

  const { data, error } = await dbLoader.supabase
    .from('stage_zero_requests')
    .insert({
      prompt: prompt || ventureData.name,
      status: 'pending',
      priority: 0,
      result: {
        origin: 'api',
        origin_type: ventureData.origin_type || 'manual',
        venture_metadata: {
          name: ventureData.name,
          description: ventureData.description,
          problem_statement: ventureData.problem_statement,
          solution: ventureData.solution,
          target_market: ventureData.target_market,
          competitor_ref: ventureData.competitor_ref || null
        }
      }
    })
    .select('id, status, created_at')
    .single();

  if (error) {
    console.error('Error creating stage zero request:', error);
    return res.status(500).json({ error: error.message });
  }

  res.status(202).json({
    stage_zero_request_id: data.id,
    status: data.status,
    message: 'Venture creation queued for Stage 0 chairman review',
    created_at: data.created_at
  });
}));

// Competitor Analysis - IDEATION-GENESIS-AUDIT: Real market intelligence
router.post('/competitor-analysis', asyncHandler(async (req, res) => {
  const { url, include_full_analysis = false } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'URL is required'
    });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL format'
    });
  }

  try {
    const { default: CompetitorIntelligenceService } = await import('../../lib/research/competitor-intelligence.js');
    const service = new CompetitorIntelligenceService();

    console.log(`[competitor-analysis] Analyzing: ${url}`);
    const startTime = Date.now();

    const analysis = await service.analyzeCompetitor(url);

    console.log(`[competitor-analysis] Complete in ${Date.now() - startTime}ms`);

    const response = {
      success: true,
      venture: {
        name: analysis.name,
        problem_statement: analysis.problem_statement,
        solution: analysis.solution,
        target_market: analysis.target_market,
        competitor_reference: analysis.competitor_reference
      },
      four_buckets_summary: {
        facts_count: analysis.four_buckets?.facts?.length || 0,
        assumptions_count: analysis.four_buckets?.assumptions?.length || 0,
        simulations_count: analysis.four_buckets?.simulations?.length || 0,
        unknowns_count: analysis.four_buckets?.unknowns?.length || 0
      },
      quality: analysis.quality,
      metadata: analysis.metadata
    };

    if (include_full_analysis) {
      response.full_analysis = {
        four_buckets: analysis.four_buckets,
        competitive_intelligence: analysis.competitive_intelligence
      };
    }

    res.json(response);

  } catch (error) {
    console.error('[competitor-analysis] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let domain = '';
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = url;
    }

    res.json({
      success: true,
      venture: {
        name: `${domain.replace('www.', '').split('.')[0].toUpperCase()} Alternative`,
        problem_statement: `[Analysis failed: ${errorMessage}] - Unable to analyze competitor. Please try again or enter details manually.`,
        solution: 'Manual entry required - competitor analysis unavailable',
        target_market: 'To be determined',
        competitor_reference: url
      },
      four_buckets_summary: {
        facts_count: 0,
        assumptions_count: 0,
        simulations_count: 0,
        unknowns_count: 1
      },
      quality: {
        confidence_score: 0,
        data_quality: 'failed',
        analysis_notes: `Real-time analysis failed: ${errorMessage}`
      },
      _fallback: true,
      _error: errorMessage
    });
  }
}));

// ── Master Reset with Repo + Registry Cleanup ──────────────────────
// SD-LEO-INFRA-BRIDGE-ARTIFACT-ENRICHMENT-001 (extended cleanup)
// SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-B (external resource teardown)
router.post('/master-reset', asyncHandler(async (req, res) => {
  // SD-SINGLEVENTURE-AND-BULK-DELETE-ORCH-001-B: master-reset now loops the
  // shared single-venture teardown helper (deleteVentureFully) instead of
  // inlining phases 1-6 + master_reset_portfolio, so the single, bulk, and
  // portfolio paths share one teardown engine. Aggregate behavior is preserved
  // (incl. the orphan stage_zero_requests sweep) and guarded by an integration
  // regression test.
  const supabase = resolveServiceClient(req);

  // Collect ALL venture ids (master_reset_portfolio deleted every venture; the
  // helper looks up each venture's repo/name internally).
  const { data: ventures, error: listErr } = await supabase
    .from('ventures')
    .select('id');
  if (listErr) {
    return res.status(500).json({ success: false, error: listErr.message, phase: 'list_ventures' });
  }
  const ventureIds = (ventures || []).map(v => v.id).filter(Boolean);

  // Loop the shared full-teardown helper per venture.
  const results = [];
  for (const id of ventureIds) {
    results.push(await deleteVentureFully(id, { supabase }));
  }

  // Preserve the one master_reset_portfolio step per-venture delete does not
  // cover: sweep orphan stage_zero_requests with no venture_id. Non-fatal.
  let orphansCleaned = 0;
  try {
    const { data: orphans } = await supabase
      .from('stage_zero_requests')
      .delete()
      .is('venture_id', null)
      .select('id');
    orphansCleaned = orphans?.length || 0;
  } catch (orphanErr) {
    console.error('[master-reset] orphan stage_zero_requests cleanup non-fatal:', orphanErr.message);
  }

  const succeeded = results.filter(r => r.success).length;

  res.json({
    success: true,
    count: succeeded,
    message: `${succeeded} venture(s) and all related data deleted.`,
    cleanup: {
      ...aggregateTeardownResults(results),
      orphans_cleaned: orphansCleaned,
      details: { results },
    },
  });
}));

// ── Single-venture full teardown ───────────────────────────────────
// SD-SINGLEVENTURE-AND-BULK-DELETE-ORCH-001-B
router.post('/:id/full-delete', validateUuidParam('id'), asyncHandler(async (req, res) => {
  const supabase = resolveServiceClient(req);
  const result = await deleteVentureFully(req.params.id, { supabase });
  return res.status(result.success ? 200 : 500).json(result);
}));

// ── Bulk full teardown ─────────────────────────────────────────────
// SD-SINGLEVENTURE-AND-BULK-DELETE-ORCH-001-B
router.post('/bulk-full-delete', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : null;
  if (!ids || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Request body must include a non-empty ids[] array' });
  }
  const supabase = resolveServiceClient(req);
  const results = [];
  for (const id of ids) {
    results.push(await deleteVentureFully(id, { supabase }));
  }
  const succeeded = results.filter(r => r.success).length;
  const failed = results.length - succeeded;
  return res.json({ success: failed === 0, succeeded, failed, results });
}));

export default router;
