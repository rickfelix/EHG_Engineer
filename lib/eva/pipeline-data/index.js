/**
 * Pipeline Data Aggregation Module — Stages 10-12 Data for GUI
 *
 * SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-K
 *
 * Aggregates stage data from venture_stage_work, venture_artifacts,
 * and brand_genome_submissions for frontend dashboard consumption.
 *
 * @module lib/eva/pipeline-data
 */

/**
 * Get customer intelligence data (Stage 10).
 * Returns customer personas and brand genome summary.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @returns {Promise<Object>} Customer intelligence data
 */
export async function getCustomerIntelligence(ventureId, deps = {}) {
  const { supabase } = deps;
  if (!supabase) return { ventureId, status: 'no-client' };

  // Get stage 10 artifacts (customer personas, brand genome)
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('artifact_type, content, quality_score, created_at')
    .eq('venture_id', ventureId)
    .in('artifact_type', ['customer_persona', 'brand_genome', 'positioning_statement'])
    .order('created_at', { ascending: false });

  // Get brand genome submission
  const { data: brandGenome } = await supabase
    .from('brand_genome_submissions')
    .select('brand_data, completeness_score, submission_status, created_at')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get stage work status
  const { data: stageWork } = await supabase
    .from('venture_stage_work')
    .select('stage_status, health_score, updated_at')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 10)
    .maybeSingle();

  const personas = (artifacts || []).filter(a => a.artifact_type === 'customer_persona');
  const positioning = (artifacts || []).find(a => a.artifact_type === 'positioning_statement');

  return {
    ventureId,
    stage: 10,
    label: 'Customer & Brand Foundation',
    status: stageWork?.stage_status || 'not_started',
    healthScore: stageWork?.health_score || null,
    personas: personas.map(p => ({
      content: p.content,
      qualityScore: p.quality_score,
      createdAt: p.created_at,
    })),
    brandGenome: brandGenome ? {
      data: brandGenome.brand_data,
      completeness: brandGenome.completeness_score,
      status: brandGenome.submission_status,
      updatedAt: brandGenome.created_at,
    } : null,
    positioning: positioning ? {
      content: positioning.content,
      qualityScore: positioning.quality_score,
    } : null,
    updatedAt: stageWork?.updated_at || null,
  };
}

/**
 * Get brand genome and visual identity data (Stage 11).
 * Returns naming candidates, visual identity, and brand expression.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @returns {Promise<Object>} Brand genome data
 */
export async function getBrandGenomeData(ventureId, deps = {}) {
  const { supabase } = deps;
  if (!supabase) return { ventureId, status: 'no-client' };

  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('artifact_type, content, quality_score, created_at')
    .eq('venture_id', ventureId)
    .in('artifact_type', ['naming_candidate', 'visual_identity', 'brand_expression'])
    .order('created_at', { ascending: false });

  const { data: stageWork } = await supabase
    .from('venture_stage_work')
    .select('stage_status, health_score, updated_at')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 11)
    .maybeSingle();

  const namingCandidates = (artifacts || []).filter(a => a.artifact_type === 'naming_candidate');
  const visualIdentity = (artifacts || []).find(a => a.artifact_type === 'visual_identity');
  const brandExpression = (artifacts || []).find(a => a.artifact_type === 'brand_expression');

  return {
    ventureId,
    stage: 11,
    label: 'Naming & Visual Identity',
    status: stageWork?.stage_status || 'not_started',
    healthScore: stageWork?.health_score || null,
    namingCandidates: namingCandidates.map(n => ({
      content: n.content,
      qualityScore: n.quality_score,
      createdAt: n.created_at,
    })),
    visualIdentity: visualIdentity ? {
      content: visualIdentity.content,
      qualityScore: visualIdentity.quality_score,
    } : null,
    brandExpression: brandExpression ? {
      content: brandExpression.content,
      qualityScore: brandExpression.quality_score,
    } : null,
    updatedAt: stageWork?.updated_at || null,
  };
}

