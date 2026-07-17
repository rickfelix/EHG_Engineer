/**
 * WordPress.org Plugin Directory source fetcher.
 * SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001 (FR-1)
 *
 * Calls the real, live, no-auth WordPress.org Plugin Directory API:
 *   - Discovery/search: api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[search]={term}
 *   - Detail:           api.wordpress.org/plugins/info/1.0/{slug}.json
 *
 * Per the shared source-fetcher contract, one call computes TWO family readings:
 *   - 'money_in'   -- slope of active_installs/downloaded vs a 12-month baseline
 *   - 'stickiness' -- slope of num_ratings (a "ratings count growth rate" proxy for
 *                     rating/persistence, documented simplification for the v1 thin slice)
 *
 * History for the slope computation lives in the shared 'market_signal_observations'
 * table (source, query_term, family, raw_value, content_hash, fetched_at,
 * transform_version) -- see database/migrations/20260716_market_signal_observations.sql.
 * A first-ever call for a (source, query_term) has no baseline: slope_90d_vs_baseline
 * is null, NOT zero/negative (per interface contract).
 *
 * Fails soft: any live-call failure returns { readings: [], errors: [...] } -- never
 * throws past the caller, and never fabricates data.
 */

import { createHash } from 'node:crypto';
import { computeSlopeAndPersist } from '../slope.js';

export const SOURCE_NAME = 'wordpress_plugins';
export const TRANSFORM_VERSION = 'v1';

const SEARCH_URL = 'https://api.wordpress.org/plugins/info/1.2/';
const DETAIL_URL = (slug) => `https://api.wordpress.org/plugins/info/1.0/${encodeURIComponent(slug)}.json`;

function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * @param {Object} args
 * @param {{ term?: string, slug?: string, perPage?: number }} args.query
 * @param {Object} [args.supabase] - optional Supabase client for history read/write
 * @returns {Promise<{ readings: object[], errors: string[] }>}
 */
export async function fetchSignal({ query, supabase } = {}) {
  const errors = [];
  const term = query?.term;
  let slug = query?.slug;
  const perPage = query?.perPage ?? 10;
  // Only populated on the discovery (search) path -- see note where it's assigned below.
  let searchActiveInstalls = null;

  if (!term && !slug) {
    errors.push('wordpress_plugins fetchSignal: query.term or query.slug is required');
    return { readings: [], errors };
  }

  // Discovery: resolve a candidate slug from the search API when one wasn't given.
  if (!slug) {
    const searchUrl = `${SEARCH_URL}?action=query_plugins&request[search]=${encodeURIComponent(term)}&request[per_page]=${perPage}`;
    let searchText;
    try {
      const res = await fetch(searchUrl);
      if (!res.ok) {
        errors.push(`wordpress_plugins search failed: HTTP ${res.status} for ${searchUrl}`);
        return { readings: [], errors };
      }
      searchText = await res.text();
    } catch (err) {
      errors.push(`wordpress_plugins search request failed: ${err.message}`);
      return { readings: [], errors };
    }

    let searchJson;
    try {
      searchJson = JSON.parse(searchText);
    } catch (err) {
      errors.push(`wordpress_plugins search response was not valid JSON: ${err.message}`);
      return { readings: [], errors };
    }

    const plugins = Array.isArray(searchJson?.plugins) ? searchJson.plugins : [];
    if (plugins.length === 0) {
      errors.push(`wordpress_plugins: no search results for term "${term}"`);
      return { readings: [], errors };
    }
    slug = plugins[0].slug;
    // Live-verified (smoke check, 2026-07-16): the info/1.2 query_plugins (search) response
    // carries active_installs; the info/1.0/{slug}.json (detail) response does NOT. Capture
    // it here so discovery-path calls get the more precise money_in signal -- monitoring-path
    // calls (query.slug given directly, no search performed) fall back to detail's
    // `downloaded` below, which is the only cumulative-installs figure available in that mode.
    if (typeof plugins[0].active_installs === 'number') {
      searchActiveInstalls = plugins[0].active_installs;
    }
  }

  // Detail: the substantive raw response the readings are derived from and hashed.
  const detailUrl = DETAIL_URL(slug);
  let detailText;
  try {
    const res = await fetch(detailUrl);
    if (!res.ok) {
      errors.push(`wordpress_plugins detail failed: HTTP ${res.status} for ${detailUrl}`);
      return { readings: [], errors };
    }
    detailText = await res.text();
  } catch (err) {
    errors.push(`wordpress_plugins detail request failed: ${err.message}`);
    return { readings: [], errors };
  }

  let detailJson;
  try {
    detailJson = JSON.parse(detailText);
  } catch (err) {
    errors.push(`wordpress_plugins detail response was not valid JSON: ${err.message}`);
    return { readings: [], errors };
  }

  if (!detailJson || detailJson.error) {
    errors.push(`wordpress_plugins: no plugin data for slug "${slug}"${detailJson?.error ? `: ${detailJson.error}` : ''}`);
    return { readings: [], errors };
  }

  const fetchedAt = new Date().toISOString();
  const contentHash = sha256Hex(detailText);
  const queryTerm = term ?? slug;

  // money_in: active_installs (from the search/discovery response, when this call took the
  // discovery path) is the more precise WP.org signal; downloaded (cumulative count, from the
  // detail response) is the fallback -- the only figure available when query.slug is passed
  // directly (monitoring an already-known candidate, no search step performed).
  const moneyInValue = searchActiveInstalls !== null
    ? searchActiveInstalls
    : (typeof detailJson.downloaded === 'number' ? detailJson.downloaded : null);

  // stickiness: num_ratings growth is a simpler "ratings count persistence" proxy for v1
  // (design doc's fuller rating/num_ratings persistence model is out of scope here).
  const stickinessValue = typeof detailJson.num_ratings === 'number' ? detailJson.num_ratings : null;

  const moneyInObservation = {
    source: SOURCE_NAME,
    raw_value: moneyInValue,
    source_url: detailUrl,
    content_hash: contentHash,
    fetched_at: fetchedAt,
    transform_version: TRANSFORM_VERSION,
  };

  const stickinessObservation = {
    source: SOURCE_NAME,
    raw_value: stickinessValue,
    source_url: detailUrl,
    content_hash: contentHash,
    fetched_at: fetchedAt,
    transform_version: TRANSFORM_VERSION,
  };

  const [moneyInSlope, stickinessSlope] = await Promise.all([
    computeSlopeAndPersist({ supabase, source: SOURCE_NAME, queryTerm, family: 'money_in', rawValue: moneyInValue, observation: moneyInObservation, errors }),
    computeSlopeAndPersist({ supabase, source: SOURCE_NAME, queryTerm, family: 'stickiness', rawValue: stickinessValue, observation: stickinessObservation, errors }),
  ]);

  const readings = [
    { family: 'money_in', slope_90d_vs_baseline: moneyInSlope, observations: [moneyInObservation] },
    { family: 'stickiness', slope_90d_vs_baseline: stickinessSlope, observations: [stickinessObservation] },
  ];

  return { readings, errors };
}

export default { fetchSignal, SOURCE_NAME, TRANSFORM_VERSION };
