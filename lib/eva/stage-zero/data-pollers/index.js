/**
 * Data Pollers Index
 * Orchestrates all ranking data pollers with concurrent execution.
 *
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001 (US-006)
 *
 * RETIREMENT NOTE (SD-LEO-INFRA-RETIRE-DEAD-MONITORING-CHAIN-001, Solomon
 * adjudication 41a2e6da): the downstream monitoring chain that once lived here
 * (pipeline-orchestrator -> change-detector -> significance-scorer ->
 * countermeasure-engine) was retired, not repaired. It was dead (zero external
 * importers, zero tests), broken (change-detector queried a phantom polled_at
 * column), and unfixable-as-designed (the (source,app_url) upsert destroyed the
 * history it existed to compare). app_rankings remains a read-only table fed by
 * the pollers below; its readers stamp data age via ./staleness.js. The
 * sanctioned rebuild path, when demand exists, is the append-only observations
 * design in docs/design/competitive-vigilance-observed-baseline-design.md.
 */

import { pollAppleRSS } from './apple-rss-poller.js';
import { pollGooglePlay } from './gplay-scraper.js';
import { pollProductHunt } from './producthunt-poller.js';

/**
 * Run all pollers concurrently using Promise.allSettled.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase client
 * @param {Object} [params.logger] - Logger
 * @param {Array}  [params.categories] - Category overrides
 * @param {Array}  [params.topics] - Product Hunt topic overrides
 * @param {string} [params.apiToken] - Product Hunt API token
 * @returns {Promise<Array<{source: string, success: boolean, count: number, error?: string}>>}
 */
export async function runAllPollers({ supabase, logger = console, categories, topics, apiToken } = {}) {
  const pollerConfigs = [
    { source: 'apple_appstore', fn: pollAppleRSS, args: { supabase, logger, categories } },
    { source: 'google_play', fn: pollGooglePlay, args: { supabase, logger, categories } },
    { source: 'product_hunt', fn: pollProductHunt, args: { supabase, logger, topics, apiToken } },
  ];

  const results = await Promise.allSettled(
    pollerConfigs.map(async ({ source, fn, args }) => {
      const result = await fn(args);
      return { source, ...result };
    })
  );

  return results.map((settled, idx) => {
    if (settled.status === 'fulfilled') {
      return settled.value;
    }
    return {
      source: pollerConfigs[idx].source,
      success: false,
      count: 0,
      error: settled.reason?.message || 'Unknown error',
    };
  });
}

export { pollAppleRSS } from './apple-rss-poller.js';
export { pollGooglePlay } from './gplay-scraper.js';
export { pollProductHunt } from './producthunt-poller.js';
