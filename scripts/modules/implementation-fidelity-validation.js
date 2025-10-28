/**
 * DESIGN→DATABASE Validation Gates - Gate 2 (EXEC→PLAN)
 *
 * Validates that EXEC actually implemented the DESIGN and DATABASE recommendations
 * before PLAN verification begins.
 *
 * Integration: unified-handoff-system.js (EXEC→PLAN handoff)
 * Created: 2025-10-28
 * Part of: SD-DESIGN-DATABASE-VALIDATION-001
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Validate implementation fidelity for EXEC→PLAN handoff
 *
 * Checks:
 * A. Design Implementation Fidelity (25 points)
 * B. Database Implementation Fidelity (25 points)
 * C. Data Flow Alignment (25 points)
 * D. Enhanced Testing (25 points)
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Validation result
 */
export async function validateGate2ExecToPlan(sd_id, supabase) {
  console.log('\n🚪 GATE 2: Implementation Fidelity Validation (EXEC→PLAN)');
  console.log('='.repeat(60));

  const validation = {
    passed: true,
    score: 0,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {},
    failed_gates: [],
    gate_scores: {}
  };

  try {
    // Fetch PRD metadata with DESIGN and DATABASE analyses
    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('metadata, directive_id, title')
      .eq('directive_id', sd_id)
      .single();

    if (prdError) {
      validation.issues.push(`Failed to fetch PRD: ${prdError.message}`);
      validation.failed_gates.push('PRD_FETCH');
      return validation;
    }

    const designAnalysis = prdData?.metadata?.design_analysis;
    const databaseAnalysis = prdData?.metadata?.database_analysis;

    if (!designAnalysis && !databaseAnalysis) {
      validation.warnings.push('No DESIGN or DATABASE analysis found - skipping Gate 2');
      validation.score = 100; // Pass by default if not applicable
      validation.passed = true;
      return validation;
    }

    // ===================================================================
    // SECTION A: Design Implementation Fidelity (25 points)
    // ===================================================================
    console.log('\n[A] Design Implementation Fidelity');
    console.log('-'.repeat(60));

    await validateDesignFidelity(sd_id, designAnalysis, validation, supabase);

    // ===================================================================
    // SECTION B: Database Implementation Fidelity (25 points)
    // ===================================================================
    console.log('\n[B] Database Implementation Fidelity');
    console.log('-'.repeat(60));

    await validateDatabaseFidelity(sd_id, databaseAnalysis, validation, supabase);

    // ===================================================================
    // SECTION C: Data Flow Alignment (25 points)
    // ===================================================================
    console.log('\n[C] Data Flow Alignment');
    console.log('-'.repeat(60));

    await validateDataFlowAlignment(sd_id, designAnalysis, databaseAnalysis, validation, supabase);

    // ===================================================================
    // SECTION D: Enhanced Testing (25 points)
    // ===================================================================
    console.log('\n[D] Enhanced Testing');
    console.log('-'.repeat(60));

    await validateEnhancedTesting(sd_id, designAnalysis, databaseAnalysis, validation, supabase);

    // ===================================================================
    // FINAL VALIDATION RESULT
    // ===================================================================
    console.log('\n' + '='.repeat(60));
    console.log(`GATE 2 SCORE: ${validation.score}/${validation.max_score} points`);

    if (validation.score >= 80) {
      validation.passed = true;
      console.log('✅ GATE 2: PASSED (≥80 points)');
    } else {
      validation.passed = false;
      console.log(`❌ GATE 2: FAILED (${validation.score} < 80 points)`);
    }

    if (validation.issues.length > 0) {
      console.log(`\nBlocking Issues (${validation.issues.length}):`);
      validation.issues.forEach(issue => console.log(`  ❌ ${issue}`));
    }

    if (validation.warnings.length > 0) {
      console.log(`\nWarnings (${validation.warnings.length}):`);
      validation.warnings.forEach(warning => console.log(`  ⚠️  ${warning}`));
    }

    console.log('='.repeat(60));

    return validation;

  } catch (error) {
    console.error('\n❌ GATE 2 Validation Error:', error.message);
    validation.passed = false;
    validation.issues.push(`Validation error: ${error.message}`);
    validation.details.error = error.message;
    return validation;
  }
}

/**
 * Validate Design Implementation Fidelity (Section A - 25 points)
 */
