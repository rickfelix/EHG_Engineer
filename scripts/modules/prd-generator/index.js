/**
 * PRD Generator Module Index
 * Part of SD-LEO-REFACTOR-PRD-DB-001
 *
 * This module provides PRD generation functionality,
 * broken down into focused modules for maintainability.
 */

// Configuration
export { LLM_PRD_CONFIG, PRD_QUALITY_RUBRIC_CRITERIA, buildSystemPrompt } from './config.js';

// Format Helpers
export {
  formatArrayField,
  formatRisks,
  formatObjectives,
  formatMetadata,
  formatVisionSpecs,
  formatGovernance
} from './format-helpers.js';

// Context Builder
export {
  buildPRDGenerationContext,
  buildDesignAgentPrompt,
  buildDatabaseAgentPrompt,
  buildSecurityAgentPrompt,
  buildRiskAgentPrompt
} from './context-builder.js';

// LLM Generator
export { generatePRDContentWithLLM } from './llm-generator.js';

// Content Formatter
export {
  formatPRDContent,
  createDefaultChecklists,
  calculateProgress
} from './content-formatter.js';

// Sub-Agent Runners
export {
  runDesignAgent,
  runDatabaseAgent,
  runSecurityAgent,
  runRiskAgent,
  updatePRDWithAnalyses
} from './sub-agent-runners.js';
