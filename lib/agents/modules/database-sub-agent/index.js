/**
 * Database Sub-Agent - Index Module
 *
 * Re-exports all functionality from sub-modules for a clean public API.
 *
 * @module lib/agents/modules/database-sub-agent
 */

// SQL Parsing
export {
  extractTablesFromSQL,
  extractTableContent,
  extractColumns,
  analyzeSQLForIssues
} from './sql-parser.js';

// Schema Analysis
export {
  analyzeSchema,
  analyzeSchemaFiles,
  analyzeKnownTables,
  analyzeIndexes,
  checkRLSPolicies,
  validateRelationships,
  findSchemaFiles
} from './schema-analyzer.js';

// Migration Validation
export { validateMigrations } from './migration-validator.js';

// Query Analysis
export { analyzeQueries } from './query-analyzer.js';

// Integrity Checking
export { checkDataIntegrity } from './integrity-checker.js';

// Performance Analysis
export {
  analyzePerformance,
  findQueryPatterns,
  checkIndexExists
} from './performance-analyzer.js';

// Report Generation
export {
  generateRecommendations,
  calculateScore,
  generateReport,
  generateOptimizationScripts
} from './report-generator.js';

// Helpers
export { getSourceFiles } from './helpers.js';
