/**
 * Synthesis Component 12: Technology Trajectory Model
 *
 * Projects technology capability trajectories across 3 axes with bull/base/bear
 * confidence bands over a 6-month horizon:
 * - Reasoning & Autonomy (RA, 40%): Agent capability, multi-step planning, tool use
 * - Cost Deflation (CD, 35%): Token economics, model efficiency, inference cost trends
 * - Multimodal Expansion (ME, 25%): Vision, audio, video, real-time processing
 *
 * Competitive Timing Signals:
 * - opening: Technology enables new moats (build now)
 * - closing: Commoditization approaching (build fast)
 * - contested: No definitive advantage window (validate first)
 *
 * Ships with advisory weight 0.05 in weighted composite.
 *
 * Part of SD-LEO-FEAT-TECHNOLOGY-TRAJECTORY-MODEL-001
 */

import { getValidationClient } from '../../../llm/client-factory.js';
import { extractUsage } from '../../utils/parse-json.js';

const AXIS_WEIGHTS = {
  reasoning_autonomy: 0.40,
  cost_deflation: 0.35,
  multimodal_expansion: 0.25,
};

const TIMING_SIGNALS = ['opening', 'closing', 'contested'];

/**
 * Analyze technology trajectory for a venture candidate.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @param {Object} [deps.dataFeed] - External data feed (stubbed for future use)
 * @returns {Promise<Object>} Technology trajectory analysis result
 */
export async function analyzeTechTrajectory(pathOutput, deps = {}) {
  const { logger = console, llmClient, dataFeed = null } = deps;
  const client = llmClient || getValidationClient();

  logger.log('   Analyzing technology trajectory...');

  const externalSignals = dataFeed ? await dataFeed.getTechSignals() : null;
  const signalContext = externalSignals
    ? `\nExternal signals available: ${JSON.stringify(externalSignals)}`
    : '';

  const prompt = `You are an EHG technology trajectory analyst. Project how frontier AI capability trends affect this venture's timing and defensibility over the next 6 months.

VENTURE:
Name: ${pathOutput.suggested_name}
Problem: ${pathOutput.suggested_problem}
Solution: ${pathOutput.suggested_solution}
Market: ${pathOutput.target_market}
${signalContext}

EHG Chairman Directives:
- Technology trajectory determines build-vs-wait timing decisions
- Cost deflation curves make previously impossible ventures viable
- Reasoning gains create new automation possibilities quarterly
- Multimodal expansion opens new interaction paradigms
- Always disclose assumptions — these are framework-informed projections, not forecasts

Evaluate across 3 capability axes (each scored 0-100 for current capability level):

1. Reasoning & Autonomy (RA, weight: 40%): Agent capability, multi-step planning, tool use
   - How does improving reasoning affect this venture's feasibility?
   - Bull case: What could this venture do with 2x reasoning capability?
   - Bear case: What if reasoning plateaus at current levels?

2. Cost Deflation (CD, weight: 35%): Token economics, model efficiency, inference cost trends
   - At what cost point does this venture become unit-economics viable?
   - Bull case: 10x cost reduction in 6 months
   - Bear case: Costs plateau or increase due to compute demand

3. Multimodal Expansion (ME, weight: 25%): Vision, audio, video, real-time processing
   - Does this venture require or benefit from multimodal capability?
   - Bull case: Full real-time multimodal available
   - Bear case: Text-only for foreseeable future

Return JSON:
{
  "axes": {
    "reasoning_autonomy": {
      "current": 65,
      "bull_6m": 85,
      "base_6m": 75,
      "bear_6m": 68,
      "venture_impact": "string (how this axis affects the venture)"
    },
    "cost_deflation": {
      "current": 50,
      "bull_6m": 80,
      "base_6m": 65,
      "bear_6m": 45,
      "venture_impact": "string"
    },
    "multimodal_expansion": {
      "current": 40,
      "bull_6m": 70,
      "base_6m": 55,
      "bear_6m": 42,
      "venture_impact": "string"
    }
  },
  "competitive_timing": {
    "signal": "opening",
    "confidence": 0.7,
    "window_months": 6,
    "rationale": "string (why this timing signal)"
  },
  "next_disruption_event": {
    "event": "string (e.g., GPT-5 release, cost breakthrough)",
    "estimated_months": 4,
    "invalidation_scope": "string (what assumptions this would break)"
  },
  "gap_windows": [{"capability": "string", "opens_when": "string", "venture_relevance": "string"}],
  "confidence_caveat": "string (mandatory: acknowledge this is framework-informed, not a forecast)",
  "summary": "string (2-3 sentences)"
}`;

  try {
    const response = await client.messages.create({
      model: client._model || 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    const usage = extractUsage(response);

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);

      const axes = normalizeAxes(analysis.axes);
      const compositeScore = calculateTrajectoryScore(axes);
      const timing = normalizeTiming(analysis.competitive_timing);

      return {
        component: 'tech_trajectory',
        trajectory_score: compositeScore,
        axes,
        competitive_timing: timing,
        next_disruption_event: analysis.next_disruption_event || { event: 'Unknown', estimated_months: 6, invalidation_scope: 'Unknown' },
        gap_windows: Array.isArray(analysis.gap_windows) ? analysis.gap_windows : [],
        confidence_caveat: analysis.confidence_caveat || 'Framework-informed projections based on training data. Not real-time signals.',
        summary: analysis.summary || '',
        data_feed_active: dataFeed !== null,
        usage,
      };
    }
    return defaultTrajectoryResult('Could not parse technology trajectory analysis');
  } catch (err) {
    logger.warn(`   Warning: Technology trajectory analysis failed: ${err.message}`);
    return defaultTrajectoryResult(`Analysis failed: ${err.message}`);
  }
}

