/**
 * Ventures API Routes
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import { dbLoader } from '../config.js';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';

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

  // Map stage enum to numeric value if needed
  const ventures = (data || []).map(v => ({
    ...v,
    stage: v.current_stage || v.current_workflow_stage || 1
  }));

  res.json(ventures);
}));

// Get single venture by ID
router.get('/:id', asyncHandler(async (req, res) => {
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

  // Map stage to numeric value
  const venture = {
    ...data,
    stage: data.current_stage || data.current_workflow_stage || 1
  };

  res.json(venture);
}));

// Get artifacts for a venture
router.get('/:id/artifacts', asyncHandler(async (req, res) => {
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

// Update venture stage
router.patch('/:id/stage', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;

  if (!stage || stage < 1 || stage > 25) {
    return res.status(400).json({ error: 'Invalid stage. Must be 1-25.' });
  }

  const { data, error } = await dbLoader.supabase
    .from('ventures')
    .update({
      current_stage: stage,
      current_workflow_stage: stage
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating venture stage:', error);
    return res.status(500).json({ error: error.message });
  }

  const venture = {
    ...data,
    stage: data.current_stage || data.current_workflow_stage || 1
  };

  res.json(venture);
}));

// Create or update artifact for a venture stage
router.post('/:id/artifacts', asyncHandler(async (req, res) => {
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

// Create new venture - IDEATION-GENESIS-AUDIT: Capture raw Chairman intent
router.post('/', asyncHandler(async (req, res) => {
  const ventureData = req.body;

  const { data, error } = await dbLoader.supabase
    .from('ventures')
    .insert({
      name: ventureData.name,
      description: ventureData.description,
      problem_statement: ventureData.problem_statement,
      raw_chairman_intent: ventureData.problem_statement,
      problem_statement_locked_at: new Date().toISOString(),
      solution: ventureData.solution,
      target_market: ventureData.target_market,
      origin_type: ventureData.origin_type || 'manual',
      competitor_ref: ventureData.competitor_ref || null,
      current_lifecycle_stage: 1,
      workflow_status: 'pending',
      status: 'active'
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating venture:', error);
    return res.status(500).json({ error: error.message });
  }

  const venture = {
    ...data,
    stage: data.current_lifecycle_stage || 1
  };

  res.status(201).json(venture);
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

export default router;
