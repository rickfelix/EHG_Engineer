#!/usr/bin/env node

/**
 * UAT Test Runner for EHG Application
 * Orchestrates testing of EHG app with monitoring in EHG_Engineer dashboard
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config({ path: '.env.uat' });
dotenv.config(); // Also load default .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Configuration
const CONFIG = {
  ehgPath: process.env.EHG_APP_PATH || '/mnt/c/_EHG/EHG',
  ehgPort: process.env.EHG_APP_PORT || 5173,
  dashboardPort: process.env.DASHBOARD_PORT || 3000,
  headless: process.env.HEADLESS === 'true',
  workers: process.env.WORKERS || 4
};

// Process tracking
let dashboardProcess = null;
let ehgProcess = null;

// Cleanup function
function cleanup() {
  console.log('\n🧹 Cleaning up processes...');
  if (dashboardProcess) {
    dashboardProcess.kill();
    console.log('   ✓ Dashboard stopped');
  }
  if (ehgProcess) {
    ehgProcess.kill();
    console.log('   ✓ EHG app stopped');
  }
}

// Handle exit signals
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

// Check if port is in use
async function isPortInUse(port) {
  return new Promise((resolve) => {
    const checkProcess = spawn('lsof', ['-i', `:${port}`], {
      stdio: 'pipe'
    });

    checkProcess.on('close', (code) => {
      resolve(code === 0); // Port is in use if lsof returns 0
    });

    checkProcess.on('error', () => {
      resolve(false); // If lsof fails, assume port is free
    });
  });
}

// Wait for server to be ready
async function waitForServer(url, maxAttempts = 30) {
  console.log(`   ⏳ Waiting for ${url}...`);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) { // 404 is ok, means server is responding
        console.log(`   ✓ Server ready at ${url}`);
        return true;
      }
    } catch (e) {
      // Server not ready yet
    }
    await setTimeout(1000);
  }

  console.error(`   ❌ Server failed to start at ${url}`);
  return false;
}

// Start EHG Application
async function startEHGApp() {
  console.log(chalk.blue('\n1️⃣  Starting EHG Application (Test Target)'));
  console.log(`   Path: ${CONFIG.ehgPath}`);
  console.log(`   Port: ${CONFIG.ehgPort}`);

  // Check if already running
  if (await isPortInUse(CONFIG.ehgPort)) {
    console.log(chalk.yellow(`   ⚠️  EHG app already running on port ${CONFIG.ehgPort}`));
    return true;
  }

  // Check if path exists
  if (!existsSync(CONFIG.ehgPath)) {
    console.error(chalk.red(`   ❌ EHG path not found: ${CONFIG.ehgPath}`));
    return false;
  }

  // Start EHG app
  ehgProcess = spawn('npm', ['run', 'dev'], {
    cwd: CONFIG.ehgPath,
    env: { ...process.env, PORT: CONFIG.ehgPort },
    stdio: 'pipe'
  });

  ehgProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Local:') || output.includes('ready')) {
      console.log(chalk.gray(`   EHG: ${output.trim()}`));
    }
  });

  ehgProcess.stderr.on('data', (data) => {
    console.error(chalk.red(`   EHG Error: ${data.toString()}`));
  });

  // Wait for EHG to be ready
  const ready = await waitForServer(`http://localhost:${CONFIG.ehgPort}`);
  if (ready) {
    console.log(chalk.green(`   ✅ EHG Application ready at http://localhost:${CONFIG.ehgPort}`));
  }
  return ready;
}

// Start UAT Dashboard
async function startDashboard() {
  console.log(chalk.blue('\n2️⃣  Starting UAT Dashboard (For Monitoring)'));
  console.log(`   Port: ${CONFIG.dashboardPort}`);

  // Check if already running
  if (await isPortInUse(CONFIG.dashboardPort)) {
    console.log(chalk.yellow(`   ⚠️  Dashboard already running on port ${CONFIG.dashboardPort}`));
    return true;
  }

  // Build client if needed
  console.log('   📦 Building dashboard client...');
  const buildProcess = spawn('npm', ['run', 'build:client'], {
    cwd: join(__dirname, '..'),
    stdio: 'pipe'
  });

  await new Promise((resolve) => {
    buildProcess.on('close', resolve);
  });

  // Start dashboard server
  dashboardProcess = spawn('node', ['server.js'], {
    cwd: join(__dirname, '..'),
    env: { ...process.env, PORT: CONFIG.dashboardPort },
    stdio: 'pipe'
  });

  dashboardProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Dashboard') || output.includes('running')) {
      console.log(chalk.gray(`   Dashboard: ${output.trim()}`));
    }
  });

  dashboardProcess.stderr.on('data', (data) => {
    console.error(chalk.red(`   Dashboard Error: ${data.toString()}`));
  });

  // Wait for dashboard to be ready
  const ready = await waitForServer(`http://localhost:${CONFIG.dashboardPort}`);
  if (ready) {
    console.log(chalk.green(`   ✅ UAT Dashboard ready at http://localhost:${CONFIG.dashboardPort}/uat-dashboard`));
  }
  return ready;
}

// Create test run record
async function createTestRun() {
  const runId = `UAT-${Date.now()}`;

  const { data, error } = await supabase
    .from('uat_test_runs')
    .insert({
      run_id: runId,
      sd_id: 'SD-UAT-001',
      environment: 'local',
      browser: 'chromium',
      status: 'running',
      triggered_by: 'manual',
      trigger_source: 'run-uat-tests.js',
      machine_info: {
        platform: process.platform,
        node: process.version
      },
      started_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error(chalk.red('Failed to create test run record:', error.message));
    return null;
  }

  console.log(chalk.green(`\n📝 Test Run ID: ${runId}`));
  return data;
}

// Run Playwright tests
async function runPlaywrightTests() {
  console.log(chalk.blue('\n3️⃣  Running Playwright Tests'));
  console.log(`   Target: http://localhost:${CONFIG.ehgPort} (EHG Application)`);
  console.log('   Config: playwright-uat.config.js');
  console.log(`   Workers: ${CONFIG.workers}`);
  console.log(`   Mode: ${CONFIG.headless ? 'Headless' : 'Headed'}\n`);

  return new Promise((resolve) => {
    const args = [
      'playwright', 'test',
      '--config=playwright-uat.config.js',
      '--workers=' + CONFIG.workers
    ];

    if (!CONFIG.headless) {
      args.push('--headed');
    }

    const testProcess = spawn('npx', args, {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        BASE_URL: `http://localhost:${CONFIG.ehgPort}`
      }
    });

    testProcess.on('close', (code) => {
      resolve(code);
    });

    testProcess.on('error', (error) => {
      console.error(chalk.red('Test execution error:', error));
      resolve(1);
    });
  });
}

// Update test run record
async function updateTestRun(runData, exitCode) {
  if (!runData) return;

  const status = exitCode === 0 ? 'completed' : 'failed';

  const { error } = await supabase
    .from('uat_test_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      pass_rate: exitCode === 0 ? 100 : 0 // This would be calculated from actual results
    })
    .eq('id', runData.id);

  if (error) {
    console.error(chalk.red('Failed to update test run:', error.message));
  }
}

// Main execution
async function main() {
  console.log(chalk.bold.cyan(`
╔══════════════════════════════════════════════════════════════╗
║           UAT Testing Framework for EHG Application          ║
║                    Automated Test Execution                  ║
╚══════════════════════════════════════════════════════════════╝
  `));

  try {
    // Start EHG Application
    const ehgReady = await startEHGApp();
    if (!ehgReady) {
      console.error(chalk.red('\n❌ Failed to start EHG application'));
      process.exit(1);
    }

    // Start Dashboard
    const dashboardReady = await startDashboard();
    if (!dashboardReady) {
      console.error(chalk.red('\n❌ Failed to start UAT Dashboard'));
    }

    // Create test run record
    const testRun = await createTestRun();

    // Run tests
    console.log(chalk.bold.yellow('\n' + '═'.repeat(60)));
    console.log(chalk.bold.yellow('🧪 EXECUTING UAT TEST SUITE'));
    console.log(chalk.bold.yellow('═'.repeat(60)));

    const exitCode = await runPlaywrightTests();

    // Update test run record
    await updateTestRun(testRun, exitCode);

    // Display results
    console.log(chalk.bold.yellow('\n' + '═'.repeat(60)));

    if (exitCode === 0) {
      console.log(chalk.bold.green('✅ UAT TESTS PASSED!'));
      console.log(chalk.green('   All tests completed successfully'));
      console.log(chalk.green('   Quality gate: PASSED'));
    } else {
      console.log(chalk.bold.red('❌ UAT TESTS FAILED'));
      console.log(chalk.red(`   Exit code: ${exitCode}`));
      console.log(chalk.yellow('\n   Run auto-fix generator:'));
      console.log(chalk.yellow('   node scripts/auto-fix-sd-generator.js'));
    }

    console.log(chalk.bold.yellow('═'.repeat(60)));

    // Show URLs
    console.log(chalk.cyan('\n📊 View Results:'));
    console.log(`   UAT Dashboard: ${chalk.underline(`http://localhost:${CONFIG.dashboardPort}/uat-dashboard`)}`);
    console.log(`   Test Report: Run ${chalk.yellow('npx playwright show-report')}`);

    // Cleanup and exit
    cleanup();
    process.exit(exitCode);

  } catch (error) {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    cleanup();
    process.exit(1);
  }
}

// Run the main function
main();