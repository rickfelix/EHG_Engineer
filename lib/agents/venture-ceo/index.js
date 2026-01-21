/**
 * Venture CEO Runtime - Main Orchestration
 * CEO agent message processing loop with governance, budget, and truth layer
 *
 * SOVEREIGN SEAL v2.9.0: Governance-compliant CEO operations
 * INDUSTRIAL-HARDENING-v2.9.0: Budget enforcement and memory isolation
 *
 * Extracted from venture-ceo-runtime.js for modularity
 * SD-LEO-REFACTOR-VENTURE-CEO-001
 */

import {
  BudgetExhaustedException,
  CircuitBreakerException,
  UnauthorizedCapabilityError,
  BusinessHypothesisValidationError
} from './exceptions.js';

import { CEO_HANDLERS, BUSINESS_HYPOTHESIS_SCHEMA } from './constants.js';
import { BudgetManager } from './budget-manager.js';
import { TruthLayer } from './truth-layer.js';
import {
  handleCEOTaskDelegation,
  handleCEOTaskCompletion,
  handleCEOStatusReport,
  handleCEOEscalation,
  handleCEOQuery,
  handleCEOResponse
} from './handlers.js';
import {
  loadAgentContext,
  markMessageCompleted,
  markMessageFailed,
  sendOutboundMessages,
  updateMemory,
  runSupervisorTimers,
  sleep,
  hasCapability,
  validateCapability
} from './helpers.js';

/**
 * VentureCEORuntime
 * Main runtime class for CEO agent message processing
 */
export class VentureCEORuntime {
  /**
   * Create a CEO runtime
   * @param {Object} supabase - Supabase client
   * @param {string} agentId - CEO agent ID
   * @param {Object} options - Runtime options
   */
  constructor(supabase, agentId, options = {}) {
    this.supabase = supabase;
    this.agentId = agentId;
    this.options = {
      maxIterations: options.maxIterations || 100,
      pollIntervalMs: options.pollIntervalMs || 5000,
      enableBudgetEnforcement: options.enableBudgetEnforcement !== false,
      enableTruthLayer: options.enableTruthLayer !== false,
      ...options
    };

    // Runtime state
    this.isRunning = false;
    this.iterationCount = 0;
    this.ventureId = null;
    this.agentContext = null;
    this.authorizedCapabilities = [];
    this.toolAccess = {};

    // Managers
    this.budgetManager = null;
    this.truthLayer = null;

    // Handler map
    this.handlers = {
      task_delegation: this.handleCEOTaskDelegation.bind(this),
      task_completion: this.handleCEOTaskCompletion.bind(this),
      status_report: this.handleCEOStatusReport.bind(this),
      escalation: this.handleCEOEscalation.bind(this),
      query: this.handleCEOQuery.bind(this),
      response: this.handleCEOResponse.bind(this)
    };

    // SOVEREIGN SEAL v2.9.0: Governance validation
    this._validateGovernanceCompliance();
  }

  /**
   * Validate governance compliance on construction
   * @private
   */
  _validateGovernanceCompliance() {
    // INDUSTRIAL-HARDENING-v2.9.0: Require budget enforcement in production
    if (process.env.NODE_ENV === 'production' && !this.options.enableBudgetEnforcement) {
      console.warn('[GOVERNANCE] WARNING: Budget enforcement disabled in production');
    }

    // SOVEREIGN SEAL v2.9.0: Require truth layer
    if (process.env.NODE_ENV === 'production' && !this.options.enableTruthLayer) {
      throw new Error('[GOVERNANCE] SOVEREIGN SEAL v2.9.0: Truth layer cannot be disabled in production');
    }
  }

