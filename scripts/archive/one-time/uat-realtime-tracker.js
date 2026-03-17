#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function getTestProgress() {
  try {
    // Check running playwright processes
    const { stdout: psOutput } = await execAsync('ps aux | grep playwright | wc -l');
    const playwrightProcesses = parseInt(psOutput.trim()) - 1; // Subtract grep itself

    // Get latest test progress from log
    const { stdout: logTail } = await execAsync('tail -100 test-results/uat-full-run.log 2>/dev/null | grep -E "\\[\\d+/1455\\]" | tail -1');

    let currentProgress = 0;
    if (logTail) {
      const match = logTail.match(/\[(\d+)\/1455\]/);
      if (match) {
        currentProgress = parseInt(match[1]);
      }
    }

    // Get test results summary
    const { stdout: failedTests } = await execAsync('grep -c "Error:" test-results/uat-full-run.log 2>/dev/null || echo 0');
    const { stdout: passedTests } = await execAsync('grep -c "passed" test-results/uat-full-run.log 2>/dev/null || echo 0');

    const failed = parseInt(failedTests.trim());
    const passed = parseInt(passedTests.trim());

    return {
      total: 1455,
      current: currentProgress,
      passed: passed,
      failed: failed,
      running: playwrightProcesses > 0,
      percentComplete: ((currentProgress / 1455) * 100).toFixed(1),
      passRate: currentProgress > 0 ? ((passed / currentProgress) * 100).toFixed(1) : 0
    };
  } catch (_error) {
    return {
      total: 1455,
      current: 0,
      passed: 0,
      failed: 0,
      running: false,
      percentComplete: 0,
      passRate: 0
    };
  }
}

async function displayProgress() {
  const stats = await getTestProgress();

  console.clear();
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║      UAT Real-Time Progress Tracker - EHG Platform           ║
╚══════════════════════════════════════════════════════════════╝

📊 Test Execution Status:
┌─────────────────────────────────────────────────────────────┐
│ Status:         ${stats.running ? '🟢 RUNNING' : '🔴 STOPPED'}                              │
│ Progress:       ${stats.current}/${stats.total} tests (${stats.percentComplete}%)              │
│ Passed:         ${stats.passed} tests                                  │
│ Failed:         ${stats.failed} tests                                  │
│ Pass Rate:      ${stats.passRate}%                                     │
└─────────────────────────────────────────────────────────────┘
`);

  // Progress bar
  const barLength = 50;
  const filled = Math.round((stats.current / stats.total) * barLength);
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

  console.log(`Progress: [${bar}] ${stats.percentComplete}%\n`);

  // Test categories being executed
  console.log(`📁 Test Categories (${17} suites, ${20} files):`);
  console.log('   ✓ Core User Journeys: ventures, dashboard, analytics, AI agents');
  console.log('   ✓ Administrative: settings, security, governance');
  console.log('   ✓ Cross-functional: accessibility, performance, mobile');
  console.log('   ✓ End-to-End: venture lifecycle, executive reporting\n');

  // Estimated completion
  if (stats.running && stats.current > 0) {
    const testsPerMinute = 50; // Rough estimate
    const remainingTests = stats.total - stats.current;
    const minutesRemaining = Math.ceil(remainingTests / testsPerMinute);
    console.log(`⏱️ Estimated time remaining: ${minutesRemaining} minutes\n`);
  }

  // Quality gate status
  const passRateNum = parseFloat(stats.passRate);
  if (passRateNum >= 85) {
    console.log('🎯 Quality Gate: ✅ PASSING (≥85% threshold)');
  } else if (passRateNum >= 70) {
    console.log('🎯 Quality Gate: ⚠️ WARNING (70-85%, needs review)');
  } else {
    console.log('🎯 Quality Gate: ❌ FAILING (<70%, critical issues)');
  }

  return stats;
}

// Main tracking loop
async function track() {
  console.log('Starting UAT progress tracker...\n');

  let lastCurrent = 0;
  let stalledCount = 0;

  while (true) {
    const stats = await displayProgress();

    // Check if tests completed
    if (!stats.running && stats.current > 0) {
      console.log('\n✨ Test execution appears to be complete!');
      console.log(`Final Results: ${stats.passed} passed, ${stats.failed} failed out of ${stats.current} executed`);
      break;
    }

    // Check if tests are stalled
    if (stats.current === lastCurrent) {
      stalledCount++;
      if (stalledCount > 12) { // 1 minute of no progress
        console.log('\n⚠️ Tests appear to be stalled or completed');
        break;
      }
    } else {
      stalledCount = 0;
    }

    lastCurrent = stats.current;

    // Wait 5 seconds before next update
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Run tracker
track().catch(console.error);