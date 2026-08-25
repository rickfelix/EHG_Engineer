/**
 * UAT failure triage — SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (FR-4).
 *
 * Classifies a failing UAT journey as venture-defect or factory-defect (via
 * uat-control-pack.js's classifyUatFailure), records it through the matching recorder, and
 * tracks whether the factory-defect failure ceiling has been exceeded for a given venture,
 * escalating to a root-fix SD rather than an unbounded retry loop.
 *
 * Escalation itself is NOT performed here: creating an SD must go through the canonical
 * `SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js` path (CLAUDE.md rule #4 — never
 * bypass canonical creation scripts), which this pure/DB-read module cannot invoke as a
 * subprocess from inside a gate evaluation. checkFailureCeiling() returns a clear
 * shouldEscalate signal; the caller (the operational pipeline that runs UAT gates) is
 * responsible for actually shelling out to the canonical script when it is true.
 */
import { recordFactoryDefect } from './findings/factory-defect-recorder.js';
import { recordVentureDefect } from './findings/venture-defect-recorder.js';
import { classifyUatFailure } from './uat-control-pack.js';
import { GAP_CLASS } from './findings/gap-class.js';
import { VENTURE_DEFECT_CLASS } from './findings/venture-defect-class.js';

/**
 * @param {Object} supabase
 * @param {Object} failure
 * @param {string} failure.ventureId
 * @param {string|null} failure.sourceSdId
 * @param {boolean} failure.mechanismError - true if the UAT mechanism itself errored (factory)
 * @param {boolean} failure.journeyExecuted - true if the journey actually ran against the app
 * @param {string} failure.title
 * @param {string} [failure.description]
 * @param {Object} [failure.metadata]
 * @returns {Promise<{side: 'venture_defect'|'factory_defect', recorded: boolean, feedbackId: string}>}
 */
export async function triageUatFailure(supabase, failure) {
  const side = classifyUatFailure({ mechanismError: failure.mechanismError, journeyExecuted: failure.journeyExecuted });

  if (side === 'factory_defect') {
    const result = await recordFactoryDefect(supabase, {
      source_sd_id: failure.sourceSdId,
      gap_class: failure.metadata?.gap_class || GAP_CLASS.GATE_CANNOT_FAIL,
      title: failure.title,
      description: failure.description,
      metadata: { ...failure.metadata, venture_id: failure.ventureId },
    });
    // SECURITY sub-agent finding S1 (EXEC-TO-PLAN evidence): recordFactoryDefect's dedup hash
    // (computeDedupHash(source_sd_id, [gap_class], null)) deliberately does NOT include
    // venture_id -- correct for its existing contract (one row per broken factory instrument,
    // shared across every venture that trips over it), but it means checkFailureCeiling's
    // ceiling MUST be tracked independently per-venture, on this same (possibly shared) row's
    // metadata, rather than by counting rows -- there is only ever one row per gap_class.
    await bumpVentureFailureOccurrence(supabase, result.feedbackId, failure.ventureId);
    return { side, ...result };
  }

  const result = await recordVentureDefect(supabase, {
    source_sd_id: failure.sourceSdId,
    venture_id: failure.ventureId,
    venture_defect_class: failure.metadata?.venture_defect_class || VENTURE_DEFECT_CLASS.APPLICATION_BEHAVIOR_DEFECT,
    title: failure.title,
    description: failure.description,
    metadata: failure.metadata,
  });
  return { side, ...result };
}

/**
 * Increments this venture's own occurrence count on a (possibly cross-venture-shared) factory
 * defect row, keyed under metadata.uat_venture_occurrences[ventureId] -- read-modify-write,
 * scoped so the ceiling can be tracked per-venture without touching
 * factory-defect-recorder.js's shared dedup contract.
 * @param {Object} supabase
 * @param {string} feedbackId
 * @param {string} ventureId
 */
async function bumpVentureFailureOccurrence(supabase, feedbackId, ventureId) {
  const { data: row, error } = await supabase.from('feedback').select('metadata').eq('id', feedbackId).single();
  if (error || !row) return; // best-effort -- a bookkeeping failure must never mask the recorded defect itself
  const occurrences = { ...(row.metadata?.uat_venture_occurrences || {}) };
  occurrences[ventureId] = (occurrences[ventureId] || 0) + 1;
  await supabase.from('feedback').update({ metadata: { ...row.metadata, uat_venture_occurrences: occurrences } }).eq('id', feedbackId);
}

/**
 * @param {Object} supabase
 * @param {string} ventureId
 * @param {number} [ceiling=3]
 * @returns {Promise<{count: number, ceiling: number, shouldEscalate: boolean}>}
 */
export async function checkFailureCeiling(supabase, ventureId, ceiling = 3) {
  const { data, error } = await supabase
    .from('feedback')
    .select('metadata')
    .eq('category', 'factory_defect')
    .in('status', ['new', 'in_progress'])
    .limit(500);
  if (error) {
    throw new Error(`checkFailureCeiling: read failed: ${error.message}`);
  }
  const count = (data || []).reduce((sum, r) => sum + (r.metadata?.uat_venture_occurrences?.[ventureId] || 0), 0);
  return { count, ceiling, shouldEscalate: count >= ceiling };
}

export default { triageUatFailure, checkFailureCeiling };
