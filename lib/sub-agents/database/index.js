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
 * Module Structure:
 * - schema-validator.js: Schema docs, validation, health check, RLS diagnosis
 * - migration-handler.js: Migration detection, execution, CLI operations
 * - db-verification.js: Database verification, contract validation, recommendations
 */

import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../../scripts/lib/supabase-connection.js';
import { quickPreflightCheck } from '../../../scripts/lib/handoff-preflight.js';

// Import from extracted modules
import {
  loadSchemaDocumentation,
  staticFileValidation,
  checkSchemaHealth,
  diagnoseRLSPolicies
} from './schema-validator.js';

import {
  ACTION_TRIGGERS,
  detectActionIntent,
  findPendingMigrations,
  executeMigrations
} from './migration-handler.js';

import {
  databaseVerification,
  validateMigrationContract,
  displayPreflightChecklist,
  generateRecommendations
} from './db-verification.js';

dotenv.config();

// Supabase client initialized in execute() to use async createSupabaseServiceClient
let supabase = null;

/**
 * Execute DATABASE sub-agent
 * Implements Two-Phase Database Migration Validation
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Database validation results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🗄️  Starting DATABASE validation for ${sdId}...`);
  console.log('   Two-Phase Migration Validation + Schema Verification');

  // ACTION INTENT DETECTION
  // Check if the context contains action-oriented keywords like "apply migration"
  const contextText = [
    options.context,
    options.description,
    options.trigger_phrase,
    subAgent?.trigger_phrase
  ].filter(Boolean).join(' ');

  const actionIntent = detectActionIntent(contextText);

  if (actionIntent.isAction) {
    console.log(`\n🎯 ACTION INTENT DETECTED: "${actionIntent.matchedTrigger}"`);
    console.log('   Mode: Migration Execution (with confirmation)');
    options.execute_migration = true;
  }

  // Initialize Supabase client with SERVICE_ROLE_KEY (SD-FOUND-SAFETY-002 pattern)
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }

  // TIER 1.5: Handoff Preflight Check
  // Verify SD has proper handoff chain before proceeding with database validation
  // This is advisory - we log warnings but don't block database work
  try {
    console.log('   🔗 Checking handoff chain status...');
    const preflightResult = await quickPreflightCheck(sdId, 'EXEC');

    if (preflightResult.ready) {
      console.log('   ✅ Handoff chain verified for EXEC phase');
    } else {
      console.log('   ⚠️  Handoff chain incomplete:');
      (preflightResult.missing || []).forEach(h => console.log(`      • Missing: ${h}`));
      console.log('   💡 Consider running: node scripts/handoff.js create --sd ' + sdId);
      console.log('   ⚠️  Proceeding with DATABASE validation (advisory check)');
    }
  } catch (preflightError) {
    console.log(`   ⚠️  Handoff preflight skipped: ${preflightError.message}`);
  }

  const results = {
    verdict: 'PASS',
    confidence: 100,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {},
    findings: {
      phase1_file_validation: null,
      phase2_db_verification: null,
      preflight_checklist: null,
      schema_health: null,
      schema_context_loaded: null
    },
    options
  };

  try {
    // Load Schema Documentation (NEW - provides full context)
    console.log('\n📚 Loading schema documentation for context...');
    const schemaContext = await loadSchemaDocumentation();
    results.findings.schema_context_loaded = schemaContext;

    if (schemaContext.loaded) {
      console.log(`   ✅ Loaded schema docs: ${schemaContext.tables_count} tables documented`);
      console.log(`   📊 Application: ${schemaContext.application}`);
      console.log(`   📦 Database: ${schemaContext.database_id}`);
    } else {
      console.log('   ⚠️  Schema docs not available (will query database directly)');
      results.warnings.push({
        severity: 'LOW',
        issue: 'Schema documentation not available',
        recommendation: 'Run: npm run schema:docs:engineer',
        note: 'Schema docs provide faster context loading'
      });
    }

    // Pre-Flight Checklist Reminder
    console.log('\n📋 Migration Pre-Flight Checklist Reminder...');
    const preflight = displayPreflightChecklist();
    results.findings.preflight_checklist = preflight;

    // RLS Policy Diagnostic (Optional, via --diagnose-rls or --table-name)
    // Run BEFORE phase1 validation so it executes even if no migrations exist
    if (options.diagnose_rls || options.table_name) {
      console.log('\n🔐 RLS Policy Diagnostic (via Supabase CLI)...');
      const tableName = options.table_name || 'sd_phase_handoffs'; // Default to problematic table
      const rlsDiagnosis = await diagnoseRLSPolicies(tableName);
      results.findings.rls_diagnosis = rlsDiagnosis;

      if (rlsDiagnosis.access_issues.length > 0) {
        results.warnings.push({
          severity: 'HIGH',
          issue: `RLS policy blocking access to ${tableName}`,
          recommendation: rlsDiagnosis.recommendations[0] || 'Use SERVICE_ROLE_KEY or Supabase CLI',
          details: rlsDiagnosis.access_issues
        });

        // Add all recommendations
        results.recommendations.push(...rlsDiagnosis.recommendations);
      }

      if (!rlsDiagnosis.cli_available) {
        results.warnings.push({
          severity: 'MEDIUM',
          issue: 'Supabase CLI not available',
          recommendation: 'Install: npm install -g supabase',
          note: 'CLI enables advanced diagnostics and service role operations'
        });
      }
    }

    // Phase 1: Static File Validation (Always Runs)
    console.log('\n🔍 Phase 1: Static File Validation...');
    const phase1 = await staticFileValidation(sdId, options);
    results.findings.phase1_file_validation = phase1;

    if (phase1.verdict === 'NOT_REQUIRED') {
      console.log('   ✅ No database changes required for this SD');
      results.verdict = 'PASS';
      results.confidence = 100;
      results.recommendations.push('No database migrations needed for this SD');
      return results;
    }

    if (phase1.verdict === 'INVALID') {
      results.verdict = 'BLOCKED';
      results.confidence = 100;
      results.critical_issues.push(...phase1.critical_issues);
      results.recommendations.push('Fix migration file syntax errors before proceeding');
      return results;
    }

    if (phase1.verdict === 'INCOMPLETE') {
      results.verdict = 'CONDITIONAL_PASS';
      results.confidence = 70;
      results.warnings.push({
        severity: 'HIGH',
        issue: 'Migration files incomplete or missing patterns',
        recommendation: 'Review migration files for completeness',
        details: phase1.warnings
      });
    }

    if (phase1.cross_schema_fks.length > 0) {
      results.warnings.push({
        severity: 'HIGH',
        issue: `Found ${phase1.cross_schema_fks.length} cross-schema foreign keys`,
        recommendation: 'Remove REFERENCES auth.users(id) - use RLS with auth.uid() instead',
        details: phase1.cross_schema_fks
      });
      if (results.confidence > 80) results.confidence = 80;
    }

    // Contract Compliance Phase: Validate migrations against parent data contract
    console.log('\n📜 Contract Compliance: Validating migrations against parent contract...');
    const contractValidation = await validateMigrationContract(sdId, phase1.migration_files);
    results.findings.contract_compliance = contractValidation;

    if (contractValidation.has_contract) {
      if (contractValidation.valid === false) {
        // DATA_CONTRACT violations are BLOCKERs
        results.verdict = 'BLOCKED';
        results.confidence = 100;

        for (const violation of (contractValidation.violations || [])) {
          results.critical_issues.push({
            severity: 'CRITICAL',
            issue: `DATA_CONTRACT violation: ${violation.message}`,
            recommendation: 'Migration references tables/operations outside parent contract boundaries',
            type: violation.type,
            contract_id: violation.contract_id
          });
        }

        console.log(`   ❌ Contract validation FAILED: ${contractValidation.violations?.length || 0} violation(s)`);
        return results;
      } else {
        console.log('   ✅ Migrations comply with parent data contract');
        if (contractValidation.contract_id) {
          console.log(`      Contract ID: ${contractValidation.contract_id}`);
          console.log(`      Contract Version: ${contractValidation.contract_version}`);
        }
      }
    } else {
      console.log('   ℹ️  No parent data contract found (standalone SD or no contract defined)');
    }

    // Phase 2: Database Verification (Optional)
    if (options.verify_db) {
      console.log('\n🔍 Phase 2: Database Verification...');
      const phase2 = await databaseVerification(sdId, phase1.migration_files, options, supabase);
      results.findings.phase2_db_verification = phase2;

      if (phase2.verdict === 'DB_MISMATCH') {
        results.verdict = 'BLOCKED';
        results.confidence = 100;
        results.critical_issues.push({
          severity: 'CRITICAL',
          issue: 'Migration files valid but tables missing in database',
          recommendation: 'Apply migration: supabase db push',
          details: phase2.missing_tables
        });
      }

      if (phase2.verdict === 'SEED_DATA_MISSING' && options.check_seed_data) {
        results.verdict = 'CONDITIONAL_PASS';
        results.confidence = 70;
        results.warnings.push({
          severity: 'HIGH',
          issue: 'Tables exist but seed data missing (silent failure detected)',
          recommendation: 'Re-run seed data script or verify data manually',
          details: phase2.empty_tables
        });
      }

      if (phase2.verdict === 'DB_ACCESS_ISSUE') {
        results.warnings.push({
          severity: 'MEDIUM',
          issue: 'Tables exist but not accessible (RLS policy issue)',
          recommendation: 'Check RLS policies allow anon SELECT access',
          details: phase2.inaccessible_tables
        });
        if (results.confidence > 85) results.confidence = 85;
      }
    } else {
      console.log('\n⏭️  Phase 2: Database Verification skipped');
      console.log('   💡 Use --verify-db flag to check database state');
      results.recommendations.push('Run with --verify-db to verify tables exist in database');
    }

    // Schema Health Check
    console.log('\n💊 Schema Health Check...');
    const schemaHealth = await checkSchemaHealth(sdId);
    results.findings.schema_health = schemaHealth;

    if (schemaHealth.trigger_issues.length > 0) {
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${schemaHealth.trigger_issues.length} trigger function(s) may have schema mismatches`,
        recommendation: 'Verify trigger functions reference correct column names',
        details: schemaHealth.trigger_issues
      });
    }

    // MIGRATION EXECUTION (if action intent detected)
    if (options.execute_migration && results.verdict !== 'BLOCKED') {
      console.log('\n🚀 Migration Execution Phase...');

      // Find all pending migrations (filtered by SD if available)
      const pendingMigrations = await findPendingMigrations(
        options.migration_filter_sd ? sdId : null,
        options.migration_path
      );

      results.findings.migration_execution = await executeMigrations(pendingMigrations, {
        auto_execute: options.confirm_apply || false,
        dry_run: options.dry_run || false
      });

      // If migrations require confirmation, add to recommendations
      if (results.findings.migration_execution.requires_confirmation) {
        results.recommendations.unshift({
          priority: 'HIGH',
          action: 'CONFIRM_MIGRATION',
          message: 'Review the migration files above and confirm to apply',
          files: results.findings.migration_execution.confirmation_display?.files || [],
          command: 'Run with --confirm-apply to execute migrations'
        });
      }

      // If migrations were executed successfully
      if (results.findings.migration_execution.executed) {
        console.log('\n✅ Migrations applied successfully!');
        results.recommendations.push('Verify database state after migration');
      }
    }

    // Generate final recommendations
    generateRecommendations(results);

    console.log(`\n✅ DATABASE validation complete: ${results.verdict} (${results.confidence}% confidence)`);

    return results;

  } catch (error) {
    console.error('\n❌ DATABASE validation error:', error.message);
    results.verdict = 'FAIL';
    results.error = error.message;
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'DATABASE sub-agent execution failed',
      recommendation: 'Review error and retry',
      error: error.message
    });
    return results;
  }
}

// Re-export all module exports for backward compatibility
export {
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
};
