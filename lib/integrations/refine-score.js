/**
 * Refine: Multi-Persona Scoring Engine
 * SD: SD-LEO-INFRA-ADD-DISTILL-REFINE-001
 *
 * Scores each roadmap wave item using 4 AI personas:
 *   1. Optimist   — Sees potential, scores upside (weight: 0.15)
 *   2. Pragmatist — Evaluates feasibility and effort (weight: 0.35)
 *   3. Devil's Advocate — Finds risks and challenges (weight: 0.25)
 *   4. Strategist — Judges alignment with vision (weight: 0.25)
 *
 * Final composite score (0-100) determines Chairman triage:
 *   - >=70: Auto-recommend for promotion
 *   - 40-69: Chairman review required
 *   - <40:  Auto-recommend for deferral
 */

import { getClassificationClient } from '../llm/client-factory.js';

const SCORE_CONFIG = {
  AI_TIMEOUT_MS: 90000,
  MAX_ITEMS_PER_BATCH: 30,
  PERSONAS: {
    optimist: { weight: 0.15, description: 'Sees potential and upside' },
    pragmatist: { weight: 0.35, description: 'Evaluates feasibility and effort' },
    devils_advocate: { weight: 0.25, description: 'Finds risks and challenges' },
    strategist: { weight: 0.25, description: 'Judges vision alignment' },
  },
  THRESHOLDS: {
    AUTO_PROMOTE: 70,
    CHAIRMAN_REVIEW: 40,
  },
};

/**
 * Build prompt for a specific persona to score items.
 * @param {string} persona
 * @param {Array} items
 * @param {Object} [context] - Optional wave/roadmap context
 * @returns {string}
 */
export function buildScoringPrompt(persona, items, context = {}) {
  const itemList = items.map((item, i) =>
    `  ${i + 1}. [${item.target_application || 'unknown'}] [${item.chairman_intent || 'unknown'}] ${(item.title || '').slice(0, 120)}`
  ).join('\n');

  const waveContext = context.waveTitle
    ? `\nThis wave is titled: "${context.waveTitle}" — ${context.waveDescription || ''}\n`
    : '';

  const personaInstructions = {
    optimist: `You are the OPTIMIST. Score each item based on its potential upside, innovation value, and opportunity it represents.
Focus on: What could this enable? What doors does it open? How transformative could it be?
Be generous but honest — score potential, not just current state.`,

    pragmatist: `You are the PRAGMATIST. Score each item based on feasibility, implementation effort, and practical value.
Focus on: How hard is this to build? What's the effort-to-value ratio? Is it achievable with current resources?
Be realistic — high scores for items that are achievable and deliver clear value.`,

    devils_advocate: `You are the DEVIL'S ADVOCATE. Score each item based on risk, complexity, and potential problems.
Focus on: What could go wrong? What dependencies are hidden? What technical debt might this create?
Higher scores mean FEWER risks (inverted: 100 = low risk, 0 = extremely risky).`,

    strategist: `You are the STRATEGIST. Score each item based on alignment with the overall vision and strategic goals.
Focus on: Does this move the product forward? Does it align with the roadmap direction? Is the timing right?
Score based on strategic importance and timing.`,
  };

  return `${personaInstructions[persona]}
${waveContext}
Score these ${items.length} items from 0-100:
${itemList}

Respond with ONLY valid JSON (no markdown, no explanation):
{"scores": [{"item_index": 1, "score": 75, "reasoning": "Brief reason"}]}

Rules:
- item_index is 1-based (matching the list)
- Score 0-100
- Every item must have exactly one score
- Keep reasoning to 1 sentence`;
}

/**
 * Parse scoring response from one persona.
 * @param {string} response
 * @param {number} itemCount
 * @returns {{ scores: Array<{item_index: number, score: number, reasoning: string}> } | null}
 */
