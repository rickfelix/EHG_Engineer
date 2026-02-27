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
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

const AARRR_CATEGORIES = ['acquisition', 'activation', 'retention', 'revenue', 'referral'];
const TREND_DIRECTIONS = ['up', 'flat', 'down'];
const OUTCOME_ASSESSMENTS = ['success', 'partial', 'failure', 'indeterminate'];
const IMPACT_LEVELS = ['high', 'medium', 'low'];
const EXPERIMENT_STATUSES = ['running', 'concluded', 'cancelled'];
const EXPERIMENT_OUTCOMES = ['positive', 'negative', 'inconclusive'];
const COHORT_PERIODS = ['day_1', 'day_7', 'day_14', 'day_30', 'day_60', 'day_90'];
const ENGAGEMENT_LEVELS = ['highly_engaged', 'engaged', 'casual', 'at_risk', 'churned'];

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
- trendDirection reflects whether the metric is improving

Additionally, evaluate these growth dimensions:

"growthExperiments": [
  {
    "name": "Experiment name",
    "hypothesis": "If we do X, then Y will increase by Z%",
    "status": "running|concluded|cancelled",
    "outcome": "positive|negative|inconclusive",
    "metric": "Primary metric tracked",
    "baselineValue": 0,
    "currentValue": 0,
    "targetLift": 10,
    "actualLift": 5,
    "sampleSize": 1000,
    "confidence": 95
  }
],
"retentionCohorts": [
  {
    "cohortName": "Week 1 users",
    "cohortSize": 100,
    "periods": {
      "day_1": 80, "day_7": 50, "day_14": 35, "day_30": 25, "day_60": 18, "day_90": 12
    },
    "churnRisk": "low|medium|high"
  }
],
"engagementScoring": {
  "overallScore": 65,
  "segments": [
    {
      "level": "highly_engaged|engaged|casual|at_risk|churned",
      "userCount": 100,
      "percentage": 25,
      "avgSessionDepth": 5,
      "avgSessionDuration": 300,
      "featureAdoption": 80
    }
  ],
  "topFeatures": [
    { "name": "Feature name", "adoptionRate": 85, "engagementImpact": "high|medium|low" }
  ]
}

Rules for growth dimensions:
- At least 1 growth experiment (can be hypothetical for pre-launch)
- At least 1 retention cohort
- Engagement scoring must have overallScore (0-100) and at least 1 segment
- Retention periods are percentages (0-100) of original cohort retained`;

/**
 * Generate launch scorecard from Stage 23 success criteria and AARRR metrics.
 *
 * @param {Object} params
 * @param {Object} params.stage23Data - Launch execution data (successCriteria, launchType)
 * @param {Object} [params.stage05Data] - Financial model (projected metrics)
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Launch scorecard with AARRR metrics and outcome
 */
export async function analyzeStage24({ stage23Data, stage05Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage24] Starting analysis', { ventureName });
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
    ? 'Stage 5 financial projections available for comparison'
    : '';

  const userPrompt = `Generate launch scorecard for this venture.