  /**
   * Initialize runtime - load context and create managers
   */
  async initialize() {
    console.log(`\nInitializing CEO Runtime for agent ${this.agentId}...`);

    // Load agent context
    const contextData = await loadAgentContext(this.supabase, this.agentId);
    this.agentContext = contextData.context;
    this.ventureId = contextData.ventureId;
    this.authorizedCapabilities = contextData.capabilities;
    this.toolAccess = contextData.toolAccess;

    // Initialize managers
    if (this.options.enableBudgetEnforcement) {
      this.budgetManager = new BudgetManager(this.supabase, this.agentId, this.ventureId);
    }

    if (this.options.enableTruthLayer) {
      this.truthLayer = new TruthLayer(this.supabase, this.agentId, this.ventureId);
    }

    console.log('   CEO Runtime initialized');
  }

  /**
   * Main agent loop - process messages continuously
   * INDUSTRIAL-HARDENING-v2.9.0: Circuit breaker prevents runaway
   */
  async runAgentLoop() {
    if (!this.agentContext) {
      await this.initialize();
    }

    console.log(`\nStarting CEO agent loop (max ${this.options.maxIterations} iterations)...`);
    this.isRunning = true;
    this.iterationCount = 0;

    while (this.isRunning && this.iterationCount < this.options.maxIterations) {
      this.iterationCount++;
      console.log(`\n--- Iteration ${this.iterationCount} ---`);

      try {
        // Check budget before processing
        if (this.budgetManager) {
          await this.budgetManager.checkBudgetOrThrow('message_processing', 100);
        }

        // Claim and process next message
        const message = await this.claimNextMessage();

        if (message) {
          await this.processMessage(message);
        } else {
          console.log('   No pending messages, running supervisor...');
          await runSupervisorTimers(this.supabase);
        }

        // Poll interval
        await sleep(this.options.pollIntervalMs);

      } catch (error) {
        if (error instanceof BudgetExhaustedException) {
          console.error('[BUDGET] Budget exhausted, stopping loop');
          this.isRunning = false;
          break;
        }

        if (error instanceof CircuitBreakerException) {
          console.error('[CIRCUIT BREAKER] Loop detected, stopping');
          this.isRunning = false;
          break;
        }

        console.error(`Error in iteration ${this.iterationCount}:`, error.message);
        // Continue loop on non-fatal errors
      }
    }

    console.log(`\nCEO agent loop completed after ${this.iterationCount} iterations`);
  }

  /**
   * Stop the agent loop
   */
  stop() {
    this.isRunning = false;
    console.log('CEO agent loop stop requested');
  }

  /**
   * Claim next pending message for this agent
   * @returns {Promise<Object|null>} Next message or null
   */
  async claimNextMessage() {
    const { data: message, error } = await this.supabase
      .from('agent_messages')
      .select('*')
      .eq('to_agent_id', this.agentId)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.warn(`   Message fetch error: ${error.message}`);
      return null;
    }

    if (!message) {
      return null;
    }

    // Claim message by updating status
    const { error: claimError } = await this.supabase
      .from('agent_messages')
      .update({ status: 'processing' })
      .eq('id', message.id)
      .eq('status', 'pending'); // Optimistic lock

    if (claimError) {
      console.warn(`   Failed to claim message: ${claimError.message}`);
      return null;
    }

