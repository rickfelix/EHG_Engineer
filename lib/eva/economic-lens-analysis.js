/**
 * Economic Lens Analysis Engine
 * SD: SD-LEO-FEAT-ECONOMIC-LENS-OPERATIONS-001
 *
 * LLM-powered 6-axis economic classification for venture evaluation.
 * Consumes upstream stage artifacts (0, 3, 4, 5, 6) and produces
 * structured JSONB output stored in venture_artifacts.
 */

import { getLLMClient } from '../llm/index.js';
import { getClaudeModel } from '../config/model-config.js';
// SD-EVA-FIX-STAGE-TEMPLATE-BYPASS-001: Migrated to unified persistence service
import { writeArtifact } from './artifact-persistence-service.js';

// Classification-to-score mapping (deterministic, not LLM-derived)
const SCORE_RUBRIC = {
  market_structure: {
    EMERGING: 8, MONOPOLISTIC_COMPETITION: 6, LOOSE_OLIGOPOLY: 5,
    TIGHT_OLIGOPOLY: 4, NEAR_PERFECT_COMPETITION: 3, MONOPOLY: 2
  },
  network_effects: {
    DIRECT_STRONG: 10, INDIRECT_STRONG: 8, DATA_NETWORK: 7,
    DIRECT_WEAK: 5, INDIRECT_WEAK: 4, LOCAL_NETWORK: 3, NONE: 1
  },
  unit_economics: { STRONG: 9, MODERATE: 6, WEAK: 3, NEGATIVE: 1 },
  market_timing: {
    RIGHT_ON_TIME: 10, EARLY_BUT_VIABLE: 7, LATE_BUT_DIFFERENTIATED: 5,
    TOO_EARLY: 2, TOO_LATE: 1
  },
  entry_barriers: { LOW: 9, MODERATE: 6, HIGH: 3, PROHIBITIVE: 1 },
  scale_economics: { STRONG_ECONOMIES: 9, MODERATE: 6, LINEAR: 4, DISECONOMIES: 1 }
};

const AXIS_NAMES = Object.keys(SCORE_RUBRIC);

const SYSTEM_PROMPT = `You are an economic analyst specializing in venture evaluation.
You will analyze a venture using 6 economic axes and produce a structured classification.

For each axis, you MUST use ONLY the allowed classification values listed below.

## Allowed Classifications

### market_structure
EMERGING, MONOPOLISTIC_COMPETITION, LOOSE_OLIGOPOLY, TIGHT_OLIGOPOLY, NEAR_PERFECT_COMPETITION, MONOPOLY

### network_effects
DIRECT_STRONG, INDIRECT_STRONG, DATA_NETWORK, DIRECT_WEAK, INDIRECT_WEAK, LOCAL_NETWORK, NONE

### unit_economics
STRONG, MODERATE, WEAK, NEGATIVE

### market_timing
RIGHT_ON_TIME, EARLY_BUT_VIABLE, LATE_BUT_DIFFERENTIATED, TOO_EARLY, TOO_LATE

### entry_barriers
LOW, MODERATE, HIGH, PROHIBITIVE

### scale_economics
STRONG_ECONOMIES, MODERATE, LINEAR, DISECONOMIES

## Output Format

Output ONLY valid JSON with this exact structure:
{
  "axes": {
    "market_structure": {
      "classification": "<one of allowed values>",
      "confidence": <0.0-1.0>,
      "rationale": "<1-3 sentences>"
    },
    "network_effects": {
      "classification": "<one of allowed values>",
      "confidence": <0.0-1.0>,
      "rationale": "<1-3 sentences>",
      "cold_start_severity": "HIGH|MODERATE|LOW|NONE",
      "multi_homing_risk": "HIGH|MODERATE|LOW",
      "winner_take_all": true|false
    },
    "unit_economics": {
      "classification": "<one of allowed values>",
      "confidence": <0.0-1.0>,
      "rationale": "<1-3 sentences>",
      "cost_curve_type": "DECREASING|FLAT|INCREASING",
      "breakeven_inflection": "<description>"
    },
    "market_timing": {
      "classification": "<one of allowed values>",
      "confidence": <0.0-1.0>,
      "rationale": "<1-3 sentences>",
      "window_status": "OPENING|OPEN|CLOSING|CLOSED",
      "first_mover_value": "HIGH|MODERATE|LOW"
    },
    "entry_barriers": {
      "classification": "<one of allowed values>",
      "confidence": <0.0-1.0>,
      "rationale": "<1-3 sentences>",
      "highest_risk_barrier": "<type>"
    },
    "scale_economics": {
      "classification": "<one of allowed values>",
      "confidence": <0.0-1.0>,
      "rationale": "<1-3 sentences>",
      "operating_leverage": "HIGH|MODERATE|LOW"
    }
  },
  "overall_risk_level": "LOW|MODERATE|HIGH|CRITICAL",
  "overall_assessment": "<2-4 sentence synthesis>"
}`;

/**
 * Fetch upstream stage artifacts for analysis context.
 */
async function fetchUpstreamContext(supabase, ventureId) {
  const requiredStages = [0, 3, 4, 5, 6];

  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage, artifact_type, content, metadata, artifact_data, created_at')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('lifecycle_stage', requiredStages)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch upstream artifacts: ${error.message}`);

  const context = {};
  for (const artifact of data || []) {
    const key = `stage_${artifact.lifecycle_stage}`;
    if (!context[key]) {
      context[key] = artifact.artifact_data || artifact.metadata || artifact.content;
    }
  }
  return context;
}

