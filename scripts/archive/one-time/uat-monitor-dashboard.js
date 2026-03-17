#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.uat' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log(`
╔══════════════════════════════════════════════════════════════╗
║         UAT Monitoring Dashboard - Real-Time Status          ║
╚══════════════════════════════════════════════════════════════╝
`);

async function parseTestResults() {
  try {
    // Read test results from multiple sources
    const resultsPath = path.join(__dirname, '../test-results');

    // Check for JSON results
    const jsonResultsPath = path.join(resultsPath, 'results.json');
    const _junitResultsPath = path.join(resultsPath, 'junit.xml');
    const logPath = path.join(resultsPath, 'uat-full-run.log');

    let testStats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      duration: 0,
      passRate: 0,
      suites: {}
    };

    // Try to read JSON results first (most reliable)
    try {
      const jsonData = await fs.readFile(jsonResultsPath, 'utf-8');
      const results = JSON.parse(jsonData);

      testStats.total = results.stats?.expected || 0;
      testStats.passed = results.stats?.passed || 0;
      testStats.failed = results.stats?.failed || 0;
      testStats.skipped = results.stats?.skipped || 0;
      testStats.flaky = results.stats?.flaky || 0;
      testStats.duration = results.stats?.duration || 0;

      // Parse suite-level details
      if (results.suites) {
        results.suites.forEach(suite => {
          const suiteName = suite.title || suite.file?.split('/').pop() || 'Unknown';
          testStats.suites[suiteName] = {
            total: suite.specs?.length || 0,
            passed: suite.specs?.filter(s => s.ok).length || 0,
            failed: suite.specs?.filter(s => !s.ok).length || 0
          };
        });
      }
    } catch (_err) {
      // Fallback to log parsing if JSON not available
      try {
        const logData = await fs.readFile(logPath, 'utf-8');
        const lines = logData.split('\n');

        // Parse test progress from log
        lines.forEach(line => {
          const progressMatch = line.match(/\[(\d+)\/(\d+)\]/);
          if (progressMatch) {
            testStats.total = parseInt(progressMatch[2]);
            const current = parseInt(progressMatch[1]);
            if (current > testStats.passed + testStats.failed) {
              testStats.passed = current - testStats.failed;
            }
          }

          if (line.includes('✓') || line.includes('passed')) {
            testStats.passed++;
          }
          if (line.includes('✕') || line.includes('failed')) {
            testStats.failed++;
          }
        });
      } catch (_logErr) {
        console.log('⚠️ Test results not yet available');
      }
    }

    // Calculate pass rate
    if (testStats.total > 0) {
      testStats.passRate = ((testStats.passed / testStats.total) * 100).toFixed(2);
    }

    return testStats;
  } catch (_error) {
    console.error('Error parsing test results:', error.message);
    return null;
  }
}

async function updateDatabaseStatus(stats) {
  try {
    // Update UAT execution record
    const { error: updateError } = await supabase
      .from('uat_executions')
      .update({
        status: stats.failed > 0 ? 'failed' : 'passed',
        total_tests: stats.total,
        passed_tests: stats.passed,
        failed_tests: stats.failed,
        pass_rate: stats.passRate,
        completed_at: new Date().toISOString()
      })
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1);

    if (updateError) {
      console.error('Error updating database:', updateError);
    }
  } catch (_error) {
    console.error('Database update failed:', error.message);
  }
}

async function displayDashboard() {
  const stats = await parseTestResults();

  if (!stats) {
    console.log('⏳ Waiting for test results...');
    return;
  }

  console.clear();
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         UAT Monitoring Dashboard - Real-Time Status          ║
╚══════════════════════════════════════════════════════════════╝

📊 Overall Statistics:
┌─────────────────────────────────────────────────────────────┐
│ Total Tests:    ${String(stats.total).padEnd(10)} Pass Rate: ${stats.passRate}%      │
│ Passed:         ${String(stats.passed).padEnd(10)} ✅                        │
│ Failed:         ${String(stats.failed).padEnd(10)} ❌                        │
│ Skipped:        ${String(stats.skipped).padEnd(10)} ⏭️                         │
│ Duration:       ${Math.round(stats.duration / 1000)}s                           │
└─────────────────────────────────────────────────────────────┘
`);

  // Display progress bar
  const progressBarLength = 50;
  const progress = stats.total > 0 ? (stats.passed + stats.failed) / stats.total : 0;
  const filledLength = Math.round(progressBarLength * progress);
  const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);

  console.log(`
Progress: [${progressBar}] ${(progress * 100).toFixed(1)}%
`);

  // Display suite breakdown if available
  if (Object.keys(stats.suites).length > 0) {
    console.log('📁 Test Suite Breakdown:');
    console.log('┌────────────────────────────────┬───────┬───────┬───────┐');
    console.log('│ Suite                          │ Total │ Pass  │ Fail  │');
    console.log('├────────────────────────────────┼───────┼───────┼───────┤');

    Object.entries(stats.suites).slice(0, 10).forEach(([name, suite]) => {
      const displayName = name.length > 30 ? name.substring(0, 27) + '...' : name;
      console.log(`│ ${displayName.padEnd(30)} │ ${String(suite.total).padStart(5)} │ ${String(suite.passed).padStart(5)} │ ${String(suite.failed).padStart(5)} │`);
    });

    console.log('└────────────────────────────────┴───────┴───────┴───────┘');
  }

  // Quality gate assessment
  console.log('\n🎯 Quality Gate Assessment:');
  const passRateNum = parseFloat(stats.passRate);
  if (passRateNum >= 85) {
    console.log('✅ PASSED - Meets 85% threshold for UAT acceptance');
  } else if (passRateNum >= 70) {
    console.log('⚠️ WARNING - Below 85% threshold, review failures');
  } else {
    console.log('❌ FAILED - Significant issues detected, intervention required');
  }

  // Update database with latest stats
  await updateDatabaseStatus(stats);

  // Check if tests are complete
  if (stats.passed + stats.failed + stats.skipped >= stats.total && stats.total > 0) {
    console.log('\n✨ Test execution complete!');

    // Generate final report
    await generateFinalReport(stats);

    return true; // Tests complete
  }

  return false; // Tests still running
}