    console.log(`   Claimed message: ${message.message_type} - ${message.subject}`);
    return message;
  }

  /**
   * Process a claimed message
   * @param {Object} message - Message to process
   */
  async processMessage(message) {
    const handlerName = CEO_HANDLERS[message.message_type];

    if (!handlerName || !this.handlers[message.message_type]) {
      console.warn(`   No handler for message type: ${message.message_type}`);
      await markMessageFailed(this.supabase, message.id, `Unknown message type: ${message.message_type}`);
      return;
    }

    try {
      // Execute handler
      const result = await this.handlers[message.message_type](message);

      // Handle result
      if (result.status === 'completed') {
        await markMessageCompleted(this.supabase, message.id, result);

        // Send outbound messages if any
        if (result.outbound_messages && result.outbound_messages.length > 0) {
          await sendOutboundMessages(this.supabase, this.agentId, result.outbound_messages);
        }

        // Update memory if specified
        if (result.memory_update) {
          await updateMemory(this.supabase, this.agentId, this.ventureId, result.memory_update);
        }
      } else {
        await markMessageFailed(this.supabase, message.id, result.error || 'Handler failed');
      }

    } catch (error) {
      console.error(`   Handler error: ${error.message}`);
      await markMessageFailed(this.supabase, message.id, error.message);
    }
  }

  // ============ Handler Wrappers ============
  // These wrap the imported handlers with runtime context

  async handleCEOTaskDelegation(message) {
    return handleCEOTaskDelegation(this._getContext(), message);
  }

  async handleCEOTaskCompletion(message) {
    return handleCEOTaskCompletion(this._getContext(), message);
  }

  async handleCEOStatusReport(message) {
    return handleCEOStatusReport(this._getContext(), message);
  }

  async handleCEOEscalation(message) {
    return handleCEOEscalation(this._getContext(), message);
  }

  async handleCEOQuery(message) {
    return handleCEOQuery(this._getContext(), message);
  }

  async handleCEOResponse(message) {
    return handleCEOResponse(this._getContext(), message);
  }

  /**
   * Get handler context object
   * @private
   */
  _getContext() {
    return {
      supabase: this.supabase,
      agentId: this.agentId,
      ventureId: this.ventureId,
      agentContext: this.agentContext
    };
  }

  // ============ Capability Methods ============

  /**
   * Check if agent has capability
   * @param {string} capability - Required capability
   * @returns {boolean}
   */
  hasCapability(capability) {
    return hasCapability(this.authorizedCapabilities, capability);
  }

  /**
   * Validate capability or throw
   * @param {string} capability - Required capability
   * @throws {UnauthorizedCapabilityError}
   */
  validateCapability(capability) {
    if (!this.hasCapability(capability)) {
      throw new UnauthorizedCapabilityError(capability, this.agentId);
    }
  }

  // ============ Truth Layer Methods ============

  /**
   * Log a prediction (delegates to TruthLayer)
   * @param {Object} prediction - Prediction details
   */
  async logPrediction(prediction) {
    if (!this.truthLayer) {
      console.warn('[TRUTH] Truth layer not enabled');
      return null;
    }
    return this.truthLayer.logPrediction(prediction);
  }

  /**
   * Log an outcome (delegates to TruthLayer)
   * @param {string} predictionId - Prediction ID
   * @param {Object} outcome - Outcome details
   */
  async logOutcome(predictionId, outcome) {
    if (!this.truthLayer) {
      console.warn('[TRUTH] Truth layer not enabled');
      return null;
    }
    return this.truthLayer.logOutcome(predictionId, outcome);
  }

  /**
   * Compute calibration (delegates to TruthLayer)
   * @param {string} period - Time period
   */
  async computeCalibration(period = 'month') {
    if (!this.truthLayer) {
      return { error: 'Truth layer not enabled' };
    }
    return this.truthLayer.computeCalibration(period);
  }

  /**
   * Validate business hypothesis
   * @param {Object} hypothesis - Hypothesis to validate
   */
  validateBusinessHypothesis(hypothesis) {
    if (!this.truthLayer) {
      throw new Error('[TRUTH] Truth layer not enabled');
    }
    return this.truthLayer.validateBusinessHypothesis(hypothesis);
  }
}

// Export handler map for reference
export { CEO_HANDLERS };

// Export schema for external validation
export { BUSINESS_HYPOTHESIS_SCHEMA };

// Export exceptions
export {
  BudgetExhaustedException,
  CircuitBreakerException,
  UnauthorizedCapabilityError,
  BusinessHypothesisValidationError
};

// Export managers
export { BudgetManager } from './budget-manager.js';
export { TruthLayer } from './truth-layer.js';

// Default export
export default VentureCEORuntime;
