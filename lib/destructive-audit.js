/**
 * Audit trail for irreversible venture teardown.
 * SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-3.
 *
 * THIS IS REPAIR, NOT INVENTION. The pre-refactor master_reset_portfolio() wrote
 * operations_audit_log BEFORE and AFTER the deletes
 * (supabase/migrations/20260320_fix_p0_security_rls_and_reset.sql:62,74,97).
 * SD-SINGLEVENTURE-AND-BULK-DELETE-ORCH-001-B replaced that RPC with the
 * deleteVentureFully loop and dropped both writes without replacement, so today the most
 * destructive operation in the system leaves no record that it ran.
 *
 * DO NOT MODEL THIS ON lib/cleanup/archive.js:303-312. That insert uses columns
 * `operation_type` and `details` which DO NOT EXIST on operations_audit_log and hard-error,
 * and its failure is swallowed by a console.warn at :314 — so it has been silently writing
 * nothing. The live column list, measured against the database, is exactly:
 *   id, entity_type, entity_id, action, performed_by, performed_at, module, severity, metadata
 *
 * TWO PROPERTIES THAT ARE EASY TO GET WRONG AND ARE THE POINT OF THIS MODULE:
 *
 *  1. THE POST ROW MUST SURVIVE PARTIAL FAILURE. If the teardown loop throws at venture k,
 *     asyncHandler unwinds straight to the error handler. Without an explicit catch the PRE
 *     row is already written and no POST row ever is, leaving a trail that permanently reads
 *     "started, never finished" with no record of how far it got. That is arguably worse
 *     than no audit at all, because it looks like a hang rather than a failure.
 *
 *  2. A FAILED PRE-WRITE MUST REFUSE THE OPERATION (fail-closed, FR-4). An irreversible
 *     teardown that cannot be recorded must not proceed. Refusing costs an operator one
 *     retry; proceeding unaudited costs the ability to ever know what happened.
 */

const MODULE_NAME = 'ventures';
const ENTITY_TYPE = 'venture';

/**
 * Write one audit row. Throws on failure — callers decide whether that is fatal.
 * Deliberately does NOT swallow errors: the bug this module replaces was invisible
 * precisely because its failure path logged and continued.
 */
export async function writeAuditRow(supabase, { operation, phase, targetIds, performedBy, metadata = {} }) {
  const { error } = await supabase.from('operations_audit_log').insert({
    entity_type: ENTITY_TYPE,
    // A single-target operation names its venture; a bulk one cannot, so the full set
    // lives in metadata.target_ids rather than being lost.
    entity_id: targetIds.length === 1 ? targetIds[0] : null,
    action: `${operation}.${phase}`,
    performed_by: performedBy || 'unknown',
    performed_at: new Date().toISOString(),
    module: MODULE_NAME,
    severity: 'critical',
    metadata: { operation, phase, target_count: targetIds.length, target_ids: targetIds, ...metadata },
  });

  if (error) throw new Error(`[destructive-audit] ${operation}.${phase} audit write failed: ${error.message}`);
}

/**
 * Run an irreversible operation bracketed by audit rows.
 *
 * @returns whatever `run` returns.
 * @throws if the PRE-write fails (operation is NOT run), or whatever `run` throws
 *         (after a POST row recording the failure has been written).
 */
export async function withDestructiveAudit(supabase, { operation, targetIds, performedBy }, run) {
  // FAIL CLOSED: if this throws, `run` is never invoked and nothing is deleted.
  await writeAuditRow(supabase, { operation, phase: 'started', targetIds, performedBy });

  let results;
  try {
    results = await run();
  } catch (err) {
    // The teardown threw partway. Record how far it got BEFORE rethrowing, so the trail
    // never reads started-never-finished. A failure to write this row must not mask the
    // original error, which is the one the operator needs.
    try {
      await writeAuditRow(supabase, {
        operation, phase: 'failed', targetIds, performedBy,
        metadata: { outcome: 'threw', error: err?.message ?? String(err) },
      });
    } catch (auditErr) {
      console.error(`[destructive-audit] ${operation}.failed audit write ALSO failed: ${auditErr.message}`);
    }
    throw err;
  }

  const list = Array.isArray(results) ? results : [results];
  const succeeded = list.filter(r => r && r.success).length;

  await writeAuditRow(supabase, {
    operation, phase: 'completed', targetIds, performedBy,
    metadata: { outcome: 'completed', succeeded, failed: list.length - succeeded },
  });

  return results;
}

/** Best-effort actor identity for the audit row. requireAuth populates req.user when a Bearer token is used. */
export function resolvePerformedBy(req) {
  return req?.user?.id || req?.user?.email || (req?.headers?.['x-internal-api-key'] ? 'internal-api-key' : 'unknown');
}
