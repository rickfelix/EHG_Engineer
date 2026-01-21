#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Automated Testing Sub-Agent
 * Re-export wrapper for modular implementation
 *
 * This file maintains backward compatibility by re-exporting from
 * the modular implementation in ./modules/testing-sub-agent/
 */

// Re-export main class and helpers
export {
  default,
  AutomatedTestingSubAgent,
  createConfig,
  createInitialTestResults
} from './modules/testing-sub-agent/index.js';

// Re-export all module functions for advanced usage
export * from './modules/testing-sub-agent/activation.js';
export * from './modules/testing-sub-agent/discovery.js';
export * from './modules/testing-sub-agent/page-testing.js';
export * from './modules/testing-sub-agent/component-testing.js';
export * from './modules/testing-sub-agent/performance.js';
export * from './modules/testing-sub-agent/accessibility.js';
export * from './modules/testing-sub-agent/reporting.js';
export * from './modules/testing-sub-agent/failure-analysis.js';