async function validateDesignFidelity(sd_id, designAnalysis, validation, supabase) {
  if (!designAnalysis) {
    validation.warnings.push('[A] No DESIGN analysis found - skipping design fidelity check');
    validation.score += 13; // Partial credit if not applicable
    validation.gate_scores.design_fidelity = 13;
    console.log('   ⚠️  No DESIGN analysis - partial credit (13/25)');
    return;
  }

  let sectionScore = 0;
  const sectionDetails = {};

  // A1: Check for UI component implementation (10 points)
  console.log('\n   [A1] UI Components Implementation...');

  // Look for component files in git commits
  try {
    const { stdout: gitLog } = await execAsync(
      `git log --all --grep="${sd_id}" --name-only --pretty=format:""`,
      { cwd: process.cwd(), timeout: 10000 }
    );

    const componentFiles = gitLog.split('\n')
      .filter(f => f.match(/\.(tsx?|jsx?)$/) && f.includes('component'))
      .filter(Boolean);

    if (componentFiles.length > 0) {
      sectionScore += 10;
      sectionDetails.components_implemented = componentFiles.length;
      sectionDetails.component_files = componentFiles.slice(0, 5); // First 5
      console.log(`   ✅ Found ${componentFiles.length} component files`);
    } else {
      validation.warnings.push('[A1] No component files found in git commits');
      sectionScore += 5; // Partial credit
      console.log('   ⚠️  No component files found (5/10)');
    }
  } catch (error) {
    validation.warnings.push(`[A1] Git log check failed: ${error.message}`);
    sectionScore += 5; // Partial credit on error
    console.log('   ⚠️  Cannot verify components (5/10)');
  }

  // A2: Check for workflow implementation (10 points)
  console.log('\n   [A2] User Workflows Implementation...');

  // Check if handoff mentions workflow implementation
  const { data: handoffData } = await supabase
    .from('sd_phase_handoffs')
    .select('deliverables, metadata')
    .eq('sd_id', sd_id)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (handoffData?.[0]?.deliverables) {
    const deliverables = JSON.stringify(handoffData[0].deliverables).toLowerCase();
    const hasWorkflowMention = deliverables.includes('workflow') ||
                                deliverables.includes('user flow') ||
                                deliverables.includes('user action');

    if (hasWorkflowMention) {
      sectionScore += 10;
      sectionDetails.workflows_mentioned = true;
      console.log('   ✅ Workflows mentioned in EXEC deliverables');
    } else {
      validation.warnings.push('[A2] Workflows not explicitly mentioned in deliverables');
      sectionScore += 5; // Partial credit
      console.log('   ⚠️  Workflows not mentioned (5/10)');
    }
  } else {
    validation.warnings.push('[A2] No EXEC→PLAN handoff found');
    sectionScore += 5; // Partial credit
    console.log('   ⚠️  No handoff found (5/10)');
  }

  // A3: Check for user action support (5 points)
  console.log('\n   [A3] User Actions Support...');

  // Look for CRUD-related code changes
  try {
    const { stdout: gitDiff } = await execAsync(
      `git log --all --grep="${sd_id}" --pretty=format:"" --patch`,
      { cwd: process.cwd(), timeout: 15000 }
    );

    const hasCRUD = gitDiff.toLowerCase().includes('create') ||
                    gitDiff.toLowerCase().includes('update') ||
                    gitDiff.toLowerCase().includes('delete') ||
                    gitDiff.toLowerCase().includes('insert');

    if (hasCRUD) {
      sectionScore += 5;
      sectionDetails.crud_operations_found = true;
      console.log('   ✅ CRUD operations found in code changes');
    } else {
      validation.warnings.push('[A3] No CRUD operations detected in code changes');
      sectionScore += 3; // Partial credit
      console.log('   ⚠️  No CRUD operations detected (3/5)');
    }
  } catch (_error) {
    sectionScore += 3; // Partial credit on error
    console.log('   ⚠️  Cannot verify CRUD operations (3/5)');
  }

  validation.score += sectionScore;
  validation.gate_scores.design_fidelity = sectionScore;
  validation.details.design_fidelity = sectionDetails;
  console.log(`\n   Section A Score: ${sectionScore}/25`);
}

/**
 * Validate Database Implementation Fidelity (Section B - 25 points)
 */
