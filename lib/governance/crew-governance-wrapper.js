/**
 * CrewGovernanceWrapper - Anchors CrewAI to LEO Protocol
 *
 * OPERATION 'GOVERNED ENGINE' v5.1.0
 *
 * THE LAW: No crew execution without:
 * 1. venture_id (MANDATORY)
 * 2. prd_id (MANDATORY for production)
 * 3. sd_id (ENCOURAGED)
 * 4. Budget check before AND during execution
 *
 * This wrapper intercepts crew dispatch and enforces governance.
 *
 * @module CrewGovernanceWrapper
 * @version 5.1.0
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import { getSemanticDiffValidator, SemanticGateRejectionError } from './semantic-diff-validator.js';

// =============================================================================
// EXCEPTIONS
// =============================================================================

export class CrewGovernanceViolationError extends Error {
  constructor(code, message, context = {}) {
    super(`GOVERNANCE VIOLATION [${code}]: ${message}`);
    this.name = 'CrewGovernanceViolationError';
    this.code = code;
    this.context = context;
    this.isRetryable = false;
  }
}

export class BudgetExhaustedError extends Error {
  constructor(ventureId, budgetRemaining) {
    super(`BUDGET EXHAUSTED: Venture ${ventureId} has ${budgetRemaining} tokens remaining`);
    this.name = 'BudgetExhaustedError';
    this.ventureId = ventureId;
    this.budgetRemaining = budgetRemaining;
    this.isRetryable = false;
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const GOVERNANCE_CONFIG = {
  // Require prd_id for all crew executions (except meta-operations)
  requirePrdId: true,

  // Encourage sd_id (log warning if missing)
  encourageSdId: true,

  // Budget check interval during execution (ms)
  budgetCheckIntervalMs: 30000, // Every 30 seconds

  // Kill switch: halt if budget drops below this
  budgetKillThreshold: 0,

  // Warning threshold: log warning if budget drops below this percentage
  budgetWarningThreshold: 0.2, // 20%

  // Enable semantic validation of crew outputs
  enableSemanticValidation: true,

  // Meta-operations that don't require prd_id
  metaOperations: [
    'health_check',
    'status_report',
    'eva_scan',
    'system_diagnostic'
  ]
};

// =============================================================================
// CREW GOVERNANCE WRAPPER
// =============================================================================

export class CrewGovernanceWrapper {
  constructor(options = {}) {
    this.supabase = createSupabaseServiceClient();
    this.config = { ...GOVERNANCE_CONFIG, ...options };
    this.semanticValidator = getSemanticDiffValidator();
    this.activeExecutions = new Map(); // Track active executions for budget monitoring
  }

  /**
   * Wrap crew kickoff with governance enforcement
   *
   * @param {Function} crewKickoffFn - The original crew kickoff function
   * @param {Object} context - Execution context
   * @param {string} context.flowId - CrewAI flow ID
   * @param {string} context.ventureId - MANDATORY: Venture ID
   * @param {string} context.prdId - PRD ID (required unless meta-operation)
   * @param {string} context.sdId - Strategic Directive ID (encouraged)
   * @param {string} context.operationType - Operation type (for meta-operations)
   * @param {string} context.vertical - Venture vertical
   * @returns {Promise<Object>} Crew execution result
   */
  async wrapKickoff(crewKickoffFn, context) {
    const executionId = crypto.randomUUID();
    const startTime = Date.now();

    console.log(`[GOVERNANCE] Starting governed crew execution ${executionId}`);

    try {
      // ==== PHASE 1: PRE-EXECUTION VALIDATION ====

      // 1.1 Validate venture_id (MANDATORY)
      if (!context.ventureId) {
        throw new CrewGovernanceViolationError(
          'VENTURE_MISSING',
          'venture_id is MANDATORY for crew execution (GOVERNED-ENGINE-v5.1.0)',
          { executionId }
        );
      }

      // 1.2 Validate prd_id (required unless meta-operation)
      const isMetaOperation = this.config.metaOperations.includes(context.operationType);
      if (this.config.requirePrdId && !context.prdId && !isMetaOperation) {
        throw new CrewGovernanceViolationError(
          'PRD_MISSING',
          'prd_id is REQUIRED for crew execution (GOVERNED-ENGINE-v5.1.0)',
          { executionId, ventureId: context.ventureId }
        );
      }

      // 1.3 Encourage sd_id (log warning if missing)
      if (this.config.encourageSdId && !context.sdId) {
        console.warn(`[GOVERNANCE] WARNING: sd_id not provided for execution ${executionId}. Traceability limited.`);
      }

      // 1.4 Validate budget via database function
      const budgetValidation = await this._validateBudget(context.flowId, context.ventureId, context.prdId, context.sdId);
      if (!budgetValidation.valid) {
        if (budgetValidation.errorCode === 'BUDGET_EXHAUSTED') {
          throw new BudgetExhaustedError(context.ventureId, budgetValidation.budgetRemaining);
        }
        throw new CrewGovernanceViolationError(
          budgetValidation.errorCode,
          budgetValidation.errorMessage,
          { executionId, ventureId: context.ventureId }
        );
      }

      console.log(`[GOVERNANCE] Pre-execution validation passed. Budget: ${budgetValidation.budgetRemaining} tokens`);

      // 1.5 Record execution start
      await this._recordExecutionStart(executionId, context, budgetValidation);

      // ==== PHASE 2: EXECUTION WITH BUDGET MONITORING ====

      // Start budget monitoring interval
      const budgetMonitor = this._startBudgetMonitor(executionId, context);
      this.activeExecutions.set(executionId, { context, budgetMonitor, startTime });

      let result;
      try {
        // Execute the wrapped crew kickoff
        result = await crewKickoffFn();
      } finally {
        // Stop budget monitoring
        this._stopBudgetMonitor(executionId);
        this.activeExecutions.delete(executionId);
      }

      // ==== PHASE 3: POST-EXECUTION VALIDATION ====

      // 3.1 Semantic validation of output
      if (this.config.enableSemanticValidation) {
        console.log('[GOVERNANCE] Validating crew output with 60/40 Truth Law');
        await this.semanticValidator.validate(result, {
          ventureId: context.ventureId,
          prdId: context.prdId,
          sdId: context.sdId,
          vertical: context.vertical,
          executionId
        });
      }

      // 3.2 Record successful execution
      const executionTime = Date.now() - startTime;
      await this._recordExecutionComplete(executionId, result, executionTime);

      console.log(`[GOVERNANCE] Crew execution ${executionId} completed successfully in ${executionTime}ms`);

      return {
        success: true,
        executionId,
        result,
        executionTimeMs: executionTime,
        governance: {
          ventureId: context.ventureId,
          prdId: context.prdId,
          sdId: context.sdId,
          budgetConsumed: await this._getBudgetConsumed(executionId)
        }
      };

    } catch (error) {
      // Record failed execution
      const executionTime = Date.now() - startTime;
      await this._recordExecutionFailed(executionId, error, executionTime);

      // Re-throw governance errors
      if (error instanceof CrewGovernanceViolationError ||
          error instanceof BudgetExhaustedError ||
          error instanceof SemanticGateRejectionError) {
        throw error;
      }

      // Wrap other errors
      console.error(`[GOVERNANCE] Crew execution ${executionId} failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate budget using database function
   */
  async _validateBudget(flowId, ventureId, prdId, sdId) {
    try {
      const { data, error } = await this.supabase
        .rpc('fn_validate_crew_kickoff', {
          p_flow_id: flowId || '00000000-0000-0000-0000-000000000000',
          p_venture_id: ventureId,
          p_prd_id: prdId || null,
          p_sd_id: sdId || null
        });

      if (error) {
        console.error(`[GOVERNANCE] Budget validation error: ${error.message}`);
        return {
          valid: false,
          errorCode: 'VALIDATION_ERROR',
          errorMessage: error.message
        };
      }

      const result = data[0] || {};
      return {
        valid: result.valid,
        errorCode: result.error_code,
        errorMessage: result.error_message,
        budgetRemaining: result.budget_remaining,
        budgetLimit: result.budget_limit
      };
    } catch (err) {
      console.error(`[GOVERNANCE] Budget validation exception: ${err.message}`);
      return {
        valid: false,
        errorCode: 'VALIDATION_EXCEPTION',
        errorMessage: err.message
      };
    }
  }

  /**
   * Start periodic budget monitoring during execution
   */
  _startBudgetMonitor(executionId, context) {
    return setInterval(async () => {
      try {
        const budget = await this._checkCurrentBudget(context.ventureId);

        if (budget.remaining <= this.config.budgetKillThreshold) {
          console.error(`[GOVERNANCE] KILL SWITCH: Budget exhausted during execution ${executionId}`);
          // Mark execution as killed by budget
          await this._markKilledByBudget(executionId);
          // Note: The actual killing would need to be handled by the crew framework
          // This logs the event for audit purposes
        } else if (budget.remaining / budget.allocated < this.config.budgetWarningThreshold) {
          console.warn(`[GOVERNANCE] WARNING: Budget at ${((budget.remaining / budget.allocated) * 100).toFixed(1)}% during execution ${executionId}`);
        }
      } catch (err) {
        console.error(`[GOVERNANCE] Budget monitor error: ${err.message}`);
      }
    }, this.config.budgetCheckIntervalMs);
  }

  /**
   * Stop budget monitoring
   */
  _stopBudgetMonitor(executionId) {
    const execution = this.activeExecutions.get(executionId);
    if (execution?.budgetMonitor) {
      clearInterval(execution.budgetMonitor);
    }
  }

  /**
   * Check current budget for venture
   */
  async _checkCurrentBudget(ventureId) {
    const { data, error } = await this.supabase
      .from('venture_token_budgets')
      .select('budget_remaining, budget_allocated')
      .eq('venture_id', ventureId)
      .single();

    if (error || !data) {
      // Fallback to venture_phase_budgets
      const { data: phaseBudget } = await this.supabase
        .from('venture_phase_budgets')
        .select('budget_remaining, budget_allocated')
        .eq('venture_id', ventureId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (phaseBudget) {
        return {
          remaining: phaseBudget.budget_remaining,
          allocated: phaseBudget.budget_allocated
        };
      }

      return { remaining: 0, allocated: 0 };
    }

    return {
      remaining: data.budget_remaining,
      allocated: data.budget_allocated
    };
  }

  /**
   * Record execution start
   */
  async _recordExecutionStart(executionId, context, budgetValidation) {
    await this.supabase
      .from('crewai_flow_executions')
      .insert({
        id: executionId,
        flow_id: context.flowId || null,
        venture_id: context.ventureId,
        prd_id: context.prdId || null,
        sd_id: context.sdId || null,
        status: 'running',
        budget_limit: budgetValidation.budgetRemaining,
        started_at: new Date().toISOString()
      })
      .then(({ error }) => {
        if (error) console.error(`[GOVERNANCE] Failed to record execution start: ${error.message}`);
      });
  }

  /**
   * Record execution complete
   */
  async _recordExecutionComplete(executionId, result, executionTime) {
    await this.supabase
      .from('crewai_flow_executions')
      .update({
        status: 'completed',
        result: typeof result === 'string' ? { output: result } : result,
        completed_at: new Date().toISOString()
      })
      .eq('id', executionId)
      .then(({ error }) => {
        if (error) console.error(`[GOVERNANCE] Failed to record execution complete: ${error.message}`);
      });
  }

  /**
   * Record execution failed
   */
  async _recordExecutionFailed(executionId, error, executionTime) {
    await this.supabase
      .from('crewai_flow_executions')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', executionId)
      .then(({ error: dbError }) => {
        if (dbError) console.error(`[GOVERNANCE] Failed to record execution failed: ${dbError.message}`);
      });
  }

  /**
   * Mark execution as killed by budget
   */
  async _markKilledByBudget(executionId) {
    await this.supabase
      .from('crewai_flow_executions')
      .update({
        killed_by_budget: true,
        status: 'killed',
        completed_at: new Date().toISOString()
      })
      .eq('id', executionId)
      .then(({ error }) => {
        if (error) console.error(`[GOVERNANCE] Failed to mark execution killed: ${error.message}`);
      });
  }

  /**
   * Get budget consumed by execution
   */
  async _getBudgetConsumed(executionId) {
    const { data } = await this.supabase
      .from('crewai_flow_executions')
      .select('budget_consumed')
      .eq('id', executionId)
      .single();

    return data?.budget_consumed || 0;
  }

  /**
   * Static helper to check budget before crew kickoff
   * Can be used without full wrapper for quick validation
   */
  static async checkBudgetOrThrow(ventureId) {
    const supabase = createSupabaseServiceClient();

    const { data } = await supabase
      .from('venture_token_budgets')
      .select('budget_remaining, budget_allocated')
      .eq('venture_id', ventureId)
      .single();

    if (!data) {
      // Fallback to venture_phase_budgets
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
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

let wrapperInstance = null;

/**
 * Get singleton CrewGovernanceWrapper instance
 */
export function getCrewGovernanceWrapper(options = {}) {
  if (!wrapperInstance) {
    wrapperInstance = new CrewGovernanceWrapper(options);
  }
  return wrapperInstance;
}

export default {
  CrewGovernanceWrapper,
  getCrewGovernanceWrapper,
  CrewGovernanceViolationError,
  BudgetExhaustedError
};
