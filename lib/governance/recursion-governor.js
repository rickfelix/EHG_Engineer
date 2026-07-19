/**
 * Recursion governor (SD-LEO-INFRA-009-LEAF-RECURSION-001)
 *
 * Generalizes the chairman taper rule -- self-improvement (meta) throughput must decline toward
 * solo-operator launch relative to product throughput -- from an ad-hoc exec-summary email line
 * (lib/fleet/exec-email-alignment.mjs) into a KPI-owned gauge with a declared band and an alert
 * only on SUSTAINED breach, not a single-tick blip. Reuses lib/fleet/exec-email-alignment.mjs's
 * isMetaSd() read-only -- zero modifications to that module.
 *
 * @module lib/governance/recursion-governor
 */

import { isMetaSd } from '../fleet/exec-email-alignment.mjs';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: throughput reads paginate past the
// PostgREST 1000-row cap (30-day completed throughput can exceed it) — a capped read would
// silently skew the meta:product ratio this governor alerts on.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

/** Initial declared band: >3 meta items shipped per 1 product item is a taper-rule breach. Named,
 *  single-source-of-truth constant -- retune from observed data with a one-line change. */
export const DEFAULT_MAX_RATIO = 3;

/** A breach must repeat this many consecutive gauge-runner ticks (newest-first) before it's
 *  "sustained" -- a single blip never trips the alert. */
export const DEFAULT_REQUIRED_CONSECUTIVE = 3;

/** Rolling window (days) of completed throughput considered per tick. */
export const DEFAULT_WINDOW_DAYS = 30;

/**
 * Pure: classify completed items into meta vs product and compute the ratio.
 * @param {Array<{key: string}>} items
 * @param {{windowDays?: number}} [opts]
 * @returns {{meta: number, product: number, ratio: (number|null), windowDays: number}}
 */
export function computeRecursionRatio(items, { windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  const rows = Array.isArray(items) ? items : [];
  let meta = 0, product = 0;
  for (const r of rows) (isMetaSd(r && r.key) ? meta++ : product++);
  const ratio = product > 0 ? meta / product : null;
  return { meta, product, ratio, windowDays };
}

/**
 * Pure: does this tick's ratio breach the declared band? All-meta/zero-product is the worst case
 * of the taper rule and breaches even though ratio is null (no divide-by-zero to hide behind).
 * @param {{meta: number, product: number, ratio: (number|null)}} result
 * @param {{maxRatio?: number}} [opts]
 * @returns {boolean}
 */
export function isBandBreach(result, { maxRatio = DEFAULT_MAX_RATIO } = {}) {
  const meta = result?.meta || 0;
  const product = result?.product || 0;
  if (product === 0) return meta > 0;
  return typeof result?.ratio === 'number' && result.ratio > maxRatio;
}

/**
 * Pure: given past gauge-runner snapshots (newest first, each carrying a boolean `breach`), is the
 * breach SUSTAINED -- an unbroken streak of requiredConsecutive breaches counting from the newest?
 * @param {Array<{breach: boolean}>} recentSnapshots
 * @param {{requiredConsecutive?: number}} [opts]
 * @returns {{sustained: boolean, streak: number}}
 */
export function detectSustainedBreach(recentSnapshots, { requiredConsecutive = DEFAULT_REQUIRED_CONSECUTIVE } = {}) {
  const rows = Array.isArray(recentSnapshots) ? recentSnapshots : [];
  let streak = 0;
  for (const s of rows) {
    if (s && s.breach) streak++;
    else break;
  }
  return { sustained: streak >= requiredConsecutive, streak };
}

/**
 * I/O: completed strategic_directives_v2 + quick_fixes rows within the rolling window, normalized
 * to {key}. Both tables' key columns (sd_key / id) already carry the QF-/SD-LEO- prefixes isMetaSd
 * classifies on -- no separate classifier needed for quick_fixes.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{windowDays?: number}} [opts]
 * @returns {Promise<Array<{key: string}>>}
 */
export async function fetchThroughputItems(supabase, { windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  const sinceIso = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString();

  // FR-6: paginated; per-table fail-loud (throw) policy preserved via the labeled wraps.
  const [sdData, qfData] = await Promise.all([
    fetchAllPaginated(() => supabase.from('strategic_directives_v2').select('sd_key').eq('status', 'completed').gte('completion_date', sinceIso).order('sd_key'))
      .catch((e) => { throw new Error('fetchThroughputItems (SD) failed: ' + ((e && e.message) || String(e))); }),
    fetchAllPaginated(() => supabase.from('quick_fixes').select('id, title').eq('status', 'completed').gte('completed_at', sinceIso).order('id'))
      .catch((e) => { throw new Error('fetchThroughputItems (QF) failed: ' + ((e && e.message) || String(e))); }),
  ]);

  // SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001: fixture rows (ZZZ_/TEST-/UAT keys or titles)
  // must not count toward real throughput — the governor's ratios read this.
  const { isFixtureSdKey, isFixtureQf } = await import('./fixture-exclusion.mjs');
  const sdItems = (sdData || []).filter((r) => !isFixtureSdKey(r.sd_key)).map((r) => ({ key: r.sd_key }));
  const qfItems = (qfData || []).filter((qf) => !isFixtureQf(qf)).map((r) => ({ key: r.id }));
  return [...sdItems, ...qfItems];
}

/**
 * I/O: the last `limit` codebase_health_snapshots rows for a dimension, newest first, normalized
 * to {breach}. Reuses the EXISTING table gauge-runner.mjs's own heartbeat already writes to.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{dimension: string, limit?: number}} opts
 * @returns {Promise<Array<{breach: boolean}>>}
 */
export async function fetchRecentSnapshots(supabase, { dimension, limit = DEFAULT_REQUIRED_CONSECUTIVE }) {
  const { data, error } = await supabase
    .from('codebase_health_snapshots')
    .select('metadata')
    .eq('dimension', dimension)
    .order('scanned_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('fetchRecentSnapshots failed: ' + error.message);
  return (data || []).map((r) => ({ breach: Boolean(r?.metadata?.breach) }));
}

/**
 * I/O: append this tick's ratio reading as a new codebase_health_snapshots row, extending the
 * durable evidence log that fetchRecentSnapshots reads back from on the NEXT tick.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{dimension: string, ratioResult: object, breach: boolean}} opts
 */
export async function writeThroughputSnapshot(supabase, { dimension, ratioResult, breach }) {
  const { error } = await supabase.from('codebase_health_snapshots').insert({
    dimension,
    target_application: 'EHG_Engineer',
    score: typeof ratioResult?.ratio === 'number' ? ratioResult.ratio : 0,
    findings: [{ ...ratioResult, breach }],
    trend_direction: breach ? 'declining' : 'stable',
    metadata: { ...ratioResult, breach },
  });
  if (error) throw new Error('writeThroughputSnapshot failed: ' + error.message);
}
