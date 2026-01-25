/**
 * Error Pattern Library - Constants
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 *
 * Error categories and severity levels used throughout the library.
 */

// ============================================================================
// ERROR CATEGORIES
// ============================================================================

export const ERROR_CATEGORIES = {
  DATABASE: 'DATABASE',
  SECURITY: 'SECURITY',
  BUILD: 'BUILD',
  RUNTIME: 'RUNTIME',
  TEST: 'TEST',
  NETWORK: 'NETWORK',
  FILESYSTEM: 'FILESYSTEM',
  PERFORMANCE: 'PERFORMANCE',
  UI_COMPONENT: 'UI_COMPONENT',
  DEPENDENCY: 'DEPENDENCY'
};

// ============================================================================
// SEVERITY LEVELS
// ============================================================================

export const SEVERITY_LEVELS = {
  CRITICAL: 'CRITICAL',   // System-breaking, requires immediate attention
  HIGH: 'HIGH',           // Major functionality broken
  MEDIUM: 'MEDIUM',       // Feature degradation
  LOW: 'LOW'              // Minor issues, cosmetic
};