/**
 * Normalize classification to deterministic score.
 */
function normalizeScore(axis, classification) {
  const rubric = SCORE_RUBRIC[axis];
  if (!rubric) return 5;
  return rubric[classification] || 5;
}

/**
 * Validate LLM output against allowed classifications.
 */
function validateAnalysis(analysis) {
  if (!analysis?.axes) throw new Error('Missing axes in analysis output');

  for (const axis of AXIS_NAMES) {
    const axisData = analysis.axes[axis];
    if (!axisData) throw new Error(`Missing axis: ${axis}`);
    if (!axisData.classification) throw new Error(`Missing classification for ${axis}`);

    const allowed = Object.keys(SCORE_RUBRIC[axis]);
    if (!allowed.includes(axisData.classification)) {
      throw new Error(`Invalid classification "${axisData.classification}" for ${axis}. Allowed: ${allowed.join(', ')}`);
    }
  }
  return true;
}

/**
 * Run economic lens analysis for a venture.
 * @param {string} ventureId - Venture UUID
 * @param {object} options - { supabase, forceRefresh }
 * @returns {Promise<object>} Analysis result with artifact_id
 */
export async function analyzeEconomicLens(ventureId, { supabase, forceRefresh = false }) {
  // Check for cached result
  if (!forceRefresh) {
    const { data: existing } = await supabase
      .from('venture_artifacts')
      .select('id, artifact_data, metadata, created_at')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'economic_lens')
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      return {
        analysis: existing.artifact_data || existing.metadata,
        artifact_id: existing.id,
        generated_at: existing.created_at,
        cached: true
      };
    }
  }

  // Fetch venture info
  const { data: venture } = await supabase
    .from('ventures')
    .select('id, name')
    .eq('id', ventureId)
    .single();

  if (!venture) throw new Error(`Venture not found: ${ventureId}`);

  // Fetch upstream stage artifacts
  const upstreamContext = await fetchUpstreamContext(supabase, ventureId);

  const userPrompt = `Analyze the following venture economically across all 6 axes.

Venture: ${venture.name}

## Available Stage Data

${Object.entries(upstreamContext).map(([stage, data]) =>
    `### ${stage.replace('_', ' ').toUpperCase()}\n${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`
  ).join('\n\n')}

${Object.keys(upstreamContext).length === 0
    ? 'No upstream stage data available. Provide analysis based on venture name and general assessment. Use lower confidence values (0.3-0.5).'
    : ''}

Output ONLY valid JSON matching the required schema.`;

  const client = getLLMClient({ purpose: 'content-generation' });
  const response = await client.complete(SYSTEM_PROMPT, userPrompt, {
    max_tokens: 4000,
    timeout: 120000
  });

  // Parse LLM response
  let analysis;
  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    analysis = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse LLM response: ${e.message}`);
  }

  // Validate classifications
  validateAnalysis(analysis);

  // Add deterministic scores
  for (const axis of AXIS_NAMES) {
    analysis.axes[axis].score = normalizeScore(axis, analysis.axes[axis].classification);
  }

  // Build full metadata
  const metadata = {
    version: '1.0',
    ...analysis,
    source_stages: Object.keys(upstreamContext),
    model_used: response.model || getClaudeModel('validation'),
    generated_at: new Date().toISOString()
  };

  // SD-EVA-FIX-STAGE-TEMPLATE-BYPASS-001: Migrated to unified persistence service
  const artifactId = await writeArtifact(supabase, {
    ventureId,
    artifactType: 'economic_lens',
    title: `Economic Lens Analysis — ${venture.name}`,
    artifactData: metadata,
    content: metadata.overall_assessment || '',
    isCurrent: true,
    qualityScore: 70,
    validationStatus: 'validated',
    source: 'economic-lens-analysis',
  });

  // Fetch created_at for return value
  const { data: inserted } = await supabase
    .from('venture_artifacts')
    .select('id, created_at')
    .eq('id', artifactId)
    .single();

  return {
    analysis: metadata,
    artifact_id: inserted?.id || artifactId,
    generated_at: inserted?.created_at || new Date().toISOString(),
    cached: false
  };
}

/**
 * Get cached economic lens analysis for a venture.
 */
export async function getEconomicLens(ventureId, { supabase }) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_data, metadata, content, created_at')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'economic_lens')
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch analysis: ${error.message}`);
  }

  if (!data) return null;

  return {
    analysis: data.artifact_data || data.metadata,
    artifact_id: data.id,
    generated_at: data.created_at
  };
}

/**
 * Get portfolio-wide economic lens data for all ventures with analyses.
 */
export async function getPortfolioEconomicLens({ supabase }) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('venture_id, artifact_data, metadata, created_at, ventures!inner(name)')
    .eq('artifact_type', 'economic_lens')
    .eq('is_current', true)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch portfolio data: ${error.message}`);

  return (data || []).map(row => ({
    venture_id: row.venture_id,
    venture_name: row.ventures?.name || 'Unknown',
    analysis: row.artifact_data || row.metadata,
    generated_at: row.created_at
  }));
}

export { SCORE_RUBRIC, AXIS_NAMES };
