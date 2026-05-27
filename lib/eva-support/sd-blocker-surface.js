/**
 * SD blocker surface for EVA Support Phase 3.
 *
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-3 + TS-2.
 *
 * Detects active SDs that are blocked. Two blocker classes:
 *
 *   (a) Handoff-blocked: at least one unresolved sd_phase_handoffs row with
 *       status IN (rejected, failed, blocked) and resolved_at IS NULL.
 *       Query predicates match idx_sd_phase_handoffs_unresolved partial-index
 *       VERBATIM so the planner uses the covering index (DATABASE deep review
 *       evidence row 64396c27).
 *
 *   (b) Dependency-blocked: SD has parent_sd_id and that parent is NOT in
 *       EXEC / EXEC_COMPLETE / COMPLETED phase (parent must reach EXEC before
 *       any child can activate; pattern from drain-orchestrator.mjs L106-119).
 *
 * Returns one blocker string per SD, ordered by priority (critical first)
 * then progress (most-progressed first — closer to unblock).
 *
 * Read-only. Gated by the same EVA_SD_READER_ENABLED flag as sd-reader (the
 * flag check delegates: if sd-reader returns flag_enabled=false, we short-
 * circuit and return [] without further DB reads). T1 + T7 boundary
 * invariants apply identically here.
 *
 * @module lib/eva-support/sd-blocker-surface
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import { getActiveSDs } from './sd-reader.js';

const SD_TABLE = 'strategic_directives_v2';
const HANDOFFS_TABLE = 'sd_phase_handoffs';

// Status values that idx_sd_phase_handoffs_unresolved indexes (partial index).
// MUST match the partial-index WHERE clause verbatim to hit the covering index.
const BLOCKED_HANDOFF_STATUSES = Object.freeze(['rejected', 'failed', 'blocked']);

// Phase values considered "parent is sufficient for child activation".
// Matches drain-orchestrator.mjs::loadQueue() L118.
const PARENT_OK_PHASES = Object.freeze(['EXEC', 'EXEC_COMPLETE', 'COMPLETED']);
const PARENT_OK_STATUSES = Object.freeze(['completed']);

const ALLOWED_SD_COLUMNS = Object.freeze([
  'id',
  'sd_key',
  'title',
  'status',
  'current_phase',
  'priority',
  'progress',
  'parent_sd_id',
  'target_application',
]);

/**
 * Get blocked active SDs.
 *
 * @param {Object} [opts]
 * @param {string} [opts.targetApplication] - filter to a single target_application.
 * @param {number} [opts.limit=10] - max blocker entries to return.
 * @param {Object} [opts.client] - Supabase client override (testing).
 * @param {string} [opts.eva_invocation_id] - correlation id.
 * @returns {Promise<{ blockers: Array<{sd_key, blocker_reason, parent_sd_key, latest_handoff_status?}>, flag_enabled: boolean }>}
 */
