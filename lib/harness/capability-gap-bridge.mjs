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
 * Each requirement is emitted with its OWN try/catch: a failure on one finding (transient
 * DB error, RLS denial, etc.) must not silently drop every finding after it in the same
 * batch -- the whole point is one durable row per finding, not all-or-nothing.
 *
 * @param {Object} supabase - service-role client
 * @param {{cannotDrive?: string[]}} coverageResult - the return value of journal.checkCoverage()
 * @param {{harnessSource?: string, runId?: string}} [context]
 * @returns {Promise<{emitted: number, failed: Array<{requirementId: string, reason: string}>}>}
 */
export async function bridgeCannotDriveFindings(supabase, coverageResult, context = {}) {
  const cannotDrive = Array.isArray(coverageResult?.cannotDrive) ? coverageResult.cannotDrive : [];
  if (cannotDrive.length === 0) return { emitted: 0, failed: [] };

  const { harnessSource = 's20-run', runId = null } = context;
  let emitted = 0;
  const failed = [];
  for (const requirementId of cannotDrive) {
    try {
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
    } catch (err) {
      failed.push({ requirementId, reason: err?.message || String(err) });
    }
  }
  return { emitted, failed };
}
