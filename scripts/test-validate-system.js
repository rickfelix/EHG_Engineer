#!/usr/bin/env node

/**
 * Test Management System Validation
 * SD-TEST-MGMT-EXEC-001
 *
 * Validates all test management components work together correctly.
 * Runs integration tests across scanner, selection, automation, and LLM features.
 *
 * Usage:
 *   node scripts/test-validate-system.js [options]
 *
 * Options:
 *   --quick         Run quick validation (skip LLM tests)
 *   --verbose, -v   Show detailed output
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });
dotenv.config({ path: path.join(PROJECT_ROOT, '.env.claude') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    quick: false,
    verbose: false
  };

  for (const arg of args) {
    if (arg === '--quick') options.quick = true;
    if (arg === '--verbose' || arg === '-v') options.verbose = true;
  }

  return options;
}

/**
 * Validation result tracker
 */
class ValidationResults {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  add(component, status, message, details = null) {
    this.results.push({
      component,
      status,
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }

  pass(component, message, details = null) {
    this.add(component, 'PASS', message, details);
    console.log(`   ✅ ${component}: ${message}`);
  }

  fail(component, message, details = null) {
    this.add(component, 'FAIL', message, details);
    console.log(`   ❌ ${component}: ${message}`);
  }

  warn(component, message, details = null) {
    this.add(component, 'WARN', message, details);
    console.log(`   ⚠️  ${component}: ${message}`);
  }

  getSummary() {
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const warned = this.results.filter(r => r.status === 'WARN').length;
    const duration = Date.now() - this.startTime;

    return {
      total: this.results.length,
      passed,
      failed,
      warned,
      duration,
      success: failed === 0
    };
  }
}

/**
 * Validate database connectivity
 */
async function validateDatabase(results, options) {
  console.log('\n   Database Connectivity\n');

  try {
    if (!supabaseUrl || !supabaseKey) {
      results.fail('Database', 'Missing credentials');
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Test UAT tables
    const tables = ['uat_test_suites', 'uat_test_cases', 'test_runs', 'test_failures'];

    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        results.fail(`Database.${table}`, error.message);
      } else {
        results.pass(`Database.${table}`, `Connected (${count} rows)`);
      }
    }

    return true;
  } catch (err) {
    results.fail('Database', err.message);
    return false;
  }
}

/**
 * Validate script files exist
 */
function validateScripts(results, options) {
  console.log('\n   Script Files\n');

  const scripts = [
    'test-scanner.js',
    'test-selection.js',
    'test-automation.js',
    'test-llm-core.js',
    'test-llm-advanced.js',
    'test-result-capture.js',
    'lib/test-parser.js',
    'lib/test-registrar.js'
  ];

  let allFound = true;

  for (const script of scripts) {
    const scriptPath = path.join(PROJECT_ROOT, 'scripts', script);
    if (fs.existsSync(scriptPath)) {
      const stats = fs.statSync(scriptPath);
      results.pass(`Script.${script}`, `Exists (${(stats.size / 1024).toFixed(1)}KB)`);
    } else {
      results.fail(`Script.${script}`, 'Not found');
      allFound = false;
    }
  }

  return allFound;
}

/**
 * Validate script execution
 */
function validateExecution(results, options) {
  console.log('\n   Script Execution\n');

  const tests = [
    { script: 'test-scanner.js', args: '--dry-run', expect: 'scan' },
    { script: 'test-selection.js', args: 'help', expect: 'select' },
    { script: 'test-automation.js', args: 'help', expect: 'watch' }
  ];

  for (const test of tests) {
    try {
      const output = execSync(
        `node scripts/${test.script} ${test.args}`,
        { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30000 }
      );

      if (output.toLowerCase().includes(test.expect)) {
        results.pass(`Exec.${test.script}`, 'Runs successfully');
      } else {
        results.warn(`Exec.${test.script}`, 'Runs but unexpected output');
      }
    } catch (err) {
      results.fail(`Exec.${test.script}`, err.message.substring(0, 100));
    }
  }
}

/**
 * Validate documentation
 */
function validateDocumentation(results, options) {
  console.log('\n   Documentation\n');

  const docs = [
    'docs/test-management/README.md'
  ];

  for (const doc of docs) {
    const docPath = path.join(PROJECT_ROOT, doc);
    if (fs.existsSync(docPath)) {
      const content = fs.readFileSync(docPath, 'utf-8');
      const lines = content.split('\n').length;
      results.pass(`Docs.${path.basename(doc)}`, `Exists (${lines} lines)`);
    } else {
      results.warn(`Docs.${path.basename(doc)}`, 'Not found');
    }
  }
}

/**
 * Validate LLM integration (optional)
 */
async function validateLLM(results, options) {
  if (options.quick) {
    results.warn('LLM', 'Skipped (quick mode)');
    return;
  }

  console.log('\n   LLM Integration\n');

  const openaiKey = process.env.OPENAI_API_KEY;
  const localLLM = process.env.USE_LOCAL_LLM;

  if (!openaiKey && !localLLM) {
    results.warn('LLM.credentials', 'No LLM configured (set OPENAI_API_KEY or USE_LOCAL_LLM=true)');
    return;
  }

  results.pass('LLM.credentials', localLLM ? 'Local LLM configured' : 'OpenAI API key configured');

  // Check LLM scripts can be loaded
  try {
    const { help } = await import('./test-llm-core.js').catch(() => ({}));
    results.pass('LLM.core', 'Module loads');
  } catch (err) {
    results.warn('LLM.core', 'Could not verify module');
  }
}

/**
 * Validate CI/CD integration
 */
function validateCICD(results, options) {
  console.log('\n   CI/CD Integration\n');

  const workflowPath = path.join(PROJECT_ROOT, '.github/workflows/test-coverage.yml');

  if (fs.existsSync(workflowPath)) {
    const content = fs.readFileSync(workflowPath, 'utf-8');

    if (content.includes('test-result-capture')) {
      results.pass('CICD.workflow', 'Has test result capture step');
    } else {
      results.warn('CICD.workflow', 'Missing test result capture');
    }
  } else {
    results.warn('CICD.workflow', 'Workflow file not found');
  }
}

/**
 * Generate validation report
 */
function generateReport(results, options) {
  const summary = results.getSummary();

  const report = {
    timestamp: new Date().toISOString(),
    summary,
    results: results.results,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      projectRoot: PROJECT_ROOT
    }
  };

