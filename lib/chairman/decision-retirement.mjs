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
 * The read projection per arm, as a FROZEN LITERAL rather than a string built at call time.
 *
 * An earlier version built the projection by interpolating the citation column into the select
 * string at call time. The value was already derived from the frozen CITATION_COLUMN map, so it was
 * not injectable — but the review gate flags the interpolation PATTERN, and it is right to: a query
 * string assembled at runtime is only as safe as every future edit to whatever feeds it.
 * Eliminating the construction is cheaper than maintaining an argument for why one instance is fine.
 */
export const RETIREMENT_READ_SELECT = Object.freeze({
  chairman_decisions: 'id, status, brief_data',
  feedback: 'id, status, metadata'
});

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
export function planRetirement(row, dispositions, { disposition = 'held', supersededBy = null } = {}) {
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
  // An UNRECOGNISED arm is not "no authority" — the chairman may well have deferred it. The queue
  // emits SEVEN arms (escalation, two gate_decision arms, chairman_approval, flag_review,
  // flag_enablement, okr_acceptance) and armOf maps three. Returning bare null here made
  // applyRetirement report reason:'no_authority', which asserts the opposite of what happened.
  if (arm === 'unknown') {
    return {
      verdict: 'unsupported_arm', arm, table: null, id: row.id, patch: null, citation: auth,
      reason: `decision_type ${JSON.stringify(row?.decision_type)} has no retirement route; ` +
        'authority EXISTS for this row but no arm handles it'
    };
  }

  const superseded = disposition === 'superseded';
  const table = arm === 'arm4' ? 'chairman_decisions' : 'feedback';
  const status = arm === 'arm4'
    ? (superseded ? DECISION_STATUS.SUPERSEDED : DECISION_STATUS.HELD)
    : (superseded ? FEEDBACK_STATUS.SUPERSEDED : FEEDBACK_STATUS.HELD);

  // ===== SUPERSEDED ON THE FEEDBACK ARM REQUIRES A REFERENT, OR IT CANNOT BE WRITTEN AT ALL =====
  // feedback.status='duplicate' is governed by TWO live CHECK constraints, both of which demand a
  // referent: chk_duplicate_requires_reference (status <> 'duplicate' OR (duplicate_of_id IS NOT
  // NULL AND duplicate_of_id <> id)) and chk_feedback_terminal_resolution (WHEN 'duplicate' THEN
  // duplicate_of_id IS NOT NULL). All 70 live duplicate rows carry one, 70/70.
  //
  // The first version set status without duplicate_of_id, so EVERY superseded retirement on this
  // arm would have died with 23514 — the exact runtime death the header above warns about, and the
  // second instance of the retirement_basis class in this one module. It was missed because the
  // status ENUM was read at :150-165 of 20260131_feedback_resolution_enforcement.sql and the
  // invalidating constraint is at :235-240 OF THE SAME FILE. Reading the enum is not reading the
  // constraints that govern its values.
  //
  // REFUSING is the correct behaviour, not inventing a referent: "superseded" means a specific
  // newer instance replaced this one, and a supersession that cannot name the replacement is
  // exactly the unattributable stamp this SD exists to remove.
  if (superseded && table === 'feedback') {
    if (!supersededBy) {
      return {
        verdict: 'blocked', arm, table, id: row.id, patch: null, citation: auth,
        reason: 'superseded on the feedback arm requires supersededBy (the replacing row id): ' +
          'status=duplicate is CHECK-constrained to carry duplicate_of_id, and a supersession that ' +
          'cannot name its replacement must not be written'
      };
    }
    if (supersededBy === row.id) {
      return {
        verdict: 'blocked', arm, table, id: row.id, patch: null, citation: auth,
        reason: 'supersededBy equals the row id; chk_duplicate_requires_reference forbids ' +
          'duplicate_of_id = id (a row cannot supersede itself)'
      };
    }
  }

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
    // duplicate_of_id is REQUIRED alongside status='duplicate' (see the CHECK analysis above) and
    // must never be sent on any other path — chk_feedback_no_self_duplicate and the arm-4 table
    // have no such column/semantics.
    patch: (superseded && table === 'feedback')
      ? { status, duplicate_of_id: supersededBy }
      : { status }
  };
}

/**
 * Apply a plan. IDEMPOTENT BY CONSTRUCTION (TR-9): the update is filtered on the row still being
 * pending, so a second call matches nothing and cannot move a timestamp. The live defect this
 * guards against is arm 5's writer setting resolved_at: new Date() unconditionally (the
 * `resolveFeedback` writer in scripts/chairman-decisions.mjs), which silently shifts the disposition
 * time on every re-run. (Cited by FUNCTION, not line — the previous line citation was wrong.)
 *
 * Deliberately does NOT write resolved_at: retirement is not resolution.
 */
