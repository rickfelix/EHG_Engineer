/**
 * Apple App Store RSS Poller
 * Fetches top-100 free apps per genre from Apple's RSS JSON API.
 *
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001 (US-001)
 */

import { normalizeAppleEntry } from './normalizer.js';

const APPLE_RSS_BASE = 'https://rss.applemarketingtools.com/api/v2';

const DEFAULT_CATEGORIES = [
  { id: 6013, name: 'Health & Fitness' },
  { id: 6015, name: 'Finance' },
  { id: 6017, name: 'Education' },
  { id: 6000, name: 'Business' },
  { id: 6007, name: 'Productivity' },
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
    const url = `${APPLE_RSS_BASE}/${country}/apps/top-free/${cat.id}/100/explicit.json`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        logger.log(`Apple RSS error for ${cat.name}: ${response.status}`);
        continue;
      }

      const json = await response.json();
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
