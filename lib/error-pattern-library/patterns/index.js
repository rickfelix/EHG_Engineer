/**
 * Error Patterns Index
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 *
 * Aggregates all error patterns from category-specific modules.
 */

import { DATABASE_PATTERNS } from './database-patterns.js';
import { SECURITY_PATTERNS } from './security-patterns.js';
import { BUILD_PATTERNS } from './build-patterns.js';
import { RUNTIME_PATTERNS } from './runtime-patterns.js';
import { TEST_PATTERNS } from './test-patterns.js';
import { PERFORMANCE_PATTERNS } from './performance-patterns.js';
import { UI_PATTERNS } from './ui-patterns.js';

/**
 * All error patterns combined.
 * Order matters - more specific patterns should come before generic ones.
 */
export const ERROR_PATTERNS = [
  // Database errors
  ...DATABASE_PATTERNS,

  // Security/Authentication errors
  ...SECURITY_PATTERNS,

  // Runtime errors (before BUILD to avoid TypeErrors matching BUILD_TYPE_ERROR)
  ...RUNTIME_PATTERNS,

  // Build/Compilation errors
  ...BUILD_PATTERNS,

  // Test errors
  ...TEST_PATTERNS,

  // Performance errors
  ...PERFORMANCE_PATTERNS,

  // UI/Component errors
  ...UI_PATTERNS
];

// Re-export individual pattern arrays for direct access
export {
  DATABASE_PATTERNS,
  SECURITY_PATTERNS,
  BUILD_PATTERNS,
  RUNTIME_PATTERNS,
  TEST_PATTERNS,
  PERFORMANCE_PATTERNS,
  UI_PATTERNS
};
