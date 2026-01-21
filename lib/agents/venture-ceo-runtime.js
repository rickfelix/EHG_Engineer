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
 *
 * REFACTORED: SD-LEO-REFACTOR-VENTURE-CEO-001
 * This file now re-exports from the modular structure in ./venture-ceo/ for backward compatibility.
 * Original file was 1601 LOC, now split into 7 modules under 500 LOC each.
 *
 * Modules:
 * - venture-ceo/exceptions.js - Custom exception classes
 * - venture-ceo/constants.js - Handler registry and schema definitions
 * - venture-ceo/budget-manager.js - Budget checking and logging
 * - venture-ceo/truth-layer.js - Prediction/outcome tracking and calibration
 * - venture-ceo/handlers.js - CEO message handlers
 * - venture-ceo/helpers.js - Private helper methods
 * - venture-ceo/index.js - VentureCEORuntime class orchestration
 */

// Re-export everything from modular structure
export {
  VentureCEORuntime,
  CEO_HANDLERS,
  BUSINESS_HYPOTHESIS_SCHEMA,
  BudgetExhaustedException,
  CircuitBreakerException,
  UnauthorizedCapabilityError,
  BusinessHypothesisValidationError,
  BudgetManager,
  TruthLayer
} from './venture-ceo/index.js';

// Re-export exceptions individually for direct import
export {
  BudgetConfigurationException
} from './venture-ceo/exceptions.js';

// Re-export constants for direct access
export {
  BUDGET_THRESHOLDS,
  STAGE_TO_VP
} from './venture-ceo/constants.js';

// Re-export handlers for testing
export {
  handleCEOTaskDelegation,
  handleCEOTaskCompletion,
  handleCEOStatusReport,
  handleCEOEscalation,
  handleCEOQuery,
  handleCEOResponse
} from './venture-ceo/handlers.js';

// Re-export truth layer functions
export {
  logPrediction,
  logOutcome
} from './venture-ceo/truth-layer.js';

// Re-export helpers for testing
export {
  loadAgentContext,
  markMessageCompleted,
  markMessageFailed,
  sendOutboundMessages,
  updateMemory,
  runSupervisorTimers,
  getEvaAgent,
  getVentureStatus,
  getVpStatuses,
  sleep,
  hasCapability,
  validateCapability
} from './venture-ceo/helpers.js';

// Default export
import VentureCEORuntime from './venture-ceo/index.js';
export default VentureCEORuntime;
