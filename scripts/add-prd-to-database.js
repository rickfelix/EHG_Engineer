#!/usr/bin/env node

/**
 * Add PRD to database
 * Creates a PRD entry for a given Strategic Directive
 *
 * Enhanced with:
 * - Auto-trigger for Product Requirements Expert (STORIES sub-agent)
 * - Semantic component recommendations with explainable AI
 *
 * Part of Phase 3.2: User story validation enforcement
 * Part of Semantic Component Selector: PRD enhancement
 *
 * NOTE: This file has been refactored into modular components.
 * See scripts/prd/ for the modular implementation.
 * SD-LEO-REFACTOR-PRD-DB-002
 */

// Re-export everything from modular structure
export { addPRDToDatabase } from './prd/index.js';
export { generatePRDContentWithLLM, buildPRDGenerationContext } from './prd/llm-generator.js';
export {
  formatArrayField,
  formatRisks,
  formatMetadata,
  formatVisionSpecs,
  formatGovernance,
  formatObjectives,
  formatPRDContent
} from './prd/formatters.js';
export { LLM_PRD_CONFIG, PRD_QUALITY_RUBRIC_CRITERIA, buildSystemPrompt } from './prd/config.js';
export {
  executeDesignAnalysis,
  executeDatabaseAnalysis,
  executeSecurityAnalysis,
  executeRiskAnalysis
} from './prd/sub-agent-orchestrator.js';
export {
  createPRDEntry,
  updatePRDWithAnalyses,
  updatePRDWithLLMContent,
  updatePRDWithComponentRecommendations,
  checkPRDTableExists,
  printTableCreationSQL,
  fetchExistingUserStories
} from './prd/prd-creator.js';

// CLI entry point - delegate to modular index
import { addPRDToDatabase } from './prd/index.js';

// Only run CLI when executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     process.argv[1]?.endsWith('add-prd-to-database.js');

if (isMainModule) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: node scripts/add-prd-to-database.js <SD-ID> [PRD-Title]');
    console.log('Example: node scripts/add-prd-to-database.js SD-DASHBOARD-AUDIT-2025-08-31-A "Dashboard Audit PRD"');
    process.exit(1);
  }

  const sdId = args[0];
  const prdTitle = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
  addPRDToDatabase(sdId, prdTitle);
}
