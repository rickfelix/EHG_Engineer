/**
 * Shared slope-vs-baseline computation for market-signal-scanner source fetchers.
 * SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001 (FR-1, post-ship adversarial-review fix).
 *
 * Extracted from three near-identical, independently-duplicated implementations
 * (wordpress-plugins.js, reddit.js, google-trends.js) after adversarial review of
 * PR #6142 found two real defects present in all three copies:
 *
 * 1. Baseline self-contamination: the "12-month baseline" average included the
 *    "recent 90-day" rows as a subset rather than excluding them, so for roughly
 *    the scanner's first ~3 months of life (before any row ages past 90 days),
 *    recent === baseline exactly and slope was deterministically 0 (a real, wrong
 *    value -- not the honest `null`) instead of reflecting an unmeasurable trend.
 *    This module splits history into non-overlapping baselineRows (strictly
 *    older than 90 days) and recentRows (within the last 90 days).
 *
 * 2. Unbounded raw-unit slope: slope was computed as an absolute difference of
 *    raw counts (e.g. WordPress.org active_installs, which can be in the
 *    thousands-to-millions), then fed directly into scoring.js's weighted sum
 *    and written to venture_nursery.current_score, a NUMERIC(5,2) column
 *    (max ~999.99). Real-world data would overflow that column and crash the
 *    insert with no try/catch around it (a separate CLI-side fix), aborting the
 *    whole scan cycle. This module instead computes slope as a PERCENTAGE
 *    CHANGE (recentAvg vs baselineAvg) and clamps it to +/-100, matching the
 *    design doc's "capped z-scores" language and keeping nicheScore's magnitude
 *    (weighted sum of up to 4 such slopes, max weight 0.35) safely within
 *    venture_nursery.current_score's NUMERIC(5,2) capacity.
 */

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: the slope reads up to 12 months of
// per-(source,query_term,family) observations from the growing market_signal_observations table and
// splits them into baseline/recent windows — a silent 1000-row cap would skew the computed trend.
// Paginate (fail-soft: on error priorRows stays [] and the error is pushed).
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

export const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
export const SLOPE_CLAMP_ABS = 100;

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Default numeric extractor: raw_value is a bare number (wordpress-plugins.js,
 * google-trends.js). Sources whose raw_value is an object (e.g. reddit.js's
 * {complaintDensity, totalPosts, ...}) must pass their own `extractValue` to
 * computeSlopeAndPersist -- applied uniformly to BOTH historical rows queried
 * back from the DB and the current cycle's value, so baseline/recent stay
 * apples-to-apples regardless of raw_value's shape.
 */
export function extractNumeric(rawValue) {
  return typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null;
}

/**
 * Percentage-change slope, clamped to +/-SLOPE_CLAMP_ABS.
 * baselineAvg === 0 is handled explicitly (division by zero would otherwise
 * yield Infinity/NaN): growth from a true zero baseline clamps to the max: no
 * growth from a zero baseline is 0, never a fabricated large negative.
 */
export function computePercentSlope(recentAvg, baselineAvg) {
  if (recentAvg === null || baselineAvg === null) return null;
  if (baselineAvg === 0) {
    if (recentAvg === 0) return 0;
    return recentAvg > 0 ? SLOPE_CLAMP_ABS : -SLOPE_CLAMP_ABS;
  }
  const pct = ((recentAvg - baselineAvg) / Math.abs(baselineAvg)) * 100;
  return Math.max(-SLOPE_CLAMP_ABS, Math.min(SLOPE_CLAMP_ABS, pct));
}

/**
 * Query prior (source, query_term, family) history over the trailing 12 months,
 * split into non-overlapping baseline (strictly older than 90 days) and recent
 * (within 90 days) windows, compute a clamped percent-change slope, then persist
 * the current observation for future cycles.
 *
 * Returns null (never a fabricated 0) when: no supabase client, no prior rows
 * at all, or either window has no rows yet -- "no reading yet" per the shared
 * source-fetcher interface contract.
 *
 * @param {Object} args
 * @param {Object} args.supabase
 * @param {string} args.source - e.g. 'wordpress_plugins', 'reddit', 'google_trends'
 * @param {string} args.queryTerm
 * @param {string} args.family
 * @param {number|object} args.rawValue - value to persist in this cycle's row
 * @param {{ fetched_at: string, content_hash: string, transform_version: string }} args.observation
 * @param {string[]} args.errors - shared errors array to push onto (fail-soft)
 * @param {(rawValue: number|object) => number|null} [args.extractValue] - pulls the
 *   numeric signal out of a raw_value (current or historical); defaults to
 *   extractNumeric (bare-number raw_value). Applied uniformly to every row.
 * @returns {Promise<number|null>}
 */
export async function computeSlopeAndPersist({
  supabase, source, queryTerm, family, rawValue, observation, errors, extractValue = extractNumeric,
}) {
  if (!supabase) return null;

  const now = new Date(observation.fetched_at);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const ninetyDaysAgo = new Date(now.getTime() - NINETY_DAYS_MS);

  let priorRows = [];
  try {
    priorRows = await fetchAllPaginated(() => supabase
      .from('market_signal_observations')
      .select('raw_value, fetched_at')
      .eq('source', source)
      .eq('query_term', queryTerm)
      .eq('family', family)
      .gte('fetched_at', twelveMonthsAgo.toISOString())
      .lte('fetched_at', now.toISOString())
      .order('fetched_at', { ascending: true })
      .order('id', { ascending: true })); // id tiebreaker: stable page boundaries (FR-6)
  } catch (err) {
    errors.push(`market_signal_observations query failed (${family}): ${err.message}`);
  }

  let slope = null;
  if (priorRows.length > 0) {
    const numericRows = priorRows
      .map((r) => ({ value: extractValue(r.raw_value), fetchedAt: new Date(r.fetched_at) }))
      .filter((r) => Number.isFinite(r.value));
    // Non-overlapping split: baseline is STRICTLY older than 90 days ago;
    // recent is the last 90 days. Recent rows never contaminate the baseline.
    const baselineRows = numericRows.filter((r) => r.fetchedAt < ninetyDaysAgo);
    const recentRows = numericRows.filter((r) => r.fetchedAt >= ninetyDaysAgo);
    const baselineAvg = average(baselineRows.map((r) => r.value));
    const recentAvg = average(recentRows.map((r) => r.value));
    slope = computePercentSlope(recentAvg, baselineAvg);
  }

  try {
    const { error: insertError } = await supabase.from('market_signal_observations').insert({
      source,
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
