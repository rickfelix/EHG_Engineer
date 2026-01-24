/**
 * Test Intelligence Module - Main Orchestrator
 * Phase 1: Selector Validation, Navigation Flow, Error Analysis, Component Mapping
 *
 * REFACTORED: This module orchestrates the domain modules.
 * See test-intelligence/ for domain architecture.
 *
 * Purpose: Make testing-agent proactive and intelligent
 *
 * @module test-intelligence
 */

// Domain imports
import {
  validateTestSelectors,
  validateNavigationFlow,
  analyzeTestComponentMapping,
  analyzeTestError
} from './validators.js';

import {
  getTestFileName,
  getTestFilePath,
  findTestFiles,
  findTestFilesFromBranch,
  readFileFromBranch,
  checkComponentExists,
  findAllComponents,
  checkComponentHasTest,
  isTestableComponent
} from './file-utils.js';

import {
  extractSelectorsFromTest,
  findReferencedComponents,
  validateSelector,
  extractNavigationSequences,
  validateNavigationSequence,
  extractComponentReferences
} from './extractors.js';

import {
  classifyError,
  determineRootCause,
  generateErrorFixes,
  calculateErrorAnalysisConfidence
} from './error-analysis.js';

// Re-exports for external use
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
};

export default {
  validateTestSelectors,
  validateNavigationFlow,
  analyzeTestComponentMapping,
  analyzeTestError
};
