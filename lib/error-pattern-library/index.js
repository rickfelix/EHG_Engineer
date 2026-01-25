/**
 * Error Pattern Library for Automatic Sub-Agent Invocation
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 *
 * Purpose: Detect errors during EXEC/PLAN phases and automatically invoke
 *          appropriate specialist sub-agents for diagnosis and recovery.
 *
 * This file is a re-export wrapper for backward compatibility.
 * The implementation has been refactored into domain modules:
 *
 * - constants.js - Error categories and severity levels
 * - patterns/ - Category-specific error patterns
 * - sub-agent-mapping.js - Sub-agent specialties
 * - detection.js - Error detection functions
 * - recommendation.js - Sub-agent recommendation functions
 *
 * Usage:
 *   import { detectError, recommendSubAgent } from './error-pattern-library/index.js';
 *
 *   const errorInfo = detectError(errorMessage, context);
 *   const subAgent = recommendSubAgent(errorInfo);
 *
 * @module error-pattern-library
 * @see SD-LEO-REFAC-ERR-PATTERN-004
 */

// Constants
export { ERROR_CATEGORIES, SEVERITY_LEVELS } from './constants.js';

// Error patterns
export {
  ERROR_PATTERNS,
  DATABASE_PATTERNS,
  SECURITY_PATTERNS,
  BUILD_PATTERNS,
  RUNTIME_PATTERNS,
  TEST_PATTERNS,
  PERFORMANCE_PATTERNS,
  UI_PATTERNS
} from './patterns/index.js';

// Sub-agent mapping
export { SUB_AGENT_SPECIALTIES } from './sub-agent-mapping.js';

// Detection functions
export { detectError, calculateConfidence } from './detection.js';

// Recommendation functions
export {
  recommendSubAgent,
  getPatternsByCategory,
  getPatternsBySubAgent,
  getLibraryStats
} from './recommendation.js';

// Default export for backward compatibility
import { ERROR_CATEGORIES, SEVERITY_LEVELS } from './constants.js';
import { ERROR_PATTERNS } from './patterns/index.js';
import { SUB_AGENT_SPECIALTIES } from './sub-agent-mapping.js';
import { detectError } from './detection.js';
import {
  recommendSubAgent,
  getPatternsByCategory,
  getPatternsBySubAgent,
  getLibraryStats
} from './recommendation.js';

export default {
  ERROR_CATEGORIES,
  SEVERITY_LEVELS,
  ERROR_PATTERNS,
  SUB_AGENT_SPECIALTIES,
  detectError,
  recommendSubAgent,
  getPatternsByCategory,
  getPatternsBySubAgent,
  getLibraryStats
};
