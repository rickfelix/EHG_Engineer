/**
 * Stage 06 Analysis Step - Risk Matrix Generation
 * Part of SD-EVA-FEAT-TEMPLATES-ENGINE-001
 *
 * Consumes Stages 1-5 data and generates a structured risk register
 * with 3-factor scoring (severity × probability × impact) and source attribution.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-06-risk-matrix
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { RISK_CATEGORIES } from '../stage-06.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';

const MIN_RISKS = 10;
const MIN_CATEGORIES = 3;

const SYSTEM_PROMPT = `You are EVA's Risk Assessment Engine. Generate a structured risk register for a venture based on analysis from Stages 1-5.

You MUST output valid JSON with exactly this structure:
{
  "risks": [
    {
      "id": "RISK-001",
      "category": "Market|Product|Technical|Legal/Compliance|Financial|Operational",
      "description": "Clear risk description (min 10 chars)",
      "severity": 1-5,
      "probability": 1-5,
      "impact": 1-5,
      "mitigation": "Specific mitigation strategy (min 10 chars)",
      "source_stage": 1-5,
      "owner": "Role responsible"
    }
  ]
}

Rules:
- Generate at least ${MIN_RISKS} risks
- Cover at least ${MIN_CATEGORIES} distinct categories
- severity (1-5): How severe is this risk if it materializes?
- probability (1-5): How likely is it to occur?
- impact (1-5): How broad is the business impact?
- score = severity × probability × impact (computed, do NOT include in output)
- source_stage indicates which upstream stage (1-5) surfaced this risk
- Each risk MUST have a specific mitigation strategy, not generic advice
- Use financial projections from Stage 5 to inform Financial risks
- Use competitive data from Stage 4 to inform Market risks
- Use validation scores from Stage 3 to inform Product risks
- Do NOT invent risks not grounded in the provided data`;

/**
 * Generate a risk matrix from Stages 1-5 data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage3Data] - Stage 3 validation scores
 * @param {Object} [params.stage4Data] - Stage 4 competitive landscape
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Risk register with aggregate metrics
 */
