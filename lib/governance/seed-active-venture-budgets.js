/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-1.
 *
 * Seed venture_token_budgets and venture_phase_budgets for ACTIVE ventures only.
 *
 * Pre-fix state: both tables 0 rows (152 ventures: 88 active, 62 cancelled, 2 paused).
 * lib/governance/budget-check.js's checkBudgetOrThrow() throws NO_BUDGET_RECORD when a
 * venture has no row in venture_token_budgets (checked first) or venture_phase_budgets
 * (fallback) — a manufactured defect from the two tables simply never being seeded.
 *
 * DEDUCTION-WIRING STATUS (explicit, per this SD's scope): fn_deduct_budget_atomic has
 * ZERO JS/TS callers repo-wide as of this SD. Seeding these rows does NOT wire deduction —
 * it only satisfies the existence check that checkBudgetOrThrow()/budget-manager.js perform.
 * Budgets are therefore ADVISORY-UNTIL-WIRED: the row exists and budget_remaining will not
 * decrement on its own. Cancelled/paused ventures are deliberately left unseeded, so
 * NO_BUDGET_RECORD stays the correct signal for ventures that should never spend budget.
 *
 * Idempotent by construction: upserts on venture_id (venture_token_budgets) and
 * (venture_id, phase_name) (venture_phase_budgets) — never a plain insert, so re-running
 * this script never produces a duplicate-key error or double-counts an active venture.
 */

/** Default phase_name used for the baseline venture_phase_budgets seed row. */
export const DEFAULT_PHASE_NAME = 'GENERAL';

/**
 * Pure: given a list of ventures, return only the active ones' ids.
 * Exported separately so the filtering decision is unit-testable without a DB.
 */
export function selectActiveVentureIds(ventures) {
  return (ventures || [])
    .filter((v) => v && v.status === 'active')
    .map((v) => v.id);
}

/**
 * Build the upsert payload rows for venture_token_budgets, one per active venture id.
 * Relies on the table's own column DEFAULTs (budget_allocated/budget_remaining = 100000)
 * by supplying only venture_id — an explicit re-supply of the same defaults here would
 * drift silently if the migration's defaults ever change.
 */
export function buildTokenBudgetRows(activeVentureIds) {
  return activeVentureIds.map((venture_id) => ({ venture_id }));
}

/** Build the upsert payload rows for venture_phase_budgets, one per active venture id. */
export function buildPhaseBudgetRows(activeVentureIds, phaseName = DEFAULT_PHASE_NAME) {
  return activeVentureIds.map((venture_id) => ({ venture_id, phase_name: phaseName }));
}

/**
 * Seed both budget tables for active ventures. Injectable supabase client for testability.
 *
 * @param {Object} supabase
 * @returns {Promise<{activeVentureCount: number, tokenBudgetsUpserted: number, phaseBudgetsUpserted: number}>}
 */
export async function seedActiveVentureBudgets(supabase) {
  const { data: ventures, error: ventureErr } = await supabase
    .from('ventures')
    .select('id, status');
  if (ventureErr) throw new Error(`Failed to read ventures: ${ventureErr.message}`);

  const activeIds = selectActiveVentureIds(ventures);

  const tokenRows = buildTokenBudgetRows(activeIds);
  const { error: tokenErr } = await supabase
    .from('venture_token_budgets')
    .upsert(tokenRows, { onConflict: 'venture_id' });
  if (tokenErr) throw new Error(`Failed to upsert venture_token_budgets: ${tokenErr.message}`);

  const phaseRows = buildPhaseBudgetRows(activeIds);
  const { error: phaseErr } = await supabase
    .from('venture_phase_budgets')
    .upsert(phaseRows, { onConflict: 'venture_id,phase_name' });
  if (phaseErr) throw new Error(`Failed to upsert venture_phase_budgets: ${phaseErr.message}`);

  return {
    activeVentureCount: activeIds.length,
    tokenBudgetsUpserted: tokenRows.length,
    phaseBudgetsUpserted: phaseRows.length
  };
}
