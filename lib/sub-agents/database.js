/**
 * DATABASE Sub-Agent (Principal Database Architect)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Two-phase database migration validation + Schema verification
 * Code: DATABASE
 * Priority: 6
 *
 * Philosophy: Database-first architecture prevents data loss.
 * Always verify trigger functions match current table schema.
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 * Refactored: 2026-01-24 (SD-LEO-REFAC-DB-SUB-003)
 *
 * BACKWARD COMPATIBILITY WRAPPER
 * This file re-exports from the modular structure in ./database/
 * All functionality preserved - imports continue to work unchanged.
 *
 * Module Structure:
 * - database/schema-validator.js: Schema docs, validation, health check, RLS diagnosis
 * - database/migration-handler.js: Migration detection, execution, CLI operations
 * - database/db-verification.js: Database verification, contract validation, recommendations
 * - database/index.js: Main execute function and unified exports
 */

// Re-export everything from the modular structure
export {
  // Main execute function
  execute,
  // From schema-validator
  loadSchemaDocumentation,
  staticFileValidation,
  checkSchemaHealth,
  diagnoseRLSPolicies,
  // From migration-handler
  ACTION_TRIGGERS,
  detectActionIntent,
  findPendingMigrations,
  executeMigrations,
  // From db-verification
  databaseVerification,
  validateMigrationContract,
  displayPreflightChecklist,
  generateRecommendations
} from './database/index.js';
