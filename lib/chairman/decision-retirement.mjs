/**
 * lib/chairman/decision-retirement.mjs — arm-aware retirement planning.
 * SD-FDBK-INFRA-DECISION-QUEUE-RETIREMENT-001, FR-1.
 *
 * PURE PLANNER, SEPARATE WRITER. planRetirement() decides; applyRetirement() writes. The split is
 * the point: "absence of authority blocks retirement" (FR-3) is only structural if the decision is
 * a value you can assert on rather than a branch buried in a DB call.
 *
 * ===== WHY RETIREMENT IS PER-ARM =====
 * chairman_pending_decisions is a SEVEN-ARM UNION (20260611_chairman_decision_queue.sql:59-244), not
 * a view over one table. Arm 4 is chairman_decisions, arm 5 is feedback, arm 6 is leo_feature_flags,
 * and the "pending" predicate is synthesised per arm at :296. So there is no single column to write.
 * A retirement built against one table would silently cover a third of the queue.
 *
 * ===== THE STATUS VOCABULARY WAS READ, NOT INVENTED =====
 * The precedent this SD originally cited (qf-20260725-450) writes status='cancelled' to
 * chairman_decisions, whose status is plain text with NO CHECK. Copying that to arm 5 dies at
 * runtime with 23514, because feedback.status is governed by feedback_status_check, whose permitted
 * set is exactly: new, triaged, in_progress, resolved, wont_fix, duplicate, invalid, backlog,
 * shipped (database/migrations/20260131_feedback_resolution_enforcement.sql:150-165). There is no
 * 'retired' or 'held' term.
 *
 * Rather than add one — DDL, and CREATE OR REPLACE is chairman-gated — two existing values already
 * carry the needed meaning WITHOUT asserting a decision the chairman never made (TR-3):
 *   SUPERSEDED -> 'duplicate'  a newer instance replaced this one
 *   HELD       -> 'backlog'    parked under a standing disposition, not decided
 * 'resolved' and 'wont_fix' are deliberately NOT used: both assert an outcome the chairman did not
 * reach, which is the failure this SD exists to remove.
 *
 * ===== ARM 6 CANNOT BE RETIRED FROM JS, AND SAYS SO =====
 * Arm 6 projects leo_feature_flags through a predicate (is_enabled=false AND
 * lifecycle_state='draft' AND created_at < now()-7d). Exiting it requires either mutating the flag —
 * which re-asserts the KILL disposition the 2026-07-12 ruling reverted, forbidden by TR-3 — or
 * changing the view, which is CREATE OR REPLACE and therefore TIER-2 chairman-gated
 * (scripts/lib/migration-tier-classifier.mjs:323). The planner returns an explicit 'gated' verdict
 * rather than silently skipping, so a caller cannot mistake "cannot" for "nothing to do".
 */

import { retirementAuthority } from './decision-disposition.mjs';

/** feedback.status values permitted by feedback_status_check. Read from the migration, not guessed. */
export const FEEDBACK_STATUS = Object.freeze({
  SUPERSEDED: 'duplicate',
  HELD: 'backlog'
});

/** chairman_decisions.status is plain text with no CHECK, so the honest term is available there. */
export const DECISION_STATUS = Object.freeze({
  SUPERSEDED: 'superseded',
  HELD: 'held'
});

/** Which source table backs each arm of the union. */
export function armOf(row) {
  switch (row?.decision_type) {
    case 'chairman_approval': return 'arm4';
    case 'flag_review': return 'arm5';
    case 'flag_enablement': return 'arm6';
    default: return 'unknown';
  }
}

/**
 * Decide whether and how to retire a row. PURE.
 *
 * @returns {null | {verdict:'gated'|'retire', arm, table, id, patch, citation, reason}}
 *   null    — no authority; retirement is BLOCKED, never defaulted
 *   'gated' — the arm cannot be retired without chairman-gated DDL
 */
export function planRetirement(row, dispositions, { disposition = 'held' } = {}) {
  const auth = retirementAuthority(row, dispositions);
  // FR-3: absence of authority BLOCKS retirement. Returning null rather than a permissive object
  // forces every caller to handle it — a truthy default here would retire the whole queue.
  if (!auth) return null;

  const arm = armOf(row);
  if (arm === 'arm6') {
    return {
      verdict: 'gated', arm, table: 'leo_feature_flags', id: row.id, patch: null, citation: auth,
      reason: 'arm 6 exits only via the view predicate (CREATE OR REPLACE => TIER-2 chairman-gated) ' +
        'or by mutating the flag, which would re-assert the reverted KILL disposition'
    };
  }
  if (arm === 'unknown') return null;

  const superseded = disposition === 'superseded';
  const table = arm === 'arm4' ? 'chairman_decisions' : 'feedback';
  const status = arm === 'arm4'
    ? (superseded ? DECISION_STATUS.SUPERSEDED : DECISION_STATUS.HELD)
    : (superseded ? FEEDBACK_STATUS.SUPERSEDED : FEEDBACK_STATUS.HELD);

  return {
    verdict: 'retire', arm, table, id: row.id, citation: auth, reason: null,
    patch: {
      status,
      // The citation travels WITH the write. A retirement whose basis lives only in a commit
      // message is the unattributable stamp this SD removes.
      retirement_basis: {
        cited_record: auth.citedRecord,
        decided_by: auth.decidedBy,
        decided_at: auth.decidedAt,
        disposition: superseded ? 'superseded' : 'held'
      }
    }
  };
}

/**
 * Apply a plan. IDEMPOTENT BY CONSTRUCTION (TR-9): the update is filtered on the row still being
 * pending, so a second call matches nothing and cannot move a timestamp. The live defect this
 * guards against is arm 5's writer setting resolved_at: new Date() unconditionally
 * (scripts/chairman-decisions.mjs:76), which silently shifts the disposition time on every re-run.
 *
 * Deliberately does NOT write resolved_at: retirement is not resolution.
 */
export async function applyRetirement(db, plan) {
  if (!plan || plan.verdict !== 'retire') return { wrote: false, reason: plan?.reason || 'no_authority' };
  // THE FENCE IS "not already retired", NOT "status = pending".
  // Arm 4's chairman_decisions does use status='pending', but arm 5's feedback DOES NOT — its live
  // values are new/resolved/backlog/duplicate/wont_fix/triaged/invalid/in_progress, and "pending" is
  // synthesised by the view (:181), not stored. Fencing on 'pending' would match zero feedback rows
  // and make arm-5 retirement a silent no-op that still reported success.
  const { data, error } = await db.from(plan.table)
    .update(plan.patch)
    .eq('id', plan.id)
    .neq('status', plan.patch.status)   // idempotency: a second call matches nothing
    .select('id');
  if (error) return { wrote: false, error: error.message };
  return { wrote: (data || []).length > 0, id: plan.id, citation: plan.citation };
}