/**
 * Get GTM strategy data (Stage 12).
 * Returns market tiers, channels, sales model, and customer journey.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @returns {Promise<Object>} GTM strategy data
 */
export async function getGtmStrategy(ventureId, deps = {}) {
  const { supabase } = deps;
  if (!supabase) return { ventureId, status: 'no-client' };

  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('artifact_type, content, quality_score, created_at')
    .eq('venture_id', ventureId)
    .in('artifact_type', ['identity_market_tier', 'identity_channel_strategy', 'identity_gtm_sales_strategy', 'identity_customer_journey'])
    .order('created_at', { ascending: false });

  const { data: stageWork } = await supabase
    .from('venture_stage_work')
    .select('stage_status, health_score, updated_at')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 12)
    .maybeSingle();

  const marketTiers = (artifacts || []).filter(a => a.artifact_type === 'identity_market_tier');
  const channels = (artifacts || []).filter(a => a.artifact_type === 'identity_channel_strategy');
  const salesPlaybook = (artifacts || []).find(a => a.artifact_type === 'identity_gtm_sales_strategy');
  const customerJourney = (artifacts || []).find(a => a.artifact_type === 'identity_customer_journey');

  return {
    ventureId,
    stage: 12,
    label: 'GTM & Sales Strategy',
    status: stageWork?.stage_status || 'not_started',
    healthScore: stageWork?.health_score || null,
    marketTiers: marketTiers.map(t => ({
      content: t.content,
      qualityScore: t.quality_score,
    })),
    channels: channels.map(c => ({
      content: c.content,
      qualityScore: c.quality_score,
    })),
    salesPlaybook: salesPlaybook ? {
      content: salesPlaybook.content,
      qualityScore: salesPlaybook.quality_score,
    } : null,
    customerJourney: customerJourney ? {
      content: customerJourney.content,
      qualityScore: customerJourney.quality_score,
    } : null,
    updatedAt: stageWork?.updated_at || null,
  };
}

/**
 * Get pipeline summary for stages 10-12.
 * Returns aggregated completion status and health scores.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @returns {Promise<Object>} Pipeline summary
 */
export async function getPipelineSummary(ventureId, deps = {}) {
  const { supabase } = deps;
  if (!supabase) return { ventureId, stages: {} };

  const { data: stageWork } = await supabase
    .from('venture_stage_work')
    .select('lifecycle_stage, stage_status, health_score, updated_at')
    .eq('venture_id', ventureId)
    .gte('lifecycle_stage', 10)
    .lte('lifecycle_stage', 12)
    .order('lifecycle_stage', { ascending: true });

  const stages = {};
  for (const stage of (stageWork || [])) {
    stages[`stage_${stage.lifecycle_stage}`] = {
      stage: stage.lifecycle_stage,
      label: STAGE_LABELS[stage.lifecycle_stage],
      status: stage.stage_status,
      healthScore: stage.health_score,
      updatedAt: stage.updated_at,
    };
  }

  // Fill missing stages
  for (let i = 10; i <= 12; i++) {
    if (!stages[`stage_${i}`]) {
      stages[`stage_${i}`] = {
        stage: i,
        label: STAGE_LABELS[i],
        status: 'not_started',
        healthScore: null,
        updatedAt: null,
      };
    }
  }

  const completedCount = Object.values(stages).filter(s => s.status === 'completed').length;

  return {
    ventureId,
    stages,
    completion: {
      total: 3,
      completed: completedCount,
      percentage: Math.round((completedCount / 3) * 100),
    },
    overallHealth: computeOverallHealth(Object.values(stages)),
  };
}

const STAGE_LABELS = {
  10: 'Customer & Brand Foundation',
  11: 'Naming & Visual Identity',
  12: 'GTM & Sales Strategy',
};

function computeOverallHealth(stages) {
  const scores = stages.map(s => s.healthScore).filter(s => s != null);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
