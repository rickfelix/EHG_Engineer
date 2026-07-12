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
 * timeFromDefectToShippedFix is INTENTIONALLY left unmeasured (null, with an explicit
 * reason) rather than fabricated: no defect-vs-fix correlation is modeled anywhere in this
 * satellite's data today -- a reflection row has no "this is the defect" / "this is the
 * fix that closed it" linkage. Faking a number here would be exactly the honest-naming /
 * NO-DATA-read-as-green violation the architecture doc's S-4 gauge doctrine forbids.
 * Computing it for real requires correlating a reflection-origin issue_patterns row with
 * its eventual assigned_sd_id + resolution_date (both columns already exist on
 * issue_patterns) -- a follow-up, once enough reflection-sourced patterns have actually
 * been assigned and resolved to compute a meaningful latency.
 */

const DEFAULT_WINDOW_DAYS = 30;

/**
 * @param {object} supabase - injected client
 * @param {{ ventureId?: string|null, sinceDays?: number }} [opts]
 * @returns {Promise<{
 *   lessonsEmitted: number,
 *   distinctVentures: number,
 *   lessonsPerTraversal: number|null,
 *   timeFromDefectToShippedFix: null,
 *   timeFromDefectToShippedFixReason: string,
 *   windowDays: number,
 *   measuredAt: string
 * }>}
 */
export async function computeLearningMoatGauge(supabase, opts = {}) {
  const { ventureId = null, sinceDays = DEFAULT_WINDOW_DAYS } = opts;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('issue_patterns')
    .select('metadata')
    .eq('metadata->>emission_type', 'traversal_reflection')
    .gte('created_at', since);
  if (ventureId) query = query.eq('metadata->>venture_id', ventureId);

  const { data, error } = await query;
  if (error) throw new Error(`computeLearningMoatGauge query failed: ${error.message}`);

  const rows = data || [];
  const distinctVentures = new Set(rows.map((r) => r.metadata?.venture_id).filter(Boolean)).size;
  const lessonsPerTraversal = distinctVentures > 0 ? rows.length / distinctVentures : null;

  return {
    lessonsEmitted: rows.length,
    distinctVentures,
    lessonsPerTraversal,
    timeFromDefectToShippedFix: null,
    timeFromDefectToShippedFixReason: 'not yet computable -- no defect/fix correlation modeled on reflection-origin issue_patterns rows; requires correlating assigned_sd_id + resolution_date once enough reflection-sourced patterns have been assigned and resolved',
    windowDays: sinceDays,
    measuredAt: new Date().toISOString(),
  };
}
