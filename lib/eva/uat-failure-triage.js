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
 * @param {Object} supabase
 * @param {string} ventureId
 * @param {number} [ceiling=3]
 * @returns {Promise<{count: number, ceiling: number, shouldEscalate: boolean}>}
 */
export async function checkFailureCeiling(supabase, ventureId, ceiling = 3) {
  const { data, error } = await supabase
    .from('feedback')
    .select('id')
    .eq('category', 'factory_defect')
    .eq('metadata->>venture_id', ventureId)
    .in('status', ['new', 'in_progress']);
  if (error) {
    throw new Error(`checkFailureCeiling: read failed: ${error.message}`);
  }
  const count = data?.length || 0;
  return { count, ceiling, shouldEscalate: count >= ceiling };
}

export default { triageUatFailure, checkFailureCeiling };
