/**
 * Stage 25 Analysis Step - Venture Review (Capstone)
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-EVA-FEAT-TEMPLATES-LAUNCH-001
 *
 * The most complex analysis step in the pipeline.
 * Consumes Stages 1 (origin vision), 5/16 (projections), 13 (roadmap),
 * 20-22 (quality/review/release), 23 (launch), 24 (metrics).
 * Produces: journey summary, financial comparison, drift analysis,
 * venture health assessment, and decision recommendation.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-25-venture-review
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

const VENTURE_DECISIONS = ['continue', 'pivot', 'expand', 'sunset', 'exit'];
const HEALTH_RATINGS = ['excellent', 'good', 'fair', 'poor', 'critical'];
const REVIEW_CATEGORIES = ['product', 'market', 'technical', 'financial', 'team'];
const EXPANSION_VECTORS = ['market', 'feature', 'segment'];
const EXPANSION_WEIGHTS = { market: 0.4, feature: 0.35, segment: 0.25 };

const EXPANSION_SYSTEM_PROMPT = `You are EVA's Expansion Analyst. Given a venture that has been recommended for expansion, score the readiness across three expansion vectors.

You MUST output valid JSON with exactly this structure:
{
  "market": { "score": 75, "rationale": "Brief rationale for market expansion readiness" },
  "feature": { "score": 80, "rationale": "Brief rationale for feature expansion readiness" },
  "segment": { "score": 60, "rationale": "Brief rationale for segment expansion readiness" }
}

Rules:
- Each score is 0-100 (0 = not ready, 100 = fully ready)
- market: readiness to enter new geographic/demographic markets
- feature: readiness to add major new product features or product lines
- segment: readiness to serve new customer segments or verticals
- Base scores on venture health dimensions, financial trajectory, and team capacity`;

const SYSTEM_PROMPT = `You are EVA's Venture Review Analyst conducting the capstone Stage 25 review. Synthesize the ENTIRE venture journey into a comprehensive decision recommendation.

You MUST output valid JSON with exactly this structure:
{
  "journeySummary": "3-5 sentence narrative of the venture's journey from idea to launch",
  "financialComparison": {
    "projectedRevenue": "From Stage 5/16 financial projections",
    "actualRevenue": "From Stage 24 metrics",
    "projectedCosts": "From Stage 5/16",
    "actualCosts": "From Stage 24",
    "variance": "Summary of variance between projected and actual",
    "assessment": "On track / Below expectations / Above expectations"
  },
  "ventureHealth": {
    "overallRating": "excellent|good|fair|poor|critical",
    "dimensions": {
      "product": { "score": 8, "rationale": "Brief explanation" },
      "market": { "score": 7, "rationale": "Brief explanation" },
      "technical": { "score": 9, "rationale": "Brief explanation" },
      "financial": { "score": 6, "rationale": "Brief explanation" },
      "team": { "score": 7, "rationale": "Brief explanation" }
    }
  },
  "driftAnalysis": {
    "originalVision": "From Stage 1",
    "currentState": "Current venture state",
    "driftDetected": true,
    "driftSummary": "Description of how the venture has evolved from original vision"
  },
  "ventureDecision": {
    "recommendation": "continue|pivot|expand|sunset|exit",
    "confidence": 85,
    "rationale": "2-3 sentence justification for the recommendation",
    "nextActions": ["Action 1", "Action 2"]
  },
  "initiatives": {
    "product": [{ "title": "Initiative", "status": "completed|in_progress|planned", "outcome": "Result" }],
    "market": [{ "title": "Initiative", "status": "completed", "outcome": "Result" }],
    "technical": [{ "title": "Initiative", "status": "completed", "outcome": "Result" }],
    "financial": [{ "title": "Initiative", "status": "completed", "outcome": "Result" }],
    "team": [{ "title": "Initiative", "status": "completed", "outcome": "Result" }]
  }
}

Rules:
- journeySummary must reference specific stages/phases
- financialComparison must include both projected and actual data
- ventureHealth dimensions scored 1-10
- Each initiatives category must have at least 1 entry
- ventureDecision.confidence is 0-100
- Decision should be based on financial, health, and metric data
- "continue" = proceed with next BUILD LOOP iteration
- "pivot" = revisit ENGINE/IDENTITY phases
- "expand" = scale current venture
- "sunset" = wind down gracefully
- "exit" = lifecycle complete (sale, shutdown, or spinoff)`;

/**
 * Generate comprehensive venture review from full lifecycle data.
 *
 * @param {Object} params
 * @param {Object} params.stage24Data - Metrics & learning (AARRR, launch outcome)
 * @param {Object} [params.stage23Data] - Launch execution (success criteria)
 * @param {Object} [params.stage01Data] - Venture hydration (original vision)
 * @param {Object} [params.stage05Data] - Financial model (projections)
 * @param {Object} [params.stage16Data] - Financial projections (detailed)
 * @param {Object} [params.stage13Data] - Product roadmap
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Comprehensive venture review with decision
 */