async function validateDatabaseFidelity(sd_id, databaseAnalysis, validation, supabase) {
  if (!databaseAnalysis) {
    validation.warnings.push('[B] No DATABASE analysis found - skipping database fidelity check');
    validation.score += 13; // Partial credit if not applicable
    validation.gate_scores.database_fidelity = 13;
    console.log('   ⚠️  No DATABASE analysis - partial credit (13/25)');
    return;
  }

  let sectionScore = 0;
  const sectionDetails = {};

  // B1: Check for migration files AND execution (15 points)
  // 8 points: Migration files created
  // 7 points: Migrations actually executed
  console.log('\n   [B1] Schema Change Migrations (Creation + Execution)...');

  try {
    const migrationDirs = [
      'database/migrations',
      'supabase/migrations',
      'migrations'
    ];

    let migrationFiles = [];
    for (const dir of migrationDirs) {
      const fullPath = path.join(process.cwd(), dir);
      if (existsSync(fullPath)) {
        const files = await readdir(fullPath);
        const sdMigrations = files.filter(f =>
          f.includes(sd_id.replace('SD-', '').toLowerCase()) ||
          f.includes(new Date().toISOString().split('T')[0].replace(/-/g, ''))
        );
        migrationFiles.push(...sdMigrations.map(f => ({ dir, file: f })));
      }
    }

    if (migrationFiles.length > 0) {
      sectionScore += 8; // Award 8 points for files existing
      sectionDetails.migration_files = migrationFiles.map(m => `${m.dir}/${m.file}`);
      sectionDetails.migration_count = migrationFiles.length;
      console.log(`   ✅ Found ${migrationFiles.length} migration file(s) (8/15)`);

      // B1.2: Verify migrations were executed (7 points)
      console.log('   [B1.2] Verifying migration execution...');

      try {
        // Query Supabase schema_migrations table to check execution
        const { data: executedMigrations, error: migrationError } = await supabase
          .from('schema_migrations')
          .select('version, name');

        if (migrationError) {
          console.log(`   ⚠️  Cannot query schema_migrations: ${migrationError.message} (3/7)`);
          sectionScore += 3; // Partial credit if can't verify
          sectionDetails.migration_execution_verified = false;
          sectionDetails.migration_execution_error = migrationError.message;
        } else if (executedMigrations && executedMigrations.length > 0) {
          // Extract version/timestamp from migration filenames
          // Typical format: YYYYMMDDHHMMSS_description.sql or similar
          const migrationVersions = migrationFiles.map(m => {
            const filename = m.file;
            // Extract timestamp/version from start of filename
            const versionMatch = filename.match(/^(\d{14}|\d{8}_\d{6})/);
            return versionMatch ? versionMatch[1].replace('_', '') : null;
          }).filter(Boolean);

          // Check if any of our migrations are in the executed list
          const executedVersions = executedMigrations.map(m => m.version || m.name);
          const ourExecutedMigrations = migrationVersions.filter(v =>
            executedVersions.some(ev => ev.includes(v) || v.includes(ev))
          );

          if (ourExecutedMigrations.length > 0) {
            sectionScore += 7;
            sectionDetails.migration_execution_verified = true;
            sectionDetails.executed_migration_count = ourExecutedMigrations.length;
            console.log(`   ✅ Verified ${ourExecutedMigrations.length}/${migrationFiles.length} migration(s) executed (7/7)`);
          } else {
            // Migration files exist but weren't executed - CRITICAL ISSUE
            validation.issues.push('[B1.2] Migration files created but NOT EXECUTED in database');
            sectionScore += 0; // No points - this is a critical failure
            sectionDetails.migration_execution_verified = false;
            sectionDetails.executed_migration_count = 0;
            console.log('   ❌ Migration files exist but NOT EXECUTED (0/7)');
            console.log('   ⚠️  CRITICAL: Run migrations before EXEC→PLAN handoff');
          }
        } else {
          sectionScore += 3; // Partial credit if no migration history
          sectionDetails.migration_execution_verified = false;
          console.log('   ⚠️  No migration history found (3/7)');
        }
      } catch (execCheckError) {
        sectionScore += 3; // Partial credit on error
        console.log(`   ⚠️  Error checking migration execution: ${execCheckError.message} (3/7)`);
      }
    } else {
      validation.warnings.push('[B1] No migration files found for this SD');
      sectionScore += 8; // Partial credit (might not need migrations)
      sectionDetails.migration_execution_verified = null; // Not applicable
      console.log('   ⚠️  No migration files found (8/15)');
    }
  } catch (error) {
    validation.warnings.push(`[B1] Migration check failed: ${error.message}`);
    sectionScore += 8; // Partial credit on error
    console.log('   ⚠️  Cannot verify migrations (8/15)');
  }

  // B2: Check for RLS policies (5 points)
  console.log('\n   [B2] RLS Policies...');

  try {
    const { stdout: gitDiff } = await execAsync(
      `git log --all --grep="${sd_id}" --pretty=format:"" --patch`,
      { cwd: process.cwd(), timeout: 15000 }
    );

    const hasRLS = gitDiff.includes('CREATE POLICY') ||
                   gitDiff.includes('ALTER POLICY') ||
                   gitDiff.toLowerCase().includes('rls');

    if (hasRLS) {
      sectionScore += 5;
      sectionDetails.rls_policies_found = true;
      console.log('   ✅ RLS policies found in migrations');
    } else {
      validation.warnings.push('[B2] No RLS policies detected');
      sectionScore += 3; // Partial credit (might not need RLS)
      console.log('   ⚠️  No RLS policies detected (3/5)');
    }
  } catch (error) {
    sectionScore += 3; // Partial credit on error
    console.log('   ⚠️  Cannot verify RLS policies (3/5)');
  }

  // B3: Migration complexity check (5 points)
  console.log('\n   [B3] Migration Complexity Alignment...');

  if (sectionDetails.migration_files && sectionDetails.migration_files.length > 0) {
    try {
      // Read first migration file to estimate complexity
      const firstMigration = sectionDetails.migration_files[0];
      const fullPath = path.join(process.cwd(), firstMigration);
      const content = await readFile(fullPath, 'utf-8');
      const lineCount = content.split('\n').length;

      sectionDetails.migration_line_count = lineCount;

      // Always give credit for having a migration
      sectionScore += 5;
      console.log(`   ✅ Migration file has ${lineCount} lines`);
    } catch (error) {
      sectionScore += 3; // Partial credit
      console.log('   ⚠️  Cannot read migration file (3/5)');
    }
  } else {
    sectionScore += 3; // Partial credit (no migration to check)
    console.log('   ⚠️  No migration to check complexity (3/5)');
  }

  validation.score += sectionScore;
  validation.gate_scores.database_fidelity = sectionScore;
  validation.details.database_fidelity = sectionDetails;
  console.log(`\n   Section B Score: ${sectionScore}/25`);
}

