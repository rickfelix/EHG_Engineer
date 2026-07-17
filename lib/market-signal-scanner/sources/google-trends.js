/**
 * Google Trends source fetcher for the Market Signal Scanner (FR-1).
 * SD: SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001
 *
 * Uses the free/unofficial Google Trends endpoints (no API key required) that
 * libraries like 'google-trends-api'/'pytrends' wrap:
 *   1. GET trends.google.com/trends/api/explore              -> resolves the
 *      TIMESERIES widget's { token, request } for the query term.
 *   2. GET trends.google.com/trends/api/widgetdata/multiline  -> the actual
 *      interest-over-time series for that widget.
 * Both responses are prefixed with the anti-XSSI-hijacking guard ")]}',"
 * which must be stripped before JSON.parse.
 *
 * Per the v1 source/family assignment in the design doc, this fetcher computes
 * ONE 'attention' family reading -- slope of search-interest-over-time for the
 * query term (wordpress_plugins -> money_in + stickiness, reddit -> structural,
 * google_trends -> attention).
 *
 * Deliberate v1 simplification: the multiline response already embeds its own
 * requested history window (e.g. a full "today 12-m" series) in one call, so a
 * more precise same-call slope could theoretically be derived without any
 * cross-cycle storage. This fetcher intentionally does NOT do that -- it uses
 * the SAME cross-cycle (source, query_term, family) averaging-in
 * 'market_signal_observations' contract as wordpress-plugins.js/reddit.js, so
 * all three v1 sources compute slope_90d_vs_baseline identically and a
 * first-ever call always returns null (no baseline), never a same-call
 * derived value. A same-call derivation is a documented future increment, not
 * a silent omission.
 *
 * Fails soft: any live-call failure or malformed response returns
 * { readings: [], errors: [...] } -- never throws past the caller, never
 * fabricates data.
 */

import crypto from 'node:crypto';

export const SOURCE_NAME = 'google_trends';
export const TRANSFORM_VERSION = 'v1';

const OBSERVATIONS_TABLE = 'market_signal_observations';
const EXPLORE_URL = 'https://trends.google.com/trends/api/explore';
const MULTILINE_URL = 'https://trends.google.com/trends/api/widgetdata/multiline';
const XSSI_PREFIX = ")]}',";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

const DEFAULT_TIMEFRAME = 'today 12-m';
const DEFAULT_GEO = '';
const DEFAULT_HL = 'en-US';
const DEFAULT_TZ = 360;
const DEFAULT_CATEGORY = 0;

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Strip Google's anti-XSSI ")]}'," prefix (if present) before JSON.parse. */
function stripXssiPrefix(text) {
  const trimmed = typeof text === 'string' ? text.trimStart() : '';
  return trimmed.startsWith(XSSI_PREFIX) ? trimmed.slice(XSSI_PREFIX.length) : trimmed;
}

