/**
 * Ranking Pipeline - End-to-end orchestrator for ranking data collection and analysis.
 * Chains: pollers -> Trend Scanner -> PathOutput
 *
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001 (US-006)
 */

import { runAllPollers } from './data-pollers/index.js';
import { executeDiscoveryMode } from './paths/discovery-mode.js';
import { createPathOutput } from './interfaces.js';

/**
 * Run the full ranking pipeline: collect data, then run enhanced trend analysis.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase client
 * @param {Object} [params.logger] - Logger
 * @param {Object} [params.llmClient] - LLM client override
 * @param {Array}  [params.categories] - Category overrides for pollers
 * @param {Array}  [params.topics] - Product Hunt topic overrides
 * @param {string} [params.apiToken] - Product Hunt API token
 * @returns {Promise<{output: Object, pollerResults: Array, totalNewRecords: number}>}
 */
export async function runRankingPipeline({ supabase, logger = console, llmClient, categories, topics, apiToken } = {}) {
  if (!supabase) {
    throw new Error('supabase client is required');
  }

  // Phase 1: Collect ranking data from all sources
  logger.log('📊 Phase 1: Running data pollers...');
  const pollerResults = await runAllPollers({ supabase, logger, categories, topics, apiToken });

  const totalNewRecords = pollerResults.reduce((sum, r) => sum + r.count, 0);
  const successCount = pollerResults.filter(r => r.success).length;

  logger.log(`   Pollers complete: ${successCount}/${pollerResults.length} succeeded, ${totalNewRecords} records collected`);
  for (const r of pollerResults) {
    const status = r.success ? '✅' : '❌';
    logger.log(`   ${status} ${r.source}: ${r.count} records${r.error ? ` (${r.error})` : ''}`);
  }

  // Phase 2: Run trend scanner with fresh ranking data
  logger.log('🔍 Phase 2: Running enhanced trend analysis...');

  let output;
  try {
    output = await executeDiscoveryMode(
      { strategy: 'trend_scanner', candidateCount: 5 },
      { supabase, logger, llmClient }
    );
  } catch (err) {
    logger.log(`   Trend scanner error: ${err.message}`);
    // Fallback: produce a minimal PathOutput
    output = createPathOutput({
      origin_type: 'discovery',
      raw_material: { error: err.message, pollerResults },
      suggested_name: 'Ranking Pipeline (no analysis)',
      suggested_problem: 'Trend analysis failed',
      suggested_solution: 'Retry with available data',
      target_market: 'General',
      metadata: {
        path: 'ranking_pipeline',
        rankingDataAvailable: totalNewRecords > 0,
        pollerResults,
      },
    });
  }

  // Enrich output metadata with pipeline info
  if (output && output.metadata) {
    output.metadata.rankingDataAvailable = totalNewRecords > 0;
    output.metadata.pollerResults = pollerResults;
    output.metadata.totalNewRecords = totalNewRecords;
  }

  return {
    output,
    pollerResults,
    totalNewRecords,
  };
}
