/**
 * Tournament Orchestrator - Parallel LLM Generation with Competitive Selection
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-E (FR-1, FR-3, FR-5)
 *
 * Runs N parallel LLM calls with varied temperature settings,
 * scores each output, and selects the highest-scoring result.
 * Falls back to single-generation if all scores below threshold.
 *
 * @module lib/eva/crews/tournament-orchestrator
 */

import { getLLMClient } from '../../llm/index.js';
import { parseJSON } from '../utils/parse-json.js';
import { getFourBucketsPrompt } from '../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../utils/four-buckets-parser.js';
import { scoreGeneration } from './tournament-scorer.js';

const DEFAULT_TEMPERATURES = [0.3, 0.7, 1.0];
const DEFAULT_THRESHOLD = 60;
const GENERATION_TIMEOUT_MS = 30_000;

/**
 * Run a tournament of parallel LLM generations for Stage 11 GTM.
 *
 * @param {Object} params
 * @param {string} params.systemPrompt - System prompt for GTM generation
 * @param {string} params.userPrompt - User prompt with venture context
 * @param {Object} params.context - Venture context for scoring
 * @param {string} [params.context.description] - Venture description
 * @param {string} [params.context.targetMarket] - Target market
 * @param {Object} [params.options]
 * @param {number[]} [params.options.temperatures] - Temperature settings per generation
 * @param {number} [params.options.threshold] - Minimum score to accept (0-100)
 * @param {Object} [params.options.logger] - Logger instance
 * @returns {Promise<{ result: Object|null, tournament: Object }>}
 *   result: The parsed GTM output of the winner (or null if fallback needed)
 *   tournament: Metadata (scores, winner index, durations)
 */
export async function runTournament({
  systemPrompt,
  userPrompt,
  context = {},
  options = {},
}) {
  const {
    temperatures = DEFAULT_TEMPERATURES,
    threshold = DEFAULT_THRESHOLD,
    logger = console,
  } = options;

  const startTime = Date.now();
  const n = temperatures.length;
  logger.log(`[Tournament] Starting with ${n} generations`, { temperatures, threshold });

  // Run all generations in parallel with individual timeouts
  const generationPromises = temperatures.map((temp, index) =>
    runSingleGeneration({ systemPrompt, userPrompt, temperature: temp, index, logger })
  );

  const settled = await Promise.allSettled(generationPromises);

  // Collect results
  const generations = settled.map((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      return { index, ...outcome.value };
    }
    logger.log(`[Tournament] Generation ${index} failed: ${outcome.reason?.message || 'unknown'}`);
    return { index, failed: true, error: outcome.reason?.message || 'unknown' };
  });

  const successful = generations.filter(g => !g.failed);
  logger.log(`[Tournament] ${successful.length}/${n} generations succeeded`);

  if (successful.length === 0) {
    logger.log('[Tournament] All generations failed — fallback required');
    return {
      result: null,
      tournament: buildMetadata({ generations, winner: null, startTime, threshold, fallback: true }),
    };
  }

  // Score each successful generation
  for (const gen of successful) {
    gen.scores = scoreGeneration(gen.parsed, context);
    logger.log(`[Tournament] Generation ${gen.index} (temp=${gen.temperature}): score=${gen.scores.total}`);
  }

  // Select winner
  successful.sort((a, b) => b.scores.total - a.scores.total);
  const best = successful[0];

  if (best.scores.total < threshold) {
    logger.log(`[Tournament] Best score ${best.scores.total} < threshold ${threshold} — fallback required`);
    return {
      result: null,
      tournament: buildMetadata({ generations, winner: null, startTime, threshold, fallback: true }),
    };
  }

  logger.log(`[Tournament] Winner: generation ${best.index} (temp=${best.temperature}, score=${best.scores.total})`);
  return {
    result: best.parsed,
    tournament: buildMetadata({ generations, winner: best.index, startTime, threshold, fallback: false }),
  };
}

/**
 * Run a single LLM generation with timeout.
 */
async function runSingleGeneration({ systemPrompt, userPrompt, temperature, index, logger }) {
  const genStart = Date.now();

  const client = getLLMClient({ purpose: 'content-generation' });

  // Race against timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  try {
    const response = await client.complete(
      systemPrompt + getFourBucketsPrompt(),
      userPrompt,
      { temperature }
    );
    clearTimeout(timeoutId);

    const parsed = parseJSON(response);
    const fourBuckets = parseFourBuckets(parsed, { logger: { log: () => {}, warn: () => {} } });

    return {
      parsed: { ...parsed, fourBuckets },
      temperature,
      durationMs: Date.now() - genStart,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Build tournament metadata for logging.
 */
function buildMetadata({ generations, winner, startTime, threshold, fallback }) {
  return {
    generationCount: generations.length,
    successCount: generations.filter(g => !g.failed).length,
    failedCount: generations.filter(g => g.failed).length,
    winnerIndex: winner,
    threshold,
    fallback,
    durationMs: Date.now() - startTime,
    scores: generations.map(g => ({
      index: g.index,
      temperature: g.temperature,
      failed: !!g.failed,
      total: g.scores?.total ?? null,
      specificity: g.scores?.specificity ?? null,
      actionability: g.scores?.actionability ?? null,
      marketFit: g.scores?.marketFit ?? null,
      financialCoherence: g.scores?.financialCoherence ?? null,
    })),
  };
}

export { DEFAULT_TEMPERATURES, DEFAULT_THRESHOLD, GENERATION_TIMEOUT_MS };
