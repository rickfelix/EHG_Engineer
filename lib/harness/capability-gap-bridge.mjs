/**
 * Bridges harness CANNOT_DRIVE findings into a durable capability-gap signal.
 * (SD-LEO-GEN-SATELLITE-CAPABILITY-EXTRACTION-001, FR-1)
 *
 * checkCoverage() (run-journal.mjs) returns cannotDrive[] -- requirement IDs whose
 * upstream trigger never fired during a harness run. Per the chairman-ratified
 * satellite architecture (docs/design/operating-company-satellite-architecture-v1.md
 * §3.4): "the run's CANNOT-DRIVE map IS negative capability data -- surfaces the
 * factory cannot drive are capabilities not yet deposited."
 *
 * This deliberately does NOT write into venture_capabilities: that table's evidence
 * column (database/migrations/20260710_venture_capabilities_evidence.sql) enforces a
 * delivered-reality-only invariant ("No aspirational (undelivered) capability may be
 * registered without a populated evidence citation"), and SPINE-001-E's
 * evaluateCapabilityMaturity() "no trophy shelf" guard assumes every row it sees was
 * actually deposited. Writing gap findings there would corrupt both. Instead, each
 * finding becomes its own feedback row (category='capability_gap') via the existing
 * canonical writer -- reusing the substrate, not rebuilding it.
 */
import { emitFeedback } from '../governance/emit-feedback.js';

export const CAPABILITY_GAP_CATEGORY = 'capability_gap';

/**
 * @param {Object} supabase - service-role client
 * @param {{cannotDrive?: string[]}} coverageResult - the return value of journal.checkCoverage()
 * @param {{harnessSource?: string, runId?: string}} [context]
 * @returns {Promise<{emitted: number}>}
 */
export async function bridgeCannotDriveFindings(supabase, coverageResult, context = {}) {
  const cannotDrive = Array.isArray(coverageResult?.cannotDrive) ? coverageResult.cannotDrive : [];
  if (cannotDrive.length === 0) return { emitted: 0 };

  const { harnessSource = 's20-run', runId = null } = context;
  let emitted = 0;
  for (const requirementId of cannotDrive) {
    // eslint-disable-next-line no-await-in-loop
    await emitFeedback({
      supabase,
      title: `Capability gap: requirement ${requirementId} cannot be driven`,
      description: `Harness run (${harnessSource}) recorded a CANNOT_DRIVE finding for requirement "${requirementId}" -- the org lacks a deposited capability to exercise this surface.`,
      type: 'enhancement',
      category: CAPABILITY_GAP_CATEGORY,
      severity: 'medium',
      metadata: { requirement_id: requirementId, harness_source: harnessSource, run_id: runId },
    });
    emitted++;
  }
  return { emitted };
}