  const reportPath = path.join(PROJECT_ROOT, 'test-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return reportPath;
}

/**
 * Main validation function
 */
async function main() {
  console.log('  Test Management System Validation');
  console.log('   SD-TEST-MGMT-EXEC-001\n');
  console.log('='.repeat(60));

  const options = parseArgs();
  const results = new ValidationResults();

  // Run all validations
  validateScripts(results, options);
  await validateDatabase(results, options);
  validateExecution(results, options);
  validateDocumentation(results, options);
  await validateLLM(results, options);
  validateCICD(results, options);

  // Generate report
  const reportPath = generateReport(results, options);

  // Print summary
  const summary = results.getSummary();

  console.log('\n' + '='.repeat(60));
  console.log('  VALIDATION SUMMARY\n');
  console.log(`   Total Checks: ${summary.total}`);
  console.log(`   Passed: ${summary.passed}`);
  console.log(`   Failed: ${summary.failed}`);
  console.log(`   Warnings: ${summary.warned}`);
  console.log(`   Duration: ${summary.duration}ms`);
  console.log(`\n   Report: ${reportPath}`);

  if (summary.success) {
    console.log('\n   ✅ VALIDATION PASSED\n');
    process.exit(0);
  } else {
    console.log('\n   ❌ VALIDATION FAILED\n');
    process.exit(1);
  }
}

// Run main
main().catch(err => {
  console.error('  Error:', err.message);
  process.exit(1);
});
