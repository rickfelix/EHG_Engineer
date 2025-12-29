/**
 * VentureCEORuntime - Autonomous message processing loop for CEO agents
 *
 * SD-VISION-V2-005: Vision V2 Venture CEO Runtime & Factory
 * SD-CAPABILITY-WIRING: Wire agent capabilities from agent_registry at runtime
 * SD-HARDENING-V2-003: Strategic hardening for business hypothesis tracking
 * Spec Reference: docs/vision/specs/06-hierarchical-agent-architecture.md Section 9
 *
 * Runtime loop pattern:
 * 1. Claim message (fn_claim_next_message with FOR UPDATE SKIP LOCKED)
 * 2. Route to handler
 * 3. Execute handler
 * 4. Commit result
 * 5. Emit outbound messages
 * 6. Run supervisor timers (deadline watchdog)
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { SovereignAlert } from '../services/sovereign-alert.js';

/**
 * Business Hypothesis Schema - Strategic intent tracking
 * SD-HARDENING-V2-003: Capture market beliefs and expected KPI impacts
 */
const BUSINESS_HYPOTHESIS_SCHEMA = {
  // Market beliefs (at least one required)
  market_assumption: String,      // e.g., "TAM exceeds $1B"
  customer_belief: String,        // e.g., "Users will pay $50/mo for this"

  // Expected KPI impacts
  expected_kpi_impact: {
    metric: String,               // e.g., "LTV/CAC", "NPS", "Conversion Rate"
    current_value: Number,
    expected_change: String,      // e.g., "+15%", "-$5"
    confidence: Number            // 0.0 - 1.0
  },

  // Risk assessment
  assumption_risk: String,        // "HIGH", "MEDIUM", "LOW"
  pivot_trigger: String,          // What would invalidate this hypothesis?

  // Governance linkage (SD-HARDENING-V2-004)
  sd_id: String,                  // Strategic Directive ID (ENCOURAGED)
  prd_id: String                  // PRD ID (REQUIRED for venture execution, optional for meta-ops)
};

/**
 * BudgetExhaustedException - Thrown when agent budget is depleted
 * Non-retryable error that halts agent execution immediately
 * ABSOLUTE kill switch - no agent can execute if budget is zero
 */
export class BudgetExhaustedException extends Error {
  constructor(agentId, ventureId, budgetRemaining) {
    super(`Budget exhausted for agent ${agentId} (venture: ${ventureId}). Remaining: ${budgetRemaining}`);
    this.name = 'BudgetExhaustedException';
    this.isRetryable = false;
    this.agentId = agentId;
    this.ventureId = ventureId;
    this.budgetRemaining = budgetRemaining;
  }
}

/**
 * BudgetConfigurationException - Thrown when budget tracking is not configured
 * Industrial Hardening v3.0: Fail-closed behavior - no budget record means HALT
 * NON-RETRYABLE - requires database configuration to resolve
 */
export class BudgetConfigurationException extends Error {
  constructor(agentId, ventureId, reason) {
    super(`Budget configuration missing for agent ${agentId} (venture: ${ventureId}). Reason: ${reason}`);
    this.name = 'BudgetConfigurationException';
    this.isRetryable = false;
    this.agentId = agentId;
    this.ventureId = ventureId;
    this.reason = reason;
  }
}

/**
 * CircuitBreakerException - Thrown when iteration/loop limit exceeded
 * Industrial Hardening v3.0: Prevents runaway token consumption
 */
export class CircuitBreakerException extends Error {
  constructor(agentId, reason, iterationCount) {
    super(`Circuit breaker triggered for agent ${agentId}. Reason: ${reason}. Iterations: ${iterationCount}`);
    this.name = 'CircuitBreakerException';
    this.isRetryable = false;
    this.agentId = agentId;
    this.reason = reason;
    this.iterationCount = iterationCount;
  }
}

/**
 * UnauthorizedCapabilityError - Thrown when agent lacks required capability
 */
export class UnauthorizedCapabilityError extends Error {
  constructor(capability, agentId) {
    super(`Agent ${agentId} lacks required capability: ${capability}`);
    this.name = 'UnauthorizedCapabilityError';
    this.capability = capability;
    this.agentId = agentId;
  }
}

/**
 * BusinessHypothesisValidationError - Thrown when hypothesis is incomplete
 */
export class BusinessHypothesisValidationError extends Error {
  constructor(missingFields) {
    super(`Business hypothesis validation failed. Missing required fields: ${missingFields.join(', ')}`);
    this.name = 'BusinessHypothesisValidationError';
    this.missingFields = missingFields;
  }
}

/**
 * CEO Handler Registry - Maps message types to handler functions and required capabilities
 * Based on spec Section 9.5
 */
const CEO_HANDLERS = {
  task_delegation: {
    handler: 'handleCEOTaskDelegation',
    requiredCapability: 'task_delegation'
  },
  task_completion: {
    handler: 'handleCEOTaskCompletion',
    requiredCapability: null // No special capability required
  },
  status_report: {
    handler: 'handleCEOStatusReport',
    requiredCapability: null
  },
  escalation: {
    handler: 'handleCEOEscalation',
    requiredCapability: 'escalation'
  },
  query: {
    handler: 'handleCEOQuery',
    requiredCapability: null
  },
  response: {
    handler: 'handleCEOResponse',
    requiredCapability: null
  }
};

/**
 * VentureCEORuntime - Runtime for CEO agent message processing
 *
 * SD-HARDENING-V2-004: DUAL-DOMAIN GOVERNANCE (Tightened)
 * - sdId: Strategic Directive ID (e.g., 'SD-PARENT-4.0') - ENCOURAGED
 * - prdId: PRD ID - REQUIRED for venture execution
 * - isMetaOperation: Boolean - Set to true for EVA health scans (prdId optional)
 *
 * THE LAW: Venture Execution agents MUST have prd_id.
 * Exception: EVA meta-operations (health scans) can use sd_id only.
 *
 * These are EXISTING IDs from the database, NOT generated.
 * All events logged by this runtime will reference these governance anchors.
 */
