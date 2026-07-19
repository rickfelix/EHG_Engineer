/**
 * Plan-drift gauge detectors (SD-LEO-INFRA-PLAN-DRIFT-GAUGE-001).
 *
 * Layer A: STAMP-COVERAGE — percent of claimable leaf SDs carrying roadmap wave linkage
 * (the starvation detector; floor = the >=80% acceptance criterion from
 * SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001, which has already shipped as of this SD's LEAD phase).
 *
 * Layer B: DISPATCH-MIX drift — last-N dispatched/claimed SDs bucketed by wave-linked rung vs
 * the active wave's demand. Self-gates on live coverage (reads Layer A itself) rather than
 * coupling to any sibling SD's completion status — more robust against a future roadmap freeze
 * recurrence than a time-based sequencing gate would be.
 *
 * Reuses (does not re-derive): scripts/coordinator-backlog-rank.mjs::computeClaimableLeaves,
 * lib/vision/needle-priority.mjs::buildSdRungMap, lib/fleet/exec-email-alignment.mjs::isMetaSd
 * (the exclusion-class classifier — QF-/SD-LEO-/SD-LEARN-FIX-/SD-MAN-INFRA- prefixed items are
 * non-wave-eligible by the same convention the taper gauge already uses).
 *
 * @module lib/governance/plan-drift-detectors
 */

import { computeClaimableLeaves } from '../../scripts/coordinator-backlog-rank.mjs';
import { buildSdRungMap } from '../vision/needle-priority.mjs';
import { isMetaSd } from '../fleet/exec-email-alignment.mjs';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: whole-corpus reads paginate past the
// PostgREST 1000-row cap (strategic_directives_v2 alone exceeds it).
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

/** Coverage floor: SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001's own acceptance criterion. */
export const COVERAGE_FLOOR_PCT = 80;

/**
 * Pure: is this SD key excluded from the dispatch-mix denominator? QFs and harness/meta SDs
 * (same prefix convention as the taper gauge's isMetaSd) are not wave-eligible work.
 * @param {string} sdKey
 * @returns {boolean}
 */
export function isWaveExclusionClass(sdKey) {
  return isMetaSd(sdKey);
}

/**
 * Pure: coverage = claimable leaves with a wave-linked rung / all claimable leaves.
 * Honest-gauge rule: a zero denominator is STARVED, never coverage=1 by default (mirrors
 * lib/governance/recursion-governor.js's isBandBreach product===0 convention).
 * @param {object[]} claimable - claimable leaf SD rows ({ sd_key, ... })
 * @param {Record<string, object>} sdRungMap - sd_key -> rung info (buildSdRungMap output)
 * @param {{ floorPct?: number }} [opts]
 * @returns {{ total: number, linked: number, coveragePct: (number|null), starved: boolean }}
 */
export function computeCoverage(claimable, sdRungMap, { floorPct = COVERAGE_FLOOR_PCT } = {}) {
  const rows = Array.isArray(claimable) ? claimable : [];
  const total = rows.length;
  if (total === 0) return { total: 0, linked: 0, coveragePct: null, starved: true, value: 'STARVED (no claimable leaves)' };
  const linked = rows.filter((d) => Boolean(sdRungMap && sdRungMap[d.sd_key])).length;
  const coveragePct = (linked / total) * 100;
  const starved = coveragePct < floorPct;
  return { total, linked, coveragePct, starved, value: `${coveragePct.toFixed(1)}%${starved ? ' (STARVED)' : ''}` };
}

/**
 * I/O: reads the live claimable-leaf set + wave-linkage map (reused, not re-derived) and computes
 * Layer A coverage.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ total: number, linked: number, coveragePct: (number|null), starved: boolean }>}
 */
export async function computeStampCoverage(supabase) {
  const { error, claimable } = await computeClaimableLeaves(supabase, { quiet: true });
  if (error) throw new Error('computeStampCoverage: computeClaimableLeaves failed: ' + error.message);
  // FR-6: paginated past the PostgREST 1000-row cap. The prior destructure silently ignored
  // query errors (data null → []); .catch(() => []) preserves that exact fail-open policy.
  const [waveItems, waves] = await Promise.all([
    fetchAllPaginated(() => supabase.from('roadmap_wave_items').select('promoted_to_sd_key, wave_id').not('promoted_to_sd_key', 'is', null).order('promoted_to_sd_key')).catch(() => []),
    fetchAllPaginated(() => supabase.from('roadmap_waves').select('id, time_horizon, metadata').order('id')).catch(() => []),
  ]);
  const wavesById = Object.fromEntries((waves || []).map((w) => [w.id, w]));
  const sdRungMap = buildSdRungMap(waveItems, wavesById);
  return computeCoverage(claimable, sdRungMap);
}

