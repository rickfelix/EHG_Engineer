/**
 * Guardrail Intelligence Analyzer (V03: analysisstep_active_intelligence)
 *
 * LLM-driven analysis layer on top of the deterministic guardrail registry.
 * Takes guardrail check results + SD data and produces structured intelligence
 * output: risk scores, pattern insights, and strategic recommendations.
 *
 * Addresses vision gaps:
 * - V03: Moves beyond simple deterministic logic to LLM-driven analysis
 *         producing structured output for the compounding intelligence chain
 * - V07: Parallel analysis with configurable concurrency, no hard compute caps
 *
 * Results are persisted to `intelligence_analysis` table for chain consumption.
 *
 * @module guardrail-intelligence-analyzer
 */

import { evaluateCost, getComputePosture } from './compute-posture.js';

/**
 * Analysis prompt templates for each analysis dimension.
 * Each produces a structured JSON response from the LLM.
 */
const ANALYSIS_PROMPTS = {
  riskAssessment: (sdData, guardrailResults) => ({
    role: 'system',
    content: `You are a governance risk analyst. Analyze the following SD guardrail results and produce a structured risk assessment.

SD Data:
- Title: ${sdData.title || 'N/A'}
- Type: ${sdData.sd_type || 'N/A'}
- Priority: ${sdData.priority || 'N/A'}
- Scope: ${sdData.scope || 'N/A'}

Guardrail Results:
- Passed: ${guardrailResults.passed}
- Violations: ${JSON.stringify(guardrailResults.violations || [])}
- Warnings: ${JSON.stringify(guardrailResults.warnings || [])}

Respond with ONLY valid JSON matching this schema:
{
  "overall_risk": "low" | "medium" | "high" | "critical",
  "risk_factors": [{ "factor": string, "severity": "low"|"medium"|"high"|"critical", "rationale": string }],
  "mitigation_suggestions": [string]
}`,
  }),

  patternAnalysis: (sdData, guardrailResults) => ({
    role: 'system',
    content: `You are a strategic pattern analyst. Analyze the SD and guardrail data for recurring patterns, strategic themes, and systemic issues.

SD Data:
- Title: ${sdData.title || 'N/A'}
- Type: ${sdData.sd_type || 'N/A'}
- Strategic Objectives: ${JSON.stringify(sdData.strategic_objectives || [])}

Guardrail Results:
- Violations: ${JSON.stringify(guardrailResults.violations || [])}
- Warnings: ${JSON.stringify(guardrailResults.warnings || [])}

Respond with ONLY valid JSON matching this schema:
{
  "patterns_detected": [{ "pattern": string, "frequency_signal": "new"|"recurring"|"systemic", "impact": string }],
  "strategic_alignment_notes": string,
  "cross_sd_implications": [string]
}`,
  }),

  recommendations: (sdData, guardrailResults) => ({
    role: 'system',
    content: `You are a governance advisor. Based on the SD data and guardrail results, produce actionable recommendations.

SD Data:
- Title: ${sdData.title || 'N/A'}
- Type: ${sdData.sd_type || 'N/A'}
- Priority: ${sdData.priority || 'N/A'}

Guardrail Results:
- Passed: ${guardrailResults.passed}
- Violations: ${JSON.stringify(guardrailResults.violations || [])}
- Warnings: ${JSON.stringify(guardrailResults.warnings || [])}

Respond with ONLY valid JSON matching this schema:
{
  "recommended_actions": [{ "action": string, "priority": "immediate"|"soon"|"backlog", "rationale": string }],
  "governance_adjustments": [{ "guardrail_id": string, "suggestion": string }],
  "escalation_needed": boolean,
  "escalation_reason": string | null
}`,
  }),
};

