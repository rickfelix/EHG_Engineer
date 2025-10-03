#!/usr/bin/env node

import { UATToSDConverter } from './uat-to-strategic-directive-ai.js';
import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createRemaining2SDs() {
  console.log(chalk.cyan.bold('\n🎯 Creating Remaining 2 Strategic Directives\n'));

  const testIds = ['TEST-NAV-018', 'TEST-NAV-019'];

  for (const testId of testIds) {
    console.log(chalk.yellow(`\nProcessing: ${testId}...`));

    const { data: testCase } = await supabase
      .from('uat_cases')
      .select('*')
      .eq('id', testId)
      .single();

    const testResult = {
      id: testCase.id,
      case_id: testCase.id,
      title: testCase.title,
      section: testCase.section,
      priority: testCase.priority || 'high',
      status: 'FAIL',
      description: testCase.description,
      expected: 'Test should pass',
      actual: 'Manual test not yet executed',
      notes: `Generated from UAT assessment. Section: ${testCase.section}`,
      result_id: `MANUAL-${testCase.id}`,
      run_id: 'manual-batch-sd-generation'
    };

    try {
      const converter = new UATToSDConverter();
      const submission = await converter.convertTestFailureToSD(testResult);
      console.log(chalk.green(`✅ Created: ${submission.sd_key}`));
    } catch (err) {
      console.error(chalk.red(`❌ Failed: ${err.message}`));
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(chalk.green.bold('\n✨ Complete! All 20 Strategic Directives created.\n'));
}

createRemaining2SDs().catch(console.error);
