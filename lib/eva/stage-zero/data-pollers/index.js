/**
 * Data Pollers Index
 * Orchestrates all ranking data pollers with concurrent execution.
 *
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001 (US-006)
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
