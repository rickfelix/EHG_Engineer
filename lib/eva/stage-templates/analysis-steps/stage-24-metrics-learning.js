/**
 * Stage 24 Analysis Step - Metrics & Learning (Launch Scorecard)
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-EVA-FEAT-TEMPLATES-LAUNCH-001
 *
 * Evaluates Stage 23 success criteria against AARRR metrics.
 * Produces launch scorecard with per-criterion assessment.
 * Interprets metrics in context of launchType.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-24-metrics-learning
 */

import { getLLMClient } from '../../../llm/index.js';

const AARRR_CATEGORIES = ['acquisition', 'activation', 'retention', 'revenue', 'referral'];
const TREND_DIRECTIONS = ['up', 'flat', 'down'];
const OUTCOME_ASSESSMENTS = ['success', 'partial', 'failure', 'indeterminate'];
const IMPACT_LEVELS = ['high', 'medium', 'low'];

const SYSTEM_PROMPT = `You are EVA's Metrics & Learning Analyst. Evaluate launch success criteria against AARRR metrics and produce a launch scorecard.

You MUST output valid JSON with exactly this structure:
{
  "aarrr": {
    "acquisition": [{ "name": "Metric name", "value": 100, "target": 200, "trendDirection": "up|flat|down" }],
    "activation": [{ "name": "Metric name", "value": 50, "target": 60, "trendDirection": "up|flat|down" }],
    "retention": [{ "name": "Metric name", "value": 30, "target": 40, "trendDirection": "up|flat|down" }],
    "revenue": [{ "name": "Metric name", "value": 1000, "target": 5000, "trendDirection": "up|flat|down" }],
    "referral": [{ "name": "Metric name", "value": 5, "target": 10, "trendDirection": "up|flat|down" }]
  },
  "criteriaEvaluation": [
    {
      "metric": "Success criterion metric name (from Stage 23)",
      "target": "The target from Stage 23",
      "actual": "What was actually achieved",
      "met": true,
      "notes": "Brief explanation"
    }
  ],
  "learnings": [
    {
      "insight": "What was learned",
      "action": "What to do about it",
      "impactLevel": "high|medium|low"
    }
  ],
  "launchOutcome": {
    "assessment": "success|partial|failure|indeterminate",
    "criteriaMetRate": 75,
    "summary": "1-2 sentence summary of launch outcome"
  }
}

Rules:
- Each AARRR category must have at least 1 metric
- criteriaEvaluation must reference Stage 23 success criteria
- At least 1 learning required
- launchOutcome.criteriaMetRate = percentage of criteria met (0-100)
- For beta launches, lower targets are acceptable
- trendDirection reflects whether the metric is improving`;

/**
 * Generate launch scorecard from Stage 23 success criteria and AARRR metrics.
 *
 * @param {Object} params
 * @param {Object} params.stage23Data - Launch execution data (successCriteria, launchType)
 * @param {Object} [params.stage05Data] - Financial model (projected metrics)
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Launch scorecard with AARRR metrics and outcome
 */
