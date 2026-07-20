/**
 * FR-1 — Learning-moat gauge (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-E).
 *
 * Makes "learning speed is the moat" FALSIFIABLE by measuring it from the reflection rows
 * the emitter (traversal-reflection-emitter.js) writes into issue_patterns
 * (metadata.emission_type='traversal_reflection'). Read-only/computed -- no new storage
 * table, so no additional RLS surface for this satellite.
 *
 * lessonsPerTraversal is genuinely derivable today: count of quality-gated reflection rows
 * divided by the number of distinct ventures that produced at least one, over a window.
 *
 * timeFromDefectToShippedFix (SD-LEO-GEN-SATELLITE-LEARNING-SPEED-001): the mean latency,
 * in hours, between a reflection-origin issue_patterns row's created_at (when the lesson
 * was captured) and its resolution_date (when the pattern's root cause was actually
 * resolved), across rows with resolution_date set in the query window. Rows without a
 * resolution_date (root cause not yet resolved) are excluded from the latency computation
 * but still count toward lessonsEmitted/lessonsPerTraversal, unchanged from before.
 *
 * HONEST-ZERO INVARIANT (preserved, not fabricated): when zero resolved rows exist in the
 * window -- the live state as of this writing, since no venture has yet completed a full
 * 26-stage traversal to produce a resolvable reflection -- timeFromDefectToShippedFix stays
 * null with an explicit reason, exactly as before this SD. Faking a number here would be
 * the honest-naming / NO-DATA-read-as-green violation the architecture doc's S-4 gauge
 * doctrine forbids.
 */

import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const DEFAULT_WINDOW_DAYS = 30;
const NO_RESOLVED_ROWS_REASON =
  'not yet computable -- no resolved (resolution_date set) reflection-origin issue_patterns rows in this window';

/**
 * @param {object} supabase - injected client
 * @param {{ ventureId?: string|null, sinceDays?: number }} [opts]
 * @returns {Promise<{
 *   lessonsEmitted: number,
 *   distinctVentures: number,
 *   lessonsPerTraversal: number|null,
 *   timeFromDefectToShippedFix: number|null,
 *   timeFromDefectToShippedFixReason: string,
 *   windowDays: number,
 *   measuredAt: string
 * }>}
 */
export async function computeLearningMoatGauge(supabase, opts = {}) {
  const { ventureId = null, sinceDays = DEFAULT_WINDOW_DAYS } = opts;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  // Paginated (FR-6 batch 7): lessonsEmitted is a rows.length gauge — a capped read
  // would silently understate the moat. Page errors rethrow with the prior message.
  let data;
  try {
    data = await fetchAllPaginated(() => {
      let q = supabase
        .from('issue_patterns')
        .select('id, metadata, created_at, resolution_date')
        .eq('metadata->>emission_type', 'traversal_reflection')
        .gte('created_at', since);
      if (ventureId) q = q.eq('metadata->>venture_id', ventureId);
      return q.order('id', { ascending: true });
    });
  } catch (e) {
    throw new Error(`computeLearningMoatGauge query failed: ${e.message}`);
  }

  const rows = data || [];
  const distinctVentures = new Set(rows.map((r) => r.metadata?.venture_id).filter(Boolean)).size;
  const lessonsPerTraversal = distinctVentures > 0 ? rows.length / distinctVentures : null;

  // h >= 0 excludes malformed/corrupted rows where resolution_date precedes created_at
  // (a fix cannot resolve a defect before the defect was captured) -- Number.isFinite
  // alone would let a negative latency silently corrupt the mean.
  const resolvedLatenciesHours = rows
    .filter((r) => r.resolution_date)
    .map((r) => (new Date(r.resolution_date).getTime() - new Date(r.created_at).getTime()) / 3_600_000)
    .filter((h) => Number.isFinite(h) && h >= 0);

  const timeFromDefectToShippedFix = resolvedLatenciesHours.length > 0
    ? Math.round((resolvedLatenciesHours.reduce((a, b) => a + b, 0) / resolvedLatenciesHours.length) * 10) / 10
    : null;
  const timeFromDefectToShippedFixReason = resolvedLatenciesHours.length > 0
    ? `computed from ${resolvedLatenciesHours.length} resolved reflection(s)`
    : NO_RESOLVED_ROWS_REASON;

  return {
    lessonsEmitted: rows.length,
    distinctVentures,
    lessonsPerTraversal,
    timeFromDefectToShippedFix,
    timeFromDefectToShippedFixReason,
    windowDays: sinceDays,
    measuredAt: new Date().toISOString(),
  };
}