export function parseScoringResponse(response, itemCount) {
  try {
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.scores || !Array.isArray(parsed.scores)) return null;

    for (const s of parsed.scores) {
      if (s.item_index < 1 || s.item_index > itemCount) return null;
      if (typeof s.score !== 'number' || s.score < 0 || s.score > 100) return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Keyword-based fallback scoring — uses intent and source type heuristics.
 * @param {Array} items
 * @param {string} persona
 * @returns {{ scores: Array<{item_index: number, score: number, reasoning: string}> }}
 */
export function keywordScore(items, persona) {
  const scores = items.map((item, i) => {
    let score = 50; // baseline

    const intent = item.chairman_intent || '';
    const app = item.target_application || '';

    if (persona === 'optimist') {
      if (intent === 'idea') score = 70;
      else if (intent === 'value') score = 65;
      else if (intent === 'insight') score = 60;
      else if (intent === 'reference') score = 55;
      else if (intent === 'question') score = 50;
    } else if (persona === 'pragmatist') {
      if (intent === 'reference') score = 70; // references are easy to act on
      else if (intent === 'insight') score = 65;
      else if (intent === 'value') score = 60;
      else if (intent === 'idea') score = 50;
      else if (intent === 'question') score = 45;
    } else if (persona === 'devils_advocate') {
      // Higher = fewer risks
      if (intent === 'reference') score = 80; // low risk
      if (intent === 'insight') score = 70;
      if (intent === 'value') score = 60;
      if (intent === 'idea') score = 45;
      if (intent === 'question') score = 65;
    } else if (persona === 'strategist') {
      if (app === 'ehg_engineer') score = 65; // infrastructure = strategic
      else if (app === 'ehg_app') score = 60;
      else if (app === 'new_venture') score = 55;
      if (intent === 'value') score += 10;
    }

    return {
      item_index: i + 1,
      score: Math.min(100, Math.max(0, score)),
      reasoning: `Keyword heuristic: ${intent}/${app}`,
    };
  });

  return { scores };
}

/**
 * Run multi-persona scoring on a set of items.
 * @param {Array} items
 * @param {Object} [context] - Wave context for scoring
 * @returns {Promise<{ item_scores: Array<{item_index: number, composite: number, persona_scores: Object, recommendation: string}>, method: 'ai' | 'keyword' }>}
 */
export async function score(items, context = {}) {
  if (!items || items.length === 0) {
    return { item_scores: [], method: 'keyword' };
  }

  const batch = items.slice(0, SCORE_CONFIG.MAX_ITEMS_PER_BATCH);
  const personas = Object.keys(SCORE_CONFIG.PERSONAS);
  const allScores = {};
  let method = 'ai';

  for (const persona of personas) {
    try {
      const client = await getClassificationClient();
      const prompt = buildScoringPrompt(persona, batch, context);
      let timeoutId;
      const response = await Promise.race([
        client.complete(
          `You are a ${persona} evaluator. Score items. Respond with only valid JSON.`,
          prompt,
          { maxTokens: 4096 }
        ),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('AI timeout')), SCORE_CONFIG.AI_TIMEOUT_MS);
          if (timeoutId.unref) timeoutId.unref();
        }),
      ]);
      clearTimeout(timeoutId);

      const text = typeof response === 'string' ? response : response?.content;
      const parsed = parseScoringResponse(text, batch.length);
      if (parsed) {
        allScores[persona] = parsed.scores;
        continue;
      }
    } catch (err) {
      console.warn(`  ${persona} AI scoring failed: ${err.message}. Using keyword fallback.`);
    }

    // Fallback for this persona
    allScores[persona] = keywordScore(batch, persona).scores;
    method = 'keyword';
  }

  // Compute composite scores
  const item_scores = batch.map((_, i) => {
    const itemIdx = i + 1;
    const persona_scores = {};
    let composite = 0;

    for (const persona of personas) {
      const personaResult = allScores[persona]?.find(s => s.item_index === itemIdx);
      const pScore = personaResult?.score || 50;
      const weight = SCORE_CONFIG.PERSONAS[persona].weight;

      persona_scores[persona] = {
        score: pScore,
        reasoning: personaResult?.reasoning || '',
      };

      composite += pScore * weight;
    }

    composite = Math.round(composite);

    let recommendation;
    if (composite >= SCORE_CONFIG.THRESHOLDS.AUTO_PROMOTE) {
      recommendation = 'promote';
    } else if (composite >= SCORE_CONFIG.THRESHOLDS.CHAIRMAN_REVIEW) {
      recommendation = 'review';
    } else {
      recommendation = 'defer';
    }

    return {
      item_index: itemIdx,
      composite,
      persona_scores,
      recommendation,
    };
  });

  return { item_scores, method };
}

export { SCORE_CONFIG };
