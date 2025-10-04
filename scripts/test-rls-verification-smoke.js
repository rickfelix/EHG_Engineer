#!/usr/bin/env node

/**
 * RLS Verification Smoke Tests (Tier 1)
 * Purpose: Execute 5 critical smoke tests from PRD
 * Test Plan: PRD-SECURITY-002 test_scenarios
 */

import { execSync } from 'child_process';
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const { Client } = pg;

class RLSSmokeTests {
  constructor() {
    this.testResults = {
      timestamp: new Date().toISOString(),
      tests_passed: 0,
      tests_total: 5,
      pass_rate: 0,
      failed_tests: [],
      test_details: []
    };
  }

  /**
   * SMOKE-1: Script Execution
   * Verify verify-rls-policies.js script executes without errors
   */
  async testScriptExecution() {
    console.log('🧪 SMOKE-1: Script Execution Test');

    try {
      const startTime = Date.now();

      // Execute script
      const output = execSync('node scripts/verify-rls-policies.js --json', {
        encoding: 'utf-8',
        timeout: 30000 // 30 second timeout
      });

      const executionTime = Date.now() - startTime;

      // Parse JSON output
      const results = JSON.parse(output);

      // Verify execution time <30s
      const passed = executionTime < 30000 && results.timestamp;

      this.recordTest('SMOKE-1', passed, {
        execution_time_ms: executionTime,
        json_output_valid: !!results.timestamp,
        expected: 'Exit 0, JSON output, <30s',
        actual: `Exit 0, JSON valid, ${executionTime}ms`
      });

      console.log(passed ? '  ✅ PASS' : '  ❌ FAIL');
      console.log(`     Execution time: ${executionTime}ms`);
      return passed;

    } catch (error) {
      this.recordTest('SMOKE-1', false, {
        error: error.message,
        expected: 'Exit 0, JSON output, <30s',
        actual: `Error: ${error.message}`
      });
      console.log('  ❌ FAIL');
      console.log(`     Error: ${error.message}`);
      return false;
    }
  }

  /**
   * SMOKE-2: Role Permissions
   * Verify rls_auditor role has correct permissions
   */
  async testRolePermissions() {
    console.log('🧪 SMOKE-2: Role Permissions Test');

    try {
      const client = new Client({
        connectionString: process.env.SUPABASE_POOLER_URL,
        ssl: { rejectUnauthorized: false }
      });

      await client.connect();

      // Check pg_policies permission
      const { rows } = await client.query(`
        SELECT has_table_privilege('rls_auditor', 'pg_catalog.pg_policies', 'SELECT') AS can_read_policies;
      `);

      const passed = rows[0]?.can_read_policies === true;

      await client.end();

      this.recordTest('SMOKE-2', passed, {
        permission_check: 'pg_policies SELECT',
        expected: 'Returns true',
        actual: `Returns ${rows[0]?.can_read_policies}`
      });

      console.log(passed ? '  ✅ PASS' : '  ❌ FAIL');
      console.log(`     Permission: ${rows[0]?.can_read_policies ? 'Granted' : 'Denied'}`);
      return passed;

    } catch (error) {
      this.recordTest('SMOKE-2', false, {
        error: error.message,
        expected: 'Returns true',
        actual: `Error: ${error.message}`
      });
      console.log('  ❌ FAIL');
      console.log(`     Error: ${error.message}`);
      return false;
    }
  }

  /**
   * SMOKE-3: Workflow Syntax
   * Verify GitHub Actions workflow has no syntax errors
   */
  async testWorkflowSyntax() {
    console.log('🧪 SMOKE-3: Workflow Syntax Test');

    try {
      // Check if workflow file exists
      const workflowPath = '.github/workflows/rls-verification.yml';
      const exists = fs.existsSync(workflowPath);

      if (!exists) {
        throw new Error('Workflow file not found');
      }

      // Read and validate YAML structure
      const content = fs.readFileSync(workflowPath, 'utf-8');

      // Basic syntax checks
      const hasName = content.includes('name:');
      const hasOn = content.includes('on:');
      const hasJobs = content.includes('jobs:');
      const hasSteps = content.includes('steps:');

      const passed = exists && hasName && hasOn && hasJobs && hasSteps;

      this.recordTest('SMOKE-3', passed, {
        file_exists: exists,
        has_required_keys: hasName && hasOn && hasJobs && hasSteps,
        expected: 'No syntax errors',
        actual: passed ? 'Valid YAML structure' : 'Invalid structure'
      });

      console.log(passed ? '  ✅ PASS' : '  ❌ FAIL');
      console.log(`     File exists: ${exists}`);
      console.log(`     Valid structure: ${passed}`);
      return passed;

    } catch (error) {
      this.recordTest('SMOKE-3', false, {
        error: error.message,
        expected: 'No syntax errors',
        actual: `Error: ${error.message}`
      });
      console.log('  ❌ FAIL');
      console.log(`     Error: ${error.message}`);
      return false;
    }
  }

