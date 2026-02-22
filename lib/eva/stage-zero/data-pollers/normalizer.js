/**
 * Normalizer for app ranking data from multiple sources.
 * Transforms raw API responses into app_rankings schema rows.
 *
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001
 */

/**
 * Normalize an Apple RSS feed entry to app_rankings schema.
 *
 * @param {Object} entry - Raw Apple RSS JSON entry
 * @param {string} category - Category name (e.g., 'Health & Fitness')
 * @param {number} position - Chart position (1-based)
 * @returns {Object} Normalized app_rankings row
 */
export function normalizeAppleEntry(entry, category, position) {
  return {
    source: 'apple_appstore',
    app_name: entry.name || entry.artistName || '',
    developer: entry.artistName || '',
    app_url: entry.url || entry.artistUrl || '',
    category,
    chart_position: position,
    chart_type: 'top-free',
    rating: null, // Apple RSS does not include ratings
    review_count: null,
    installs_range: null,
    description: null,
  };
}

/**
 * Normalize a Google Play scraper result to app_rankings schema.
 *
 * @param {Object} entry - Raw google-play-scraper result
 * @param {string} category - Category name
 * @param {number} position - Chart position (1-based)
 * @returns {Object} Normalized app_rankings row
 */
export function normalizeGooglePlayEntry(entry, category, position) {
  const rating = parseFloat(entry.scoreText || entry.score);
  return {
    source: 'google_play',
    app_name: entry.title || '',
    developer: entry.developer || '',
    app_url: entry.url || '',
    category,
    chart_position: position,
    chart_type: 'top-free',
    rating: isNaN(rating) ? null : rating,
    review_count: typeof entry.reviews === 'number' ? entry.reviews : null,
    installs_range: entry.installs || null,
    description: entry.summary || null,
  };
}

/**
 * Normalize a Product Hunt GraphQL post to app_rankings schema.
 *
 * @param {Object} post - Raw Product Hunt GraphQL post node
 * @param {number} position - Position in the trending list (1-based)
 * @returns {Object} Normalized app_rankings row
 */
export function normalizeProductHuntEntry(post, position) {
  return {
    source: 'product_hunt',
    app_name: post.name || '',
    developer: null,
    app_url: post.url || '',
    website_url: post.website || null,
    category: null,
    chart_position: position,
    chart_type: 'trending',
    rating: null,
    review_count: null,
    installs_range: null,
    vote_count: post.votesCount || 0,
    description: post.tagline || null,
  };
}
