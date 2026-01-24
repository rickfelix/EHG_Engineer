/**
 * Base Sub-Agent Class
 * LEO Protocol v4.1.2 - Sub-Agent Enhancement
 *
 * STRATEGIC HARDENING: Budget enforcement at constructor level
 * THE LAW: No sub-agent shall exist if budget_remaining <= 0. NO EXCEPTIONS.
 *
 * Refactored: 2026-01-24 (SD-LEO-REFAC-BASE-AGENT-003)
 *
 * BACKWARD COMPATIBILITY WRAPPER
 * This file re-exports from the modular structure in ./base-sub-agent/
 * All functionality preserved - imports continue to work unchanged.
 *
 * Module Structure:
 * - base-sub-agent/exceptions.js: Exception classes
 * - base-sub-agent/budget-manager.js: Budget checking and logging
 * - base-sub-agent/finding-manager.js: Finding creation, deduplication, scoring
 * - base-sub-agent/output-generator.js: Output generation, recommendations
 * - base-sub-agent/index.js: Main BaseSubAgent class
 */

// Re-export everything from the modular structure
export {
  default,
  // Exceptions
  BudgetExhaustedException,
  VentureRequiredException,
  BudgetConfigurationException,
  // Budget functions
  getSupabaseClient,
  checkBudget,
  // Finding functions
  generateFindingId,
  normalizeSeverity,
  calculateScore,
  // Output functions
  getStatus,
  generateSummary,
  getSourceFiles,
  // Constants
  DEFAULT_CONFIDENCE_THRESHOLDS,
  SEVERITY_WEIGHTS
} from './base-sub-agent/index.js';