Venture: ${ventureName || 'Unnamed'}
${launchContext}
${criteriaContext}
${financialContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

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

  // Normalize growth experiments
  let growthExperiments = Array.isArray(parsed.growthExperiments)
    ? parsed.growthExperiments.filter(e => e?.name)
    : [];

  if (growthExperiments.length === 0) {
    growthExperiments = [{
      name: 'Baseline growth tracking',
      hypothesis: 'Establish baseline metrics for future experiments',
      status: 'running',
      outcome: 'inconclusive',
      metric: 'User acquisition rate',
      baselineValue: 0, currentValue: 0, targetLift: 10, actualLift: 0,
      sampleSize: 0, confidence: 0,
    }];
  } else {
    growthExperiments = growthExperiments.map(e => ({
      name: String(e.name).substring(0, 200),
      hypothesis: String(e.hypothesis || '').substring(0, 500),
      status: EXPERIMENT_STATUSES.includes(e.status) ? e.status : 'running',
      outcome: EXPERIMENT_OUTCOMES.includes(e.outcome) ? e.outcome : 'inconclusive',
      metric: String(e.metric || 'Unknown metric').substring(0, 200),
      baselineValue: typeof e.baselineValue === 'number' ? e.baselineValue : 0,
      currentValue: typeof e.currentValue === 'number' ? e.currentValue : 0,
      targetLift: typeof e.targetLift === 'number' ? e.targetLift : 10,
      actualLift: typeof e.actualLift === 'number' ? e.actualLift : 0,
      sampleSize: typeof e.sampleSize === 'number' ? e.sampleSize : 0,
      confidence: typeof e.confidence === 'number' ? Math.min(100, Math.max(0, e.confidence)) : 0,
    }));
  }

  // Normalize retention cohorts
  let retentionCohorts = Array.isArray(parsed.retentionCohorts)
    ? parsed.retentionCohorts.filter(c => c?.cohortName)
    : [];

  if (retentionCohorts.length === 0) {
    retentionCohorts = [{
      cohortName: 'Initial cohort',
      cohortSize: 0,
      periods: { day_1: 100, day_7: 0, day_14: 0, day_30: 0, day_60: 0, day_90: 0 },
      churnRisk: 'medium',
    }];
  } else {
    retentionCohorts = retentionCohorts.map(c => {
      const periods = {};
      for (const p of COHORT_PERIODS) {
        const val = c.periods?.[p];
        periods[p] = typeof val === 'number' ? Math.min(100, Math.max(0, val)) : 0;
      }
      return {
        cohortName: String(c.cohortName).substring(0, 200),
        cohortSize: typeof c.cohortSize === 'number' ? c.cohortSize : 0,
        periods,
        churnRisk: ['low', 'medium', 'high'].includes(c.churnRisk) ? c.churnRisk : 'medium',
      };
    });
  }

  // Normalize engagement scoring
  const rawEngagement = parsed.engagementScoring || {};
  const segments = Array.isArray(rawEngagement.segments)
    ? rawEngagement.segments.filter(s => s?.level).map(s => ({
        level: ENGAGEMENT_LEVELS.includes(s.level) ? s.level : 'casual',
        userCount: typeof s.userCount === 'number' ? s.userCount : 0,
        percentage: typeof s.percentage === 'number' ? Math.min(100, Math.max(0, s.percentage)) : 0,
        avgSessionDepth: typeof s.avgSessionDepth === 'number' ? s.avgSessionDepth : 0,
        avgSessionDuration: typeof s.avgSessionDuration === 'number' ? s.avgSessionDuration : 0,
        featureAdoption: typeof s.featureAdoption === 'number' ? Math.min(100, Math.max(0, s.featureAdoption)) : 0,
      }))
    : [{ level: 'casual', userCount: 0, percentage: 100, avgSessionDepth: 0, avgSessionDuration: 0, featureAdoption: 0 }];

  const topFeatures = Array.isArray(rawEngagement.topFeatures)
    ? rawEngagement.topFeatures.filter(f => f?.name).map(f => ({
        name: String(f.name).substring(0, 200),
        adoptionRate: typeof f.adoptionRate === 'number' ? Math.min(100, Math.max(0, f.adoptionRate)) : 0,
        engagementImpact: IMPACT_LEVELS.includes(f.engagementImpact) ? f.engagementImpact : 'medium',
      }))
    : [];

  const engagementScoring = {
    overallScore: typeof rawEngagement.overallScore === 'number'
      ? Math.min(100, Math.max(0, rawEngagement.overallScore))
      : 0,
    segments,
    topFeatures,
  };

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

  // Compute growth experiment derived metrics
  const concludedExperiments = growthExperiments.filter(e => e.status === 'concluded');
  const positiveExperiments = concludedExperiments.filter(e => e.outcome === 'positive');

  // Compute retention health
  const avgDay30Retention = retentionCohorts.length > 0
    ? Math.round(retentionCohorts.reduce((sum, c) => sum + c.periods.day_30, 0) / retentionCohorts.length)
    : 0;
  const highChurnCohorts = retentionCohorts.filter(c => c.churnRisk === 'high').length;

  logger.log('[Stage24] Analysis complete', { duration: Date.now() - startTime });
  return {
    aarrr,
    criteriaEvaluation,
    learnings,
    launchOutcome,
    growthExperiments,
    retentionCohorts,
    engagementScoring,
    totalMetrics,
    metricsOnTarget,
    metricsBelowTarget,
    categoriesComplete: categoriesComplete === AARRR_CATEGORIES.length,
    totalLearnings: learnings.length,
    highImpactLearnings: learnings.filter(l => l.impactLevel === 'high').length,
    totalExperiments: growthExperiments.length,
    concludedExperiments: concludedExperiments.length,
    positiveExperimentRate: concludedExperiments.length > 0
      ? Math.round((positiveExperiments.length / concludedExperiments.length) * 100)
      : 0,
    totalCohorts: retentionCohorts.length,
    avgDay30Retention,
    highChurnCohorts,
    engagementScore: engagementScoring.overallScore,
    fourBuckets, usage,
  };
}


export {
  AARRR_CATEGORIES, TREND_DIRECTIONS, OUTCOME_ASSESSMENTS, IMPACT_LEVELS,
  EXPERIMENT_STATUSES, EXPERIMENT_OUTCOMES, COHORT_PERIODS, ENGAGEMENT_LEVELS,
};
