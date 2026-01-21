/**
 * CEO Budget Manager
 * Handles budget checking, validation, and logging
 *
 * Extracted from venture-ceo-runtime.js for modularity
 * SD-LEO-REFACTOR-VENTURE-CEO-001
 */

import { BudgetExhaustedException, BudgetConfigurationException } from './exceptions.js';
import { BUDGET_THRESHOLDS } from './constants.js';

/**
 * Budget Manager class
 * Handles all budget-related operations for the CEO runtime
 */
export class BudgetManager {
  constructor(supabase, agentId, ventureId) {
    this.supabase = supabase;
    this.agentId = agentId;
    this.ventureId = ventureId;
  }

  /**
   * Check budget availability before operation
   * INDUSTRIAL-HARDENING-v2.9.0: Budget Enforcement
   *
   * @param {string} operationType - Type of operation (message_processing, prediction, etc.)
   * @param {number} estimatedCost - Estimated token cost
   * @throws {BudgetExhaustedException} If budget is depleted
   * @throws {BudgetConfigurationException} If budget config is invalid
   */
  async checkBudgetOrThrow(operationType, estimatedCost = 100) {
    // Fetch current budget status
    const { data: budgetData, error } = await this.supabase
      .from('agent_budgets')
      .select('daily_limit, daily_consumed, monthly_limit, monthly_consumed')
      .eq('agent_id', this.agentId)
      .single();

    if (error) {
      // No budget record - check if budgets are optional
      if (error.code === 'PGRST116') {
        console.log('   [BUDGET] No budget record - operating without limits');
        return;
      }
      throw new BudgetConfigurationException(`Budget fetch failed: ${error.message}`);
    }

    if (!budgetData) {
      console.log('   [BUDGET] No budget configuration - operating without limits');
      return;
    }

    // Check daily budget
    const dailyRemaining = budgetData.daily_limit - budgetData.daily_consumed;
    if (dailyRemaining < estimatedCost) {
      await this._logBudgetCheck(operationType, 'BLOCKED', {
        reason: 'daily_limit_exceeded',
        remaining: dailyRemaining,
        required: estimatedCost
      });
      throw new BudgetExhaustedException(
        `Daily budget exhausted. Remaining: ${dailyRemaining}, Required: ${estimatedCost}`,
        { daily_remaining: dailyRemaining, estimated_cost: estimatedCost }
      );
    }

    // Check monthly budget
    const monthlyRemaining = budgetData.monthly_limit - budgetData.monthly_consumed;
    if (monthlyRemaining < estimatedCost) {
      await this._logBudgetCheck(operationType, 'BLOCKED', {
        reason: 'monthly_limit_exceeded',
        remaining: monthlyRemaining,
        required: estimatedCost
      });
      throw new BudgetExhaustedException(
        `Monthly budget exhausted. Remaining: ${monthlyRemaining}, Required: ${estimatedCost}`,
        { monthly_remaining: monthlyRemaining, estimated_cost: estimatedCost }
      );
    }

    // Check for warning thresholds
    const dailyPercent = budgetData.daily_consumed / budgetData.daily_limit;
    const monthlyPercent = budgetData.monthly_consumed / budgetData.monthly_limit;

    if (dailyPercent > BUDGET_THRESHOLDS.CRITICAL_PERCENT) {
      console.warn(`   [BUDGET] CRITICAL: Daily budget at ${(dailyPercent * 100).toFixed(1)}%`);
    } else if (dailyPercent > BUDGET_THRESHOLDS.WARNING_PERCENT) {
      console.warn(`   [BUDGET] WARNING: Daily budget at ${(dailyPercent * 100).toFixed(1)}%`);
    }

    if (monthlyPercent > BUDGET_THRESHOLDS.CRITICAL_PERCENT) {
      console.warn(`   [BUDGET] CRITICAL: Monthly budget at ${(monthlyPercent * 100).toFixed(1)}%`);
    }

    await this._logBudgetCheck(operationType, 'ALLOWED', {
      daily_remaining: dailyRemaining,
      monthly_remaining: monthlyRemaining
    });
  }

  /**
   * Log budget check for audit trail
   * @private
   */
  async _logBudgetCheck(operationType, decision, details) {
    try {
      await this.supabase
        .from('agent_budget_logs')
        .insert({
          agent_id: this.agentId,
          venture_id: this.ventureId,
          operation_type: operationType,
          decision: decision,
          details: details,
          timestamp: new Date().toISOString()
        });
    } catch (err) {
      // Log failure shouldn't block operation
      console.warn(`   [BUDGET] Log failed: ${err.message}`);
    }
  }

  /**
   * Record token consumption after operation
   * @param {number} tokensUsed - Actual tokens consumed
   */
  async recordConsumption(tokensUsed) {
    try {
      await this.supabase.rpc('increment_agent_budget', {
        p_agent_id: this.agentId,
        p_tokens: tokensUsed
      });
    } catch (err) {
      console.warn(`   [BUDGET] Consumption recording failed: ${err.message}`);
    }
  }
}

// Export for direct function usage in runtime
export async function checkBudgetOrThrow(supabase, agentId, ventureId, operationType, estimatedCost) {
  const manager = new BudgetManager(supabase, agentId, ventureId);
  return manager.checkBudgetOrThrow(operationType, estimatedCost);
}
