/**
 * Apple App Store RSS Poller
 * Fetches top-100 free apps per genre from Apple's RSS JSON API.
 *
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001 (US-001)
 */

import { normalizeAppleEntry } from './normalizer.js';
import { withRetry } from './retry.js';

const APPLE_RSS_BASE = 'https://rss.marketingtools.apple.com/api/v2';

const DEFAULT_CATEGORIES = [
  { id: null, name: 'Top Free' },
];

/**
 * Poll Apple RSS for top free apps.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase client
 * @param {Object} [params.logger] - Logger (default: console)
 * @param {Array}  [params.categories] - Categories to poll
 * @param {string} [params.country] - Country code (default: 'us')
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
export async function pollAppleRSS({ supabase, logger = console, categories, country = 'us' } = {}) {
  const cats = categories || DEFAULT_CATEGORIES;
  let totalUpserted = 0;

  for (const cat of cats) {
    const url = cat.id
      ? `${APPLE_RSS_BASE}/${country}/apps/top-free/${cat.id}/100/apps.json`
      : `${APPLE_RSS_BASE}/${country}/apps/top-free/100/apps.json`;
    try {
      const json = await withRetry(async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }, { label: `Apple RSS (${cat.name})`, logger });

      const results = json?.feed?.results || [];
      const rows = results.map((entry, idx) => normalizeAppleEntry(entry, cat.name, idx + 1));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('app_rankings')
          .upsert(rows, { onConflict: 'source,app_url' });

        if (error) {
          logger.log(`Apple RSS upsert error for ${cat.name}: ${error.message}`);
        } else {
          totalUpserted += rows.length;
        }
      }
    } catch (err) {
      logger.log(`Apple RSS error for ${cat.name}: ${err.message}`);
    }
  }

  if (totalUpserted === 0) {
    return { success: false, count: 0, error: 'No data collected from any category' };
  }

  return { success: true, count: totalUpserted };
}
