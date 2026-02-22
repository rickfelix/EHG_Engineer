/**
 * Google Play Store Scraper Poller
 * Fetches top free apps per category using google-play-scraper.
 *
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001 (US-002)
 */

import { normalizeGooglePlayEntry } from './normalizer.js';

const DEFAULT_CATEGORIES = [
  { id: 'HEALTH_AND_FITNESS', name: 'Health & Fitness' },
  { id: 'FINANCE', name: 'Finance' },
  { id: 'EDUCATION', name: 'Education' },
  { id: 'BUSINESS', name: 'Business' },
  { id: 'PRODUCTIVITY', name: 'Productivity' },
];

/**
 * Poll Google Play for top free apps.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase client
 * @param {Object} [params.logger] - Logger (default: console)
 * @param {Array}  [params.categories] - Categories to poll
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
export async function pollGooglePlay({ supabase, logger = console, categories } = {}) {
  const cats = categories || DEFAULT_CATEGORIES;
  let gplay;

  try {
    gplay = await import('google-play-scraper');
    // Handle both default and named exports
    gplay = gplay.default || gplay;
  } catch {
    return { success: false, count: 0, error: 'google-play-scraper not installed' };
  }

  let totalUpserted = 0;

  for (const cat of cats) {
    try {
      const results = await gplay.list({
        category: cat.id,
        collection: gplay.collection?.TOP_FREE || 'topselling_free',
        num: 100,
      });

      const rows = results.map((entry, idx) => normalizeGooglePlayEntry(entry, cat.name, idx + 1));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('app_rankings')
          .upsert(rows, { onConflict: 'source,app_url' });

        if (error) {
          logger.log(`Google Play upsert error for ${cat.name}: ${error.message}`);
        } else {
          totalUpserted += rows.length;
        }
      }
    } catch (err) {
      logger.log(`Google Play error for ${cat.name}: ${err.message}`);
    }
  }

  if (totalUpserted === 0) {
    return { success: false, count: 0, error: 'No data collected from any category' };
  }

  return { success: true, count: totalUpserted };
}
