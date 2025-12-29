#!/usr/bin/env node

/**
 * Test script to verify SD completion fields are properly updated
 * This tests the fix for the critical issue where SDs weren't marked complete
 */

import { createClient } from '@supabase/supabase-js';
import UniversalPhaseExecutor from '../templates/execute-phase.js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class SDCompletionTester {
  constructor() {
    this.executor = new UniversalPhaseExecutor();
  }

  async testMarkSDComplete() {
    console.log(chalk.blue('\n🧪 Testing SD Completion Field Updates\n'));
    console.log('=' .repeat(50));

    // Create a test SD
    const testSDId = 'TEST-SD-' + Date.now();

    console.log(chalk.cyan('1. Creating test SD...'));
    const { data: testSD, error: createError } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: testSDId,
        title: 'Test SD for Completion Fix',
        category: 'test',
        status: 'active',
        is_working_on: true,
        progress: 30,
        current_phase: 'EXEC_IMPLEMENTATION',
        priority: 'low',
        description: 'Test SD to verify completion fields update correctly',
        target_application: 'EHG',
        rationale: 'Testing completion field updates',
        scope: 'Test scope',
        strategic_intent: 'Test intent',
        key_changes: [],
        strategic_objectives: [],
        success_criteria: [],
        key_principles: [],
        implementation_guidelines: [],
        dependencies: [],
        risks: [],
        success_metrics: [],
        stakeholders: [],
        metadata: {
          test: true,
          created_for: 'completion_fix_test'
        }
      })
      .select()
      .single();

    if (createError) {
      console.error(chalk.red('Failed to create test SD:'), createError);
      return;
    }

    console.log(chalk.green('✓ Test SD created:'), testSDId);
    console.log(chalk.gray(`  Initial state: status=${testSD.status}, progress=${testSD.progress}, is_working_on=${testSD.is_working_on}`));

    // Test the markSDComplete function
    console.log(chalk.cyan('\n2. Testing markSDComplete function...'));

    try {
      await this.executor.markSDComplete(testSDId);
      console.log(chalk.green('✓ markSDComplete executed successfully'));
    } catch (_error) {
      console.error(chalk.red('✗ markSDComplete failed:'), error);
    }

    // Verify the fields were updated
    console.log(chalk.cyan('\n3. Verifying field updates...'));

    const { data: updatedSD, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('id, status, progress, is_working_on, current_phase')
      .eq('id', testSDId)
      .single();

    if (fetchError) {
      console.error(chalk.red('Failed to fetch updated SD:'), fetchError);
      return;
    }

    console.log(chalk.blue('\nResults:'));
    console.log('-'.repeat(50));

    const checks = [
      {
        field: 'status',
        expected: 'completed',
        actual: updatedSD.status,
        pass: updatedSD.status === 'completed'
      },
      {
        field: 'progress',
        expected: 100,
        actual: updatedSD.progress,
        pass: updatedSD.progress === 100
      },
      {
        field: 'is_working_on',
        expected: false,
        actual: updatedSD.is_working_on,
        pass: updatedSD.is_working_on === false
      },
      {
        field: 'current_phase',
        expected: 'APPROVAL_COMPLETE',
        actual: updatedSD.current_phase,
        pass: updatedSD.current_phase === 'APPROVAL_COMPLETE'
      }
    ];

    let allPassed = true;
    checks.forEach(check => {
      const icon = check.pass ? '✓' : '✗';
      const color = check.pass ? chalk.green : chalk.red;
      console.log(color(`${icon} ${check.field}: ${check.actual} (expected: ${check.expected})`));
      if (!check.pass) allPassed = false;
    });

    // Clean up test SD
    console.log(chalk.cyan('\n4. Cleaning up test SD...'));
    await supabase
      .from('strategic_directives_v2')
      .delete()
      .eq('id', testSDId);
    console.log(chalk.green('✓ Test SD deleted'));

    // Final result
    console.log('\n' + '='.repeat(50));
    if (allPassed) {
      console.log(chalk.green.bold('✅ TEST PASSED: All fields updated correctly!'));
      console.log(chalk.gray('The SD completion fix is working properly.'));
    } else {
      console.log(chalk.red.bold('❌ TEST FAILED: Some fields did not update correctly'));
      console.log(chalk.yellow('Please review the implementation.'));
    }
  }
}

// Run the test
const tester = new SDCompletionTester();
tester.testMarkSDComplete()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(chalk.red('Test failed with error:'), error);
    process.exit(1);
  });