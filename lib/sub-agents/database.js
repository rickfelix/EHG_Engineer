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
 */

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import globPkg from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import {
  detectValidationMode
} from '../utils/adaptive-validation.js';

// Handle CommonJS/ESM compatibility for glob
const { glob } = globPkg;
const execAsync = promisify(exec);

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Load Schema Documentation for Context
 * Reads the auto-generated schema overview to provide context
 */
async function loadSchemaDocumentation() {
  const schemaOverviewPath = path.join(
    process.cwd(),
    'docs',
    'reference',
    'schema',
    'engineer',
    'database-schema-overview.md'
  );

  try {
    if (!existsSync(schemaOverviewPath)) {
      return {
        loaded: false,
        reason: 'Schema docs not generated yet'
      };
    }

    const content = await readFile(schemaOverviewPath, 'utf-8');

    // Extract metadata from the schema docs
    const applicationMatch = content.match(/\*\*Application\*\*:\s*(.+)/);
    const databaseMatch = content.match(/\*\*Database\*\*:\s*(\w+)/);
    const tablesMatch = content.match(/\*\*Tables\*\*:\s*(\d+)/);
    const repositoryMatch = content.match(/\*\*Repository\*\*:\s*(.+)/);

    return {
      loaded: true,
      application: applicationMatch ? applicationMatch[1].trim() : 'Unknown',
      database_id: databaseMatch ? databaseMatch[1] : 'Unknown',
      tables_count: tablesMatch ? parseInt(tablesMatch[1]) : 0,
      repository: repositoryMatch ? repositoryMatch[1].trim() : 'Unknown',
      overview_path: schemaOverviewPath,
      content_preview: content.substring(0, 500)
    };
  } catch (error) {
    return {
      loaded: false,
      error: error.message,
      reason: 'Failed to read schema docs'
    };
  }
}

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

  // SD-LEO-PROTOCOL-V4-4-0: Detect validation mode (for consistency)
  const validationMode = await detectValidationMode(sdId, options);

  const results = {
    verdict: 'PASS',
    confidence: 100,
    validation_mode: validationMode,  // SD-LEO-PROTOCOL-V4-4-0: Add for database storage
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

    // Phase 2: Database Verification (Optional)
    if (options.verify_db) {
      console.log('\n🔍 Phase 2: Database Verification...');
      const phase2 = await databaseVerification(sdId, phase1.migration_files, options);
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

/**
 * Diagnose RLS Policies using Supabase CLI
 */
async function diagnoseRLSPolicies(tableName) {
  console.log(`   🔍 Diagnosing RLS policies for ${tableName} using Supabase CLI...`);

  const diagnosis = {
    cli_available: false,
    policies_found: [],
    access_issues: [],
    recommendations: []
  };

  try {
    // Check if Supabase CLI is available
    try {
      const { stdout: versionOutput } = await execAsync('supabase --version');
      diagnosis.cli_available = true;
      console.log(`      ✅ Supabase CLI available: ${versionOutput.trim()}`);
    } catch (error) {
      console.log('      ⚠️  Supabase CLI not available');
      diagnosis.recommendations.push('Install Supabase CLI: npm install -g supabase');
      return diagnosis;
    }

    // Inspect database schema for RLS policies
    console.log('      🔍 Inspecting RLS policies...');
    try {
      const { stdout: policyOutput } = await execAsync(
        `supabase db dump --schema public | grep -A 5 "CREATE POLICY.*${tableName}"`
      );

      if (policyOutput) {
        const policies = policyOutput.split('\n').filter(line => line.includes('CREATE POLICY'));
        diagnosis.policies_found = policies;
        console.log(`      ✅ Found ${policies.length} RLS policy/policies for ${tableName}`);

        // Check for authenticated-only policies
        const authOnlyPolicies = policies.filter(p =>
          p.includes('TO authenticated') || p.includes('FOR authenticated')
        );

        if (authOnlyPolicies.length > 0) {
          diagnosis.access_issues.push({
            issue: 'Table has authenticated-only policies',
            policies: authOnlyPolicies,
            impact: 'Anonymous key cannot INSERT/UPDATE/DELETE'
          });
          console.log(`      ⚠️  ${authOnlyPolicies.length} authenticated-only policy/policies found`);
        }
      }
    } catch (error) {
      // grep returns non-zero if no matches, which is expected
      console.log('      ℹ️  No specific policies found (or CLI command failed)');
    }

    // Check current connection type
    console.log('      🔍 Checking connection type...');
    const usingAnonKey = !!process.env.SUPABASE_ANON_KEY;
    const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (usingAnonKey && diagnosis.access_issues.length > 0) {
      diagnosis.recommendations.push(
        'Option 1: Use SERVICE_ROLE_KEY for unrestricted access',
        'Option 2: Use Supabase CLI with service role: supabase db execute',
        'Option 3: Modify RLS policy to allow anon INSERT (security risk)',
        'Option 4: Create authenticated API endpoint for table operations'
      );
    }

    if (hasServiceRole) {
      console.log('      ✅ SERVICE_ROLE_KEY available - can bypass RLS');
      diagnosis.recommendations.push('Use SERVICE_ROLE_KEY for this operation');
    } else {
      console.log('      ⚠️  SERVICE_ROLE_KEY not available');
    }

  } catch (error) {
    console.error(`      ❌ RLS diagnosis error: ${error.message}`);
    diagnosis.error = error.message;
  }

  return diagnosis;
}

/**
 * Execute Database Operation via Supabase CLI
 */
async function executeViaSupabaseCLI(sqlStatement, description = 'SQL operation') {
  console.log(`   🚀 Executing via Supabase CLI: ${description}...`);

  const result = {
    success: false,
    output: null,
    error: null
  };

  try {
    // Check if Supabase CLI is available and linked
    const { stdout: linkStatus } = await execAsync('supabase status');
    console.log('      ✅ Supabase project linked');

    // Execute SQL via CLI (bypasses RLS with service role)
    const { stdout, stderr } = await execAsync(
      `supabase db execute --sql "${sqlStatement.replace(/"/g, '\\"')}"`
    );

    result.success = true;
    result.output = stdout;

    if (stderr) {
      console.log(`      ⚠️  Warnings: ${stderr}`);
    }

    console.log('      ✅ Execution successful');

  } catch (error) {
    result.error = error.message;
    console.error(`      ❌ Execution failed: ${error.message}`);

    if (error.message.includes('not linked')) {
      console.log(`      💡 Run: supabase link --project-ref ${process.env.SUPABASE_PROJECT_REF || '[your-project-ref]'}`);
    }
  }

  return result;
}

/**
 * Display Pre-Flight Checklist
 */
function displayPreflightChecklist() {
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
 * Phase 1: Static File Validation
 */
async function staticFileValidation(sdId, options) {
  console.log(`   🔍 Searching for migration files for ${sdId}...`);

  const validation = {
    verdict: 'NOT_REQUIRED',
    migration_files: [],
    critical_issues: [],
    warnings: [],
    cross_schema_fks: []
  };

  try {
    // Search for migration files mentioning this SD
    const migrationPaths = [
      'database/migrations/*.sql',
      'supabase/migrations/*.sql',
      'migrations/*.sql'
    ];

    let allFiles = [];
    for (const pattern of migrationPaths) {
      try {
        const files = await glob(pattern);
        // Convert to array if it's an async iterator or Glob object
        const fileArray = Array.isArray(files) ? files : Array.from(files);
        allFiles = allFiles.concat(fileArray);
      } catch (err) {
        // Pattern not found, skip
      }
    }

    console.log(`      Found ${allFiles.length} total migration files`);

    // Filter files that mention this SD
    const relevantFiles = [];
    for (const file of allFiles) {
      try {
        const content = await readFile(file, 'utf-8');
        if (content.includes(sdId)) {
          relevantFiles.push({ path: file, content });
        }
      } catch (err) {
        console.log(`      ⚠️  Could not read ${file}: ${err.message}`);
      }
    }

    if (relevantFiles.length === 0) {
      console.log(`      ✅ No migration files found for ${sdId}`);
      validation.verdict = 'NOT_REQUIRED';
      return validation;
    }

    console.log(`      ✅ Found ${relevantFiles.length} migration file(s) for ${sdId}`);

    validation.migration_files = relevantFiles.map(f => f.path);
    validation.verdict = 'VALID';

    // Validate each file
    for (const file of relevantFiles) {
      console.log(`      🔍 Validating ${file.path}...`);

      // Check for required patterns
      const hasCreateTable = file.content.match(/CREATE TABLE/i);
      const hasAlterTable = file.content.match(/ALTER TABLE/i);
      const hasCreateIndex = file.content.match(/CREATE INDEX/i);
      const hasRLS = file.content.match(/ROW LEVEL SECURITY|RLS|CREATE POLICY/i);

      if (!hasCreateTable && !hasAlterTable && !hasCreateIndex) {
        validation.warnings.push({
          file: file.path,
          issue: 'No CREATE TABLE, ALTER TABLE, or CREATE INDEX patterns found',
          severity: 'LOW'
        });
      }

      // Check for cross-schema foreign keys (PROHIBITED)
      const crossSchemaFKs = file.content.match(/REFERENCES\s+auth\.\w+/gi);
      if (crossSchemaFKs) {
        validation.cross_schema_fks.push({
          file: file.path,
          matches: crossSchemaFKs,
          line_context: 'Search file for REFERENCES auth.'
        });
        console.log(`         ⚠️  Found ${crossSchemaFKs.length} cross-schema FK(s)`);
      }

      // Check for unclosed quotes or unbalanced parentheses
      const openQuotes = (file.content.match(/'/g) || []).length;
      const openParens = (file.content.match(/\(/g) || []).length;
      const closeParens = (file.content.match(/\)/g) || []).length;

      if (openQuotes % 2 !== 0) {
        validation.critical_issues.push({
          file: file.path,
          issue: 'Unclosed single quotes detected',
          severity: 'CRITICAL'
        });
        validation.verdict = 'INVALID';
        console.log('         ❌ Unclosed quotes detected');
      }

      if (openParens !== closeParens) {
        validation.critical_issues.push({
          file: file.path,
          issue: `Unbalanced parentheses (${openParens} open, ${closeParens} close)`,
          severity: 'CRITICAL'
        });
        validation.verdict = 'INVALID';
        console.log('         ❌ Unbalanced parentheses');
      }

      if (validation.verdict === 'VALID') {
        console.log('         ✅ Syntax validation passed');
      }
    }

  } catch (error) {
    console.error(`      ❌ File validation error: ${error.message}`);
    validation.verdict = 'ERROR';
    validation.critical_issues.push({
      issue: 'File validation failed',
      error: error.message,
      severity: 'CRITICAL'
    });
  }

  return validation;
}

/**
 * Phase 2: Database Verification
 */
async function databaseVerification(sdId, migrationFiles, options) {
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
        const { data, error, count } = await supabase
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
 * Check Schema Health (Trigger functions, etc.)
 */
async function checkSchemaHealth(sdId) {
  console.log('   💊 Checking for common schema issues...');

  const health = {
    trigger_issues: [],
    recommendations: []
  };

  console.log('      💡 Reminder: Always verify trigger functions match current table schema');
  console.log('      💡 Common issue: Trigger references old column name after schema change');

  health.recommendations.push('Manually verify trigger functions match current schema');
  health.recommendations.push('Check for column name mismatches (e.g., confidence_score vs confidence)');

  return health;
}

/**
 * Generate Recommendations
 */
function generateRecommendations(results) {
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
}
