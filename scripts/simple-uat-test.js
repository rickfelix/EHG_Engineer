#!/usr/bin/env node

/**
 * Simple UAT Test Guide - Interactive Login Test
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import readline from 'readline';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (question) => {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer.trim());
    });
  });
};

async function runLoginTest() {
  console.clear();
  console.log(chalk.cyan.bold('\n🧪 UAT Test Guide - Login Test\n'));
  console.log(chalk.gray('=' .repeat(60)));

  // Test Information
  console.log(chalk.yellow('\n📋 Test Case: TEST-AUTH-001'));
  console.log(chalk.white('Title: Login with valid credentials'));
  console.log(chalk.gray('Priority: CRITICAL'));
  console.log(chalk.gray('Section: Authentication\n'));

  console.log(chalk.cyan('═'.repeat(60)));

  // Provide Instructions
  console.log(chalk.yellow('\n📝 Test Steps:\n'));
  console.log(chalk.white('1. Open your browser and navigate to:'));
  console.log(chalk.green('   http://localhost:5173/login\n'));

  console.log(chalk.white('2. Enter the following credentials:'));
  console.log(chalk.green('   Username: admin@test.com'));
  console.log(chalk.green('   Password: Admin123!\n'));

  console.log(chalk.white('3. Click the "Sign In" button\n'));

  console.log(chalk.white('4. Verify that:'));
  console.log(chalk.gray('   • The dashboard page loads'));
  console.log(chalk.gray('   • Your username appears in the header'));
  console.log(chalk.gray('   • No error messages are displayed\n'));

  console.log(chalk.yellow('✓ Expected Result:'));
  console.log(chalk.gray('  User successfully logs in and sees the dashboard\n'));

  console.log(chalk.cyan('═'.repeat(60)));

  // Wait for user to perform test
  const _ready = await ask(chalk.cyan('\nPress Enter when ready to perform the test...'));

  console.log(chalk.gray('\n⏱️  Please perform the test steps now...\n'));

  // Get test result
  console.log(chalk.yellow('After performing the test, select the result:\n'));
  console.log('  ' + chalk.green('P') + ' - PASS (login succeeded)');
  console.log('  ' + chalk.red('F') + ' - FAIL (login failed)');
  console.log('  ' + chalk.yellow('B') + ' - BLOCKED (cannot test)');
  console.log('  ' + chalk.gray('N') + ' - N/A (not applicable)\n');

  const result = await ask(chalk.cyan('Test result (P/F/B/N): '));

  let status;
  switch (result.toUpperCase()) {
    case 'P': status = 'PASS'; break;
    case 'F': status = 'FAIL'; break;
    case 'B': status = 'BLOCKED'; break;
    case 'N': status = 'NA'; break;
    default:
      console.log(chalk.red('Invalid result.'));
      rl.close();
      return;
  }

  // Get additional details for failures
  let notes = '';
  if (status === 'FAIL' || status === 'BLOCKED') {
    console.log(chalk.yellow('\n📝 Please provide details:\n'));
    notes = await ask('What went wrong? ');

    // Provide troubleshooting tips
    if (status === 'FAIL') {
      console.log(chalk.yellow('\n💡 Troubleshooting Tips:'));

      if (notes.toLowerCase().includes('404') || notes.toLowerCase().includes('not found')) {
        console.log('  • Check if the EHG app is running on port 5173');
        console.log('  • Run: cd /mnt/c/_EHG/EHG && npm run dev');
      } else if (notes.toLowerCase().includes('credential') || notes.toLowerCase().includes('password')) {
        console.log('  • Verify the credentials are correct');
        console.log('  • Check if the user exists in the database');
        console.log('  • Try resetting the password');
      } else if (notes.toLowerCase().includes('error') || notes.toLowerCase().includes('crash')) {
        console.log('  • Check browser console for errors (F12)');
        console.log('  • Check if the API is responding');
        console.log('  • Look at server logs for issues');
      }
    }
  } else if (status === 'PASS') {
    notes = await ask('Any notes? (optional, press Enter to skip): ') || 'Login successful';
  }

  // Save result to database
  console.log(chalk.gray('\n💾 Recording test result...'));

  // Get or create a test run
  let runId;
  const { data: existingRuns } = await supabase
    .from('uat_runs')
    .select('id')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1);

  if (existingRuns && existingRuns.length > 0) {
    runId = existingRuns[0].id;
  } else {
    // Create new run
    const { data: newRun } = await supabase
      .from('uat_runs')
      .insert({
        app: 'EHG',
        env_url: 'http://localhost:5173',
        app_version: '1.0.0',
        browser: 'Chrome',
        role: 'Admin',
        notes: 'Manual UAT testing session',
        started_at: new Date().toISOString(),
        created_by: 'Manual Tester'
      })
      .select()
      .single();

    runId = newRun?.id;
  }

  if (runId) {
    // Record the result
    const { error } = await supabase
      .from('uat_results')
      .upsert({
        run_id: runId,
        case_id: 'TEST-AUTH-001',
        status: status,
        notes: notes,
        recorded_at: new Date().toISOString()
      }, {
        onConflict: 'run_id,case_id'
      });

    if (!error) {
      console.log(chalk.green('✅ Test result recorded successfully!'));
    } else {
      console.log(chalk.red('Failed to save result:'), error.message);
    }
  }

  // Summary
  console.log(chalk.cyan('\n' + '═'.repeat(60)));
  console.log(chalk.bold('Test Summary'));
  console.log(chalk.cyan('═'.repeat(60)));
  console.log('Test Case: TEST-AUTH-001');
  console.log(`Result: ${status === 'PASS' ? chalk.green(status) :
                       status === 'FAIL' ? chalk.red(status) :
                       chalk.yellow(status)}`);
  if (notes) {
    console.log(`Notes: ${notes}`);
  }
  console.log(chalk.cyan('═'.repeat(60)));

  console.log(chalk.gray('\n👀 View results at: http://localhost:3000/uat-dashboard\n'));

  // Ask about next test
  const nextTest = await ask(chalk.cyan('Would you like to test another case? (y/n): '));
  if (nextTest.toLowerCase() === 'y') {
    console.log(chalk.yellow('\nOther test cases you can try:'));
    console.log('  • TEST-AUTH-002: Login with invalid credentials');
    console.log('  • TEST-DASH-001: Dashboard initial load');
    console.log('  • TEST-VENT-001: View ventures list');
    console.log('\nRun: node scripts/simple-uat-test.js\n');
  }

  rl.close();
}

// Run the test
runLoginTest().catch(console.error);