export class VentureCEORuntime {
  constructor(options = {}) {
    this.supabase = options.supabaseClient || createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.agentId = options.agentId;
    this.ventureId = options.ventureId;
    this.pollIntervalMs = options.pollIntervalMs || 5000;
    this.deadlineCheckIntervalMs = options.deadlineCheckIntervalMs || 60000;

    // SD-HARDENING-V2-004: Meta-operation flag for EVA health scans
    this.isMetaOperation = options.isMetaOperation || false;

    // DUAL-DOMAIN GOVERNANCE: Reference existing SDs/PRDs
    // These are passed in, NOT generated - they link to existing governance artifacts
    this.sdId = options.sdId || null;      // e.g., 'SD-PARENT-4.0'
    this.prdId = options.prdId || null;    // e.g., UUID from product_requirements_v2

    // SOVEREIGN SEAL v2.7.0: Allowed meta-operation event types (HEALTH ONLY)
    // This seals the EVA loophole - only genuine health scans can bypass prd_id
    this.ALLOWED_META_EVENT_TYPES = [
      'EVA_HEALTH_BRIEF',
      'HEALTH_CHECK',
      'VENTURE_HEALTH_SCAN',
      'SYSTEM_HEALTH_REPORT'
    ];
    // BLOCKED: AGENT_PREDICTION, AGENT_OUTCOME - these ALWAYS require prd_id

    // SOVEREIGN SEAL v2.7.0: Required actor roles for meta-operations
    this.ALLOWED_META_ACTOR_ROLES = ['EVA_HEALTH_SCANNER', 'SYSTEM', 'SCHEDULER'];

    // SD-HARDENING-V2-004 + SOVEREIGN SEAL v2.7.0: Tightened Sovereignty Trace
    // Venture execution REQUIRES prdId. Meta-operations (EVA health scans) can use sdId only.
    if (this.isMetaOperation) {
      // SOVEREIGN SEAL v2.7.0: Validate actor_role for meta-operations
      const actorRole = options.actorRole || 'UNKNOWN';
      if (!this.ALLOWED_META_ACTOR_ROLES.includes(actorRole)) {
        throw new Error(
          '[GOVERNANCE] SOVEREIGN-SEAL-v2.7.0: Meta-operation rejected. ' +
          `Actor role '${actorRole}' is not authorized for meta-operations. ` +
          `Allowed roles: ${this.ALLOWED_META_ACTOR_ROLES.join(', ')}`
        );
      }
      this.actorRole = actorRole;

      // Meta-operations (health scans) only require sdId
      if (!this.sdId) {
        throw new Error(
          '[GOVERNANCE] SD-HARDENING-V2-004: Meta-operation requires sdId. ' +
          'EVA health scans must anchor to a Strategic Directive.'
        );
      }
      console.log(`[GOVERNANCE] Meta-operation mode: sdId=${this.sdId}, actorRole=${actorRole} (prdId not required)`);
    } else {
      // Standard venture execution REQUIRES prdId
      if (!this.prdId) {
        throw new Error(
          '[GOVERNANCE] SD-HARDENING-V2-004: Venture execution requires prdId. ' +
          'Every CEO action must trace to a specific PRD. ' +
          'For meta-operations (health scans), set isMetaOperation=true with valid actorRole.'
        );
      }
      this.actorRole = options.actorRole || 'VENTURE_CEO';
      console.log(`[GOVERNANCE] Venture execution mode: prdId=${this.prdId}, sdId=${this.sdId || 'inherited'}`);
    }

    this.isRunning = false;
    this.messagesProcessed = 0;
    this.lastDeadlineCheck = Date.now();
    this.agentContext = null;
    this.authorizedCapabilities = []; // Loaded from agent_registry
    this.toolAccess = {}; // Loaded from agent_registry
  }

  /**
   * Start the agent runtime loop
   */
  async start() {
    if (this.isRunning) {
      console.log('Warning: Runtime already running');
      return;
    }

    console.log(`\nCEO Runtime starting for agent ${this.agentId}`);
    console.log('='.repeat(50));

    // Load agent context and capabilities
    await this._loadAgentContext();

    this.isRunning = true;
    this.runAgentLoop();
  }

  /**
   * Stop the agent runtime loop
   */
  stop() {
    console.log('\nStopping CEO Runtime...');
    this.isRunning = false;
  }