export async function analyzeStage24({ stage23Data, stage05Data, ventureName }) {
  if (!stage23Data) {
    throw new Error('Stage 24 metrics & learning requires Stage 23 (launch execution) data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const criteriaContext = Array.isArray(stage23Data.successCriteria)
    ? `Success criteria from Stage 23:\n${stage23Data.successCriteria.map(sc => `- ${sc.metric}: ${sc.target} (${sc.priority}, window: ${sc.measurementWindow})`).join('\n')}`
    : '';

  const launchContext = stage23Data.launchType
    ? `Launch type: ${stage23Data.launchType}`
    : '';

  const financialContext = stage05Data
    ? `Stage 5 financial projections available for comparison`
    : '';

  const userPrompt = `Generate launch scorecard for this venture.

Venture: ${ventureName || 'Unnamed'}
${launchContext}
${criteriaContext}
${financialContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT, userPrompt);
  const parsed = parseJSON(response);

  // Normalize AARRR metrics
  const aarrr = {};
  for (const cat of AARRR_CATEGORIES) {
    const metrics = Array.isArray(parsed.aarrr?.[cat])
      ? parsed.aarrr[cat].filter(m => m?.name)
      : [];

    if (metrics.length === 0) {
      aarrr[cat] = [{
        name: `${cat} metric`,
        value: 0,
        target: 1,
        trendDirection: 'flat',
      }];
    } else {
      aarrr[cat] = metrics.map(m => ({
        name: String(m.name).substring(0, 200),
        value: typeof m.value === 'number' ? m.value : 0,
        target: typeof m.target === 'number' ? m.target : 1,
        trendDirection: TREND_DIRECTIONS.includes(m.trendDirection) ? m.trendDirection : 'flat',
      }));
    }
  }

  // Normalize criteria evaluation
  let criteriaEvaluation = Array.isArray(parsed.criteriaEvaluation)
    ? parsed.criteriaEvaluation.filter(ce => ce?.metric)
    : [];

  criteriaEvaluation = criteriaEvaluation.map(ce => ({
    metric: String(ce.metric).substring(0, 200),
    target: String(ce.target || 'Not specified').substring(0, 200),
    actual: String(ce.actual || 'Not measured').substring(0, 200),
    met: typeof ce.met === 'boolean' ? ce.met : false,
    notes: String(ce.notes || '').substring(0, 300),
  }));

  // Normalize learnings
  let learnings = Array.isArray(parsed.learnings)
    ? parsed.learnings.filter(l => l?.insight)
    : [];

  if (learnings.length === 0) {
    learnings = [{
      insight: 'Launch metrics collected for baseline',
      action: 'Review metrics in next cycle',
      impactLevel: 'medium',
    }];
  } else {
    learnings = learnings.map(l => ({
      insight: String(l.insight).substring(0, 300),
      action: String(l.action).substring(0, 300),
      impactLevel: IMPACT_LEVELS.includes(l.impactLevel) ? l.impactLevel : 'medium',
    }));
  }

  // Normalize launch outcome
  const lo = parsed.launchOutcome || {};
  const criteriaMet = criteriaEvaluation.filter(ce => ce.met).length;
  const criteriaMetRate = criteriaEvaluation.length > 0
    ? Math.round((criteriaMet / criteriaEvaluation.length) * 100)
    : (typeof lo.criteriaMetRate === 'number' ? lo.criteriaMetRate : 0);

  let assessment;
  if (OUTCOME_ASSESSMENTS.includes(lo.assessment)) {
    assessment = lo.assessment;
  } else if (criteriaMetRate >= 80) {
    assessment = 'success';
  } else if (criteriaMetRate >= 50) {
    assessment = 'partial';
  } else if (criteriaEvaluation.length === 0) {
    assessment = 'indeterminate';
  } else {
    assessment = 'failure';
  }

  const launchOutcome = {
    assessment,
    criteriaMetRate,
    summary: String(lo.summary || `Launch ${assessment}: ${criteriaMetRate}% of criteria met`).substring(0, 500),
  };

  // Compute derived metrics
  let totalMetrics = 0;
  let metricsOnTarget = 0;
  let metricsBelowTarget = 0;
  let categoriesComplete = 0;

  for (const cat of AARRR_CATEGORIES) {
    const metrics = aarrr[cat];
    if (metrics.length > 0) categoriesComplete++;
    totalMetrics += metrics.length;
    for (const m of metrics) {
      if (m.value >= m.target) metricsOnTarget++;
      else metricsBelowTarget++;
    }
  }

  return {
    aarrr,
    criteriaEvaluation,
    learnings,
    launchOutcome,
    totalMetrics,
    metricsOnTarget,
    metricsBelowTarget,
    categoriesComplete: categoriesComplete === AARRR_CATEGORIES.length,
    totalLearnings: learnings.length,
    highImpactLearnings: learnings.filter(l => l.impactLevel === 'high').length,
  };
}

function parseJSON(text) {
  const cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse metrics & learning response: ${cleaned.substring(0, 200)}`);
  }
}

export { AARRR_CATEGORIES, TREND_DIRECTIONS, OUTCOME_ASSESSMENTS, IMPACT_LEVELS };
