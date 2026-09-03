/**
 * QF-20260902-199 (defect A — the durable-record half; defect B, the wrong-half guard
 * ordering, was already fixed by QF-20260902-837/PR #8032, confirmed live on main before
 * this file was written).
 *
 * worktree-reaper.mjs's own header calls its output "Structured logs: JSON-lines to
 * stderr + human table to stdout" — both ephemeral. The UNATTENDED invocation
 * (scripts/fleet/worktree-reaper-tick.cjs, run via the "EHG LEO Stale-Session Sweep"
 * host task) launches hidden with no log redirection, so a scheduled run's
 * classifications are not durably visible to anyone. This closes that gap by persisting
 * every classification row — every run, dry-run or --execute — to the existing generic
 * audit_log table. No new table or migration: audit_log's metadata JSONB column already
 * accepts an arbitrary shape.
 */

export const EVENT_TYPE = 'worktree_reaper_classification';

/**
 * Pure mapping from reaper classification records (buildRecord() output in
 * worktree-reaper.mjs) to audit_log insert rows.
 * @param {Array<object>} records
 * @param {{runId: string}} ctx
 * @returns {Array<object>}
 */
export function buildAuditRows(records, { runId }) {
  return (records || []).map((r) => ({
    event_type: EVENT_TYPE,
    entity_type: 'worktree',
    entity_id: r.worktree_path,
    metadata: {
      run_id: runId,
      schema_version: r.schema_version,
      timestamp: r.timestamp,
      branch: r.branch,
      categories: r.categories,
      dirty_file_count: r.dirty_file_count,
      unpushed_commit_count: r.unpushed_commit_count,
      age_days: r.age_days,
      ship_status: r.ship_status,
      claim_status: r.claim_status,
      verdict: r.verdict,
      reason: r.reason,
    },
    severity: r.verdict === 'keep' ? 'low' : 'medium',
    created_by: 'worktree-reaper',
  }));
}

/**
 * Best-effort durable write. Never throws — a sink failure must never break the
 * reaper's primary function (classification, and removal under --execute).
 * @param {object} supabase
 * @param {Array<object>} records
 * @param {{runId: string, logger?: Function}} ctx
 * @returns {Promise<{ok: boolean, error?: string, inserted: number}>}
 */
export async function writeAuditSink(supabase, records, { runId, logger = () => {} } = {}) {
  if (!supabase) return { ok: false, error: 'no_supabase_client', inserted: 0 };
  const rows = buildAuditRows(records, { runId });
  if (rows.length === 0) return { ok: true, inserted: 0 };
  try {
    const { error } = await supabase.from('audit_log').insert(rows);
    if (error) {
      logger(`  ⚠️  worktree-reaper audit sink write failed (non-fatal): ${error.message}`);
      return { ok: false, error: error.message, inserted: 0 };
    }
    return { ok: true, inserted: rows.length };
  } catch (e) {
    logger(`  ⚠️  worktree-reaper audit sink write threw (non-fatal): ${e?.message || e}`);
    return { ok: false, error: e?.message || String(e), inserted: 0 };
  }
}

export default { buildAuditRows, writeAuditSink, EVENT_TYPE };