  /**
   * Check budget and throw BudgetExhaustedException if depleted
   * ABSOLUTE kill switch - no agent can execute if budget is zero
   */
  async checkBudgetOrThrow() {
    // Query current budget from venture_token_budgets
    const { data: budgetData, error: budgetError } = await this.supabase
      .from('venture_token_budgets')
      .select('budget_remaining, budget_allocated')
      .eq('venture_id', this.ventureId)
      .single();

    // If no budget record found, check venture_phase_budgets as fallback
    let budgetRemaining = null;
    let budgetAllocated = null;
    let budgetSource = 'venture_token_budgets';

    if (budgetError || !budgetData) {
      const { data: phaseBudgetData, error: phaseError } = await this.supabase
        .from('venture_phase_budgets')
        .select('budget_remaining, budget_allocated')
        .eq('venture_id', this.ventureId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (phaseError || !phaseBudgetData) {
        // Industrial Hardening v3.0: FAIL-CLOSED behavior
        // No budget record = HALT execution, not silent bypass
        console.error(`   [BUDGET] FAIL-CLOSED: No budget record for venture ${this.ventureId}`);
        await this._logBudgetCheck('NO_RECORD', null);
        throw new BudgetConfigurationException(
          this.agentId,
          this.ventureId,
          'NO_BUDGET_RECORD - Venture must have budget tracking configured before agent execution'
        );
      }

      budgetRemaining = phaseBudgetData.budget_remaining;
      budgetAllocated = phaseBudgetData.budget_allocated;
      budgetSource = 'venture_phase_budgets';
    } else {
      budgetRemaining = budgetData.budget_remaining;
      budgetAllocated = budgetData.budget_allocated;
    }

    // Log budget check to system_events
    await this._logBudgetCheck(budgetRemaining > 0 ? 'PASSED' : 'BLOCKED', budgetRemaining);

    // Industrial Hardening v3.0: Fire warning when budget < 20%
    const WARNING_THRESHOLD = 0.2;
    if (budgetAllocated > 0 && budgetRemaining < budgetAllocated * WARNING_THRESHOLD) {
      try {
        await SovereignAlert.fireBudgetWarning(this.ventureId, budgetRemaining, budgetAllocated);
        console.log(`   [BUDGET] WARNING: Budget below ${WARNING_THRESHOLD * 100}% threshold - alert fired`);
      } catch (alertError) {
        console.error(`   [BUDGET] Failed to fire SovereignAlert: ${alertError.message}`);
      }
    }

    // ABSOLUTE kill switch: throw if budget is exhausted
    if (budgetRemaining <= 0) {
      console.log(`   [BUDGET] KILL SWITCH ACTIVATED - Budget exhausted (${budgetRemaining} remaining from ${budgetSource})`);
      throw new BudgetExhaustedException(this.agentId, this.ventureId, budgetRemaining);
    }

    console.log(`   [BUDGET] Check passed - ${budgetRemaining} tokens remaining (source: ${budgetSource})`);
  }

  /**
   * Log budget check to system_events
   */
  async _logBudgetCheck(status, budgetRemaining) {
    try {
      await this.supabase
        .from('system_events')
        .insert({
          event_type: 'BUDGET_CHECK',
          event_source: 'venture-ceo-runtime',
          severity: status === 'BLOCKED' ? 'error' : 'info',
          details: {
            agent_id: this.agentId,
            venture_id: this.ventureId,
            status: status,
            budget_remaining: budgetRemaining,
            timestamp: new Date().toISOString()
          }
        });
    } catch (err) {
      // Don't fail on logging errors
      console.warn(`   [BUDGET] Failed to log budget check: ${err.message}`);
    }
  }

  /**
   * Check if agent has a specific capability
   * @param {string} capabilityName - The capability to check
   * @returns {boolean}
   */
  hasCapability(capabilityName) {
    if (!capabilityName) return true; // No capability required
    return this.authorizedCapabilities.includes(capabilityName);
  }

  /**
   * Validate capability before executing handler
   * Logs capability check to system_events
   * @param {string} capabilityName - The capability to validate
   * @throws {UnauthorizedCapabilityError}
   */
  async _validateCapability(capabilityName) {
    const hasCapability = this.hasCapability(capabilityName);

    // Log capability check to system_events
    await this.supabase
      .from('system_events')
      .insert({
        event_type: 'CAPABILITY_CHECK',
        event_source: 'venture-ceo-runtime',
        severity: hasCapability ? 'info' : 'warning',
        details: {
          agent_id: this.agentId,
          capability: capabilityName,
          authorized: hasCapability,
          authorized_capabilities: this.authorizedCapabilities,
          timestamp: new Date().toISOString()
        }
      });

    if (!hasCapability) {
      throw new UnauthorizedCapabilityError(capabilityName, this.agentId);
    }
  }

  /**
   * Validate business hypothesis completeness
   * @private
   * @param {Object} businessHypothesis - The hypothesis to validate
   * @throws {BusinessHypothesisValidationError}
   */
  _validateBusinessHypothesis(businessHypothesis) {
    const missingFields = [];
    const qualitativeWarnings = [];

    // Governance linkage is MANDATORY
    if (!businessHypothesis.sd_id) {
      missingFields.push('sd_id');
    }

    // At least one market belief required
    if (!businessHypothesis.market_assumption && !businessHypothesis.customer_belief) {
      missingFields.push('market_assumption OR customer_belief');
    }

    // SOVEREIGN SEAL v2.7.0: Require QUANTITATIVE predictions (reject vague hypotheses)
    // Expected KPI impact is now MANDATORY with numeric target
    if (!businessHypothesis.expected_kpi_impact) {
      missingFields.push('expected_kpi_impact (quantitative prediction required)');
    } else {
      if (!businessHypothesis.expected_kpi_impact.metric) {
        missingFields.push('expected_kpi_impact.metric');
      }
      // SOVEREIGN SEAL v2.7.0: Require numeric target value
      if (businessHypothesis.expected_kpi_impact.target === undefined ||
          businessHypothesis.expected_kpi_impact.target === null) {
        missingFields.push('expected_kpi_impact.target (numeric value required)');
      }
      // SOVEREIGN SEAL v2.7.0: Reject zero-value predictions as trivial
      if (businessHypothesis.expected_kpi_impact.target === 0) {
        missingFields.push('expected_kpi_impact.target cannot be 0 (trivial prediction)');
      }
    }

    // SOVEREIGN SEAL v2.7.0: Detect vague/unfalsifiable language patterns
    const vaguePatterns = [
      /will be favorable/i,
      /strong engagement/i,
      /good performance/i,
      /positive results/i,
      /significant improvement/i,
      /market conditions/i
    ];

    const hypothesisText = JSON.stringify(businessHypothesis);
    for (const pattern of vaguePatterns) {
      if (pattern.test(hypothesisText)) {
        qualitativeWarnings.push(`Vague language detected: "${hypothesisText.match(pattern)[0]}"`);
      }
    }

    if (qualitativeWarnings.length > 0) {
      console.warn('   [TRUTH] SOVEREIGN-SEAL-v2.7.0: Vague hypothesis warnings:');
      qualitativeWarnings.forEach(w => console.warn(`      - ${w}`));
      // For now, warn but don't block - can escalate to error in future
    }

    if (missingFields.length > 0) {
      throw new BusinessHypothesisValidationError(missingFields);
    }
  }

  /**
   * Truth Layer: Log prediction with business hypothesis
   * SD-HARDENING-V2-003: Upgraded to capture strategic intent
   *
   * @param {Object} businessHypothesis - Business hypothesis (REQUIRED)
   * @param {Object} technicalContext - Technical telemetry (optional, for backward compatibility)
   * @returns {string} prediction_event_id for outcome linking
   */
  async logPrediction(businessHypothesis, technicalContext = {}) {
    // ZERO-TOLERANCE v2.4.3: No legacy bypass allowed
    // Every prediction MUST have a business hypothesis with governance linkage
    if (!businessHypothesis || typeof businessHypothesis !== 'object') {
      throw new BusinessHypothesisValidationError(['businessHypothesis object required']);
    }

    // Validate business hypothesis - HARD ENFORCEMENT, no warnings
    try {
      this._validateBusinessHypothesis(businessHypothesis);
    } catch (error) {
      console.error(`   [TRUTH] BLOCKED: ${error.message}`);
      throw error;  // No fallback, no legacy path - hard stop
    }

    const idempotencyKey = uuidv4();
    const actualCorrelationId = technicalContext.correlation_id || uuidv4();

    // Merge business hypothesis with technical context
    const predictionData = {
      // Strategic layer (NEW)
      business_hypothesis: {
        market_assumption: businessHypothesis.market_assumption,
        customer_belief: businessHypothesis.customer_belief,
        expected_kpi_impact: businessHypothesis.expected_kpi_impact,
        assumption_risk: businessHypothesis.assumption_risk,
        pivot_trigger: businessHypothesis.pivot_trigger
      },
      // Governance linkage (REQUIRED for non-legacy)
      sd_id: businessHypothesis.sd_id,
      prd_id: businessHypothesis.prd_id,
      // Technical layer (existing)
      technical_context: technicalContext,
      // Agent context
      agent_id: this.agentId,
      venture_id: this.ventureId,
      timestamp: new Date().toISOString()
    };

    const { data, error } = await this.supabase
      .from('system_events')
      .insert({
        event_type: 'AGENT_PREDICTION',
        correlation_id: actualCorrelationId,
        idempotency_key: idempotencyKey,
        // DUAL-DOMAIN GOVERNANCE: Use instance-level governance context
        // These reference EXISTING SDs/PRDs, not generated values
        sd_id: this.sdId,   // From constructor - e.g., 'SD-PARENT-4.0'
        prd_id: this.prdId, // From constructor - e.g., UUID from product_requirements_v2
        actor_type: 'agent',
        actor_role: 'VENTURE_CEO',  // Governance domain classification
        agent_id: this.agentId,
        venture_id: this.ventureId,
        predicted_outcome: predictionData,
        directive_context: {
          domain: 'VENTURE_EXECUTION',
          source: 'VentureCEORuntime',
          prediction_type: technicalContext.action || 'unknown',
          has_business_hypothesis: true  // Always true after v2.4.3 - no legacy path
        }
      })
      .select('id')
      .single();

    if (error) {
      console.warn(`   [TRUTH] Prediction logging failed: ${error.message}`);
      return null;
    }

    // SD-HARDENING-V2-004: Legacy mode eliminated - all predictions have business hypothesis
    console.log(`   [TRUTH] Business hypothesis logged: ${data.id} (SD: ${businessHypothesis.sd_id}, PRD: ${businessHypothesis.prd_id || 'meta-op'})`);

    return data.id;
  }

  /**
   * Truth Layer: Log actual outcome and compute calibration delta
   * @param {string} predictionEventId - ID from logPrediction
   * @param {Object} actualOutcome - Actual outcome data
   * @param {Object} prediction - Original prediction for delta calculation
   */
  async logOutcome(predictionEventId, actualOutcome, prediction = {}) {
    if (!predictionEventId) {
      console.warn('   [TRUTH] No prediction event ID provided for outcome logging');
      return;
    }

    const calibrationDelta = this._computeCalibrationDelta(prediction, actualOutcome);

    const { error } = await this.supabase
      .from('system_events')
      .insert({
        event_type: 'AGENT_OUTCOME',
        parent_event_id: predictionEventId,
        correlation_id: uuidv4(),
        idempotency_key: `OUTCOME-${this.ventureId}-${Date.now()}`,
        // DUAL-DOMAIN GOVERNANCE: Use instance-level governance context
        sd_id: this.sdId,
        prd_id: this.prdId,
        actor_type: 'agent',
        actor_role: 'VENTURE_CEO',
        agent_id: this.agentId,
        venture_id: this.ventureId,
        actual_outcome: actualOutcome,
        calibration_delta: calibrationDelta.accuracy_score || 0,
        directive_context: {
          domain: 'VENTURE_EXECUTION',
          source: 'VentureCEORuntime',
          calibration_accuracy: calibrationDelta.accuracy_score || 0
        }
      });

    if (error) {
      console.warn(`   [TRUTH] Outcome logging failed: ${error.message}`);
      return;
    }

    console.log(`   [TRUTH] Outcome logged (accuracy: ${(calibrationDelta.accuracy_score * 100).toFixed(1)}%)`);
  }

  /**
   * Compute calibration delta between prediction and outcome
   * COGNITIVE UPGRADE v2.6.0: Business Calibration
   *
   * THE LAW: Calibration = "How right was I about the MARKET?" not just "How many tokens?"
   *
   * Calibration now incorporates:
   * 1. market_assumption accuracy (did our market belief prove true?)
   * 2. expected_kpi_impact (did we hit our predicted metrics?)
   * 3. customer_belief validation (did customers behave as expected?)
   * 4. Technical outcomes (tokens, success, action)
   *
   * @private
   */
  _computeCalibrationDelta(prediction, outcome) {
    const delta = {
      fields_compared: [],
      differences: {},
      accuracy_score: 1.0,
      // COGNITIVE UPGRADE v2.6.0: Separate business vs technical accuracy
      business_accuracy: 1.0,
      technical_accuracy: 1.0,
      calibration_type: 'hybrid'
    };

    // ========================================================================
    // BUSINESS CALIBRATION (Weight: 60% of total score)
    // THE LAW: Business accuracy matters more than technical accuracy
    // ========================================================================

    // 1. Market Assumption Validation
    const businessHypothesis = prediction.business_hypothesis || prediction;
    if (businessHypothesis.market_assumption) {
      delta.fields_compared.push('market_assumption');

      // Check if outcome includes market validation
      const marketValidated = outcome.market_validated ||
        outcome.assumption_validated ||
        (outcome.metrics?.conversion_rate !== undefined) ||
        (outcome.metrics?.customer_acquisition !== undefined);

      if (marketValidated) {
        // Calculate how close we were to market expectations
        const marketAccuracy = this._computeMarketAccuracy(businessHypothesis, outcome);
        delta.differences.market_assumption = {
          predicted: businessHypothesis.market_assumption,
          actual_validation: outcome.market_validated || 'implicit',
          accuracy: marketAccuracy
        };
        delta.business_accuracy *= marketAccuracy;
      } else {
        // SOVEREIGN SEAL v2.7.0: Escalated NO_DATA penalty (was 0.5, now 0.1)
        // Market assumption made but no validation data - SEVERE penalty
        delta.differences.market_assumption = {
          predicted: businessHypothesis.market_assumption,
          actual_validation: 'NO_DATA',
          accuracy: 0.1  // 90% penalty for unvalidated assumptions - NO FREE PASSES
        };
        delta.business_accuracy *= 0.1;
      }
    }

    // 2. Expected KPI Impact
    if (businessHypothesis.expected_kpi_impact || prediction.expected_kpi) {
      delta.fields_compared.push('kpi_impact');

      const expectedKpi = businessHypothesis.expected_kpi_impact || prediction.expected_kpi;
      const actualKpi = outcome.actual_kpi || outcome.metrics;

      if (actualKpi) {
        const kpiAccuracy = this._computeKpiAccuracy(expectedKpi, actualKpi);
        delta.differences.kpi_impact = {
          predicted: expectedKpi,
          actual: actualKpi,
          accuracy: kpiAccuracy
        };
        delta.business_accuracy *= kpiAccuracy;
      } else {
        // SOVEREIGN SEAL v2.7.0: Escalated NO_DATA penalty (was 0.5, now 0.1)
        delta.differences.kpi_impact = {
          predicted: expectedKpi,
          actual: 'NO_DATA',
          accuracy: 0.1  // 90% penalty - predictions without validation are worthless
        };
        delta.business_accuracy *= 0.1;
      }
    }

    // 3. Customer Belief Validation
    if (businessHypothesis.customer_belief) {
      delta.fields_compared.push('customer_belief');

      const customerValidated = outcome.customer_validated ||
        outcome.user_behavior ||
        outcome.conversion_rate !== undefined;

      if (customerValidated) {
        const customerAccuracy = outcome.customer_accuracy || 0.8;
        delta.differences.customer_belief = {
          predicted: businessHypothesis.customer_belief,
          validated: customerValidated,
          accuracy: customerAccuracy
        };
        delta.business_accuracy *= customerAccuracy;
      }
    }

    // 4. Pivot Trigger Check (was the pivot trigger hit?)
    if (businessHypothesis.pivot_trigger && outcome.pivot_triggered !== undefined) {
      delta.fields_compared.push('pivot_trigger');
      const pivotExpected = outcome.metrics_below_threshold || false;
      const pivotTriggered = outcome.pivot_triggered || false;

      delta.differences.pivot_trigger = {
        trigger_condition: businessHypothesis.pivot_trigger,
        should_trigger: pivotExpected,
        did_trigger: pivotTriggered,
        correct: pivotExpected === pivotTriggered
      };

      if (pivotExpected !== pivotTriggered) {
        delta.business_accuracy *= 0.3;  // Major penalty for pivot miscalibration
      }
    }

    // ========================================================================
    // TECHNICAL CALIBRATION (Weight: 40% of total score)
    // ========================================================================

    // Compare expected_tokens if present
    if (prediction.expected_tokens && outcome.actual_tokens) {
      const tokenDiff = Math.abs(prediction.expected_tokens - outcome.actual_tokens);
      const tokenAccuracy = 1 - Math.min(tokenDiff / prediction.expected_tokens, 1);
      delta.fields_compared.push('tokens');
      delta.differences.tokens = {
        predicted: prediction.expected_tokens,
        actual: outcome.actual_tokens,
        diff: tokenDiff,
        accuracy: tokenAccuracy
      };
      delta.technical_accuracy *= tokenAccuracy;
    }

    // Compare action outcome
    if (prediction.action && outcome.action) {
      const actionMatch = prediction.action === outcome.action;
      delta.fields_compared.push('action');
      delta.differences.action = {
        predicted: prediction.action,
        actual: outcome.action,
        match: actionMatch
      };
      if (!actionMatch) {
        delta.technical_accuracy *= 0.5;
      }
    }

    // Compare success expectation
    if (prediction.expected_success !== undefined && outcome.success !== undefined) {
      const successMatch = prediction.expected_success === outcome.success;
      delta.fields_compared.push('success');
      delta.differences.success = {
        predicted: prediction.expected_success,
        actual: outcome.success,
        match: successMatch
      };
      if (!successMatch) {
        delta.technical_accuracy *= 0.3;
      }
    }

    // ========================================================================
    // COMPOSITE ACCURACY SCORE
    // Business: 60% weight, Technical: 40% weight
    // THE LAW: Market accuracy matters MORE than token efficiency
    // ========================================================================
    delta.accuracy_score = (delta.business_accuracy * 0.6) + (delta.technical_accuracy * 0.4);

    // ========================================================================
    // INDUSTRIAL HARDENING v2.9.0: VERTICAL COMPLEXITY NORMALIZATION
    // A 0.22 delta in Healthcare is NOT the same as 0.22 in Logistics
    // ========================================================================
    delta.vertical_normalization = this._applyVerticalNormalization(delta.accuracy_score);

    // Log calibration breakdown
    console.log(`   [CALIBRATION] Business: ${(delta.business_accuracy * 100).toFixed(1)}%, Technical: ${(delta.technical_accuracy * 100).toFixed(1)}%, Composite: ${(delta.accuracy_score * 100).toFixed(1)}%`);
    if (delta.vertical_normalization.applied) {
      console.log(`   [CALIBRATION] Vertical (${delta.vertical_normalization.vertical}): ${delta.vertical_normalization.multiplier}x → Normalized: ${(delta.vertical_normalization.normalized_accuracy * 100).toFixed(1)}% = ${delta.vertical_normalization.health_status.toUpperCase()}`);
    }

    return delta;
  }

  /**
   * Apply vertical complexity normalization to accuracy score
   * INDUSTRIAL HARDENING v2.9.0: Truth Normalization (Pillar 6)
   *
   * @param {number} rawAccuracy - Raw accuracy score (0.0 - 1.0)
   * @returns {object} Normalization result with vertical context
   * @private
   */
  _applyVerticalNormalization(rawAccuracy) {
    // Vertical complexity multipliers (same as database seed)
    const VERTICAL_MULTIPLIERS = {
      healthcare: { multiplier: 1.5, green: 0.90, yellow: 0.70 },
      fintech: { multiplier: 1.3, green: 0.85, yellow: 0.65 },
      edtech: { multiplier: 1.2, green: 0.75, yellow: 0.50 },
      logistics: { multiplier: 1.0, green: 0.75, yellow: 0.50 },
      other: { multiplier: 1.0, green: 0.75, yellow: 0.50 }
    };

    // Get venture's vertical category from metadata
    const vertical = this.agentContext?.metadata?.vertical?.toLowerCase() ||
                     this.agentContext?.vertical_category ||
                     'other';

    const config = VERTICAL_MULTIPLIERS[vertical] || VERTICAL_MULTIPLIERS.other;

    // Calculate raw delta (error) and apply multiplier
    const rawDelta = 1 - rawAccuracy;
    const normalizedDelta = Math.min(1.0, rawDelta * config.multiplier);
    const normalizedAccuracy = 1 - normalizedDelta;

    // Determine health status based on vertical-specific thresholds
    let healthStatus;
    if (normalizedAccuracy >= config.green) {
      healthStatus = 'green';
    } else if (normalizedAccuracy >= config.yellow) {
      healthStatus = 'yellow';
    } else {
      healthStatus = 'red';
    }

    return {
      applied: true,
      vertical: vertical,
      multiplier: config.multiplier,
      raw_accuracy: rawAccuracy,
      raw_delta: rawDelta,
      normalized_accuracy: normalizedAccuracy,
      normalized_delta: normalizedDelta,
      health_status: healthStatus,
      thresholds: { green: config.green, yellow: config.yellow }
    };
  }

  /**
   * Compute market assumption accuracy
   * @private
   */
  _computeMarketAccuracy(hypothesis, outcome) {
    // If we have explicit market validation, use it
    if (outcome.market_accuracy !== undefined) {
      return outcome.market_accuracy;
    }

    // If we have conversion metrics, compare to assumptions
    if (outcome.metrics?.conversion_rate && hypothesis.expected_conversion) {
      const diff = Math.abs(outcome.metrics.conversion_rate - hypothesis.expected_conversion);
      return Math.max(0, 1 - diff);
    }

    // If market was validated positively, assume 80% accuracy
    if (outcome.market_validated === true) {
      return 0.8;
    }

    // If market was invalidated, accuracy is low
    if (outcome.market_validated === false) {
      return 0.2;
    }

    // Default: moderate uncertainty
    return 0.6;
  }

  /**
   * Compute KPI accuracy between expected and actual
   * @private
   */
  _computeKpiAccuracy(expected, actual) {
    if (typeof expected === 'object' && typeof actual === 'object') {
      // Compare multiple KPIs
      let totalAccuracy = 0;
      let count = 0;

      for (const key of Object.keys(expected)) {
        if (actual[key] !== undefined) {
          const expVal = parseFloat(expected[key]) || 0;
          const actVal = parseFloat(actual[key]) || 0;
          const diff = Math.abs(expVal - actVal);
          const kpiAccuracy = expVal !== 0 ? Math.max(0, 1 - diff / Math.abs(expVal)) : (actVal === 0 ? 1 : 0);
          totalAccuracy += kpiAccuracy;
          count++;
        }
      }

      // SOVEREIGN SEAL v2.7.0: No KPI data = severe penalty (was 0.5, now 0.1)
      return count > 0 ? totalAccuracy / count : 0.1;
    }

    // Single value comparison
    const expVal = parseFloat(expected) || 0;
    const actVal = parseFloat(actual) || 0;
    const diff = Math.abs(expVal - actVal);
    return expVal !== 0 ? Math.max(0, 1 - diff / Math.abs(expVal)) : (actVal === 0 ? 1 : 0);
  }

  /**
   * Estimate token usage for prediction
   * @private
   */
  _estimateTokens(data) {
    if (!data) return 100;
    const jsonStr = JSON.stringify(data);
    // Rough estimate: 4 characters per token
    return Math.ceil(jsonStr.length / 4);
  }

  /**
   * Main runtime loop - processes messages and runs supervisor timers
   * Industrial Hardening v3.0: Includes iteration circuit breaker
   */
  async runAgentLoop() {
    // Industrial Hardening v3.0: Circuit breaker configuration
    const MAX_ITERATIONS_PER_SESSION = 1000;
    let iterationCount = 0;

    while (this.isRunning) {
      try {
        // Industrial Hardening v3.0: Iteration circuit breaker
        iterationCount++;
        if (iterationCount > MAX_ITERATIONS_PER_SESSION) {
          console.error(`\n[CIRCUIT BREAKER] Max iterations reached: ${iterationCount}/${MAX_ITERATIONS_PER_SESSION}`);
          throw new CircuitBreakerException(this.agentId, 'MAX_ITERATIONS_EXCEEDED', iterationCount);
        }

        // Step 1: Claim next message
        const message = await this.claimNextMessage();

        if (message) {
          // Step 2-4: Route, execute, commit
          await this.processMessage(message);
          this.messagesProcessed++;
        }

        // Step 6: Run supervisor timers periodically
        if (Date.now() - this.lastDeadlineCheck >= this.deadlineCheckIntervalMs) {
          await this.runSupervisorTimers();
          this.lastDeadlineCheck = Date.now();
        }

        // Wait before next poll
        await this._sleep(this.pollIntervalMs);

      } catch (error) {
        // Industrial Hardening v3.0: Handle all kill-switch exceptions
        // These exceptions MUST stop the runtime - no recovery

        // Handle BudgetExhaustedException - budget depleted
        if (error instanceof BudgetExhaustedException) {
          console.error(`\n[FATAL] Budget exhausted - stopping runtime: ${error.message}`);
          this.isRunning = false;
          throw error;
        }

        // Handle BudgetConfigurationException - no budget record (fail-closed)
        if (error instanceof BudgetConfigurationException) {
          console.error(`\n[FATAL] Budget not configured - stopping runtime: ${error.message}`);
          this.isRunning = false;
          throw error;
        }

        // Handle CircuitBreakerException - iteration limit exceeded
        if (error instanceof CircuitBreakerException) {
          console.error(`\n[FATAL] Circuit breaker triggered - stopping runtime: ${error.message}`);
          this.isRunning = false;
          throw error;
        }

        console.error(`\nRuntime error: ${error.message}`);
        // Continue running despite other errors
        await this._sleep(this.pollIntervalMs * 2);
      }
    }

    console.log(`\nRuntime stopped. Messages processed: ${this.messagesProcessed}. Iterations: ${iterationCount}`);
  }

  /**
   * Claim next message using atomic database operation
   * Uses fn_claim_next_message() for concurrency-safe claiming
   */
  async claimNextMessage() {
    const { data, error } = await this.supabase
      .rpc('fn_claim_next_message', { p_agent_id: this.agentId });

    if (error) {
      if (!error.message.includes('No pending messages')) {
        console.warn(`Warning: Claim error: ${error.message}`);
      }
      return null;
    }

    if (data) {
      console.log(`\nClaimed message: ${data.subject}`);
      console.log(`   Type: ${data.message_type} | Priority: ${data.priority}`);
    }

    return data;
  }

  /**
   * Build business hypothesis from message context
   * SD-HARDENING-V2-003: Extract strategic intent
   * @private
   */
  _buildBusinessHypothesis(message) {
    // Extract SD and PRD context from message
    const sdId = message.body?.sd_id || message.metadata?.sd_id || null;
    const prdId = message.body?.prd_id || message.metadata?.prd_id || null;

    // Extract strategic beliefs from message body
    const marketAssumption = message.body?.market_assumption || null;
    const customerBelief = message.body?.customer_belief || null;

    // For now, return basic hypothesis with governance linkage
    // In production, this would query strategic_directives and prds tables
    // to enrich with full business context
    return {
      sd_id: sdId,
      prd_id: prdId,
      market_assumption: marketAssumption,
      customer_belief: customerBelief,
      expected_kpi_impact: message.body?.expected_kpi_impact || null,
      assumption_risk: message.body?.assumption_risk || 'MEDIUM',
      pivot_trigger: message.body?.pivot_trigger || null
    };
  }

  /**
   * Process a claimed message
   * TRUTH LAYER: Log prediction before handler, outcome after handler
   * SD-HARDENING-V2-003: Build business hypothesis from message context
   */
  async processMessage(message) {
    const handlerConfig = CEO_HANDLERS[message.message_type];

    if (!handlerConfig) {
      console.warn(`Warning: No handler for message type: ${message.message_type}`);
      await this._markMessageFailed(message.id, `No handler for type: ${message.message_type}`);
      return;
    }

    const handlerName = typeof handlerConfig === 'string' ? handlerConfig : handlerConfig.handler;
    const requiredCapability = typeof handlerConfig === 'object' ? handlerConfig.requiredCapability : null;

    const handler = this[handlerName];
    if (!handler) {
      console.warn(`Warning: Handler ${handlerName} not implemented`);
      await this._markMessageFailed(message.id, `Handler not implemented: ${handlerName}`);
      return;
    }

    // Build business hypothesis from message context
    const businessHypothesis = this._buildBusinessHypothesis(message);

    // TRUTH LAYER: Log prediction with business hypothesis
    const technicalContext = {
      action: message.message_type,
      expected_tokens: this._estimateTokens(message),
      expected_success: true,
      handler: handlerName,
      correlation_id: message.correlation_id
    };

    let predictionEventId = null;

    // Only log full hypothesis if we have governance linkage
    if (businessHypothesis.sd_id) {
      predictionEventId = await this.logPrediction(businessHypothesis, technicalContext);
    } else {
      // Fall back to legacy technical-only prediction
      predictionEventId = await this.logPrediction(technicalContext);
    }

    try {
      // BUDGET KILL SWITCH: Check budget BEFORE handler execution
      await this.checkBudgetOrThrow();

      // Validate capability before executing handler
      if (requiredCapability) {
        await this._validateCapability(requiredCapability);
        console.log(`   Capability validated: ${requiredCapability}`);
      }

      // Execute handler
      const startTime = Date.now();
      const result = await handler.call(this, message);
      const executionTime = Date.now() - startTime;

      // TRUTH LAYER: Log actual outcome
      const outcome = {
        action: message.message_type,
        actual_tokens: result?.tokens_used || this._estimateTokens(result),
        success: result?.status === 'completed',
        execution_time_ms: executionTime,
        handler: handlerName
      };
      await this.logOutcome(predictionEventId, outcome, technicalContext);

      // Commit result
      await this._markMessageCompleted(message.id, result);

      // Emit outbound messages if any
      if (result && result.outbound_messages) {
        await this._sendOutboundMessages(result.outbound_messages);
      }

      // Update memory if relevant
      if (result && result.memory_update) {
        await this._updateMemory(result.memory_update);
      }

    } catch (error) {
      // TRUTH LAYER: Log failure outcome
      const outcome = {
        action: message.message_type,
        success: false,
        error: error.message,
        handler: handlerName
      };
      await this.logOutcome(predictionEventId, outcome, technicalContext);

      // Re-throw BudgetExhaustedException to halt execution
      if (error instanceof BudgetExhaustedException) {
        await this._markMessageFailed(message.id, `Budget exhausted: ${error.message}`);
        throw error;
      }

      if (error instanceof UnauthorizedCapabilityError) {
        console.error(`Capability error: ${error.message}`);
        await this._markMessageFailed(message.id, `Unauthorized: ${error.message}`);
      } else {
        console.error(`Handler error: ${error.message}`);
        await this._markMessageFailed(message.id, error.message);
      }
    }
  }

  /**
   * Handler: Task Delegation from EVA or Chairman
   * Decomposes directive into VP tasks
   * Requires: task_delegation capability
   */
  async handleCEOTaskDelegation(message) {
    console.log('   Processing task delegation...');

    // BUDGET KILL SWITCH: Check budget BEFORE delegating to sub-agents
    await this.checkBudgetOrThrow();

    const { directive, instructions, priority_stage } = message.body || {};
    const outbound_messages = [];

    // Determine which VP should handle based on stage ownership
    const vpAssignment = this._determineVpForStage(priority_stage || 1);

    if (vpAssignment) {
      // Create task delegation to appropriate VP
      outbound_messages.push({
        message_type: 'task_delegation',
        to_agent_id: vpAssignment.vp_id,
        subject: `[DELEGATED] ${directive || message.subject}`,
        body: {
          original_directive: directive,
          instructions: instructions,
          stage: priority_stage,
          delegated_by: 'CEO',
          deadline_hours: 24
        },
        priority: message.priority || 'normal'
      });

      console.log(`   Delegated to ${vpAssignment.vp_role}`);
    }

    // Send acknowledgement back to sender
    if (message.requires_response) {
      outbound_messages.push({
        message_type: 'response',
        to_agent_id: message.from_agent_id,
        correlation_id: message.correlation_id,
        subject: `[ACK] ${message.subject}`,
        body: {
          status: 'accepted',
          delegated_to: vpAssignment?.vp_role || 'pending_assignment'
        },
        priority: 'normal'
      });
    }

    return {
      status: 'completed',
      delegated_to: vpAssignment?.vp_role,
      outbound_messages,
      memory_update: {
        type: 'decisions',
        content: {
          action: 'task_delegated',
          directive: directive,
          delegated_to: vpAssignment?.vp_role,
          timestamp: new Date().toISOString()
        }
      }
    };
  }

  /**
   * Handler: Task Completion from VP
   * Records completion, potentially advances stage
   */
  async handleCEOTaskCompletion(message) {
    console.log('   Processing task completion...');

    const { stage_completed, artifacts, key_decisions: _key_decisions, ready_for_handoff } = message.body || {};

    // Update memory with completion
    const memory_update = {
      type: 'context',
      content: {
        action: 'stage_progress',
        stage: stage_completed,
        completed_by: message.from_agent_id,
        artifacts_received: artifacts?.length || 0,
        timestamp: new Date().toISOString()
      }
    };

    // If VP signals ready for handoff, CEO can review and commit
    if (ready_for_handoff && stage_completed) {
      console.log(`   Stage ${stage_completed} ready for handoff review`);

      // Import state machine for stage transition
      // This will be handled by venture-state-machine.js
      return {
        status: 'completed',
        stage_ready_for_commit: stage_completed,
        handoff_pending: true,
        memory_update
      };
    }

    return {
      status: 'completed',
      stage_progress_recorded: true,
      memory_update
    };
  }

  /**
   * Handler: Status Report from VP
   * Updates CEO memory with VP status
   */
  async handleCEOStatusReport(message) {
    console.log('   Processing status report...');

    const { vp_role, current_stage, progress_percent, blockers } = message.body || {};

    return {
      status: 'completed',
      memory_update: {
        type: 'context',
        content: {
          action: 'status_update',
          vp_role: vp_role,
          current_stage: current_stage,
          progress: progress_percent,
          blockers: blockers,
          timestamp: new Date().toISOString()
        }
      }
    };
  }

  /**
   * Handler: Escalation from VP
   * Forwards to EVA if beyond CEO authority
   * Requires: escalation capability
   */
  async handleCEOEscalation(message) {
    console.log('   Processing escalation...');

    const { severity, issue, requires_chairman } = message.body || {};

    // Check if CEO can handle or needs to escalate to EVA
    const ceoCanHandle = !requires_chairman && severity !== 'critical';

    if (ceoCanHandle) {
      console.log('   CEO handling escalation');
      return {
        status: 'completed',
        handled_by: 'CEO',
        memory_update: {
          type: 'decisions',
          content: {
            action: 'escalation_handled',
            issue: issue,
            resolution_pending: true,
            timestamp: new Date().toISOString()
          }
        }
      };
    }

    // Forward to EVA
    console.log('   Forwarding to EVA');
    const { data: eva } = await this._getEvaAgent();

    return {
      status: 'completed',
      forwarded_to: 'EVA',
      outbound_messages: [{
        message_type: 'escalation',
        to_agent_id: eva?.id,
        subject: `[ESCALATED FROM CEO] ${message.subject}`,
        body: {
          original_from: message.from_agent_id,
          original_issue: issue,
          severity: severity,
          ceo_notes: 'Beyond CEO authority, forwarding to EVA'
        },
        priority: 'critical'
      }]
    };
  }

  /**
   * Handler: Query - Respond to information requests
   */
  async handleCEOQuery(message) {
    console.log('   Processing query...');

    const { query_type, query_params: _query_params } = message.body || {};

    // Build response based on query type
    let response_data = {};

    switch (query_type) {
      case 'venture_status':
        response_data = await this._getVentureStatus();
        break;
      case 'vp_status':
        response_data = await this._getVpStatuses();
        break;
      default:
        response_data = { error: `Unknown query type: ${query_type}` };
    }

    return {
      status: 'completed',
      outbound_messages: [{
        message_type: 'response',
        to_agent_id: message.from_agent_id,
        correlation_id: message.correlation_id,
        subject: `[RESPONSE] ${message.subject}`,
        body: response_data,
        priority: 'normal'
      }]
    };
  }

  /**
   * Handler: Response - Process response to previous query
   */
  async handleCEOResponse(message) {
    console.log('   Processing response...');

    return {
      status: 'completed',
      memory_update: {
        type: 'context',
        content: {
          action: 'response_received',
          correlation_id: message.correlation_id,
          response_summary: message.subject,
          timestamp: new Date().toISOString()
        }
      }
    };
  }

  /**
   * Run supervisor timers - deadline watchdog
   */
  async runSupervisorTimers() {
    console.log('\nRunning supervisor timers...');

    // Check for overdue messages
    const { data: overdueMessages } = await this.supabase
      .from('agent_messages')
      .select('id, subject, to_agent_id, response_deadline')
      .eq('status', 'pending')
      .lt('response_deadline', new Date().toISOString())
      .limit(10);

    if (overdueMessages && overdueMessages.length > 0) {
      console.log(`   Warning: Found ${overdueMessages.length} overdue messages`);

      for (const msg of overdueMessages) {
        // Send reminder or escalate
        await this._handleOverdueMessage(msg);
      }
    } else {
      console.log('   No overdue messages');
    }

    // Aggregate status for EVA briefing (daily)
    // This would run on a longer interval in production
  }

  // ============ Private Helper Methods ============

  /**
   * Load agent context and capabilities from database
   * Fetches capabilities and tool_access from agent_registry
   */
  async _loadAgentContext() {
    const { data, error } = await this.supabase
      .from('agent_registry')
      .select('*, agent_memory_stores(*)')
      .eq('id', this.agentId)
      .single();

    if (error) {
      throw new Error(`Failed to load agent context: ${error.message}`);
    }

    this.agentContext = data;
    this.ventureId = data?.venture_id;

    // Load capabilities from agent_registry
    this.authorizedCapabilities = data?.capabilities || [];
    this.toolAccess = data?.tool_access || {};

    console.log(`   Agent: ${data?.display_name}`);
    console.log(`   Venture: ${this.ventureId}`);
    console.log(`   Capabilities: ${this.authorizedCapabilities.join(', ') || 'none'}`);
  }

  /**
   * Determine which VP should handle a stage
   */
  _determineVpForStage(stage) {
    // Based on STANDARD_VENTURE_TEMPLATE stage_ownership
    const stageToVp = {
      VP_STRATEGY: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      VP_PRODUCT: [10, 11, 12],
      VP_TECH: [13, 14, 15, 16, 17, 18, 19, 20],
      VP_GROWTH: [21, 22, 23, 24, 25]
    };

    for (const [vpRole, stages] of Object.entries(stageToVp)) {
      if (stages.includes(stage)) {
        return {
          vp_role: vpRole,
          vp_id: this.agentContext?.vp_ids?.[vpRole] || null
        };
      }
    }

    return null;
  }

  /**
   * Get EVA agent
   */
  async _getEvaAgent() {
    return this.supabase
      .from('agent_registry')
      .select('id')
      .eq('agent_type', 'eva')
      .single();
  }

  /**
   * Get venture status
   */
  async _getVentureStatus() {
    const { data } = await this.supabase
      .from('ventures')
      .select('id, name, current_lifecycle_stage, status')
      .eq('id', this.ventureId)
      .single();

    return data || { error: 'Venture not found' };
  }

  /**
   * Get VP statuses
   */
  async _getVpStatuses() {
    const { data } = await this.supabase
      .from('agent_registry')
      .select('id, agent_role, status, token_consumed')
      .eq('venture_id', this.ventureId)
      .eq('agent_type', 'executive');

    return data || [];
  }

  /**
   * Mark message as completed
   */
  async _markMessageCompleted(messageId, result) {
    await this.supabase
      .from('agent_messages')
      .update({
        status: 'completed',
        metadata: { result_summary: result.status }
      })
      .eq('id', messageId);
  }

  /**
   * Mark message as failed
   */
  async _markMessageFailed(messageId, errorMessage) {
    await this.supabase
      .from('agent_messages')
      .update({
        status: 'failed',
        metadata: { error: errorMessage }
      })
      .eq('id', messageId);
  }

  /**
   * Send outbound messages
   */
  async _sendOutboundMessages(messages) {
    for (const msg of messages) {
      const { error } = await this.supabase
        .from('agent_messages')
        .insert({
          ...msg,
          from_agent_id: this.agentId,
          correlation_id: msg.correlation_id || uuidv4(),
          status: 'pending',
          created_at: new Date().toISOString()
        });

      if (error) {
        console.warn(`Warning: Failed to send message: ${error.message}`);
      }
    }
  }

  /**
   * Update agent memory
   * INDUSTRIAL-HARDENING-v2.9.0: Memory Partitioning
   * All memory operations MUST include venture_id to prevent cross-contamination
   */
  async _updateMemory(update) {
    // SOVEREIGN SEAL v2.9.0: Enforce venture_id on all memory writes
    if (!this.ventureId) {
      console.warn('[GOVERNANCE] INDUSTRIAL-v2.9.0: Memory write blocked - no venture_id');
      return;
    }

    await this.supabase
      .from('agent_memory_stores')
      .insert({
        agent_id: this.agentId,
        venture_id: this.ventureId, // INDUSTRIAL-HARDENING-v2.9.0: Memory isolation
        memory_type: update.type,
        content: update.content,
        summary: JSON.stringify(update.content).substring(0, 200),
        version: 1,
        is_current: true,
        importance_score: 0.7
      });
  }

  /**
   * Handle overdue message
   */
  async _handleOverdueMessage(msg) {
    console.log(`   Handling overdue: ${msg.subject}`);
    // Could escalate or send reminder
  }

  /**
   * Sleep helper
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export handler map for reference
export { CEO_HANDLERS };

// Export schema for external validation
export { BUSINESS_HYPOTHESIS_SCHEMA };

// Default export
export default VentureCEORuntime;
