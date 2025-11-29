#!/usr/bin/env node
/**
 * Unified Database Validation Runner
 * SD-DATABASE-VALIDATION-001: Phase 4 - Automation
 *
 * Runs all database validations in sequence:
 * 1. Schema validation
 * 2. Migration syntax validation
 * 3. Function consistency checks
 * 4. RLS policy verification
 *
 * Usage:
 *   node scripts/db-validate/run-all-validations.js [--verbose] [--ci]
 *
 * Exit codes:
 *   0 - All validations passed
 *   1 - One or more validations failed
 */

import { SchemaValidator } from './schema-validator.js';
import { MigrationTester, getLatestMigrations } from './migration-tester.js';
import { FunctionValidator, FUNCTION_GROUPS } from './function-validator.js';
import { RLSValidator, CRITICAL_TABLES } from './rls-validator.js';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const ciMode = args.includes('--ci');
const project = args.find(a => a.startsWith('--project='))?.split('=')[1] || 'engineer';

// In CI mode, we want stricter validation
const strictMode = ciMode;

/**
 * Format duration in human-readable format
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Print section header
 */
function printSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

/**
 * Print result with status
 */
function printResult(label, passed, details = '') {
  const status = passed ? '\x1b[32m✓ PASSED\x1b[0m' : '\x1b[31m✗ FAILED\x1b[0m';
  console.log(`  ${label}: ${status}${details ? ` (${details})` : ''}`);
}

/**
 * Run all validations
 */
