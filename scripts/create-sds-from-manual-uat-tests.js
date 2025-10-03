#!/usr/bin/env node

/**
 * Batch Create Strategic Directives from Manual UAT Tests
 *
 * Converts all 20 manual UAT test cases into Strategic Directives using AI.
 * Each test's comprehensive assessment becomes the foundation for an SD.
 */

import { UATToSDConverter } from './uat-to-strategic-directive-ai.js';
import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createSDsFromManualUATTests() {
  console.log(chalk.cyan.bold('\n🎯 Batch SD Generation from Manual UAT Tests\n'));
  console.log(chalk.gray('═'.repeat(70)));

  try {
    // Fetch all 20 manual UAT tests
    console.log(chalk.yellow('\n📋 Fetching manual UAT test cases...'));
    const { data: testCases, error } = await supabase
      .from('uat_cases')
      .select('*')
      .eq('test_type', 'manual')
      .order('sort_order');

    if (error) {
      throw new Error(`Failed to fetch UAT tests: ${error.message}`);
    }

    console.log(chalk.green(`✅ Found ${testCases.length} manual UAT test cases`));
    console.log(chalk.gray('─'.repeat(70)));

    const results = [];
    const errors = [];

    // Process each test case
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(chalk.cyan(`\n[${i + 1}/${testCases.length}] Processing: ${testCase.id}`));
      console.log(chalk.white(`   Title: ${testCase.title}`));
      console.log(chalk.white(`   Section: ${testCase.section}`));
      console.log(chalk.white(`   Priority: ${testCase.priority}`));

      try {
        // Format test case as "failed" test result for conversion
        const testResult = {
          id: testCase.id,
          case_id: testCase.id,
          title: testCase.title,
          section: testCase.section,
          priority: testCase.priority || 'high',
          status: 'FAIL', // Fake status for conversion (tests are assessment-only)
          description: testCase.description || `Manual UAT test for ${testCase.section}`,
          expected: 'Test should pass with all requirements met',
          actual: 'Manual test not yet executed - SD created from assessment',
          notes: `Generated from comprehensive UAT assessment. Section: ${testCase.section}`,
          // Fake IDs for linking (optional, converter handles missing gracefully)
          result_id: `MANUAL-${testCase.id}`,
          run_id: 'manual-batch-sd-generation'
        };

        // Convert to Strategic Directive using AI
        const converter = new UATToSDConverter();
        const submission = await converter.convertTestFailureToSD(testResult);

        results.push({
          testId: testCase.id,
          submissionId: submission.submission_id,
          sdKey: submission.sd_key,
          success: true
        });

        console.log(chalk.green(`   ✅ SD Created: ${submission.sd_key}`));
        console.log(chalk.green(`   📋 Submission: ${submission.submission_id}`));

        // Brief delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (err) {
        console.error(chalk.red(`   ❌ Failed: ${err.message}`));
        errors.push({
          testId: testCase.id,
          error: err.message
        });
      }

      console.log(chalk.gray('─'.repeat(70)));
    }

    // Summary Report
    console.log(chalk.cyan.bold('\n📊 BATCH CONVERSION SUMMARY\n'));
    console.log(chalk.green(`✅ Successful: ${results.length}/${testCases.length}`));
    console.log(chalk.red(`❌ Failed: ${errors.length}/${testCases.length}`));

    if (results.length > 0) {
      console.log(chalk.yellow('\n✨ Created Strategic Directives:'));
      results.forEach(r => {
        console.log(chalk.white(`   • ${r.sdKey} (Test: ${r.testId})`));
      });
    }

    if (errors.length > 0) {
      console.log(chalk.red('\n❌ Failed Conversions:'));
      errors.forEach(e => {
        console.log(chalk.red(`   • ${e.testId}: ${e.error}`));
      });
    }

    console.log(chalk.cyan.bold('\n🎉 Batch conversion complete!\n'));
    console.log(chalk.white(`📍 View created SDs at: http://localhost:3000/dashboard`));
    console.log(chalk.white(`📊 View UAT tests at: http://localhost:3000/uat\n`));

  } catch (error) {
    console.error(chalk.red.bold('\n❌ Batch conversion failed:'), error.message);
    console.error(error);
    process.exit(1);
  }
}

// Execute
createSDsFromManualUATTests().catch(console.error);