/**
 * Calculate composite trajectory score from axis base-case projections.
 * Weights: RA=40%, CD=35%, ME=25%.
 *
 * @param {Object} axes - Normalized axis data
 * @returns {number} Score 0-100
 */
export function calculateTrajectoryScore(axes) {
  if (!axes) return 0;

  return Math.round(
    clamp(axes.reasoning_autonomy?.base_6m ?? 0, 0, 100) * AXIS_WEIGHTS.reasoning_autonomy +
    clamp(axes.cost_deflation?.base_6m ?? 0, 0, 100) * AXIS_WEIGHTS.cost_deflation +
    clamp(axes.multimodal_expansion?.base_6m ?? 0, 0, 100) * AXIS_WEIGHTS.multimodal_expansion
  );
}

function normalizeAxes(rawAxes) {
  if (!rawAxes) return defaultAxes();

  const normalize = (axis) => ({
    current: clamp(axis?.current ?? 0, 0, 100),
    bull_6m: clamp(axis?.bull_6m ?? 0, 0, 100),
    base_6m: clamp(axis?.base_6m ?? 0, 0, 100),
    bear_6m: clamp(axis?.bear_6m ?? 0, 0, 100),
    venture_impact: axis?.venture_impact || '',
  });

  return {
    reasoning_autonomy: normalize(rawAxes.reasoning_autonomy),
    cost_deflation: normalize(rawAxes.cost_deflation),
    multimodal_expansion: normalize(rawAxes.multimodal_expansion),
  };
}

function normalizeTiming(rawTiming) {
  if (!rawTiming) return { signal: 'contested', confidence: 0, window_months: 6, rationale: '' };

  return {
    signal: TIMING_SIGNALS.includes(rawTiming.signal) ? rawTiming.signal : 'contested',
    confidence: clamp(rawTiming.confidence ?? 0, 0, 1),
    window_months: Math.max(0, rawTiming.window_months ?? 6),
    rationale: rawTiming.rationale || '',
  };
}

function defaultAxes() {
  const axis = { current: 0, bull_6m: 0, base_6m: 0, bear_6m: 0, venture_impact: '' };
  return { reasoning_autonomy: { ...axis }, cost_deflation: { ...axis }, multimodal_expansion: { ...axis } };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function defaultTrajectoryResult(summary) {
  return {
    component: 'tech_trajectory',
    trajectory_score: 0,
    axes: defaultAxes(),
    competitive_timing: { signal: 'contested', confidence: 0, window_months: 0, rationale: '' },
    next_disruption_event: { event: 'Unknown', estimated_months: 0, invalidation_scope: 'Unknown' },
    gap_windows: [],
    confidence_caveat: 'Technology trajectory analysis unavailable.',
    summary,
    data_feed_active: false,
  };
}

export { AXIS_WEIGHTS, TIMING_SIGNALS };
