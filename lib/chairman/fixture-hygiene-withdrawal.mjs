/**
 * lib/chairman/fixture-hygiene-withdrawal.mjs — a STRUCTURALLY DISTINCT withdrawal path for a
 * chairman_decisions row that is stuck for a hygiene reason (its linked venture is a known
 * test/demo fixture), never for a merits reason.
 * SD-LEO-INFRA-CHAIRMAN-DECISION-VALUE-001 FR-4.
 *
 * WHY THIS EXISTS, NOT lib/chairman/decision-retirement.mjs's EXISTING PATH. That module's
 * planRetirement()/retirementAuthority() require a PRIOR recorded chairman deferral (a Map lookup
 * keyed on decidedBy + deferredAt) — correct for "the chairman looked at this and said park it",
 * wrong for a row that is a test artifact the chairman never should have seen at all. Widening
 * retirementAuthority() itself to also accept "the venture is fixture-flagged" would put a merits
 * gate and a hygiene gate behind the SAME predicate, so a caller reading retirementAuthority()'s
 * truthiness could no longer tell which kind of authority it is looking at — precisely the
 * conflation TR-3 forbids. This module is a SEPARATE planner with its own, narrower predicate; it
 * reuses ONLY the tested WRITER (applyRetirement) from decision-retirement.mjs, unmodified.
 *
 * THE PREDICATE, and why it is narrow on purpose:
 *   1. row.status === 'pending' — never touches an already-decided row.
 *   2. row.venture_id is set AND the linked venture has is_demo === true — the SAME predicate
 *      chairman_unified_decisions already uses to hide this exact row from the chairman's queue
 *      (verified live, 2026-09-07: chairman_pending_decisions -> chairman_unified_decisions ->
 *      chairman_all_decision_signals excludes any row whose venture matches
 *      COALESCE(ventures.is_demo,false)=true). A row the chairman was NEVER GOING TO SEE is safe
 *      to retire as hygiene — this is not a decision being taken away from him, it is removing an
 *      artifact he never had the opportunity to decide.
 *   3. armOf(row) resolves to a table this module can write to (arm4/chairman_decisions or
 *      arm5/feedback) — arm6 stays gated exactly as decision-retirement.mjs already documents.
 * A row failing ANY of these returns null — no authority, never a default retire.
 *
 * disposition is stamped 'fixture_hygiene_withdrawal' (not 'superseded'/'held') so an auditor
 * reading retirement_basis can distinguish this narrow, structural path from a chairman-authorised
 * one at a glance — never silently reusing an existing disposition label for a different kind of
 * authority.
 */
import { armOf, DECISION_STATUS, CITATION_COLUMN } from './decision-retirement.mjs';

/**
 * Pure. Decide whether `row` is eligible for fixture-hygiene withdrawal, and if so, build the
 * SAME plan shape lib/chairman/decision-retirement.mjs's applyRetirement() already knows how to
 * write — so this module never re-implements the write-side idempotency/status-fence logic that
 * module has already been hardened for.
 *
 * @param {{id:string, status?:string, decision_type?:string, venture_id?:string|null}} row
 * @param {{id?:string, is_demo?:boolean}|null|undefined} venture — the row's linked venture, or
 *   null/undefined if row.venture_id is null or the venture could not be read.
 * @param {{decidedBy: string, reason: string}} opts — REQUIRED. decidedBy is who invoked the
 *   withdrawal (never defaulted — an unattributed hygiene action is the same failure class this
 *   whole SD exists to remove); reason is the free-text hygiene justification, persisted verbatim.
 * @returns {null | object} null = no authority; otherwise a plan applyRetirement() can consume.
 */
export function planFixtureHygieneWithdrawal(row, venture, { decidedBy, reason } = {}) {
  if (!row?.id) return null;
  if (row.status !== 'pending') return null;
  if (!decidedBy || !reason) return null; // unattributed/unjustified: refuse, never default
  if (!row.venture_id || !venture || venture.is_demo !== true) return null;

  const arm = armOf(row);
  if (arm === 'arm6' || arm === 'unknown') return null;

  const table = arm === 'arm4' ? 'chairman_decisions' : 'feedback';
  const col = CITATION_COLUMN[table];
  // Mirrors decision-retirement.mjs's SUPERSEDED status choice per table: the row is genuinely
  // withdrawn (not parked), so 'cancelled'/'duplicate' are the correct terminal values — but this
  // module targets arm4 (chairman_decisions) only in practice today (the only live specimen,
  // d87a7018, is a 'review' row); arm5 support is carried for parity, not exercised yet.
  if (table === 'feedback') return null; // out of scope: feedback's 'duplicate' needs a referent this predicate does not supply

  return {
    verdict: 'retire',
    arm,
    table,
    id: row.id,
    citation: { decidedBy, decidedAt: new Date().toISOString(), basis: reason },
    reason: null,
    citationColumn: col,
    retirementBasis: {
      cited_record: null,
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
      disposition: 'fixture_hygiene_withdrawal',
      hygiene_reason: reason,
      fixture_venture_id: row.venture_id,
    },
    patch: { status: DECISION_STATUS.SUPERSEDED },
  };
}
