#!/usr/bin/env node

/**
 * Test Management System Validation Script
 * SD-TEST-MGMT-VALIDATION-001
 *
 * Validates the end-to-end flow of the Test Management System:
 * 1. Create a test run
 * 2. Execute a test and record result
 * 3. Verify result is saved to database
 * 4. Clean up test data
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

async function validateTestManagementSystem() {
  console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold} TEST MANAGEMENT SYSTEM VALIDATION${colors.reset}`);
  console.log(`${colors.dim} SD-TEST-MGMT-VALIDATION-001${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  const results = {
    createRun: false,
    getTestCase: false,
    recordResult: false,
    verifyResult: false,
    cleanup: false,
  };

  let runId = null;
  let resultId = null;

  try {
    // Step 1: Create a test run
    console.log(`${colors.bold}Step 1: Create Test Run${colors.reset}`);
    const { data: run, error: runError } = await supabase
      .from('uat_runs')
      .insert({
        app: 'EHG',
        env_url: 'http://localhost:5173',
        app_version: '1.0.0-validation',
        browser: 'Chrome',
        role: 'Admin',
        notes: 'SD-TEST-MGMT-VALIDATION-001 - System validation test',
        started_at: new Date().toISOString(),
        created_by: 'VALIDATION_SCRIPT'
      })
      .select()
      .single();

    if (runError) {
      console.log(`${colors.red}  ✗ Failed to create run: ${runError.message}${colors.reset}`);
    } else {
      runId = run.id;
      console.log(`${colors.green}  ✓ Created test run: ${runId.substring(0, 8)}...${colors.reset}`);
      results.createRun = true;
    }

    // Step 2: Get a test case
    console.log(`\n${colors.bold}Step 2: Retrieve Test Case${colors.reset}`);
    const { data: testCase, error: caseError } = await supabase
      .from('uat_cases')
      .select('*')
      .limit(1)
      .single();

    if (caseError) {
      console.log(`${colors.red}  ✗ Failed to get test case: ${caseError.message}${colors.reset}`);
    } else {
      console.log(`${colors.green}  ✓ Found test case: ${testCase.id}${colors.reset}`);
      console.log(`${colors.dim}    Title: ${testCase.title}${colors.reset}`);
      console.log(`${colors.dim}    Section: ${testCase.section}${colors.reset}`);
      results.getTestCase = true;

      // Step 3: Record a test result
      console.log(`\n${colors.bold}Step 3: Record Test Result${colors.reset}`);
      const { data: result, error: resultError } = await supabase
        .from('uat_results')
        .insert({
          run_id: runId,
          case_id: testCase.id,
          status: 'PASS',
          notes: 'Automated validation - Test Management System working correctly',
          recorded_at: new Date().toISOString()
        })
        .select()
        .single();

      if (resultError) {
        console.log(`${colors.red}  ✗ Failed to record result: ${resultError.message}${colors.reset}`);
      } else {
        resultId = result.id;
        console.log(`${colors.green}  ✓ Recorded result: ${resultId.substring(0, 8)}...${colors.reset}`);
        console.log(`${colors.dim}    Status: ${result.status}${colors.reset}`);
        results.recordResult = true;

        // Step 4: Verify the result was saved
        console.log(`\n${colors.bold}Step 4: Verify Result in Database${colors.reset}`);
        const { data: verifyResult, error: verifyError } = await supabase
          .from('uat_results')
          .select('*, uat_cases(title)')
          .eq('id', resultId)
          .single();

        if (verifyError) {
          console.log(`${colors.red}  ✗ Failed to verify: ${verifyError.message}${colors.reset}`);
        } else if (verifyResult.status === 'PASS') {
          console.log(`${colors.green}  ✓ Verified result exists in database${colors.reset}`);
          console.log(`${colors.dim}    Run ID: ${verifyResult.run_id.substring(0, 8)}...${colors.reset}`);
          console.log(`${colors.dim}    Case: ${verifyResult.uat_cases?.title || testCase.title}${colors.reset}`);
          console.log(`${colors.dim}    Status: ${verifyResult.status}${colors.reset}`);
          results.verifyResult = true;
        }
      }
    }

    // Step 5: Cleanup validation data
    console.log(`\n${colors.bold}Step 5: Cleanup Validation Data${colors.reset}`);

    // Delete result first (foreign key constraint)
    if (resultId) {
      const { error: deleteResultError } = await supabase
        .from('uat_results')
        .delete()
        .eq('id', resultId);

      if (deleteResultError) {
        console.log(`${colors.yellow}  ⚠ Could not delete result: ${deleteResultError.message}${colors.reset}`);
      } else {
        console.log(`${colors.green}  ✓ Deleted validation result${colors.reset}`);
      }
    }

    // Delete run
    if (runId) {
      const { error: deleteRunError } = await supabase
        .from('uat_runs')
        .delete()
        .eq('id', runId);

      if (deleteRunError) {
        console.log(`${colors.yellow}  ⚠ Could not delete run: ${deleteRunError.message}${colors.reset}`);
      } else {
        console.log(`${colors.green}  ✓ Deleted validation run${colors.reset}`);
        results.cleanup = true;
      }
    }

  } catch (error) {
    console.log(`${colors.red}  ✗ Unexpected error: ${error.message}${colors.reset}`);
  }

  // Summary
  console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold} VALIDATION SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  const checks = [
    { name: 'Create Test Run', passed: results.createRun },
    { name: 'Retrieve Test Case', passed: results.getTestCase },
    { name: 'Record Test Result', passed: results.recordResult },
    { name: 'Verify Database Write', passed: results.verifyResult },
    { name: 'Cleanup Test Data', passed: results.cleanup },
  ];

  let passedCount = 0;
  for (const check of checks) {
    const icon = check.passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    console.log(`  ${icon} ${check.name}`);
    if (check.passed) passedCount++;
  }

  const allPassed = passedCount === checks.length;
  console.log(`\n${colors.bold}Result: ${passedCount}/${checks.length} checks passed${colors.reset}`);

  if (allPassed) {
    console.log(`\n${colors.green}${colors.bold}✅ TEST MANAGEMENT SYSTEM VALIDATED SUCCESSFULLY${colors.reset}`);
    console.log(`${colors.dim}The system can create runs, record results, and persist to database.${colors.reset}\n`);
  } else {
    console.log(`\n${colors.yellow}${colors.bold}⚠️ VALIDATION INCOMPLETE${colors.reset}`);
    console.log(`${colors.dim}Some checks failed. Review the output above.${colors.reset}\n`);
  }

  return allPassed;
}

// Run validation
validateTestManagementSystem()
  .then(passed => process.exit(passed ? 0 : 1))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