export async function applyRetirement(db, plan) {
  // A non-retire plan carries its OWN reason. Only a genuinely absent plan means "no authority" —
  // conflating them reported an unsupported arm as "the chairman never deferred this", which is the
  // opposite of what happened.
  if (!plan) return { wrote: false, reason: 'no_authority' };
  if (plan.verdict !== 'retire') return { wrote: false, verdict: plan.verdict, reason: plan.reason || 'not_retirable' };

  const retirable = RETIRABLE_STATUSES[plan.table];
  // DERIVED HERE, NOT READ FROM THE PLAN (DQR-SEC-09). `col` selects which jsonb column the citation
  // is written into and is used as a computed property key below. Taking it from a caller-supplied
  // object would let a malformed plan direct the write at a column of its choosing. Every plan is
  // built by planRetirement() today, so this is not reachable — but a guard that depends on its
  // input having been built correctly is not a guard.
  // (An earlier revision of this comment claimed `col` was interpolated into .select(). That was
  // true of the code it was written for and is no longer true of this code: the projection is now
  // the frozen RETIREMENT_READ_SELECT literal. Corrected rather than deleted, because a stale
  // justification tells the next editor the wrong thing about what constrains this line.)
  const col = CITATION_COLUMN[plan.table];
  if (!retirable || !col) return { wrote: false, reason: 'unknown_table', table: plan.table };

  // READ FIRST, for two reasons that both matter.
  // (1) The citation nests into an EXISTING jsonb column, and a Supabase update REPLACES that column
  //     wholesale — writing it blind would destroy whatever else lives there.
  // (2) EVERY zero-row outcome must be DISTINGUISHABLE. The previous version returned
  //     {wrote:false} for "already retired", "row absent" AND (with the error branch mutated away)
  //     a failed write — so a retirement that never happened was indistinguishable from correct
  //     idempotency. Silence is the failure mode this SD exists to remove; it may not live here.
  const { data: cur, error: readErr } = await db.from(plan.table)
    .select(RETIREMENT_READ_SELECT[plan.table])
    .eq('id', plan.id);
  if (readErr) return { wrote: false, reason: 'db_error', error: readErr.message };
  if (!cur || cur.length === 0) return { wrote: false, reason: 'not_found', id: plan.id };

  const row = cur[0];
  const existing = row[col];
  // A jsonb column that is not a plain object cannot be MERGED into — spreading an array yields
  // {"0":…,"1":…} (silently changing the column's shape) and a scalar/string falls to {} (silently
  // discarding the prior value). The read-first exists precisely so the write does not destroy what
  // is already there; for non-object JSON it would have done exactly that. Refuse instead.
  const existingIsMergeable = existing === null || existing === undefined
    || (typeof existing === 'object' && !Array.isArray(existing));
  if (!existingIsMergeable) {
    return {
      wrote: false, reason: 'citation_column_not_mergeable', id: plan.id, column: col,
      detail: `${plan.table}.${col} holds ${Array.isArray(existing) ? 'an array' : typeof existing} — ` +
        'merging would change its shape or discard it'
    };
  }

  // "ALREADY RETIRED" MUST MEAN RETIRED, NOT "HAPPENS TO SIT AT THAT STATUS".
  // Both feedback targets collide with statuses humans set independently: HELD is 'backlog' (which
  // is also in RETIRABLE_STATUSES.feedback, i.e. an OPEN state) and SUPERSEDED is 'duplicate'. A
  // triager who parked a row in backlog would otherwise get {wrote:false, reason:'already_retired'},
  // the caller would believe the retirement happened, and THE CITATION WOULD NEVER BE WRITTEN —
  // defeating this SD's core rule that the basis travels with the write. The citation column is
  // already in hand from the read, so consult it rather than inferring from status alone.
  if (row.status === plan.patch.status) {
    if (existing && typeof existing === 'object' && existing.retirement_basis) {
      return { wrote: false, reason: 'already_retired', status: row.status, id: plan.id };
    }
    // THE COLLISION BRANCH MUST NOT OUTRANK THE TERMINAL REFUSAL.
    // It exists for HELD ('backlog'), which is an OPEN status a triager also sets. But SUPERSEDED
    // ('duplicate') is TERMINAL, so a row already at 'duplicate' was marked so by someone else —
    // and writing a chairman retirement_basis onto it stamps an attribution for a retirement that
    // never happened. That is this SD's own defect class, reintroduced by the fix for it. Fall
    // through to the refusal below whenever the matched status is not a retirable one.
    if (!retirable.includes(row.status)) {
      return { wrote: false, reason: 'refused_terminal_status', status: row.status, id: plan.id };
    }
    // Status matches but nothing retired it. Record the basis WITHOUT re-asserting a status change
    // that already holds, so the attribution exists even though there is no transition to make.
    const merged = { ...(existing || {}), retirement_basis: plan.retirementBasis };
    const { data: cd, error: cErr } = await db.from(plan.table)
      .update({ [col]: merged }).eq('id', plan.id).select('id');
    if (cErr) return { wrote: false, reason: 'db_error', error: cErr.message };
    return {
      wrote: (cd || []).length > 0, reason: 'citation_recorded_status_already_matched',
      id: plan.id, citation: plan.citation, citationColumn: col, status: row.status
    };
  }

  // REFUSE rather than overwrite. Measured: this is what stops retirement erasing three live
  // chairman approvals and overwriting three resolved feedback rows.
  if (!retirable.includes(row.status)) {
    return { wrote: false, reason: 'refused_terminal_status', status: row.status, id: plan.id };
  }

  // KNOWN LOST-UPDATE WINDOW (DQR-SEC-08, accepted): this is a read-modify-write on a jsonb column,
  // so a concurrent writer touching a DIFFERENT key of the same column between the read above and
  // the write below loses its change. Accepted rather than fixed because the alternative is a
  // jsonb_set RPC (DDL, chairman-gated) and retirement is a rare, deliberate, single-actor act.
  // The STATUS transition is NOT exposed to this — that is fenced on the write. Revisit if
  // retirement is ever automated or batched.
  const merged = { ...(existing || {}), retirement_basis: plan.retirementBasis };

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