/**
 * Pure: bucket the last-N dispatched SD keys by wave-linked rung, and compare against the active
 * wave's demand distribution. Non-wave-eligible classes are excluded from the denominator by
 * class (FR-3) -- if exclusion leaves zero denominator, report STARVED (same honesty convention
 * as coverage), never a false pass.
 * @param {string[]} dispatchedKeys - last-N dispatched/claimed SD keys, newest first
 * @param {Record<string, object>} sdRungMap - sd_key -> rung info
 * @param {string|null} activeRungKey - the active wave's rung key
 * @returns {{ total: number, excluded: number, mix: Record<string, number>, activeRungCount: number, activeRungPct: (number|null), starved: boolean }}
 */
export function computeDispatchMix(dispatchedKeys, sdRungMap, activeRungKey) {
  const keys = Array.isArray(dispatchedKeys) ? dispatchedKeys : [];
  const excluded = keys.filter(isWaveExclusionClass).length;
  const included = keys.filter((k) => !isWaveExclusionClass(k));
  const total = included.length;
  if (total === 0) return { total: 0, excluded, mix: {}, activeRungCount: 0, activeRungPct: null, starved: true };
  const mix = {};
  for (const k of included) {
    // buildSdRungMap's values are plain rung-key STRINGS (see lib/vision/rung-progress-rollup.mjs
    // mapWaveToRung) -- not objects.
    const rung = (sdRungMap && sdRungMap[k]) || 'unlinked';
    mix[rung] = (mix[rung] || 0) + 1;
  }
  const activeRungCount = activeRungKey ? (mix[activeRungKey] || 0) : 0;
  const activeRungPct = (activeRungCount / total) * 100;
  return { total, excluded, mix, activeRungCount, activeRungPct, starved: false };
}

/**
 * I/O: the last `limit` dispatch/claim events (newest first) across all SDs, read from
 * strategic_directives_v2.metadata.claim_history (there is no top-level dispatch_rank column --
 * verified live; mirrors lib/governance/work-boundary-gauges.js::fetchSdBoundaryRows's JSONB read
 * pattern). Each claim event is one dispatch signal, so a re-claimed SD contributes multiple
 * entries -- this reflects actual dispatch activity volume, not just unique SDs touched.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<string[]>} sd_keys, newest-claimed first
 */
export async function fetchLastNDispatchedKeys(supabase, { limit = 20 } = {}) {
  // FR-6: paginated — the SD corpus exceeds the PostgREST 1000-row cap, and a capped read here
  // would silently skew the dispatch-mix sample. Fail-loud (throw) policy preserved via the wrap.
  let data;
  try {
    data = await fetchAllPaginated(() => supabase.from('strategic_directives_v2').select('sd_key, metadata').order('sd_key'));
  } catch (e) {
    throw new Error('fetchLastNDispatchedKeys failed: ' + ((e && e.message) || String(e)));
  }
  const events = [];
  for (const row of data || []) {
    const history = Array.isArray(row?.metadata?.claim_history) ? row.metadata.claim_history : [];
    for (const entry of history) {
      if (entry && entry.claimed_at) events.push({ sd_key: row.sd_key, claimed_at: entry.claimed_at });
    }
  }
  events.sort((a, b) => new Date(b.claimed_at).getTime() - new Date(a.claimed_at).getTime());
  return events.slice(0, limit).map((e) => e.sd_key);
}

/**
 * I/O: re-surface-once dedup check (FR-5) -- is there already an OPEN invariant_gauge_finding for
 * this gauge_id? routeFinding() in scripts/gauge-runner.mjs always inserts unconditionally
 * otherwise (verified: 903 existing duplicate rows, no gauge dedups today), so this is genuinely
 * new logic, not a reuse of existing framework behavior.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gaugeId
 * @returns {Promise<boolean>} true when an OPEN finding already exists (caller should skip insert)
 */
export async function hasOpenFinding(supabase, gaugeId) {
  const { data, error } = await supabase
    .from('feedback')
    .select('id')
    .eq('category', 'invariant_gauge_finding')
    .eq('metadata->>gauge_id', gaugeId)
    .in('status', ['new', 'backlog', 'in_progress'])
    .limit(1);
  if (error) throw new Error('hasOpenFinding failed: ' + error.message);
  return Array.isArray(data) && data.length > 0;
}

/**
 * Pure: does the dispatch mix drift past threshold relative to the active wave's demand? A wave
 * is "aligned" when the active rung's share of dispatched work is at least `minActiveRungPct` of
 * the mix; anything below is drift. Starved input is never "aligned" (honest-gauge rule).
 * @param {{ starved: boolean, activeRungPct: (number|null) }} mixResult
 * @param {{ minActiveRungPct?: number }} [opts]
 * @returns {boolean}
 */
export function isDriftBreach(mixResult, { minActiveRungPct = 25 } = {}) {
  if (!mixResult || mixResult.starved) return true;
  return typeof mixResult.activeRungPct === 'number' && mixResult.activeRungPct < minActiveRungPct;
}
