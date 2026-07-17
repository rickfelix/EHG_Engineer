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

export const SOURCE_NAME = 'wordpress_plugins';
export const TRANSFORM_VERSION = 'v1';

const SEARCH_URL = 'https://api.wordpress.org/plugins/info/1.2/';
const DETAIL_URL = (slug) => `https://api.wordpress.org/plugins/info/1.0/${encodeURIComponent(slug)}.json`;

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Extract a plain number out of a jsonb raw_value column (stored as a bare number). */
function extractNumeric(rawValue) {
  return typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null;
}

/**
 * Query prior history for (source, query_term, family) over the trailing 12 months,
 * compute slope_90d_vs_baseline (recent-90d avg minus 12mo-baseline avg; positive =
 * growth), then persist the current observation for future cycles.
 *
 * Returns null when there is no supabase client (can't read/write history) or when
 * no prior rows exist yet for this (source, query_term, family) -- "no reading yet",
 * per the interface contract, never a fabricated zero.
 */
async function computeSlopeAndPersist({ supabase, queryTerm, family, rawValue, observation, errors }) {
  if (!supabase) return null;

  const now = new Date(observation.fetched_at);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const ninetyDaysAgo = new Date(now.getTime() - NINETY_DAYS_MS);

  let priorRows = [];
  try {
    const { data, error } = await supabase
      .from('market_signal_observations')
      .select('raw_value, fetched_at')
      .eq('source', observation.source)
      .eq('query_term', queryTerm)
      .eq('family', family)
      .gte('fetched_at', twelveMonthsAgo.toISOString())
      .lte('fetched_at', now.toISOString());
    if (error) {
      errors.push(`market_signal_observations query failed (${family}): ${error.message}`);
    } else {
      priorRows = data || [];
    }
  } catch (err) {
    errors.push(`market_signal_observations query threw (${family}): ${err.message}`);
  }

  let slope = null;
  if (priorRows.length > 0) {
    const numericRows = priorRows
      .map((r) => ({ value: extractNumeric(r.raw_value), fetchedAt: new Date(r.fetched_at) }))
      .filter((r) => Number.isFinite(r.value));
    const recentRows = numericRows.filter((r) => r.fetchedAt >= ninetyDaysAgo);
    const baselineAvg = average(numericRows.map((r) => r.value));
    const recentAvg = average(recentRows.map((r) => r.value));
    if (baselineAvg !== null && recentAvg !== null) {
      slope = recentAvg - baselineAvg;
    }
  }

  try {
    const { error: insertError } = await supabase.from('market_signal_observations').insert({
      source: observation.source,
      query_term: queryTerm,
      family,
      raw_value: rawValue,
      content_hash: observation.content_hash,
      fetched_at: observation.fetched_at,
      transform_version: observation.transform_version,
    });
    if (insertError) {
      errors.push(`market_signal_observations insert failed (${family}): ${insertError.message}`);
    }
  } catch (err) {
    errors.push(`market_signal_observations insert threw (${family}): ${err.message}`);
  }

  return slope;
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
    computeSlopeAndPersist({ supabase, queryTerm, family: 'money_in', rawValue: moneyInValue, observation: moneyInObservation, errors }),
    computeSlopeAndPersist({ supabase, queryTerm, family: 'stickiness', rawValue: stickinessValue, observation: stickinessObservation, errors }),
  ]);

  const readings = [
    { family: 'money_in', slope_90d_vs_baseline: moneyInSlope, observations: [moneyInObservation] },
    { family: 'stickiness', slope_90d_vs_baseline: stickinessSlope, observations: [stickinessObservation] },
  ];

  return { readings, errors };
}

export default { fetchSignal, SOURCE_NAME, TRANSFORM_VERSION };
