/**
 * Database Verification Module
 * DATABASE Sub-Agent - Database State Verification & Recommendations
 *
 * Extracted from lib/sub-agents/database.js (SD-LEO-REFAC-DB-SUB-003)
 *
 * Responsibilities:
 * - Phase 2 database verification
 * - Migration contract validation
 * - Generate recommendations
 * - Display preflight checklist
 */

import { readFile } from 'fs/promises';
import { validateMigrationAgainstDataContract, getInheritedContracts } from '../../../scripts/modules/contract-validation.js';

/**
 * Phase 2: Database Verification
 * Verifies database state matches migration files
 * @param {string} sdId - Strategic Directive ID
 * @param {Array} migrationFiles - Array of migration file paths
 * @param {Object} options - Verification options
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Object>} Verification result
 */
export async function databaseVerification(sdId, migrationFiles, options, supabase) {
  console.log('   🔍 Verifying database state...');

  const verification = {
    verdict: 'VALID',
    tables_checked: [],
    missing_tables: [],
    inaccessible_tables: [],
    empty_tables: []
  };

  try {
    // Extract table names from migration files
    const tableNames = new Set();

    for (const filePath of migrationFiles) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const createMatches = content.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)/gi);

        for (const match of createMatches) {
          tableNames.add(match[1]);
        }
      } catch (err) {
        console.log(`      ⚠️  Could not read ${filePath}: ${err.message}`);
      }
    }

    console.log(`      📊 Checking ${tableNames.size} table(s)...`);

    // Check each table
    for (const tableName of tableNames) {
      console.log(`         🔍 ${tableName}...`);

      try {
        // Try to query table (tests existence + RLS access)
        const { error, count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });

        if (error) {
          if (error.message.includes('does not exist')) {
            verification.missing_tables.push(tableName);
            verification.verdict = 'DB_MISMATCH';
            console.log('            ❌ Table missing');
          } else if (error.message.includes('permission denied') || error.message.includes('RLS')) {
            verification.inaccessible_tables.push(tableName);
            verification.verdict = 'DB_ACCESS_ISSUE';
            console.log('            ⚠️  Access denied (RLS)');
          } else {
            console.log(`            ⚠️  Error: ${error.message}`);
          }
        } else {
          verification.tables_checked.push(tableName);

          if (options.check_seed_data && count === 0) {
            verification.empty_tables.push(tableName);
            if (verification.verdict === 'VALID') {
              verification.verdict = 'SEED_DATA_MISSING';
            }
            console.log('            ⚠️  Table exists but 0 rows (seed data missing?)');
          } else {
            console.log(`            ✅ Verified (${count || 0} rows)`);
          }
        }
      } catch (err) {
        console.log(`            ⚠️  Check failed: ${err.message}`);
      }
    }

  } catch (error) {
    console.error(`      ❌ Database verification error: ${error.message}`);
    verification.verdict = 'ERROR';
  }

  return verification;
}

/**
 * Validate migrations against parent data contract
 * @param {string} sdId - Strategic Directive ID
 * @param {Array} migrationFiles - Array of migration file paths
 * @returns {Promise<Object>} Contract validation result
 */
export async function validateMigrationContract(sdId, migrationFiles) {
  const result = {
    has_contract: false,
    valid: true,
    violations: [],
    contract_id: null,
    contract_version: null
  };

  try {
    // Check if SD has an inherited data contract
    const contracts = await getInheritedContracts(sdId);

    if (contracts.error || !contracts.dataContract) {
      // No data contract = no restrictions
      return result;
    }

    result.has_contract = true;
    result.contract_id = contracts.dataContract.contract_id;
    result.contract_version = contracts.dataContract.contract_version;

    // Read and concatenate all migration file contents
    let migrationContent = '';
    for (const migrationFile of (migrationFiles || [])) {
      try {
        const content = await readFile(migrationFile, 'utf-8');
        migrationContent += '\n' + content;
      } catch {
        console.log(`      ⚠️  Could not read migration file: ${migrationFile}`);
      }
    }

    if (!migrationContent.trim()) {
      console.log('      ℹ️  No migration content to validate');
      return result;
    }

    // Validate against data contract using the database RPC
    const validation = await validateMigrationAgainstDataContract(sdId, migrationContent);

    result.valid = validation.valid;
    result.violations = validation.violations || [];
    result.checked_at = validation.checked_at;

    if (validation.contract_id) {
      result.contract_id = validation.contract_id;
      result.contract_version = validation.contract_version;
    }

  } catch (error) {
    console.error(`      ❌ Contract validation error: ${error.message}`);
    result.error = error.message;
    // Don't block on errors - just warn
    result.valid = true;
  }

  return result;
}

/**
 * Display Pre-Flight Checklist
 * @returns {Object} Preflight checklist result
 */
export function displayPreflightChecklist() {
  console.log('   📖 BEFORE attempting any database migration:');
  console.log('      1. Read established pattern (lib/supabase-connection.js)');
  console.log('      2. Verify connection parameters:');
  console.log('         - Region: aws-1-us-east-1 (NOT aws-0)');
  console.log('         - Port: 5432 (Transaction Mode)');
  console.log('         - SSL: { rejectUnauthorized: false }');
  console.log('      3. Use helper functions (createDatabaseClient, splitPostgreSQLStatements)');
  console.log('      4. Handle conflicts gracefully (DROP IF EXISTS, ON CONFLICT DO NOTHING)');
  console.log('      5. Leverage Supabase CLI for RLS-protected operations');

  return {
    displayed: true,
    key_points: [
      'Read established pattern first',
      'Verify connection parameters',
      'Use helper functions',
      'Handle conflicts gracefully',
      'Use Supabase CLI for service role access'
    ]
  };
}

/**
 * Generate Recommendations based on validation results
 * @param {Object} results - Validation results object
 */
export function generateRecommendations(results) {
  const { findings } = results;

  // Phase 1 recommendations
  if (findings.phase1_file_validation?.verdict === 'INVALID') {
    results.recommendations.push('Fix SQL syntax errors in migration files');
  }

  if (findings.phase1_file_validation?.cross_schema_fks.length > 0) {
    results.recommendations.push('Remove cross-schema foreign keys (REFERENCES auth.users)');
    results.recommendations.push('Use RLS policies with auth.uid() instead of foreign keys');
  }

  // Phase 2 recommendations
  if (findings.phase2_db_verification?.missing_tables.length > 0) {
    results.recommendations.push('Apply migrations: supabase db push');
  }

  if (findings.phase2_db_verification?.empty_tables.length > 0) {
    results.recommendations.push('Re-run seed data scripts (silent failure detected)');
  }

  if (findings.phase2_db_verification?.inaccessible_tables.length > 0) {
    results.recommendations.push('Fix RLS policies to allow anon SELECT access');
  }

  // General recommendations
  if (!results.options.verify_db) {
    results.recommendations.push('Run with --verify-db to verify database state matches migration files');
  }

  if (!results.options.check_seed_data) {
    results.recommendations.push('Run with --check-seed-data to verify seed data was inserted');
  }

  // Contract compliance recommendations
  if (results.findings.contract_compliance?.valid === false) {
    results.recommendations.push('Review parent data contract boundaries');
    results.recommendations.push('Modify migrations to only touch allowed tables');
    results.recommendations.push('Or request contract update from parent SD owner');
  }
}