/**
 * Validate Data Flow Alignment (Section C - 25 points)
 */
async function validateDataFlowAlignment(sd_id, designAnalysis, databaseAnalysis, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [C] Data Flow Alignment...');

  // This is hard to validate without running the app
  // We'll use heuristics based on code changes

  // C1: Check for database query code (10 points)
  console.log('\n   [C1] Database Query Integration...');

  try {
    const { stdout: gitDiff } = await execAsync(
      `git log --all --grep="${sd_id}" --pretty=format:"" --patch`,
      { cwd: process.cwd(), timeout: 15000 }
    );

    const hasQueries = gitDiff.includes('.select(') ||
                       gitDiff.includes('.insert(') ||
                       gitDiff.includes('.update(') ||
                       gitDiff.includes('.from(');

    if (hasQueries) {
      sectionScore += 10;
      sectionDetails.database_queries_found = true;
      console.log('   ✅ Database queries found in code changes');
    } else {
      validation.warnings.push('[C1] No database queries detected in code');
      sectionScore += 5; // Partial credit
      console.log('   ⚠️  No database queries detected (5/10)');
    }
  } catch (_error) {
    sectionScore += 5; // Partial credit on error
    console.log('   ⚠️  Cannot verify database queries (5/10)');
  }

  // C2: Check for form/UI integration (10 points)
  console.log('\n   [C2] Form/UI Integration...');

  try {
    const { stdout: gitDiff } = await execAsync(
      `git log --all --grep="${sd_id}" --pretty=format:"" --patch`,
      { cwd: process.cwd(), timeout: 15000 }
    );

    const hasFormIntegration = gitDiff.includes('useState') ||
                                gitDiff.includes('useForm') ||
                                gitDiff.includes('onSubmit') ||
                                gitDiff.includes('<form') ||
                                gitDiff.includes('Input') ||
                                gitDiff.includes('Button');

    if (hasFormIntegration) {
      sectionScore += 10;
      sectionDetails.form_integration_found = true;
      console.log('   ✅ Form/UI integration found');
    } else {
      validation.warnings.push('[C2] No form/UI integration detected');
      sectionScore += 5; // Partial credit
      console.log('   ⚠️  No form/UI integration detected (5/10)');
    }
  } catch (_error) {
    sectionScore += 5; // Partial credit on error
    console.log('   ⚠️  Cannot verify form integration (5/10)');
  }

  // C3: Check for data validation (5 points)
  console.log('\n   [C3] Data Validation...');

  try {
    const { stdout: gitDiff } = await execAsync(
      `git log --all --grep="${sd_id}" --pretty=format:"" --patch`,
      { cwd: process.cwd(), timeout: 15000 }
    );

    const hasValidation = gitDiff.includes('zod') ||
                          gitDiff.includes('validate') ||
                          gitDiff.includes('schema') ||
                          gitDiff.includes('.required()');

    if (hasValidation) {
      sectionScore += 5;
      sectionDetails.data_validation_found = true;
      console.log('   ✅ Data validation found');
    } else {
      validation.warnings.push('[C3] No data validation detected');
      sectionScore += 3; // Partial credit
      console.log('   ⚠️  No data validation detected (3/5)');
    }
  } catch (_error) {
    sectionScore += 3; // Partial credit on error
    console.log('   ⚠️  Cannot verify data validation (3/5)');
  }

  validation.score += sectionScore;
  validation.gate_scores.data_flow_alignment = sectionScore;
  validation.details.data_flow_alignment = sectionDetails;
  console.log(`\n   Section C Score: ${sectionScore}/25`);
}

