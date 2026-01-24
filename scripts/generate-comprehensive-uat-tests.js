#!/usr/bin/env node

/**
 * Comprehensive UAT Test Suite Generator for EHG Application
 * Generates 28 test files covering all 43+ pages with ~330 test cases
 *
 * REFACTORED: This file is now a thin wrapper around the domain modules.
 * See scripts/generate-uat/ for the extracted domain architecture.
 *
 * Domains:
 * - test-suite-config.js: Test suite definitions and configurations
 * - test-generators.js: Test file and implementation generators
 * - suite-builders.js: Admin, cross-functional, E2E suite builders
 * - index.js: Main orchestrator with re-exports
 */

// Re-export everything from the domain modules for backward compatibility
export {
  generateAllTests,
  TEST_SUITES,
  generateTestFile,
  generateTestImplementation,
  generateAdminTests,
  generateCrossFunctionalTests,
  generateE2ETests
} from './generate-uat/index.js';

export { default } from './generate-uat/index.js';

// CLI execution - delegate to the domain module
if (import.meta.url === `file://${process.argv[1]}`) {
  const { generateAllTests } = await import('./generate-uat/index.js');
  generateAllTests();
}
