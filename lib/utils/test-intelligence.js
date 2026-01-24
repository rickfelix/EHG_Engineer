/**
 * Test Intelligence Module
 * Phase 1: Selector Validation, Navigation Flow, Error Analysis, Component Mapping
 *
 * REFACTORED: This file is now a thin wrapper around the domain modules.
 * See lib/utils/test-intelligence/ for the extracted domain architecture.
 *
 * Domains:
 * - validators.js: Main validation functions (phases 1.1-1.4)
 * - extractors.js: Selector, navigation, component extraction
 * - file-utils.js: File and branch-aware utilities
 * - error-analysis.js: Error classification and fix generation
 * - index.js: Main orchestrator with re-exports
 *
 * Purpose: Make testing-agent proactive and intelligent
 */

// Re-export everything from the domain modules for backward compatibility
export {
  // Main validation functions
  validateTestSelectors,
  validateNavigationFlow,
  analyzeTestComponentMapping,
  analyzeTestError,

  // File utilities
  getTestFileName,
  getTestFilePath,
  findTestFiles,
  findTestFilesFromBranch,
  readFileFromBranch,
  checkComponentExists,
  findAllComponents,
  checkComponentHasTest,
  isTestableComponent,

  // Extractors
  extractSelectorsFromTest,
  findReferencedComponents,
  validateSelector,
  extractNavigationSequences,
  validateNavigationSequence,
  extractComponentReferences,

  // Error analysis
  classifyError,
  determineRootCause,
  generateErrorFixes,
  calculateErrorAnalysisConfidence
} from './test-intelligence/index.js';

export { default } from './test-intelligence/index.js';