export async function analyzeStage25({ stage24Data, stage23Data, stage01Data, stage05Data, stage16Data, stage13Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage25] Starting analysis', { ventureName });
  if (!stage24Data) {
    throw new Error('Stage 25 venture review requires Stage 24 (metrics & learning) data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const metricsContext = stage24Data.launchOutcome
    ? `Launch outcome: ${stage24Data.launchOutcome.assessment} (${stage24Data.launchOutcome.criteriaMetRate}% criteria met)`
    : '';

  const learningsContext = Array.isArray(stage24Data.learnings)
    ? `Key learnings: ${stage24Data.learnings.slice(0, 3).map(l => l.insight).join('; ')}`
    : '';

  const stage1Context = stage01Data
    ? `Original vision: ${stage01Data.venture_name || 'Unknown'} — ${stage01Data.elevator_pitch || 'No pitch'}`
    : '';

  const financialContext = stage05Data
    ? 'Stage 5 financial projections available'
    : '';

  const projectionContext = stage16Data
    ? 'Stage 16 detailed projections available'
    : '';

  const roadmapContext = stage13Data
    ? 'Stage 13 product roadmap available'
    : '';

  const launchContext = stage23Data
    ? `Launch type: ${stage23Data.launchType || 'unknown'}, Tasks: ${stage23Data.totalTasks || 0}`
    : '';

  const userPrompt = `Generate comprehensive venture review (Stage 25 capstone).

Venture: ${ventureName || 'Unnamed'}
${stage1Context}
${launchContext}
${metricsContext}
${learningsContext}
${financialContext}
${projectionContext}
${roadmapContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize journey summary
  const journeySummary = String(parsed.journeySummary || 'Venture journey summary pending review.').substring(0, 2000);

  // Normalize financial comparison
  const fc = parsed.financialComparison || {};
  const financialComparison = {
    projectedRevenue: String(fc.projectedRevenue || 'Not available').substring(0, 200),
    actualRevenue: String(fc.actualRevenue || 'Not measured').substring(0, 200),
    projectedCosts: String(fc.projectedCosts || 'Not available').substring(0, 200),
    actualCosts: String(fc.actualCosts || 'Not measured').substring(0, 200),
    variance: String(fc.variance || 'Variance analysis pending').substring(0, 500),
    assessment: String(fc.assessment || 'Assessment pending').substring(0, 200),
  };

  // Normalize venture health
  const vh = parsed.ventureHealth || {};
  const dimensions = {};
  for (const cat of REVIEW_CATEGORIES) {
    const dim = vh.dimensions?.[cat] || {};
    dimensions[cat] = {
      score: typeof dim.score === 'number' ? Math.max(1, Math.min(10, Math.round(dim.score))) : 5,
      rationale: String(dim.rationale || `${cat} assessment pending`).substring(0, 300),
    };
  }

  const avgScore = REVIEW_CATEGORIES.reduce((sum, cat) => sum + dimensions[cat].score, 0) / REVIEW_CATEGORIES.length;
  let overallRating;
  if (HEALTH_RATINGS.includes(vh.overallRating)) {
    overallRating = vh.overallRating;
  } else if (avgScore >= 8.5) {
    overallRating = 'excellent';
  } else if (avgScore >= 7) {
    overallRating = 'good';
  } else if (avgScore >= 5) {
    overallRating = 'fair';
  } else if (avgScore >= 3) {
    overallRating = 'poor';
  } else {
    overallRating = 'critical';
  }

  const ventureHealth = { overallRating, dimensions };

  // Normalize drift analysis
  const da = parsed.driftAnalysis || {};
  const driftAnalysis = {
    originalVision: String(da.originalVision || stage01Data?.elevator_pitch || 'Not available').substring(0, 500),
    currentState: String(da.currentState || 'Current state assessment pending').substring(0, 500),
    driftDetected: typeof da.driftDetected === 'boolean' ? da.driftDetected : false,
    driftSummary: String(da.driftSummary || 'No significant drift detected').substring(0, 500),
  };

  // Normalize venture decision
  const vd = parsed.ventureDecision || {};
  const recommendation = VENTURE_DECISIONS.includes(vd.recommendation)
    ? vd.recommendation
    : 'continue';
  const confidence = typeof vd.confidence === 'number'
    ? Math.max(0, Math.min(100, Math.round(vd.confidence)))
    : 50;

  const ventureDecision = {
    recommendation,
    confidence,
    rationale: String(vd.rationale || `Recommended ${recommendation} based on available data`).substring(0, 500),
    nextActions: Array.isArray(vd.nextActions) && vd.nextActions.length > 0
      ? vd.nextActions.map(a => String(a).substring(0, 200))
      : ['Review venture metrics in next cycle'],
  };

  // Normalize initiatives
  const initiatives = {};
  let totalInitiatives = 0;
  let categoriesReviewed = 0;

  for (const cat of REVIEW_CATEGORIES) {
    const items = Array.isArray(parsed.initiatives?.[cat])
      ? parsed.initiatives[cat].filter(i => i?.title)
      : [];

    if (items.length === 0) {
      initiatives[cat] = [{
        title: `${cat} initiative review pending`,
        status: 'planned',
        outcome: 'Pending review',
      }];
    } else {
      initiatives[cat] = items.map(i => ({
        title: String(i.title).substring(0, 200),
        status: String(i.status || 'planned').substring(0, 50),
        outcome: String(i.outcome || 'Pending').substring(0, 300),
      }));
    }

    totalInitiatives += initiatives[cat].length;
    categoriesReviewed++;
  }

  // Expansion vector analysis (only when recommendation is 'expand')
  let expansionAnalysis = null;
  let expansionReadinessScore = null;

  if (ventureDecision.recommendation === 'expand') {
    logger.log('[Stage25] Expand recommended — running expansion vector analysis');
    expansionAnalysis = await analyzeExpansionVectors({ ventureHealth, ventureDecision, ventureName, logger });
    expansionReadinessScore = expansionAnalysis.readinessScore;
  }

  logger.log('[Stage25] Analysis complete', { duration: Date.now() - startTime });
  return {
    journeySummary,
    financialComparison,
    ventureHealth,
    driftAnalysis,
    ventureDecision,
    initiatives,
    totalInitiatives,
    allCategoriesReviewed: categoriesReviewed === REVIEW_CATEGORIES.length,
    healthScore: Math.round(avgScore * 10) / 10,
    expansionAnalysis,
    expansionReadinessScore,
    fourBuckets, usage,
  };
}


/**
 * Analyze expansion vectors when venture decision is 'expand'.
 * Scores market, feature, and segment readiness via LLM.
 *
 * @param {Object} params
 * @param {Object} params.ventureHealth - Health dimensions from main analysis
 * @param {Object} params.ventureDecision - Decision object with recommendation/rationale
 * @param {string} [params.ventureName]
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} Expansion analysis with per-vector scores and composite readinessScore
 */
export async function analyzeExpansionVectors({ ventureHealth, ventureDecision, ventureName, logger = console }) {
  const client = getLLMClient({ purpose: 'content-generation' });

  const healthSummary = Object.entries(ventureHealth.dimensions || {})
    .map(([cat, dim]) => `${cat}: ${dim.score}/10`)
    .join(', ');

  const userPrompt = `Analyze expansion readiness for venture: ${ventureName || 'Unnamed'}.

Health dimensions: ${healthSummary}
Overall health: ${ventureHealth.overallRating}
Decision rationale: ${ventureDecision.rationale}
Decision confidence: ${ventureDecision.confidence}%

Output ONLY valid JSON.`;

  try {
    const response = await client.complete(EXPANSION_SYSTEM_PROMPT, userPrompt, { timeout: 60000 });
    const parsed = parseJSON(response);

    const vectors = {};
    for (const vec of EXPANSION_VECTORS) {
      const v = parsed[vec] || {};
      vectors[vec] = {
        score: typeof v.score === 'number' ? Math.max(0, Math.min(100, Math.round(v.score))) : 50,
        rationale: String(v.rationale || `${vec} expansion readiness pending`).substring(0, 300),
      };
    }

    const readinessScore = Math.round(
      EXPANSION_VECTORS.reduce((sum, vec) => sum + vectors[vec].score * EXPANSION_WEIGHTS[vec], 0)
    );

    logger.log('[Stage25] Expansion analysis complete', { readinessScore });
    return { vectors, readinessScore };
  } catch (err) {
    logger.warn('[Stage25] Expansion analysis failed, using defaults', { error: err.message });
    const vectors = {};
    for (const vec of EXPANSION_VECTORS) {
      vectors[vec] = { score: 50, rationale: `${vec} expansion readiness could not be assessed` };
    }
    return { vectors, readinessScore: 50 };
  }
}

export { VENTURE_DECISIONS, HEALTH_RATINGS, REVIEW_CATEGORIES, EXPANSION_VECTORS, EXPANSION_WEIGHTS };
