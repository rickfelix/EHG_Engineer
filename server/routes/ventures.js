/**
 * Ventures API Routes
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import { dbLoader } from '../config.js';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { isValidUuid, validateUuidParam, isValidStringLength } from '../middleware/validate.js';

const router = Router();

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
  // Use service-role client for admin operations (RPC requires service_role or chairman)
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // Phase 1: Collect venture repo info BEFORE deletion
  const { data: provisioningRows } = await supabase
    .from('venture_provisioning_state')
    .select('venture_id, venture_name, github_repo_url');

  const repoUrls = (provisioningRows || [])
    .map(r => r.github_repo_url)
    .filter(Boolean);

  const ventureNames = (provisioningRows || [])
    .map(r => r.venture_name)
    .filter(Boolean);

  const ventureIds = (provisioningRows || [])
    .map(r => r.venture_id)
    .filter(Boolean);

  // Phase 1.5a: External resource teardown (Vercel, filesystem, Docker)
  const { runTeardown } = await import('../../lib/cleanup/index.js');
  const teardownResults = {};
  for (const ventureId of ventureIds) {
    teardownResults[ventureId] = await runTeardown(ventureId);
  }

  // Phase 1.5a2: Mark venture_resources as cleaned (SD-LEO-INFRA-UNIFIED-VENTURE-CREATION-001-B)
  let resourcesCleanedCount = 0;
  try {
    const { markResourcesCleaned } = await import('../../lib/venture-resources.js');
    for (const ventureId of ventureIds) {
      resourcesCleanedCount += await markResourcesCleaned(ventureId);
    }
    console.log(`[master-reset] ${resourcesCleanedCount} venture resource(s) marked as cleaned`);
  } catch (resErr) {
    console.error('[master-reset] Resource cleanup non-fatal:', resErr.message);
  }

  // Phase 1.5b: REVOKE — Credential revocation at external providers BEFORE DB deletion
  // SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-C
  // This MUST run while the relational mapping (managed_applications -> application_credentials) is intact
  let credentialCleanup = { revoked: [], failed: [], skipped: [] };
  try {
    const { cleanup: cleanupCredentials } = await import('../../lib/cleanup/credentials.js');
    credentialCleanup = await cleanupCredentials(ventureIds, { dryRun: false });
    if (credentialCleanup.failed.length > 0) {
      console.warn(`[master-reset] ${credentialCleanup.failed.length} credential(s) failed revocation — quarantined for manual review`);
    }
  } catch (credErr) {
    // Non-blocking: credential revocation failure should not prevent reset
    console.error('[master-reset] Credential revocation error:', credErr.message);
    credentialCleanup = { revoked: [], failed: [{ error: credErr.message }], skipped: [] };
  }

  // Phase 2: Execute existing DB master reset RPC
  const { data: rpcResult, error: rpcErr } = await supabase
    .rpc('master_reset_portfolio');

  if (rpcErr) {
    return res.status(500).json({
      success: false,
      error: rpcErr.message,
      phase: 'database_reset',
    });
  }

  const dbCount = rpcResult?.count ?? 0;
  const cleanupResults = { repos_deleted: [], repos_failed: [], registry_cleaned: false };

  // Phase 3: Delete GitHub repos
  if (repoUrls.length > 0) {
    const { execSync } = await import('child_process');

    for (const url of repoUrls) {
      // Extract owner/repo from URL (https://github.com/owner/repo or owner/repo)
      const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
      const repoSlug = match ? match[1].replace(/\.git$/, '') : url.replace(/\.git$/, '');

      if (!repoSlug || repoSlug.split('/').length !== 2) {
        cleanupResults.repos_failed.push({ repo: url, reason: 'invalid repo format' });
        continue;
      }

      // SAFETY: Never delete core repos
      const PROTECTED_REPOS = new Set([
        'rickfelix/ehg', 'rickfelix/EHG_Engineer', 'rickfelix/ehg_engineer',
      ]);
      if (PROTECTED_REPOS.has(repoSlug) || PROTECTED_REPOS.has(repoSlug.toLowerCase())) {
        cleanupResults.repos_failed.push({ repo: repoSlug, reason: 'PROTECTED — core repo, skipped' });
        continue;
      }

      try {
        execSync(`gh repo delete ${repoSlug} --yes`, {
          timeout: 15000,
          stdio: 'pipe',
        });
        cleanupResults.repos_deleted.push(repoSlug);
      } catch (err) {
        const msg = err.stderr?.toString() || err.message;
        // Not found is OK (already deleted)
        if (msg.includes('not found') || msg.includes('404')) {
          cleanupResults.repos_deleted.push(`${repoSlug} (already gone)`);
        } else {
          cleanupResults.repos_failed.push({ repo: repoSlug, reason: msg.substring(0, 200) });
        }
      }
    }
  }

  // Phase 4: Clean applications/registry.json
  try {
    const { readFileSync, writeFileSync } = await import('fs');
    const { resolve } = await import('path');
    const registryPath = resolve(process.cwd(), 'applications/registry.json');

    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const apps = registry.applications || {};
    const ventureNameSet = new Set(ventureNames.map(n => n.toLowerCase()));

    // Remove APP entries matching deleted venture names (keep APP001=ehg, APP002=test-leo-project)
    const coreApps = new Set(['ehg', 'ehg_engineer', 'test-leo-project']);
    let removed = 0;
    for (const [key, app] of Object.entries(apps)) {
      const name = (app.name || '').toLowerCase();
      if (ventureNameSet.has(name) && !coreApps.has(name)) {
        delete apps[key];
        removed++;
      }
    }

    if (removed > 0) {
      registry.metadata.total_apps = Object.keys(apps).length;
      registry.metadata.active_apps = Object.values(apps).filter(a => a.status === 'active').length;
      registry.metadata.last_updated = new Date().toISOString();
      writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
      cleanupResults.registry_cleaned = true;
    }
  } catch (err) {
    cleanupResults.registry_error = err.message;
  }

  res.json({
    success: true,
    count: dbCount,
    message: `${dbCount} venture(s) and all related data deleted.`,
    cleanup: {
      repos_deleted: cleanupResults.repos_deleted.length,
      repos_failed: cleanupResults.repos_failed.length,
      credentials_revoked: credentialCleanup.revoked.length,
      credentials_failed: credentialCleanup.failed.length,
      credentials_skipped: credentialCleanup.skipped.length,
      registry_cleaned: cleanupResults.registry_cleaned,
      teardown: teardownResults,
      details: { ...cleanupResults, credentials: credentialCleanup },
    },
  });
}));

export default router;