/**
 * Analyze guardrail results using LLM-driven intelligence.
 *
 * @param {Object} sdData - SD fields (title, sd_type, priority, scope, etc.)
 * @param {Object} guardrailResults - Output from guardrail-registry check()
 * @param {Object} options
 * @param {Object} options.llmClient - LLM client with `analyze(prompt)` method
 * @param {number} [options.concurrency=3] - Max parallel LLM calls
 * @param {Object} [options.supabase] - Supabase client for persisting results
 * @param {string} [options.sdKey] - SD key for DB persistence
 * @param {string} [options.stageType='EXEC'] - Stage type for cost tracking
 * @returns {Promise<IntelligenceAnalysis>}
 *
 * @typedef {Object} IntelligenceAnalysis
 * @property {string|null} analysisId - UUID of persisted record (null if not persisted)
 * @property {Object} riskAssessment - LLM risk analysis or fallback
 * @property {Object} patternAnalysis - LLM pattern analysis or fallback
 * @property {Object} recommendations - LLM recommendations or fallback
 * @property {Object} cost - { totalCost, evaluation, posture }
 * @property {Object} meta - { analyzedAt, dimensions, errors, partial }
 */
export async function analyzeGuardrailResults(sdData, guardrailResults, options = {}) {
  const {
    llmClient,
    concurrency = 3,
    supabase,
    sdKey,
    stageType = 'EXEC',
  } = options;

  const errors = [];
  const startTime = Date.now();

  // If no LLM client, return deterministic fallback
  if (!llmClient || typeof llmClient.analyze !== 'function') {
    const fallback = buildDeterministicFallback(sdData, guardrailResults);
    fallback.meta.errors.push('No LLM client provided — using deterministic fallback');
    return fallback;
  }

  // Build analysis tasks
  const dimensions = ['riskAssessment', 'patternAnalysis', 'recommendations'];
  const prompts = dimensions.map(dim => ({
    dimension: dim,
    prompt: ANALYSIS_PROMPTS[dim](sdData, guardrailResults),
  }));

  // Execute in parallel with configurable concurrency using batched Promise.allSettled
  const results = {};
  const batches = chunkArray(prompts, concurrency);
  let totalCost = 0;

  for (const batch of batches) {
    const settled = await Promise.allSettled(
      batch.map(async ({ dimension, prompt }) => {
        const result = await llmClient.analyze(prompt);
        return { dimension, result };
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        const { dimension, result } = outcome.value;
        results[dimension] = parseAnalysisResult(result, dimension);
        totalCost += result?.cost ?? 0;
      } else {
        const idx = settled.indexOf(outcome);
        const dim = batch[idx]?.dimension || 'unknown';
        errors.push(`${dim}: ${outcome.reason?.message || 'Analysis failed'}`);
        results[dim] = getFallbackForDimension(dim, sdData, guardrailResults);
      }
    }
  }

  // Cost tracking via compute-posture (V07: awareness-not-enforcement)
  const posture = getComputePosture();
  const costEvaluation = evaluateCost(totalCost, stageType, posture);

  const analysis = {
    analysisId: null,
    riskAssessment: results.riskAssessment || getFallbackForDimension('riskAssessment', sdData, guardrailResults),
    patternAnalysis: results.patternAnalysis || getFallbackForDimension('patternAnalysis', sdData, guardrailResults),
    recommendations: results.recommendations || getFallbackForDimension('recommendations', sdData, guardrailResults),
    cost: {
      totalCost,
      evaluation: costEvaluation,
      posture: posture.policy,
    },
    meta: {
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      dimensions: dimensions.length,
      errors,
      partial: errors.length > 0,
    },
  };

  // Persist to intelligence_analysis table if supabase provided
  if (supabase && sdKey) {
    try {
      analysis.analysisId = await persistAnalysis(supabase, sdKey, analysis);
    } catch (err) {
      errors.push(`persist: ${err.message}`);
    }
  }

  return analysis;
}

/**
 * Build a deterministic fallback when no LLM is available.
 * Derives insights from guardrail violations/warnings directly.
 */
export function buildDeterministicFallback(sdData, guardrailResults) {
  const violations = guardrailResults.violations || [];
  const warnings = guardrailResults.warnings || [];

  const riskLevel = violations.some(v => v.severity === 'critical') ? 'critical'
    : violations.length > 0 ? 'high'
      : warnings.length > 2 ? 'medium'
        : 'low';

  return {
    analysisId: null,
    riskAssessment: {
      overall_risk: riskLevel,
      risk_factors: violations.map(v => ({
        factor: v.guardrail,
        severity: v.severity,
        rationale: v.message,
      })),
      mitigation_suggestions: violations.map(v => `Address ${v.guardrail}: ${v.message}`),
    },
    patternAnalysis: {
      patterns_detected: warnings.map(w => ({
        pattern: w.guardrail,
        frequency_signal: 'new',
        impact: w.message,
      })),
      strategic_alignment_notes: guardrailResults.passed
        ? 'All blocking guardrails passed'
        : `${violations.length} blocking violation(s) detected`,
      cross_sd_implications: [],
    },
    recommendations: {
      recommended_actions: violations.map(v => ({
        action: `Resolve ${v.name}`,
        priority: v.severity === 'critical' ? 'immediate' : 'soon',
        rationale: v.message,
      })),
      governance_adjustments: [],
      escalation_needed: violations.some(v => v.severity === 'critical'),
      escalation_reason: violations.find(v => v.severity === 'critical')?.message || null,
    },
    cost: {
      totalCost: 0,
      evaluation: { level: 'normal', cost: 0, threshold: {}, blocked: false },
      posture: getComputePosture().policy,
    },
    meta: {
      analyzedAt: new Date().toISOString(),
      durationMs: 0,
      dimensions: 3,
      errors: [],
      partial: false,
    },
  };
}

/**
 * Parse LLM result string/object into structured analysis.
 *
 * @param {Object|string} result - LLM response
 * @param {string} dimension - Which analysis dimension
 * @returns {Object} Parsed result
 */
function parseAnalysisResult(result, dimension) {
  if (!result) return null;

  // If result has a `content` field (common LLM response shape)
  const raw = typeof result === 'string' ? result
    : result.content || result.text || JSON.stringify(result);

  try {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
    return JSON.parse(jsonMatch[1].trim());
  } catch {
    return getFallbackShape(dimension);
  }
}

/**
 * Get a safe fallback shape for a specific dimension.
 */
function getFallbackShape(dimension) {
  const shapes = {
    riskAssessment: {
      overall_risk: 'medium',
      risk_factors: [],
      mitigation_suggestions: ['Unable to analyze — manual review recommended'],
    },
    patternAnalysis: {
      patterns_detected: [],
      strategic_alignment_notes: 'Analysis unavailable',
      cross_sd_implications: [],
    },
    recommendations: {
      recommended_actions: [],
      governance_adjustments: [],
      escalation_needed: false,
      escalation_reason: null,
    },
  };
  return shapes[dimension] || {};
}

/**
 * Get fallback for a specific dimension using deterministic analysis.
 */
function getFallbackForDimension(dimension, sdData, guardrailResults) {
  const fallback = buildDeterministicFallback(sdData, guardrailResults);
  return fallback[dimension] || getFallbackShape(dimension);
}

/**
 * Persist analysis results to intelligence_analysis table.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdKey - SD key for context
 * @param {Object} analysis - Full analysis result
 * @returns {Promise<string>} UUID of inserted record
 */
async function persistAnalysis(supabase, sdKey, analysis) {
  const { data, error } = await supabase
    .from('intelligence_analysis')
    .insert({
      agent_type: 'guardrail_intelligence',
      status: 'COMPLETED',
      results: {
        sd_key: sdKey,
        risk_assessment: analysis.riskAssessment,
        pattern_analysis: analysis.patternAnalysis,
        recommendations: analysis.recommendations,
        cost: analysis.cost,
        meta: analysis.meta,
      },
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`intelligence_analysis insert failed: ${error.message}`);
  }

  return data.id;
}

/**
 * Split array into chunks for batched parallel execution.
 *
 * @param {Array} arr
 * @param {number} size
 * @returns {Array<Array>}
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Retrieve past analyses for chain consumption (V03: compounding intelligence).
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [filters]
 * @param {string} [filters.sdKey] - Filter by SD key
 * @param {number} [filters.limit=10] - Max results
 * @returns {Promise<Array>} Past analysis records
 */
export async function getAnalysisHistory(supabase, filters = {}) {
  let query = supabase
    .from('intelligence_analysis')
    .select('id, agent_type, status, results, created_at')
    .eq('agent_type', 'guardrail_intelligence')
    .eq('status', 'COMPLETED');

  if (filters.sdKey) {
    query = query.contains('results', { sd_key: filters.sdKey });
  }

  query = query
    .order('created_at', { ascending: false })
    .limit(filters.limit || 10);

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}
