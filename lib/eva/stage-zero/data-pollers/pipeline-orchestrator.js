/**
 * Pipeline Orchestrator
 * Coordinates all ranking data pollers with change detection and structured output.
 *
 * Part of SD-LEO-INFRA-COMPETITOR-MONITORING-PHASE-003
 */

import { runAllPollers } from './index.js';
import { detectChanges } from './change-detector.js';

/**
 * Run the full competitive monitoring pipeline.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase client
 * @param {Object} [params.logger] - Logger instance
 * @param {Object} [params.options] - Pipeline options
 * @param {number} [params.options.changeThreshold=5] - Minimum position change for significance
 * @param {Array}  [params.options.categories] - Category overrides for Apple/Google pollers
 * @param {Array}  [params.options.topics] - Topic overrides for Product Hunt
 * @param {string} [params.options.apiToken] - Product Hunt API token
 * @param {boolean} [params.options.skipChangeDetection=false] - Skip change detection step
 * @returns {Promise<Object>} Structured pipeline report
 */
export async function runPipeline({ supabase, logger = console, options = {} } = {}) {
  const startTime = Date.now();
  const {
    changeThreshold = 5,
    categories,
    topics,
    apiToken,
    skipChangeDetection = false,
  } = options;

  logger.log('Pipeline: Starting competitive monitoring run...');

  // Step 1: Run all pollers
  const pollerResults = await runAllPollers({
    supabase,
    logger,
    categories,
    topics,
    apiToken,
  });

  const pollerDuration = Date.now() - startTime;
  logger.log(`Pipeline: Pollers completed in ${pollerDuration}ms`);

  // Build per-source summary
  const sources = {};
  let totalRecords = 0;
  let successCount = 0;
  const allCurrentResults = [];

  for (const result of pollerResults) {
    sources[result.source] = {
      success: result.success,
      count: result.count || 0,
      error: result.error || null,
    };
    totalRecords += result.count || 0;
    if (result.success) successCount++;
  }

  // Step 2: Change detection (if not skipped and we have results)
  let changeReport = { movements: [], summary: { total_compared: 0, significant: 0, new_entries: 0 } };

  if (!skipChangeDetection && totalRecords > 0) {
    logger.log('Pipeline: Running change detection...');

    // Fetch the current results from DB for change comparison
    const { data: currentData } = await supabase
      .from('app_rankings')
      .select('source, app_name, app_url, chart_position, chart_type')
      .order('polled_at', { ascending: false })
      .limit(500);

    if (currentData && currentData.length > 0) {
      changeReport = await detectChanges({
        supabase,
        currentResults: currentData,
        threshold: changeThreshold,
        logger,
      });
    }

    logger.log(`Pipeline: Change detection found ${changeReport.movements.length} significant movements`);
  }

  const totalDuration = Date.now() - startTime;

  // Step 3: Build structured output
  const report = {
    timestamp: new Date().toISOString(),
    duration_ms: totalDuration,
    polling: {
      sources,
      total_records: totalRecords,
      sources_succeeded: successCount,
      sources_total: pollerResults.length,
      duration_ms: pollerDuration,
    },
    changes: {
      threshold: changeThreshold,
      ...changeReport.summary,
      movements: changeReport.movements,
    },
    status: successCount >= 2 ? 'success' : 'partial_failure',
  };

  logger.log(`Pipeline: Complete — ${successCount}/${pollerResults.length} sources, ${totalRecords} records, ${changeReport.movements.length} movements (${totalDuration}ms)`);

  return report;
}
