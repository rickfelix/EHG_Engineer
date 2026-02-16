/**
 * Cross-Venture Knowledge Retriever
 * SD-MAN-ORCH-EVA-PORTFOLIO-INTELLIGENCE-001-A
 *
 * Wraps searchSimilar() with stage-specific context for use in
 * eva-orchestrator.js processStage(). Builds search queries from
 * venture context and current stage, retrieves relevant cross-venture
 * patterns, deduplicates, and returns structured knowledge context.
 *
 * Design:
 *   - Non-blocking: errors are caught and logged, never thrown
 *   - Excludes current venture from results (FR-3)
 *   - Deduplicates by source+id (FR-4)
 *   - Max 5 results per retrieval (FR-4)
 *   - Score threshold >= 0.5 (FR-1)
 */

import { searchSimilar } from '../cross-venture-learning.js';

const MAX_RESULTS = 5;
const SCORE_THRESHOLD = 0.5;

/**
 * Build a search query string from venture context and stage info.
 *
 * @param {object} ventureContext - Venture record (id, name, archetype, etc.)
 * @param {number} stageId - Current lifecycle stage number
 * @returns {string} Natural language query for searchSimilar()
 */
function buildStageQuery(ventureContext, stageId) {
  const parts = [];

  if (ventureContext.name) {
    parts.push(ventureContext.name);
  }
  if (ventureContext.archetype) {
    parts.push(`${ventureContext.archetype} venture`);
  }

  parts.push(`stage ${stageId} evaluation`);
  parts.push('patterns lessons risks');

  return parts.join(' ');
}

/**
 * Retrieve cross-venture knowledge relevant to the current stage.
 *
 * @param {object} params
 * @param {object} params.ventureContext - Venture record with id, name, archetype
 * @param {number} params.stageId - Current lifecycle stage
 * @param {object} deps
 * @param {import('@supabase/supabase-js').SupabaseClient} deps.supabase
 * @param {object} [deps.logger] - Logger (defaults to console)
 * @returns {Promise<Array<{source: string, id: string, content: string, score: number}>>}
 *   Knowledge context array (empty on error or no results)
 */
export async function retrieveKnowledge({ ventureContext, stageId }, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase || !ventureContext) {
    return [];
  }

  try {
    const query = buildStageQuery(ventureContext, stageId);

    const results = await searchSimilar(supabase, {
      query,
      tables: ['venture_artifacts', 'issue_patterns'],
      matchThreshold: SCORE_THRESHOLD,
      limit: MAX_RESULTS * 2, // fetch extra to allow for filtering
    });

    // FR-3: Exclude current venture's own artifacts
    const filtered = results.filter(r => {
      if (r.metadata?.venture_id === ventureContext.id) return false;
      return r.score >= SCORE_THRESHOLD;
    });

    // FR-4: Deduplicate by source+id (searchSimilar already deduplicates internally,
    // but guard against edge cases)
    const seen = new Set();
    const deduped = [];
    for (const r of filtered) {
      const key = `${r.source}:${r.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push({
          source: r.source,
          id: r.id,
          content: r.content,
          score: r.score,
        });
      }
    }

    // FR-4: Rank by descending score, cap at MAX_RESULTS
    const knowledge = deduped
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

    if (knowledge.length > 0) {
      logger.log(`[Eva] Knowledge retriever: ${knowledge.length} cross-venture pattern(s) surfaced for stage ${stageId}`);
    }

    return knowledge;
  } catch (err) {
    // FR-5: Graceful degradation - log and return empty
    logger.warn(`[Eva] Knowledge retrieval failed (non-fatal): ${err.message}`);
    return [];
  }
}

// Exported for testing
export const _internal = {
  buildStageQuery,
  MAX_RESULTS,
  SCORE_THRESHOLD,
};
