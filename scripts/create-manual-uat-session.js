#!/usr/bin/env node

/**
 * Create a Fresh Manual UAT Testing Session
 * Starts a new test run with all tests marked as "not tested"
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function createManualSession() {
  console.log(chalk.cyan.bold('\n🆕 Creating Fresh Manual UAT Session\n'));
  console.log(chalk.gray('This will create a new test run with all tests unmarked'));
  console.log(chalk.gray('=' .repeat(60)));

  // First, close any existing runs
  console.log(chalk.yellow('\n📋 Closing previous test runs...'));

  const { error: closeError } = await supabase
    .from('uat_runs')
    .update({ ended_at: new Date().toISOString() })
    .is('ended_at', null);

  if (!closeError) {
    console.log(chalk.green('✓ Previous runs closed'));
  }

  // Create a new manual testing run
  console.log(chalk.yellow('\n🚀 Creating new manual test run...'));

  const { data: newRun, error: runError } = await supabase
    .from('uat_runs')
    .insert({
      app: 'EHG',
      env_url: 'http://localhost:5173',
      app_version: '1.0.0',
      browser: 'Manual Testing',
      role: 'Tester',
      notes: 'MANUAL UAT SESSION - Human tester performing real tests',
      started_at: new Date().toISOString(),
      created_by: 'Human Tester'
    })
    .select()
    .single();

  if (runError) {
    console.error(chalk.red('❌ Failed to create run:'), runError.message);
    return;
  }

  console.log(chalk.green('✅ New manual test run created!'));
  console.log(chalk.cyan('\n╔═══════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║           MANUAL UAT SESSION DETAILS                  ║'));
  console.log(chalk.cyan('╚═══════════════════════════════════════════════════════╝'));
  console.log(chalk.white(`  Run ID:      ${newRun.id}`));
  console.log(chalk.white('  Type:        MANUAL TESTING'));
  console.log(chalk.white('  Environment: http://localhost:5173'));
  console.log(chalk.white(`  Started:     ${new Date(newRun.started_at).toLocaleString()}`));
  console.log(chalk.cyan('═'.repeat(60)));

  // Get test statistics
  const { data: testCases } = await supabase
    .from('uat_cases')
    .select('priority')
    .order('priority');

  const priorityCounts = {
    critical: testCases?.filter(t => t.priority === 'critical').length || 0,
    high: testCases?.filter(t => t.priority === 'high').length || 0,
    medium: testCases?.filter(t => t.priority === 'medium').length || 0,
    low: testCases?.filter(t => t.priority === 'low').length || 0
  };

  console.log(chalk.yellow('\n📊 Test Cases Ready for Manual Testing:'));
  console.log(chalk.white(`  Total Tests: ${testCases?.length || 0}`));
  console.log(chalk.red(`  • Critical:  ${priorityCounts.critical}`));
  console.log(chalk.yellow(`  • High:      ${priorityCounts.high}`));
  console.log(chalk.blue(`  • Medium:    ${priorityCounts.medium}`));
  console.log(chalk.gray(`  • Low:       ${priorityCounts.low}`));

  console.log(chalk.green('\n✨ Your fresh manual testing session is ready!'));
  console.log(chalk.cyan('\n' + '═'.repeat(60)));
  console.log(chalk.yellow('📋 Next Steps:'));
  console.log(chalk.white('1. Go to UAT Dashboard: http://localhost:3000/uat-dashboard'));
  console.log(chalk.white('2. All tests should now show as "Not Tested"'));
  console.log(chalk.white('3. Run tests with: node scripts/simple-uat-test.js'));
  console.log(chalk.white('4. Or select tests from the dashboard and click "Start Test"'));
  console.log(chalk.cyan('═'.repeat(60) + '\n'));

  console.log(chalk.gray('💡 Tip: Start with Critical priority tests first!'));
  console.log(chalk.gray('💡 Remember: You need ≥85% pass rate for GREEN gate status\n'));

  // Save run ID for easy access
  const fs = (await import('fs')).default;
  fs.writeFileSync('.current-uat-run', newRun.id);
  console.log(chalk.gray('Run ID saved to .current-uat-run for reference\n'));
}

// Run
createManualSession().catch(console.error);