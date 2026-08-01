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

/**
 * WHERE THE CITATION IS STORED — and why it is NOT a `retirement_basis` column.
 *
 * The first version of this module wrote patch.retirement_basis. THAT COLUMN EXISTS ON NEITHER
 * TABLE: an explicit select returns 42703 on both feedback and chairman_decisions, and no migration
 * adds it. Every applyRetirement() call would have failed at runtime. It was latent only because
 * nothing calls this module yet, and it survived the unit suite because a hand-written fake accepts
 * any patch object — A FAKE THAT CANNOT REJECT AN UNKNOWN COLUMN CANNOT WITNESS A MISSING ONE.
 *
 * Adding the column is DDL and therefore chairman-gated, so the citation is nested inside a jsonb
 * column that already exists on each table. Verified present and nullable on both.
 */
export const CITATION_COLUMN = Object.freeze({ chairman_decisions: 'brief_data', feedback: 'metadata' });

/**
 * WHICH STATUSES MAY BE RETIRED, PER ARM. Retirement must never overwrite a disposition a human or
 * an upstream process already reached — that is the exact "assert a decision the chairman did not
 * make" failure this SD exists to remove, and the previous uniform `.neq(status, target)` fence
 * committed it.
 *
 * MEASURED against the 15 live deferral targets: 6 resolve to feedback (3 of them status='resolved')
 * and 7 to chairman_decisions (3 of them status='approved'). Under the old fence ALL 13 matched, so
 * retirement would have overwritten three resolved feedback rows AND ERASED THREE CHAIRMAN
 * APPROVALS. chairman_decisions.status has no CHECK constraint to stop it.
 *
 * The sets are per-arm because the arms have genuinely different vocabularies — the whole reason
 * FR-1 is arm-aware. chairman_decisions is undecided ONLY at 'pending' (approved=248, cancelled=358,
 * rejected=7 are all decisions already made). feedback has no 'pending' at all; its live statuses
 * are new/triaged/in_progress/backlog (open) and resolved/wont_fix/duplicate/invalid/shipped (done).
 */
export const RETIRABLE_STATUSES = Object.freeze({
  chairman_decisions: Object.freeze(['pending']),
  feedback: Object.freeze(['new', 'triaged', 'in_progress', 'backlog'])
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
    // The citation travels WITH the write. A retirement whose basis lives only in a commit message
    // is the unattributable stamp this SD removes. It is nested into an EXISTING jsonb column
    // (see CITATION_COLUMN) because `retirement_basis` is not a column on either table.
    citationColumn: CITATION_COLUMN[table],
    retirementBasis: {
      cited_record: auth.citedRecord,
      decided_by: auth.decidedBy,
      decided_at: auth.decidedAt,
      disposition: superseded ? 'superseded' : 'held'
    },
    patch: { status }
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

  const retirable = RETIRABLE_STATUSES[plan.table];
  const col = plan.citationColumn;
  if (!retirable || !col) return { wrote: false, reason: 'unknown_table', table: plan.table };

  // READ FIRST, for two reasons that both matter.
  // (1) The citation nests into an EXISTING jsonb column, and a Supabase update REPLACES that column
  //     wholesale — writing it blind would destroy whatever else lives there.
  // (2) EVERY zero-row outcome must be DISTINGUISHABLE. The previous version returned
  //     {wrote:false} for "already retired", "row absent" AND (with the error branch mutated away)
  //     a failed write — so a retirement that never happened was indistinguishable from correct
  //     idempotency. Silence is the failure mode this SD exists to remove; it may not live here.
  const { data: cur, error: readErr } = await db.from(plan.table)
    .select(`id, status, ${col}`)
    .eq('id', plan.id);
  if (readErr) return { wrote: false, reason: 'db_error', error: readErr.message };
  if (!cur || cur.length === 0) return { wrote: false, reason: 'not_found', id: plan.id };

  const row = cur[0];
  if (row.status === plan.patch.status) return { wrote: false, reason: 'already_retired', status: row.status };
  // REFUSE rather than overwrite. Measured: this is what stops retirement erasing three live
  // chairman approvals and overwriting three resolved feedback rows.
  if (!retirable.includes(row.status)) {
    return { wrote: false, reason: 'refused_terminal_status', status: row.status, id: plan.id };
  }

  const merged = { ...(row[col] && typeof row[col] === 'object' ? row[col] : {}), retirement_basis: plan.retirementBasis };

  // The fence is REPEATED on the write so a concurrent decision between the read and the write
  // cannot slip through: status must still be retirable and still not be the target value.
  const { data, error } = await db.from(plan.table)
    .update({ ...plan.patch, [col]: merged })
    .eq('id', plan.id)
    .in('status', retirable)
    .neq('status', plan.patch.status)
    .select('id');
  if (error) return { wrote: false, reason: 'db_error', error: error.message };
  if (!data || data.length === 0) return { wrote: false, reason: 'raced', id: plan.id };
  return { wrote: true, id: plan.id, citation: plan.citation, citationColumn: col };
}