function parseXssiJson(text) {
  return JSON.parse(stripXssiPrefix(text));
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Returns the most-recent-90d average minus the 12-month baseline average for
// this (source, query_term, family), or null when there isn't enough prior
// history yet (first-ever call) -- "no reading" this cycle, never a
// zero/negative reading.
async function computeSlope({ supabase, term, family }) {
  if (!supabase) return null;

  const since = new Date(Date.now() - TWELVE_MONTHS_MS).toISOString();
  const { data: priorRows, error } = await supabase
    .from(OBSERVATIONS_TABLE)
    .select('raw_value, fetched_at')
    .eq('source', SOURCE_NAME)
    .eq('query_term', term)
    .eq('family', family)
    .gte('fetched_at', since);

  if (error || !priorRows || priorRows.length === 0) return null;

  const numericOf = (row) => {
    const v = row.raw_value;
    if (typeof v === 'number') return v;
    if (v && typeof v.meanInterest === 'number') return v.meanInterest;
    return 0;
  };

  const ninetyDaysAgo = Date.now() - NINETY_DAYS_MS;
  const recent = priorRows.filter((r) => new Date(r.fetched_at).getTime() >= ninetyDaysAgo);
  if (recent.length === 0) return null;

  const avg = (rows) => average(rows.map(numericOf));
  return avg(recent) - avg(priorRows);
}

/**
 * @param {{ query: { term: string, geo?: string, timeframe?: string, hl?: string, tz?: number, category?: number }, supabase?: import('@supabase/supabase-js').SupabaseClient }} args
 * @returns {Promise<{ readings: Array<{family:string, slope_90d_vs_baseline:number|null, observations:object[]}>, errors: string[] }>}
 */
export async function fetchSignal({ query, supabase } = {}) {
  const errors = [];
  const term = query?.term;

  if (!term) {
    return { readings: [], errors: ['google_trends fetcher: query.term is required'] };
  }

  const geo = query?.geo ?? DEFAULT_GEO;
  const timeframe = query?.timeframe ?? DEFAULT_TIMEFRAME;
  const hl = query?.hl ?? DEFAULT_HL;
  const tz = query?.tz ?? DEFAULT_TZ;
  const category = query?.category ?? DEFAULT_CATEGORY;

  // Step 1: explore -- resolves the TIMESERIES widget's token + request shape.
  const exploreReq = {
    comparisonItem: [{ keyword: term, geo, time: timeframe }],
    category,
    property: '',
  };
  const exploreUrl =
    `${EXPLORE_URL}?hl=${encodeURIComponent(hl)}&tz=${tz}` +
    `&req=${encodeURIComponent(JSON.stringify(exploreReq))}`;

  let exploreText;
  try {
    const res = await fetch(exploreUrl);
    if (!res.ok) {
      errors.push(`google_trends explore failed: HTTP ${res.status} for ${exploreUrl}`);
      return { readings: [], errors };
    }
    exploreText = await res.text();
  } catch (err) {
    errors.push(`google_trends explore request failed: ${err.message}`);
    return { readings: [], errors };
  }

  let exploreJson;
  try {
    exploreJson = parseXssiJson(exploreText);
  } catch (err) {
    errors.push(`google_trends explore response was not valid JSON: ${err.message}`);
    return { readings: [], errors };
  }

  const widgets = Array.isArray(exploreJson?.widgets) ? exploreJson.widgets : [];
  const timeseriesWidget = widgets.find((w) => w?.id === 'TIMESERIES');
  if (!timeseriesWidget?.token || !timeseriesWidget?.request) {
    errors.push(`google_trends: no TIMESERIES widget found for term "${term}"`);
    return { readings: [], errors };
  }

  // Step 2: widgetdata/multiline -- the actual interest-over-time series, and
  // the substantive raw response the reading is derived from and hashed.
  const multilineUrl =
    `${MULTILINE_URL}?tz=${tz}` +
    `&req=${encodeURIComponent(JSON.stringify(timeseriesWidget.request))}` +
    `&token=${encodeURIComponent(timeseriesWidget.token)}`;

  let multilineText;
  try {
    const res = await fetch(multilineUrl);
    if (!res.ok) {
      errors.push(`google_trends widgetdata failed: HTTP ${res.status} for ${multilineUrl}`);
      return { readings: [], errors };
    }
    multilineText = await res.text();
  } catch (err) {
    errors.push(`google_trends widgetdata request failed: ${err.message}`);
    return { readings: [], errors };
  }

  let multilineJson;
  try {
    multilineJson = parseXssiJson(multilineText);
  } catch (err) {
    errors.push(`google_trends widgetdata response was not valid JSON: ${err.message}`);
    return { readings: [], errors };
  }

  const timelineData = Array.isArray(multilineJson?.default?.timelineData)
    ? multilineJson.default.timelineData
    : [];
  if (timelineData.length === 0) {
    errors.push(`google_trends: no interest-over-time data for term "${term}"`);
    return { readings: [], errors };
  }

  const points = timelineData
    .map((point) => (Array.isArray(point?.value) ? point.value[0] : null))
    .filter((v) => typeof v === 'number' && Number.isFinite(v));

  if (points.length === 0) {
    errors.push(`google_trends: interest-over-time data for term "${term}" had no numeric values`);
    return { readings: [], errors };
  }

  const meanInterest = average(points);
  const latestValue = points[points.length - 1];

  const fetchedAt = new Date().toISOString();
  const contentHash = sha256Hex(multilineText);

  const rawValue = { term, geo, timeframe, meanInterest, latestValue, pointCount: points.length };

  const observation = {
    source: SOURCE_NAME,
    raw_value: rawValue,
    source_url: multilineUrl,
    content_hash: contentHash,
    fetched_at: fetchedAt,
    transform_version: TRANSFORM_VERSION,
  };

  let slope = null;
  try {
    slope = await computeSlope({ supabase, term, family: 'attention' });
  } catch (err) {
    errors.push(`google_trends slope computation failed (non-fatal, returning null slope): ${err.message}`);
  }

  if (supabase) {
    try {
      const { error: insertError } = await supabase.from(OBSERVATIONS_TABLE).insert({
        source: SOURCE_NAME,
        query_term: term,
        family: 'attention',
        raw_value: rawValue,
        content_hash: contentHash,
        fetched_at: fetchedAt,
        transform_version: TRANSFORM_VERSION,
      });
      if (insertError) {
        errors.push(`google_trends observation insert failed (non-fatal): ${insertError.message}`);
      }
    } catch (err) {
      errors.push(`google_trends observation insert threw (non-fatal): ${err.message}`);
    }
  }

  return {
    readings: [
      {
        family: 'attention',
        slope_90d_vs_baseline: slope,
        observations: [observation],
      },
    ],
    errors,
  };
}

export const __internal = { stripXssiPrefix, parseXssiJson, sha256Hex };

export default { fetchSignal, SOURCE_NAME, TRANSFORM_VERSION };