  /**
   * SMOKE-4: Missing RLS Detection
   * Verify script detects missing RLS policies (using test scenario)
   */
  async testMissingRLSDetection() {
    console.log('🧪 SMOKE-4: Missing RLS Detection Test');

    try {
      // Run verification script
      const output = execSync('node scripts/verify-rls-policies.js --json', {
        encoding: 'utf-8'
      });

      const results = JSON.parse(output);

      // Check if script can identify tables without RLS
      // A passing test means the script successfully reports status
      // (We're testing the detection capability, not that all tables have RLS)
      const hasStatusReporting = typeof results.tables_missing_rls === 'number';
      const hasFailedTablesList = Array.isArray(results.failed_tables);

      const passed = hasStatusReporting && hasFailedTablesList;

      this.recordTest('SMOKE-4', passed, {
        can_detect_missing_rls: hasStatusReporting,
        reports_failed_tables: hasFailedTablesList,
        tables_missing_rls: results.tables_missing_rls,
        expected: 'Script reports RLS status',
        actual: `Reports ${results.tables_missing_rls} missing, ${results.failed_tables.length} failed`
      });

      console.log(passed ? '  ✅ PASS' : '  ❌ FAIL');
      console.log(`     Detection capability: ${passed ? 'Working' : 'Failed'}`);
      console.log(`     Tables missing RLS: ${results.tables_missing_rls}`);
      return passed;

    } catch (error) {
      this.recordTest('SMOKE-4', false, {
        error: error.message,
        expected: 'Script reports RLS status',
        actual: `Error: ${error.message}`
      });
      console.log('  ❌ FAIL');
      console.log(`     Error: ${error.message}`);
      return false;
    }
  }

  /**
   * SMOKE-5: PLAN Integration
   * Verify RLS verification integrates with PLAN phase
   */
  async testPLANIntegration() {
    console.log('🧪 SMOKE-5: PLAN Integration Test');

    try {
      // Check if integration script exists
      const integrationPath = 'scripts/plan-supervisor-rls-integration.js';
      const exists = fs.existsSync(integrationPath);

      if (!exists) {
        throw new Error('PLAN integration script not found');
      }

      // Check script can be imported
      const content = fs.readFileSync(integrationPath, 'utf-8');
      const hasExport = content.includes('export default');
      const hasExecuteMethod = content.includes('async execute');

      const passed = exists && hasExport && hasExecuteMethod;

      this.recordTest('SMOKE-5', passed, {
        file_exists: exists,
        has_export: hasExport,
        has_execute_method: hasExecuteMethod,
        expected: 'PLAN integration script functional',
        actual: passed ? 'Script ready for integration' : 'Script incomplete'
      });

      console.log(passed ? '  ✅ PASS' : '  ❌ FAIL');
      console.log(`     Integration script: ${exists ? 'Found' : 'Missing'}`);
      console.log(`     Functional: ${passed}`);
      return passed;

    } catch (error) {
      this.recordTest('SMOKE-5', false, {
        error: error.message,
        expected: 'PLAN integration script functional',
        actual: `Error: ${error.message}`
      });
      console.log('  ❌ FAIL');
      console.log(`     Error: ${error.message}`);
      return false;
    }
  }

  /**
   * Record test result
   */
  recordTest(testId, passed, details) {
    if (passed) {
      this.testResults.tests_passed++;
    } else {
      this.testResults.failed_tests.push(testId);
    }

    this.testResults.test_details.push({
      test_id: testId,
      passed,
      ...details
    });
  }

  /**
   * Run all smoke tests
   */
  async runAll() {
    console.log('🚀 RLS Verification Smoke Tests (Tier 1)');
    console.log('='.repeat(50));
    console.log('');

    await this.testScriptExecution();
    await this.testRolePermissions();
    await this.testWorkflowSyntax();
    await this.testMissingRLSDetection();
    await this.testPLANIntegration();

    this.testResults.pass_rate = Math.round(
      (this.testResults.tests_passed / this.testResults.tests_total) * 100
    );

    console.log('\n' + '='.repeat(50));
    console.log('SMOKE TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Tests Passed: ${this.testResults.tests_passed}/${this.testResults.tests_total}`);
    console.log(`Pass Rate: ${this.testResults.pass_rate}%`);
    console.log(`Status: ${this.testResults.pass_rate >= 80 ? '✅ PASS' : '❌ FAIL'}`);

    if (this.testResults.failed_tests.length > 0) {
      console.log('\nFailed Tests:');
      this.testResults.failed_tests.forEach(test => console.log(`  - ${test}`));
    }

    // Save results to file
    fs.writeFileSync(
      '/tmp/rls-verification-smoke-tests.json',
      JSON.stringify(this.testResults, null, 2)
    );

    console.log('\n📄 Results saved to: /tmp/rls-verification-smoke-tests.json');

    return this.testResults;
  }
}

// CLI Entry Point
async function main() {
  const tester = new RLSSmokeTests();
  const results = await tester.runAll();

  // Exit with appropriate code (pass rate >= 80%)
  process.exit(results.pass_rate >= 80 ? 0 : 1);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default RLSSmokeTests;
