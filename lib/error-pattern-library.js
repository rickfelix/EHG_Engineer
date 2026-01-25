#!/usr/bin/env node

/**
 * Error Pattern Library for Automatic Sub-Agent Invocation
 *
 * Purpose: Detect errors during EXEC/PLAN phases and automatically invoke
 *          appropriate specialist sub-agents for diagnosis and recovery.
 *
 * This file is a re-export wrapper for backward compatibility.
 * The implementation has been refactored into domain modules:
 *
 * - error-pattern-library/constants.js - Error categories and severity levels
 * - error-pattern-library/patterns/ - Category-specific error patterns
 * - error-pattern-library/sub-agent-mapping.js - Sub-agent specialties
 * - error-pattern-library/detection.js - Error detection functions
 * - error-pattern-library/recommendation.js - Sub-agent recommendation functions
 * - error-pattern-library/index.js - Main re-export module
 *
 * @module error-pattern-library
 * @see SD-LEO-REFAC-ERR-PATTERN-004
 */

// Re-export everything from the modular implementation
export {
  ERROR_CATEGORIES,
  SEVERITY_LEVELS,
  ERROR_PATTERNS,
  DATABASE_PATTERNS,
  SECURITY_PATTERNS,
  BUILD_PATTERNS,
  RUNTIME_PATTERNS,
  TEST_PATTERNS,
  PERFORMANCE_PATTERNS,
  UI_PATTERNS,
  SUB_AGENT_SPECIALTIES,
  detectError,
  calculateConfidence,
  recommendSubAgent,
  getPatternsByCategory,
  getPatternsBySubAgent,
  getLibraryStats
} from './error-pattern-library/index.js';

// Default export for backward compatibility
export { default } from './error-pattern-library/index.js';
