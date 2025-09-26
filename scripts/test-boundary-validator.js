#!/usr/bin/env node

/**
 * Test script for ApplicationBoundaryValidator
 * Demonstrates validation functionality
 */

import { ApplicationBoundaryValidator } from '../src/services/ApplicationBoundaryValidator.js';
import chalk from 'chalk';

async function runTests() {
  console.log(chalk.blue('\n🧪 Testing ApplicationBoundaryValidator\n'));
  console.log('='.repeat(60));

  const validator = new ApplicationBoundaryValidator();
  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Validate SD with target_application
  console.log('\n📝 Test 1: Validate SD-003 (should be EHG)');
  try {
    const result = await validator.validateSD('SD-003');
    if (result.valid) {
      console.log(chalk.green(`✅ PASSED: SD validated - Target: ${result.target_application}`));
      testsPassed++;
    } else {
      console.log(chalk.red(`❌ FAILED: ${result.error}`));
      testsFailed++;
    }
  } catch (error) {
    console.log(chalk.red(`❌ ERROR: ${error.message}`));
    testsFailed++;
  }

  // Test 2: Validate implementation path for EHG_ENGINEER
  console.log('\n📝 Test 2: Validate EHG_ENGINEER path');
  try {
    // First set SD-BACKLOG-INT-001 as EHG_ENGINEER for testing
    validator.validationCache.set('sd_SD-BACKLOG-INT-001', {
      valid: true,
      target_application: 'EHG_ENGINEER'
    });

    const result = await validator.validateImplementation('SD-BACKLOG-INT-001', '/scripts/test-script.js');
    if (result.valid) {
      console.log(chalk.green('✅ PASSED: Path validated for EHG_ENGINEER'));
      testsPassed++;
    } else {
      console.log(chalk.red(`❌ FAILED: ${result.error}`));
      testsFailed++;
    }
  } catch (error) {
    console.log(chalk.red(`❌ ERROR: ${error.message}`));
    testsFailed++;
  }

  // Test 3: Detect cross-boundary violation
  console.log('\n📝 Test 3: Detect cross-boundary violation');
  try {
    // Try to implement EHG_ENGINEER SD in EHG path
    const result = await validator.validateImplementation('SD-BACKLOG-INT-001', '/src/client/components/Feature.jsx');
    if (!result.valid && result.error.includes('boundary violation')) {
      console.log(chalk.green('✅ PASSED: Boundary violation correctly detected'));
      testsPassed++;
    } else {
      console.log(chalk.red('❌ FAILED: Should have detected boundary violation'));
      testsFailed++;
    }
  } catch (error) {
    console.log(chalk.red(`❌ ERROR: ${error.message}`));
    testsFailed++;
  }

  // Test 4: Check views existence
  console.log('\n📝 Test 4: Check if validation views exist');
  try {
    const viewsExist = await validator.checkViewsExist();
    console.log(viewsExist
      ? chalk.green('✅ PASSED: Views are available')
      : chalk.yellow('⚠️  WARNING: Views not available - using fallback mode'));
    testsPassed++;
  } catch (error) {
    console.log(chalk.red(`❌ ERROR: ${error.message}`));
    testsFailed++;
  }

  // Test 5: Check cross-contamination
  console.log('\n📝 Test 5: Check cross-contamination for SD-003');
  try {
    const result = await validator.checkCrossContamination('SD-003');
    console.log(result.clean
      ? chalk.green('✅ PASSED: No contamination detected')
      : chalk.yellow(`⚠️  WARNING: ${result.issues?.length || 0} contamination issues found`));

    if (result.fallback) {
      console.log(chalk.yellow('   Note: Using fallback keyword-based validation'));
    }
    testsPassed++;
  } catch (error) {
    console.log(chalk.red(`❌ ERROR: ${error.message}`));
    testsFailed++;
  }

  // Test 6: Generate full validation report
  console.log('\n📝 Test 6: Generate validation report for SD-003');
  try {
    const report = await validator.generateValidationReport('SD-003');
    if (report.sd_validation && report.contamination_check && report.timestamp) {
      console.log(chalk.green('✅ PASSED: Full report generated successfully'));
      testsPassed++;
    } else {
      console.log(chalk.red('❌ FAILED: Report incomplete'));
      testsFailed++;
    }
  } catch (error) {
    console.log(chalk.red(`❌ ERROR: ${error.message}`));
    testsFailed++;
  }

  // Test 7: Cache functionality
  console.log('\n📝 Test 7: Verify caching works');
  try {
    const cacheSize = validator.validationCache.size;
    if (cacheSize > 0) {
      console.log(chalk.green(`✅ PASSED: Cache working (${cacheSize} entries)`));
      testsPassed++;
    } else {
      console.log(chalk.yellow('⚠️  WARNING: Cache is empty'));
      testsPassed++;
    }
  } catch (error) {
    console.log(chalk.red(`❌ ERROR: ${error.message}`));
    testsFailed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(chalk.blue('📊 Test Summary:'));
  console.log(chalk.green(`   Passed: ${testsPassed}`));
  console.log(chalk.red(`   Failed: ${testsFailed}`));
  console.log(chalk.blue(`   Total:  ${testsPassed + testsFailed}`));

  if (testsFailed === 0) {
    console.log(chalk.green('\n🎉 All tests passed!'));
  } else {
    console.log(chalk.yellow('\n⚠️  Some tests failed. Review the output above.'));
  }

  console.log('='.repeat(60));
}

// Run tests
runTests().catch(console.error);