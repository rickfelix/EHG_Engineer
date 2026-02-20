/**
 * Budget Check Utility
 *
 * Extracted from CrewGovernanceWrapper (SD-EHG-ORCH-FOUNDATION-CLEANUP-001-A).
 * Validates venture token budgets before operations.
 *
 * @module budget-check
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import { BudgetExhaustedError, CrewGovernanceViolationError } from '../exceptions/index.js';

/**
 * Check if venture has available budget, throw if exhausted.
 *
 * Checks venture_token_budgets first, falls back to venture_phase_budgets.
 *
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<{remaining: number, allocated: number}>}
 * @throws {CrewGovernanceViolationError} If no budget record found
 * @throws {BudgetExhaustedError} If budget is zero or negative
 */
export async function checkBudgetOrThrow(ventureId) {
  const supabase = createSupabaseServiceClient();

  const { data } = await supabase
    .from('venture_token_budgets')
    .select('budget_remaining, budget_allocated')
    .eq('venture_id', ventureId)
    .single();

  if (!data) {
    const { data: phaseBudget } = await supabase
      .from('venture_phase_budgets')
      .select('budget_remaining, budget_allocated')
      .eq('venture_id', ventureId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!phaseBudget) {
      throw new CrewGovernanceViolationError(
        'NO_BUDGET_RECORD',
        `No budget record found for venture ${ventureId}`,
        { ventureId }
      );
    }

    if (phaseBudget.budget_remaining <= 0) {
      throw new BudgetExhaustedError(ventureId, phaseBudget.budget_remaining);
    }

    return {
      remaining: phaseBudget.budget_remaining,
      allocated: phaseBudget.budget_allocated
    };
  }

  if (data.budget_remaining <= 0) {
    throw new BudgetExhaustedError(ventureId, data.budget_remaining);
  }

  return {
    remaining: data.budget_remaining,
    allocated: data.budget_allocated
  };
}
