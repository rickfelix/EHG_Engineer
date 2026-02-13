/**
 * Synthesis Component 9: Virality Analysis
 *
 * Evaluates venture candidates for viral growth potential across 7 dimensions:
 * - K-factor: Expected viral coefficient (users brought per user)
 * - Cycle time: Days for one viral loop to complete
 * - Mechanic type: inherent | manufactured | word_of_mouth | incentivized
 * - Channel fit: How well the product fits viral distribution channels (0-100)
 * - Shareability: How naturally the product gets shared (0-100)
 * - Decay rate: How quickly viral momentum fades (0-1, lower is better)
 * - Organic ratio: Proportion of growth that's organic vs paid (0-1)
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-A
 */

import { getValidationClient } from '../../../llm/client-factory.js';

const MECHANIC_TYPES = ['inherent', 'manufactured', 'word_of_mouth', 'incentivized'];

/**
 * Analyze virality potential for a venture candidate.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Virality analysis result
 */
export async function analyzeVirality(pathOutput, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  logger.log('   Analyzing virality potential...');

  const prompt = `You are an EHG growth analyst. Evaluate the viral potential of this venture.

VENTURE:
Name: ${pathOutput.suggested_name}
Problem: ${pathOutput.suggested_problem}
Solution: ${pathOutput.suggested_solution}
Market: ${pathOutput.target_market}

EHG Chairman Directives:
- Viral potential is a key evaluation factor
- Prefer ventures with inherent virality over manufactured
- Data collection and network effects compound virality
- Narrow niche virality is more valuable than broad shallow virality

Evaluate across 7 dimensions:

1. K-factor (0-10): How many new users does each user bring?
   - <1 = decaying, 1 = stable, >1 = growing, >3 = exceptional
2. Cycle time (days): How long for one viral loop?
   - <1 day = instant (social), 1-7 = fast, 7-30 = moderate, >30 = slow
3. Mechanic type: Primary viral mechanic
   - inherent: Product requires sharing to function (e.g., messaging)
   - manufactured: Built-in sharing features (e.g., referral program)
   - word_of_mouth: Quality drives organic discussion
   - incentivized: Rewards for sharing (e.g., discounts)
4. Channel fit (0-100): How well does this fit viral channels?
5. Shareability (0-100): How naturally does this get shared?
6. Decay rate (0-1): How quickly does viral momentum fade? (lower = better)
7. Organic ratio (0-1): What fraction of growth is organic? (higher = better)

Return JSON:
{
  "k_factor": 1.5,
  "cycle_time_days": 7,
  "mechanic_type": "word_of_mouth",
  "channel_fit": 65,
  "shareability": 70,
  "decay_rate": 0.3,
  "organic_ratio": 0.6,
  "virality_score": 62,
  "growth_loops": [{"name": "string", "description": "string", "strength": 75}],
  "viral_channels": ["string"],
  "compounding_factors": "string (how virality compounds with data/network effects)",
  "risks": ["string"],
  "summary": "string (2-3 sentences)"
}`;

  try {
    const response = await client.messages.create({
      model: client._model || 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      return {
        component: 'virality_analysis',
        k_factor: clamp(analysis.k_factor ?? 0, 0, 10),
        cycle_time_days: Math.max(0, analysis.cycle_time_days ?? 30),
        mechanic_type: MECHANIC_TYPES.includes(analysis.mechanic_type) ? analysis.mechanic_type : 'word_of_mouth',
        channel_fit: clamp(analysis.channel_fit ?? 0, 0, 100),
        shareability: clamp(analysis.shareability ?? 0, 0, 100),
        decay_rate: clamp(analysis.decay_rate ?? 0.5, 0, 1),
        organic_ratio: clamp(analysis.organic_ratio ?? 0.5, 0, 1),
        virality_score: clamp(analysis.virality_score ?? calculateViralityScore(analysis), 0, 100),
        growth_loops: analysis.growth_loops || [],
        viral_channels: analysis.viral_channels || [],
        compounding_factors: analysis.compounding_factors || '',
        risks: analysis.risks || [],
        summary: analysis.summary || '',
      };
    }
    return defaultViralityResult('Could not parse virality analysis');
  } catch (err) {
    logger.warn(`   Warning: Virality analysis failed: ${err.message}`);
    return defaultViralityResult(`Analysis failed: ${err.message}`);
  }
}

/**
 * Calculate virality score from sub-dimensions when LLM doesn't provide one.
 *
 * Weighted formula:
 * - K-factor: 30% (normalized to 0-100 from 0-10 scale)
 * - Shareability: 20%
 * - Channel fit: 15%
 * - Organic ratio: 15% (scaled to 0-100)
 * - Cycle time: 10% (inverse - shorter is better)
 * - Decay rate: 10% (inverse - lower is better)
 *
 * @param {Object} dims - Sub-dimension values
 * @returns {number} Score 0-100
 */
export function calculateViralityScore(dims) {
  if (!dims) return 0;

  const kScore = clamp((dims.k_factor ?? 0) / 10 * 100, 0, 100);
  const shareScore = clamp(dims.shareability ?? 0, 0, 100);
  const channelScore = clamp(dims.channel_fit ?? 0, 0, 100);
  const organicScore = clamp((dims.organic_ratio ?? 0) * 100, 0, 100);

  // Cycle time: <1 day = 100, 30+ days = 0
  const cycleTime = dims.cycle_time_days ?? 30;
  const cycleScore = cycleTime >= 30 ? 0 : Math.round(((30 - cycleTime) / 30) * 100);

  // Decay rate: 0 = 100 (no decay), 1 = 0 (instant decay)
  const decayScore = Math.round((1 - clamp(dims.decay_rate ?? 0.5, 0, 1)) * 100);

  return Math.round(
    kScore * 0.30 +
    shareScore * 0.20 +
    channelScore * 0.15 +
    organicScore * 0.15 +
    cycleScore * 0.10 +
    decayScore * 0.10
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function defaultViralityResult(summary) {
  return {
    component: 'virality_analysis',
    k_factor: 0,
    cycle_time_days: 0,
    mechanic_type: 'word_of_mouth',
    channel_fit: 0,
    shareability: 0,
    decay_rate: 0,
    organic_ratio: 0,
    virality_score: 0,
    growth_loops: [],
    viral_channels: [],
    compounding_factors: '',
    risks: [],
    summary,
  };
}

export { MECHANIC_TYPES };
