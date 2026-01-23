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

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import globPkg from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
import { validateMigrationAgainstDataContract, getInheritedContracts } from '../../scripts/modules/contract-validation.js';
import { quickPreflightCheck } from '../../scripts/lib/handoff-preflight.js';

// Handle CommonJS/ESM compatibility for glob
const { glob } = globPkg;
const execAsync = promisify(exec);

dotenv.config();

// Supabase client initialized in execute() to use async createSupabaseServiceClient
let supabase = null;

// Action trigger keywords for migration execution
const ACTION_TRIGGERS = [
  'apply migration', 'run migration', 'execute migration',
  'apply supabase migration', 'push migration', 'migrate database',
  'apply the migration', 'run the migration', 'db push',
  'supabase db push', 'apply schema', 'run schema migration'
];

/**
 * Detect if the context contains action-oriented keywords
 * @param {string} context - The execution context or description
 * @returns {Object} Action detection result
 */
function detectActionIntent(context) {
  if (!context || typeof context !== 'string') {
    return { isAction: false, matchedTrigger: null };
  }

  const lowerContext = context.toLowerCase();

  for (const trigger of ACTION_TRIGGERS) {
    if (lowerContext.includes(trigger)) {
      return { isAction: true, matchedTrigger: trigger };
    }
  }

  return { isAction: false, matchedTrigger: null };
}

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
    } catch {
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
    } catch {
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
async function _executeViaSupabaseCLI(sqlStatement, description = 'SQL operation') {
  console.log(`   🚀 Executing via Supabase CLI: ${description}...`);

  const result = {
    success: false,
    output: null,
    error: null
  };

  try {
    // Check if Supabase CLI is available and linked
    const { stdout: _linkStatus } = await execAsync('supabase status');
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
 * Find pending migration files that haven't been applied
 * @param {string} sdId - Strategic Directive ID (optional filter)
 * @param {string} migrationPath - Path pattern to search for migrations
 * @returns {Promise<Array>} List of pending migration files with metadata
 */
async function findPendingMigrations(sdId = null, migrationPath = null) {
  console.log('   🔍 Searching for pending migration files...');

  const migrationPaths = migrationPath
    ? [migrationPath]
    : [
        'database/migrations/*.sql',
        'supabase/migrations/*.sql',
        'supabase/ehg_engineer/migrations/*.sql'
      ];

  const pendingMigrations = [];

  for (const pattern of migrationPaths) {
    try {
      const files = await glob(pattern);
      const fileArray = Array.isArray(files) ? files : Array.from(files);

      for (const file of fileArray) {
        try {
          const content = await readFile(file, 'utf-8');
          const fileName = path.basename(file);

          // Filter by SD ID if provided
          if (sdId && !content.includes(sdId) && !fileName.includes(sdId)) {
            continue;
          }

          // Extract timestamp from filename (common patterns: YYYYMMDD_ or timestamp_)
          const timestampMatch = fileName.match(/^(\d{8}|\d{14})_/);
          const timestamp = timestampMatch ? timestampMatch[1] : null;

          // Detect migration type
          const hasCreateTable = /CREATE TABLE/i.test(content);
          const hasAlterTable = /ALTER TABLE/i.test(content);
          const hasRLS = /CREATE POLICY|ROW LEVEL SECURITY/i.test(content);
          const hasInsert = /INSERT INTO/i.test(content);

          pendingMigrations.push({
            path: file,
            fileName,
            timestamp,
            size: content.length,
            types: {
              hasCreateTable,
              hasAlterTable,
              hasRLS,
              hasInsert
            },
            preview: content.substring(0, 200).replace(/\n/g, ' ').trim() + '...'
          });
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Pattern not found, skip
    }
  }

  console.log(`      Found ${pendingMigrations.length} migration file(s)`);
  return pendingMigrations;
}

/**
 * Execute migration files via Supabase CLI (with confirmation display)
 * @param {Array} migrationFiles - Array of migration file objects
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
async function executeMigrations(migrationFiles, options = {}) {
  console.log('\n🚀 Migration Execution Requested');
  console.log('═'.repeat(50));

  const result = {
    executed: false,
    files_processed: [],
    errors: [],
    requires_confirmation: true,
    confirmation_display: null
  };

  if (migrationFiles.length === 0) {
    console.log('   ℹ️  No migration files to execute');
    result.requires_confirmation = false;
    return result;
  }

  // Build confirmation display
  console.log('\n📋 MIGRATIONS TO APPLY:');
  console.log('─'.repeat(50));

  for (const migration of migrationFiles) {
    console.log(`\n   📄 ${migration.fileName}`);
    console.log(`      Path: ${migration.path}`);
    console.log(`      Size: ${migration.size} bytes`);
    console.log('      Contains:');
    if (migration.types.hasCreateTable) console.log('         • CREATE TABLE statements');
    if (migration.types.hasAlterTable) console.log('         • ALTER TABLE statements');
    if (migration.types.hasRLS) console.log('         • RLS/Policy definitions');
    if (migration.types.hasInsert) console.log('         • INSERT statements (seed data)');
    console.log(`      Preview: ${migration.preview}`);
  }

  console.log('\n' + '─'.repeat(50));

  result.confirmation_display = {
    file_count: migrationFiles.length,
    files: migrationFiles.map(m => ({
      name: m.fileName,
      path: m.path,
      types: m.types
    })),
    command_preview: 'supabase db push  # OR manual SQL execution'
  };

  // If auto-execute is enabled (dangerous), proceed without confirmation
  if (options.auto_execute) {
    console.log('\n⚠️  AUTO-EXECUTE ENABLED - Proceeding without confirmation');

    for (const migration of migrationFiles) {
      try {
        const content = await readFile(migration.path, 'utf-8');
        const execResult = await executeViaSupabaseCLI(content, `Migration: ${migration.fileName}`);

        if (execResult.success) {
          result.files_processed.push({
            file: migration.fileName,
            status: 'SUCCESS',
            output: execResult.output
          });
        } else {
          result.errors.push({
            file: migration.fileName,
            error: execResult.error
          });
        }
      } catch (error) {
        result.errors.push({
          file: migration.fileName,
          error: error.message
        });
      }
    }

    result.executed = result.errors.length === 0;
  } else {
    // Standard flow: require confirmation
    console.log('\n🔐 CONFIRMATION REQUIRED');
    console.log('   To apply these migrations, run one of:');
    console.log('   1. supabase db push');
    console.log('   2. node scripts/run-migration.js --file <path>');
    console.log('   3. Use this sub-agent with --confirm-apply flag');
    console.log('\n   ⚠️  Review the migrations above before confirming!');
  }

  return result;
}

/**
 * Execute SQL via Supabase CLI (exposed version for migrations)
 */
async function executeViaSupabaseCLI(sqlContent, description = 'SQL migration') {
  console.log(`   🚀 Executing via Supabase CLI: ${description}...`);

  const result = {
    success: false,
    output: null,
    error: null
  };

  try {
    // Check if Supabase CLI is available
    try {
      await execAsync('supabase --version');
    } catch {
      result.error = 'Supabase CLI not installed. Install with: npm install -g supabase';
      console.log('      ❌ Supabase CLI not available');
      return result;
    }

    // Write SQL to temp file for safer execution
    const tempFile = path.join(process.cwd(), '.temp', `migration_${Date.now()}.sql`);
    const tempDir = path.dirname(tempFile);

    // Ensure temp directory exists
    if (!existsSync(tempDir)) {
      const { mkdir } = await import('fs/promises');
      await mkdir(tempDir, { recursive: true });
    }

    const { writeFile, unlink } = await import('fs/promises');
    await writeFile(tempFile, sqlContent, 'utf-8');

    try {
      // Execute via Supabase CLI
      const { stdout, stderr } = await execAsync('supabase db push --include-all', {
        timeout: 120000 // 2 minute timeout
      });

      result.success = true;
      result.output = stdout;

      if (stderr && !stderr.includes('warning')) {
        console.log(`      ⚠️  Notices: ${stderr}`);
      }

      console.log('      ✅ Migration executed successfully');
    } finally {
      // Cleanup temp file
      try {
        await unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    result.error = error.message;
    console.error(`      ❌ Migration failed: ${error.message}`);

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
async function staticFileValidation(sdId, _options) {
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
      } catch {
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
      const _hasRLS = file.content.match(/ROW LEVEL SECURITY|RLS|CREATE POLICY/i);

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
 * Check Schema Health (Trigger functions, etc.)
 */
async function checkSchemaHealth(_sdId) {
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

  // Contract compliance recommendations
  if (results.findings.contract_compliance?.valid === false) {
    results.recommendations.push('Review parent data contract boundaries');
    results.recommendations.push('Modify migrations to only touch allowed tables');
    results.recommendations.push('Or request contract update from parent SD owner');
  }
}

/**
 * Validate migrations against parent data contract
 * @param {string} sdId - Strategic Directive ID
 * @param {Array} migrationFiles - Array of migration file paths
 * @returns {Promise<Object>} Contract validation result
 */
async function validateMigrationContract(sdId, migrationFiles) {
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
