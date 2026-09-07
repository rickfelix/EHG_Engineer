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
// SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F: two more residue classes, each its OWN event_type
// (never overloading EVENT_TYPE above) so a reader can tell them apart. Terminology note: the
// PRUNE_CANDIDATE class is a REGISTERED worktree whose gitdir target is missing (the
// `git worktree prune` set) -- this repo's own code (lib/worktree-reaper/close-husk.js,
// lib/worktree-manager.js) reserves the word "husk" for the OPPOSITE case (deregistered from
// git, directory survives), which is what HUSK_SHIP_PATH below actually is.
export const EVENT_TYPE_PRUNE_CANDIDATE = 'worktree_prune_candidate';
export const EVENT_TYPE_HUSK_SHIP_PATH = 'worktree_husk_ship_path';

// SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 FR-3: the DB's audit_log_severity_check
// constraint allows only {info, warning, error, critical} (database/schema-reference-
// snapshot.json). This module previously wrote 'low'/'medium', so EVERY non-'keep'
// row was silently rejected by the insert (writeAuditSink never throws, by design, so
// the rejection was invisible) -- a live measurement found ZERO worktree_reaper_
// classification rows had ever landed since the sink shipped. preserve_held_secret is
// mapped 'critical' pre-emptively for FR-1a's secret-scan hold verdict, which this
// module does not yet emit (lands in a later phase) but must already have a valid,
// tested mapping the moment it does.
const SEVERITY_BY_VERDICT = Object.freeze({
  keep: 'info',
  stage1_remove: 'warning',
  stage2_remove: 'warning',
  preserve_pushed: 'warning',
  reclaim_removed: 'warning',
  preserve_held_secret: 'critical',
});
const DEFAULT_SEVERITY = 'warning';

/** Pure: verdict -> a severity value valid under audit_log_severity_check. Never 'low'/'medium'. */
export function severityForVerdict(verdict) {
  return SEVERITY_BY_VERDICT[verdict] || DEFAULT_SEVERITY;
}

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
    severity: severityForVerdict(r.verdict),
    created_by: 'worktree-reaper',
  }));
}

/**
 * Best-effort durable write of pre-built audit_log rows. Never throws — a sink failure must
 * never break the reaper's primary function. Shared by writeAuditSink (classification records)
 * and the residue-class writers below (buildPruneCandidateRows/buildHuskShipPathRows), so every
 * caller gets the same never-throws contract and the same insert call site.
 * @param {object} supabase
 * @param {Array<object>} rows - already audit_log-shaped (see buildAuditRows et al.)
 * @param {{logger?: Function}} [ctx]
 * @returns {Promise<{ok: boolean, error?: string, inserted: number}>}
 */
export async function writeRows(supabase, rows, { logger = () => {} } = {}) {
  if (!supabase) return { ok: false, error: 'no_supabase_client', inserted: 0 };
  if (!rows || rows.length === 0) return { ok: true, inserted: 0 };
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

/**
 * Best-effort durable write. Never throws — a sink failure must never break the
 * reaper's primary function (classification, and removal under --execute).
 * @param {object} supabase
 * @param {Array<object>} records
 * @param {{runId: string, logger?: Function}} ctx
 * @returns {Promise<{ok: boolean, error?: string, inserted: number}>}
 */
export async function writeAuditSink(supabase, records, { runId, logger = () => {} } = {}) {
  return writeRows(supabase, buildAuditRows(records, { runId }), { logger });
}

/**
 * Pure mapping from parsePruneCandidates() output (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F) to
 * audit_log insert rows. A distinct event_type from EVENT_TYPE -- never "husk" (see the const's
 * own terminology note above).
 * @param {Array<{name: string, reason: string}>} candidates
 * @param {{runId: string}} ctx
 * @returns {Array<object>}
 */
export function buildPruneCandidateRows(candidates, { runId }) {
  return (candidates || []).map((c) => ({
    event_type: EVENT_TYPE_PRUNE_CANDIDATE,
    entity_type: 'worktree',
    entity_id: c.name,
    metadata: { run_id: runId, name: c.name, reason: c.reason },
    severity: DEFAULT_SEVERITY,
    created_by: 'worktree-reaper',
  }));
}

/**
 * Pure mapping from a ship-path worktree.husk_detected event (SD-LEO-ORCH-CAPA-DURABILITY-
 * AUDIT-001-F) to an audit_log insert row. This IS the repo's own "husk" definition
 * (deregistered from git, directory survives) -- see scripts/modules/shipping/
 * post-merge-worktree-cleanup.js.
 * @param {{wtPath: string, sdKey?: string, error?: string, timestamp?: string}} event
 * @param {{runId: string}} ctx
 * @returns {Array<object>}
 */
export function buildHuskShipPathRows(event, { runId }) {
  if (!event) return [];
  return [{
    event_type: EVENT_TYPE_HUSK_SHIP_PATH,
    entity_type: 'worktree',
    entity_id: event.wtPath,
    metadata: { run_id: runId, sd_key: event.sdKey || null, error: event.error || null, detected_at: event.timestamp || null },
    severity: DEFAULT_SEVERITY,
    created_by: 'post-merge-worktree-cleanup',
  }];
}

export default {
  buildAuditRows, writeAuditSink, writeRows, severityForVerdict, EVENT_TYPE,
  buildPruneCandidateRows, buildHuskShipPathRows, EVENT_TYPE_PRUNE_CANDIDATE, EVENT_TYPE_HUSK_SHIP_PATH,
};