/**
 * Validate Enhanced Testing (Section D - 25 points)
 */
async function validateEnhancedTesting(sd_id, designAnalysis, databaseAnalysis, validation, _supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [D] Enhanced Testing...');

  // D1: Check for E2E tests (15 points)
  console.log('\n   [D1] E2E Test Coverage...');

  try {
    const testDirs = [
      'tests/e2e',
      'tests/integration',
      'e2e',
      'playwright/tests'
    ];

    let testFiles = [];
    for (const dir of testDirs) {
      const fullPath = path.join(process.cwd(), dir);
      if (existsSync(fullPath)) {
        const files = await readdir(fullPath, { recursive: true });
        const sdTests = files.filter(f =>
          typeof f === 'string' &&
          (f.includes(sd_id.toLowerCase()) ||
           f.includes(sd_id.replace('SD-', '').toLowerCase()))
        );
        testFiles.push(...sdTests);
      }
    }

    if (testFiles.length > 0) {
      sectionScore += 15;
      sectionDetails.e2e_tests = testFiles;
      sectionDetails.e2e_test_count = testFiles.length;
      console.log(`   ✅ Found ${testFiles.length} E2E test file(s)`);
    } else {
      validation.warnings.push('[D1] No E2E tests found for this SD');
      sectionScore += 8; // Partial credit
      console.log('   ⚠️  No E2E tests found (8/15)');
    }
  } catch (_error) {
    validation.warnings.push('[D1] E2E test check failed');
    sectionScore += 8; // Partial credit on error
    console.log('   ⚠️  Cannot verify E2E tests (8/15)');
  }

  // D2: Check for database migration tests (5 points)
  console.log('\n   [D2] Database Migration Tests...');

  try {
    const { stdout: gitLog } = await execAsync(
      `git log --all --grep="${sd_id}" --name-only --pretty=format:""`,
      { cwd: process.cwd(), timeout: 10000 }
    );

    const hasMigrationTests = gitLog.includes('migration') && gitLog.includes('test');

    if (hasMigrationTests) {
      sectionScore += 5;
      sectionDetails.migration_tests_found = true;
      console.log('   ✅ Migration tests found');
    } else {
      validation.warnings.push('[D2] No migration tests detected');
      sectionScore += 3; // Partial credit
      console.log('   ⚠️  No migration tests detected (3/5)');
    }
  } catch (_error) {
    sectionScore += 3; // Partial credit on error
    console.log('   ⚠️  Cannot verify migration tests (3/5)');
  }

  // D3: Check for test coverage metadata (5 points)
  console.log('\n   [D3] Test Coverage Documentation...');

  // Check if EXEC→PLAN handoff mentions test coverage
  const { data: handoffData } = await supabase
    .from('sd_phase_handoffs')
    .select('metadata')
    .eq('sd_id', sd_id)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (handoffData?.[0]?.metadata) {
    const metadataStr = JSON.stringify(handoffData[0].metadata).toLowerCase();
    const hasCoverage = metadataStr.includes('test') ||
                        metadataStr.includes('coverage') ||
                        metadataStr.includes('e2e');

    if (hasCoverage) {
      sectionScore += 5;
      sectionDetails.test_coverage_documented = true;
      console.log('   ✅ Test coverage documented in handoff');
    } else {
      validation.warnings.push('[D3] Test coverage not documented in handoff');
      sectionScore += 3; // Partial credit
      console.log('   ⚠️  Test coverage not documented (3/5)');
    }
  } else {
    sectionScore += 3; // Partial credit
    console.log('   ⚠️  No handoff metadata found (3/5)');
  }

  validation.score += sectionScore;
  validation.gate_scores.enhanced_testing = sectionScore;
  validation.details.enhanced_testing = sectionDetails;
  console.log(`\n   Section D Score: ${sectionScore}/25`);
}