export async function analyzeStage06({ stage1Data, stage3Data, stage4Data, stage5Data, ventureName, ventureId, supabase, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage06] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 06 risk matrix requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const financialContext = stage5Data
    ? `Financial Model:
  Initial Investment: $${stage5Data.initialInvestment || 'N/A'}
  Year 1 Revenue: $${stage5Data.year1?.revenue || 'N/A'}
  ROI (3yr): ${stage5Data.roi3y ? (stage5Data.roi3y * 100).toFixed(1) + '%' : 'N/A'}
  Break-even: Month ${stage5Data.breakEvenMonth || 'N/A'}
  Unit Economics: CAC=$${stage5Data.unitEconomics?.cac || 'N/A'}, LTV=$${stage5Data.unitEconomics?.ltv || 'N/A'}`
    : 'No financial model available';

  const competitiveContext = stage4Data?.competitors
    ? `Competitive Landscape:
  Competitors: ${stage4Data.competitors.length}
  Average threat level: ${stage4Data.competitors.reduce((s, c) => s + (c.threatLevel || 3), 0) / stage4Data.competitors.length}
  Pricing models: ${stage4Data.stage5Handoff?.pricingModels?.join(', ') || 'N/A'}`
    : 'No competitive data available';

  const validationContext = stage3Data?.overallScore
    ? `Validation Score: ${stage3Data.overallScore}/100`
    : '';

  const userPrompt = `Generate a risk register for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket || 'N/A')}
Problem: ${sanitizeForPrompt(stage1Data.problemStatement || 'N/A')}
Archetype: ${sanitizeForPrompt(stage1Data.archetype || 'N/A')}
${validationContext}

${financialContext}

${competitiveContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  if (!Array.isArray(parsed.risks) || parsed.risks.length === 0) {
    throw new Error('Stage 06 risk matrix: LLM returned no risks');
  }

  // Normalize and validate each risk — 3-factor scoring (severity × probability × impact)
  let llmFallbackCount = 0;
  const risks = parsed.risks.map((r, i) => {
    const severity = clamp(r.severity ?? r.consequence, 1, 5, logger, `risk[${i}].severity`);
    const probability = clamp(r.probability, 1, 5, logger, `risk[${i}].probability`);
    const impact = clamp(r.impact ?? r.consequence, 1, 5, logger, `risk[${i}].impact`);

    // Track LLM fallbacks for missing 3-factor fields
    if (!Number.isFinite(Number(r.severity))) llmFallbackCount++;
    if (!Number.isFinite(Number(r.probability))) llmFallbackCount++;
    if (!Number.isFinite(Number(r.impact))) llmFallbackCount++;

    return {
      id: r.id || `RISK-${String(i + 1).padStart(3, '0')}`,
      category: RISK_CATEGORIES.includes(r.category) ? r.category : 'Operational',
      description: String(r.description || '').substring(0, 500),
      severity,
      probability,
      impact,
      score: severity * probability * impact,
      mitigation: String(r.mitigation || '').substring(0, 500),
      source_stage: clamp(r.source_stage, 1, 5, logger, `risk[${i}].source_stage`),
      owner: r.owner || 'Founder',
      status: 'open',
      review_date: new Date().toISOString().split('T')[0],
    };
  });

  if (llmFallbackCount > 0) {
    logger.warn('[Stage06] LLM fallback fields detected', { llmFallbackCount });
  }

  // Aggregate metrics — aligned with template computeDerived
  const aggregate_risk_score = risks.length > 0
    ? Math.round(risks.reduce((sum, r) => sum + r.score, 0) / risks.length)
    : 0;

  // Normalized score on 0-10 scale (from 1-125 range)
  const normalized_risk_score = aggregate_risk_score > 0
    ? Math.round(((aggregate_risk_score - 1) / 124) * 10 * 100) / 100
    : 0;

  // Highest risk factor = category of highest-scoring risk
  const sorted = [...risks].sort((a, b) => b.score - a.score);
  const highest_risk_factor = sorted.length > 0 ? sorted[0].category : null;

  // Mitigation coverage
  const mitigatedCount = risks.filter(r => r.status === 'mitigated' || r.status === 'closed').length;
  const mitigation_coverage_pct = risks.length > 0
    ? Math.round((mitigatedCount / risks.length) * 10000) / 100
    : 0;

  const risksByCategory = {};
  for (const r of risks) {
    risksByCategory[r.category] = (risksByCategory[r.category] || 0) + 1;
  }

  // Persist risks to risk_recalibration_forms (dual-write: advisory_data preserved by engine)
  let riskFormId = null;
  if (supabase && ventureId) {
    try {
      const scoreToLevel = (score) => score >= 75 ? 'CRITICAL' : score >= 40 ? 'HIGH' : score >= 15 ? 'MEDIUM' : 'LOW';
      const categoryMap = {
        'Market': 'market', 'Product': 'product', 'Technical': 'technical',
        'Legal/Compliance': 'legal', 'Financial': 'financial', 'Operational': 'operational'
      };

      const formRow = {
        venture_id: ventureId,
        gate_number: 6,
        risk_context: 'evaluation',
        from_phase: 'EXEC',
        to_phase: 'EXEC',
        assessment_date: new Date().toISOString(),
        assessor_type: 'LEO',
        risk_trajectory: normalized_risk_score > 5 ? 'DEGRADING' : normalized_risk_score > 2 ? 'STABLE' : 'IMPROVING',
        blocking_risks: risks.some(r => r.score >= 75),
        chairman_review_required: risks.some(r => r.score >= 75) || risks.filter(r => r.score >= 40).length >= 2,
        go_decision: risks.some(r => r.score >= 75) ? 'CONDITIONAL' : 'GO',
        new_risks: risks.map(r => ({ category: r.category, level: scoreToLevel(r.score), description: r.description, mitigations: [r.mitigation] })),
      };

      for (const [stageCategory, colPrefix] of Object.entries(categoryMap)) {
        const catRisks = risks.filter(r => r.category === stageCategory);
        const highestScore = catRisks.length > 0 ? Math.max(...catRisks.map(r => r.score)) : 0;
        formRow[`${colPrefix}_risk_current`] = catRisks.length > 0 ? scoreToLevel(highestScore) : 'LOW';
        formRow[`${colPrefix}_risk_previous`] = 'N/A';
        formRow[`${colPrefix}_risk_delta`] = 'NEW';
        formRow[`${colPrefix}_risk_justification`] = catRisks.map(r => r.description).join('; ').substring(0, 500) || null;
        formRow[`${colPrefix}_risk_mitigations`] = catRisks.map(r => ({ risk_id: r.id, mitigation: r.mitigation }));
      }

      const { data: formData, error: formError } = await supabase
        .from('risk_recalibration_forms')
        .upsert(formRow, { onConflict: 'venture_id,gate_number' })
        .select('id')
        .single();

      if (formError) {
        logger.warn('[Stage06] risk_recalibration_forms upsert failed (non-blocking):', formError.message);
      } else {
        riskFormId = formData.id;
        logger.log('[Stage06] Risk form persisted to risk_recalibration_forms:', { id: riskFormId });
      }
    } catch (err) {
      logger.warn('[Stage06] risk form persistence failed (non-blocking):', err.message);
    }
  }

  logger.log('[Stage06] Analysis complete', { duration: Date.now() - startTime });
  return {
    risks,
    aggregate_risk_score,
    normalized_risk_score,
    highest_risk_factor,
    mitigation_coverage_pct,
    risksByCategory,
    totalRisks: risks.length,
    categoryCoverage: Object.keys(risksByCategory).length,
    fourBuckets, usage, llmFallbackCount, riskFormId,
  };
}

function clamp(val, min, max, logger, fieldName) {
  const n = Number(val);
  if (!Number.isFinite(n)) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: NaN coerced to ${min}`, { original: val });
    return min;
  }
  const clamped = Math.max(min, Math.min(max, Math.round(n)));
  if (clamped !== Math.round(n)) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: ${n} clamped to [${min},${max}] → ${clamped}`, { original: val });
  }
  return clamped;
}


export { MIN_RISKS, MIN_CATEGORIES };