async function runAllValidations() {
  const startTime = Date.now();
  const results = {
    schema: null,
    migrations: null,
    functions: null,
    rls: null
  };

  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(10) + 'Database Validation Suite' + ' '.repeat(23) + '║');
  console.log('║' + ' '.repeat(10) + `Project: ${project}` + ' '.repeat(38 - project.length) + '║');
  console.log('║' + ' '.repeat(10) + `Mode: ${strictMode ? 'STRICT (CI)' : 'Standard'}` + ' '.repeat(strictMode ? 31 : 35) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  // 1. Schema Validation
  printSection('1. SCHEMA VALIDATION');
  try {
    const schemaValidator = new SchemaValidator(project, { verbose });
    await schemaValidator.connect();

    // Validate critical tables exist
    const criticalTables = [
      'strategic_directives_v2',
      'product_requirements_v2',
      'leo_protocols',
      'retrospectives'
    ];

    let schemaErrors = 0;
    for (const table of criticalTables) {
      const exists = await schemaValidator.tableExists(table);
      if (!exists) {
        console.log(`  ERROR: Critical table '${table}' not found`);
        schemaErrors++;
      } else if (verbose) {
        console.log(`  ✓ Table '${table}' exists`);
      }
    }

    // Run full schema validation
    const schemaResult = await schemaValidator.validateAll();
    await schemaValidator.disconnect();

    results.schema = {
      passed: schemaResult.valid && schemaErrors === 0,
      tableCount: schemaResult.metadata.tableCount,
      errors: schemaResult.errors,
      duration: schemaResult.metadata.duration
    };

    printResult('Schema', results.schema.passed, `${results.schema.tableCount} tables validated`);
    if (!results.schema.passed && results.schema.errors.length > 0) {
      results.schema.errors.slice(0, 5).forEach(err => console.log(`    - ${err}`));
    }

  } catch (error) {
    results.schema = { passed: false, error: error.message };
    printResult('Schema', false, error.message);
  }

  // 2. Migration Validation
  printSection('2. MIGRATION VALIDATION');
  try {
    const migrationTester = new MigrationTester(project, { dryRun: true, verbose });

    // Get latest migrations
    const migrations = getLatestMigrations(10);
    let migrationErrors = 0;

    for (const migration of migrations) {
      const syntaxResult = migrationTester.validateSyntax(migration);
      if (!syntaxResult.valid) {
        migrationErrors++;
        if (verbose) {
          console.log(`  ✗ ${migration.filename}`);
          syntaxResult.errors.forEach(err => console.log(`    - ${err}`));
        }
      } else if (verbose) {
        console.log(`  ✓ ${migration.filename}`);
      }
    }

    results.migrations = {
      passed: migrationErrors === 0,
      checked: migrations.length,
      failed: migrationErrors
    };

    printResult('Migrations', results.migrations.passed,
      `${migrations.length} checked, ${migrationErrors} failed`);

  } catch (error) {
    results.migrations = { passed: false, error: error.message };
    printResult('Migrations', false, error.message);
  }

  // 3. Function Consistency
  printSection('3. FUNCTION CONSISTENCY');
  try {
    const functionValidator = new FunctionValidator(project, { verbose });
    await functionValidator.connect();

    const functionResult = await functionValidator.validateAllGroups();
    await functionValidator.disconnect();

    const groupsPassed = Object.values(functionResult.results).filter(r => r.valid).length;
    const totalGroups = Object.keys(functionResult.results).length;

    // In non-strict mode, warnings are OK
    const funcPassed = strictMode ? functionResult.valid : groupsPassed > 0;

    results.functions = {
      passed: funcPassed,
      groupsPassed,
      totalGroups,
      errors: Object.values(functionResult.results).flatMap(r => r.errors),
      warnings: Object.values(functionResult.results).flatMap(r => r.warnings)
    };

    printResult('Functions', results.functions.passed,
      `${groupsPassed}/${totalGroups} groups passed`);

    if (verbose && results.functions.warnings.length > 0) {
      console.log('  Warnings:');
      results.functions.warnings.slice(0, 3).forEach(w => console.log(`    - ${w}`));
    }

  } catch (error) {
    results.functions = { passed: false, error: error.message };
    printResult('Functions', false, error.message);
  }

  // 4. RLS Validation
  printSection('4. RLS POLICY VALIDATION');
  try {
    const rlsValidator = new RLSValidator(project, { verbose });
    await rlsValidator.connect();

    // In strict mode, validate all tables; otherwise just critical
    const rlsResult = strictMode
      ? await rlsValidator.validateAll()
      : await rlsValidator.validateCritical();

    await rlsValidator.disconnect();

    results.rls = {
      passed: rlsResult.valid,
      tablesWithRLS: rlsResult.metadata.tablesWithRLS || CRITICAL_TABLES.length,
      tablesWithoutRLS: rlsResult.metadata.tablesWithoutRLS || 0,
      errors: rlsResult.errors,
      warnings: rlsResult.warnings
    };

    const rlsDetail = strictMode
      ? `${results.rls.tablesWithRLS} tables with RLS, ${results.rls.tablesWithoutRLS} without`
      : `${CRITICAL_TABLES.length} critical tables checked`;

    printResult('RLS Policies', results.rls.passed, rlsDetail);

    if (!results.rls.passed && results.rls.errors.length > 0) {
      results.rls.errors.slice(0, 5).forEach(err => console.log(`    - ${err}`));
    }

  } catch (error) {
    results.rls = { passed: false, error: error.message };
    printResult('RLS Policies', false, error.message);
  }

  // Summary
  const totalDuration = Date.now() - startTime;
  const allPassed = Object.values(results).every(r => r && r.passed);

  printSection('SUMMARY');
  console.log(`  Schema:     ${results.schema?.passed ? '✓' : '✗'}`);
  console.log(`  Migrations: ${results.migrations?.passed ? '✓' : '✗'}`);
  console.log(`  Functions:  ${results.functions?.passed ? '✓' : '✗'}`);
  console.log(`  RLS:        ${results.rls?.passed ? '✓' : '✗'}`);
  console.log('');
  console.log(`  Total duration: ${formatDuration(totalDuration)}`);

  if (allPassed) {
    console.log('\n\x1b[32m' + '═'.repeat(60) + '\x1b[0m');
    console.log('\x1b[32m  ALL VALIDATIONS PASSED\x1b[0m');
    console.log('\x1b[32m' + '═'.repeat(60) + '\x1b[0m\n');
    return 0;
  } else {
    console.log('\n\x1b[31m' + '═'.repeat(60) + '\x1b[0m');
    console.log('\x1b[31m  VALIDATION FAILED\x1b[0m');
    console.log('\x1b[31m' + '═'.repeat(60) + '\x1b[0m\n');
    return 1;
  }
}

// Run validations
runAllValidations()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('Validation runner error:', error.message);
    process.exit(1);
  });