async function generateFinalReport(stats) {
  const report = {
    execution_id: `UAT-${Date.now()}`,
    timestamp: new Date().toISOString(),
    environment: {
      base_url: process.env.BASE_URL,
      ehg_app_path: process.env.EHG_APP_PATH,
      ehg_app_port: process.env.EHG_APP_PORT
    },
    summary: {
      total_tests: stats.total,
      passed: stats.passed,
      failed: stats.failed,
      skipped: stats.skipped,
      flaky: stats.flaky,
      pass_rate: stats.passRate,
      duration_seconds: Math.round(stats.duration / 1000)
    },
    quality_gate: {
      threshold: 85,
      status: parseFloat(stats.passRate) >= 85 ? 'PASSED' : 'FAILED'
    },
    test_suites: stats.suites,
    recommendations: []
  };

  // Add recommendations based on results
  if (parseFloat(stats.passRate) < 85) {
    report.recommendations.push('Review failed test cases for root causes');
    report.recommendations.push('Consider implementing retry logic for flaky tests');
  }

  if (stats.failed > 0) {
    report.recommendations.push('Prioritize fixing authentication and navigation failures');
  }

  // Save report
  const reportPath = path.join(__dirname, '../test-results', `uat-report-${Date.now()}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📄 Final report saved: ${reportPath}`);

  // Store in database
  await supabase
    .from('uat_reports')
    .insert({
      execution_id: report.execution_id,
      report_data: report,
      pass_rate: report.summary.pass_rate,
      status: report.quality_gate.status
    });
}

// Main monitoring loop
async function monitor() {
  console.log('🔄 Starting UAT monitoring dashboard...\n');

  let isComplete = false;
  let iterations = 0;
  const maxIterations = 120; // Max 10 minutes of monitoring

  while (!isComplete && iterations < maxIterations) {
    isComplete = await displayDashboard();

    if (!isComplete) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
    }

    iterations++;
  }

  if (!isComplete) {
    console.log('\n⏱️ Monitoring timeout - tests may still be running');
  }

  console.log('\n👋 UAT monitoring complete');
}

// Run the monitor
monitor().catch(console.error);