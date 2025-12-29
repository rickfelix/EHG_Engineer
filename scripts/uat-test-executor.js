#!/usr/bin/env node

/**
 * UAT Test Executor
 * Interactive CLI for executing UAT tests with sub-agent guidance
 */

import UATSubAgent from '../lib/agents/uat-sub-agent.js';
import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import { Command } from 'commander';

// Initialize Supabase
const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

// Setup CLI
const program = new Command();
program
  .name('uat-executor')
  .description('UAT Test Executor - Interactive test guidance')
  .version('1.0.0')
  .option('-r, --run <id>', 'UAT run ID')
  .option('-t, --test <id>', 'Specific test case ID')
  .option('-l, --list', 'List available tests')
  .option('-s, --status', 'Show run status')
  .parse();

const options = program.opts();

/**
 * Get or create active run
 */
async function getActiveRun() {
  // Check for environment variable
  let runId = options.run || process.env.UAT_RUN_ID;

  if (!runId) {
    // Look for most recent active run
    const { data: runs } = await supabase
      .from('uat_runs')
      .select('*')
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1);

    if (runs && runs.length > 0) {
      runId = runs[0].id;
      console.log(chalk.green(`✓ Found active run: ${runId.slice(0, 8)}...`));
    } else {
      // Create a new run
      console.log(chalk.yellow('No active run found. Creating new test run...\n'));

      const { data: newRun, error } = await supabase
        .from('uat_runs')
        .insert({
          app: 'EHG',
          env_url: 'http://localhost:5173',
          app_version: '1.0.0',
          browser: 'Chrome',
          role: 'Admin',
          notes: 'UAT test execution session',
          started_at: new Date().toISOString(),
          created_by: 'UAT Executor'
        })
        .select()
        .single();

      if (error) {
        console.error(chalk.red('Failed to create run:'), error.message);
        process.exit(1);
      }

      runId = newRun.id;
      console.log(chalk.green(`✅ Created new run: ${runId}`));
      console.log(chalk.gray(`Set environment variable: export UAT_RUN_ID=${runId}\n`));
    }
  }

  return runId;
}

/**
 * List available tests
 */
async function listTests(runId) {
  console.log(chalk.cyan.bold('\n📋 Available UAT Tests\n'));

  // Get test cases with their status
  const { data: _cases } = await supabase
    .from('uat_cases')
    .select(`
      *,
      uat_results!inner (
        status
      )
    `)
    .eq('uat_results.run_id', runId)
    .order('section')
    .order('priority', { ascending: false });

  const { data: allCases } = await supabase
    .from('uat_cases')
    .select('*')
    .order('section')
    .order('priority', { ascending: false });

  // Get results for this run
  const { data: results } = await supabase
    .from('uat_results')
    .select('case_id, status')
    .eq('run_id', runId);

  const resultMap = new Map(results?.map(r => [r.case_id, r.status]) || []);

  // Group by section
  const sections = {};
  for (const testCase of allCases || []) {
    if (!sections[testCase.section]) {
      sections[testCase.section] = [];
    }
    sections[testCase.section].push({
      ...testCase,
      status: resultMap.get(testCase.id) || 'NOT_TESTED'
    });
  }

  // Display tests by section
  for (const [section, tests] of Object.entries(sections)) {
    console.log(chalk.yellow.bold(`\n${section}:`));

    for (const test of tests) {
      const statusIcon =
        test.status === 'PASS' ? '✅' :
        test.status === 'FAIL' ? '❌' :
        test.status === 'BLOCKED' ? '⚠️' :
        test.status === 'NA' ? '⭕' : '⬜';

      const priorityColor =
        test.priority === 'critical' ? chalk.red :
        test.priority === 'high' ? chalk.yellow :
        chalk.gray;

      console.log(
        `  ${statusIcon} ${chalk.cyan(test.id)} - ${test.title} ${priorityColor(`[${test.priority}]`)}`
      );
    }
  }

  // Show summary
  const total = allCases?.length || 0;
  const tested = results?.filter(r => r.status).length || 0;
  const passed = results?.filter(r => r.status === 'PASS').length || 0;

  console.log(chalk.cyan('\n' + '═'.repeat(60)));
  console.log(`Progress: ${tested}/${total} tests completed (${Math.round(tested/total*100)}%)`);
  console.log(`Pass Rate: ${tested > 0 ? Math.round(passed/tested*100) : 0}%`);
}

/**
 * Show run status
 */
async function showStatus(runId) {
  const { data: stats } = await supabase
    .from('v_uat_run_stats')
    .select('*')
    .eq('run_id', runId)
    .single();

  if (!stats) {
    console.log(chalk.red('Run not found.'));
    return;
  }

  console.log(chalk.cyan.bold('\n📊 UAT Run Status\n'));
  console.log(`Run ID: ${stats.run_id.slice(0, 8)}...`);
  console.log(`Environment: ${stats.env_url}`);
  console.log(`Browser: ${stats.browser}`);
  console.log(`Started: ${new Date(stats.started_at).toLocaleString()}`);

  if (stats.active_case_id) {
    console.log(chalk.yellow(`\n🎯 Active Test: ${stats.active_case_title}`));
  }

  console.log(chalk.cyan('\n' + '═'.repeat(60)));
  console.log('Test Results:');
  console.log(`  ✅ Passed: ${stats.passed}`);
  console.log(`  ❌ Failed: ${stats.failed}`);
  console.log(`  ⚠️ Blocked: ${stats.blocked}`);
  console.log(`  ⭕ N/A: ${stats.na}`);
  console.log(`  ⬜ Not Tested: ${stats.not_tested}`);
  console.log(chalk.cyan('═'.repeat(60)));

  const gateColor =
    stats.gate_status === 'GREEN' ? chalk.green :
    stats.gate_status === 'YELLOW' ? chalk.yellow :
    stats.gate_status === 'RED' ? chalk.red :
    chalk.gray;

  console.log(`Pass Rate: ${stats.pass_rate}%`);
  console.log(`Gate Status: ${gateColor(stats.gate_status)}`);

  if (stats.has_critical_defects) {
    console.log(chalk.red('\n⚠️ Critical defects detected!'));
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Get active run
    const runId = await getActiveRun();

    if (options.list) {
      // List tests
      await listTests(runId);
    } else if (options.status) {
      // Show status
      await showStatus(runId);
    } else {
      // Execute test
      const agent = new UATSubAgent();

      if (options.test) {
        // Set specific test as active
        await agent.setActiveTest(runId, options.test);
      }

      // Execute the active test
      await agent.executeTest(runId);
    }

  } catch (_error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

// Run
main();