export async function getBlockedSDs(opts = {}) {
  const { targetApplication, limit = 10, client, eva_invocation_id } = opts;

  // Reuse sd-reader's flag-check + audit-row behavior. If flag is OFF,
  // sd-reader writes the reader_disabled audit row and we return [] here
  // without writing a second row (audit-economy).
  //
  // Composability hook: callers (e.g. dispatcher middleware in CP-4) that have
  // already invoked sd-reader can pass _activeSDsOverride + _flagEnabledOverride
  // to avoid double-fetch + double-audit. When BOTH are provided we skip the
  // internal sd-reader call entirely.
  let flagCheck;
  if (opts._activeSDsOverride !== undefined && opts._flagEnabledOverride !== undefined) {
    flagCheck = { sds: opts._activeSDsOverride, flag_enabled: opts._flagEnabledOverride, audit_row_id: null };
  } else {
    flagCheck = await getActiveSDs({ targetApplication, limit: 100, client, eva_invocation_id });
  }

  if (!flagCheck.flag_enabled) {
    return { blockers: [], flag_enabled: false };
  }
  if (flagCheck.sds.length === 0) {
    return { blockers: [], flag_enabled: true };
  }

  const supabase = client ?? createSupabaseServiceClient();

  // sd-reader returns the 7-column projection. We need id + parent_sd_id, so
  // re-query for the columns we need. (Could batch in one call, but keeping
  // sd-reader's allowlist tight per FR-1.)
  const sdKeys = flagCheck.sds.map((s) => s.sd_key);

  const { data: enrichedSDs, error: sdErr } = await supabase
    .from(SD_TABLE)
    .select(ALLOWED_SD_COLUMNS.join(','))
    .in('sd_key', sdKeys);

  if (sdErr || !enrichedSDs?.length) {
    return { blockers: [], flag_enabled: true };
  }

  // (a) Handoff-blocked: query the partial index with EXACT predicates.
  const sdIdToRow = new Map(enrichedSDs.map((sd) => [sd.id, sd]));
  const { data: blockerHandoffs, error: hErr } = await supabase
    .from(HANDOFFS_TABLE)
    .select('sd_id, from_phase, to_phase, status, created_at, rejection_reason')
    .in('sd_id', enrichedSDs.map((s) => s.id))
    .is('resolved_at', null) // exact partial-index predicate
    .in('status', BLOCKED_HANDOFF_STATUSES) // exact partial-index predicate
    .order('created_at', { ascending: false });

  const handoffBlockedBy = new Map(); // sd_id → most-recent blocker handoff
  if (!hErr && blockerHandoffs) {
    for (const ho of blockerHandoffs) {
      // Most-recent first; only keep the latest per sd_id.
      if (!handoffBlockedBy.has(ho.sd_id)) handoffBlockedBy.set(ho.sd_id, ho);
    }
  }

  // (b) Dependency-blocked: for SDs with parent_sd_id, check parent phase/status.
  // Orchestrator parents (sd_type='orchestrator') are ALWAYS considered OK because
  // children of orchestrators activate independent of the orchestrator's own phase
  // (CLAUDE_CORE.md "Parent-Child SD Hierarchy" — orchestrator-completion-hook
  // mediates orchestrator completion, not child activation). Non-orchestrator parents
  // must reach EXEC / EXEC_COMPLETE / COMPLETED before children activate (drain-
  // orchestrator parity).
  const parentIds = [...new Set(enrichedSDs.filter((s) => s.parent_sd_id).map((s) => s.parent_sd_id))];
  let parentMap = new Map();
  if (parentIds.length > 0) {
    const { data: parents, error: pErr } = await supabase
      .from(SD_TABLE)
      .select('id, sd_key, current_phase, status, sd_type')
      .in('id', parentIds);
    if (!pErr && parents) {
      for (const p of parents) parentMap.set(p.id, p);
    }
  }

  function isParentOK(parentRow) {
    if (!parentRow) return false;
    if (parentRow.sd_type === 'orchestrator') return true; // orchestrator children activate independently
    if (PARENT_OK_PHASES.includes(parentRow.current_phase)) return true;
    if (PARENT_OK_STATUSES.includes(parentRow.status)) return true;
    return false;
  }

  // Build blocker entries.
  const blockers = [];
  for (const sd of enrichedSDs) {
    const reasons = [];
    let latestHandoffStatus = null;

    const blocker = handoffBlockedBy.get(sd.id);
    if (blocker) {
      const reasonText = blocker.rejection_reason
        ? `latest ${blocker.from_phase}→${blocker.to_phase} handoff ${blocker.status}: ${String(blocker.rejection_reason).slice(0, 200)}`
        : `latest ${blocker.from_phase}→${blocker.to_phase} handoff ${blocker.status}`;
      reasons.push(reasonText);
      latestHandoffStatus = blocker.status;
    }

    if (sd.parent_sd_id) {
      const parent = parentMap.get(sd.parent_sd_id);
      if (!isParentOK(parent)) {
        const parentKey = parent?.sd_key ?? `<parent id ${sd.parent_sd_id}>`;
        const parentPhase = parent?.current_phase ?? '<unknown phase>';
        const parentStatus = parent?.status ?? '<unknown status>';
        reasons.push(`parent ${parentKey} not in EXEC (phase=${parentPhase}, status=${parentStatus})`);
      }
    }

    if (reasons.length === 0) continue;

    blockers.push({
      sd_key: sd.sd_key,
      sd_title: sd.title,
      priority: sd.priority,
      progress: sd.progress,
      target_application: sd.target_application,
      parent_sd_key: sd.parent_sd_id ? parentMap.get(sd.parent_sd_id)?.sd_key ?? null : null,
      latest_handoff_status: latestHandoffStatus,
      blocker_reason: reasons.join('; '),
    });
  }

  // Sort: critical priority first, then most-progressed.
  const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  blockers.sort((a, b) => {
    const pa = priorityRank[a.priority] ?? 0;
    const pb = priorityRank[b.priority] ?? 0;
    if (pa !== pb) return pb - pa;
    return (b.progress ?? 0) - (a.progress ?? 0);
  });

  return {
    blockers: blockers.slice(0, limit),
    flag_enabled: true,
  };
}

export const __testHooks = Object.freeze({
  BLOCKED_HANDOFF_STATUSES,
  PARENT_OK_PHASES,
  PARENT_OK_STATUSES,
  ALLOWED_SD_COLUMNS,
});
