#!/usr/bin/env node
/**
 * Real Testing Campaign Monitor
 * Monitors autonomous batch testing progress in real-time
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const PROGRESS_LOG = '/tmp/batch-test-progress.log';

async function getTestingStats() {
  // Get all SDs
  const { data: allSDs } = await supabase
    .from('strategic_directives_v2')
    .select('id, status')
    .eq('status', 'completed');

  const totalCompleted = allSDs?.length || 0;

  // Get tested SDs
  const { data: testedSDs } = await supabase
    .from('sd_testing_status')
    .select('*')
    .eq('tested', true);

  const totalTested = testedSDs?.length || 0;

  // Calculate stats
  const passed = testedSDs?.filter(sd => sd.test_pass_rate === 100).length || 0;
  const failed = testedSDs?.filter(sd => sd.test_pass_rate < 100 && sd.test_pass_rate > 0).length || 0;
  const errors = testedSDs?.filter(sd => sd.test_pass_rate === 0).length || 0;

  // Calculate average metrics
  let avgCoverage = 0;
  let avgPassRate = 0;
  let avgDuration = 0;

  if (testedSDs && testedSDs.length > 0) {
    const coverageSum = testedSDs.reduce((sum, sd) => sum + (sd.coverage_percentage || 0), 0);
    const passRateSum = testedSDs.reduce((sum, sd) => sum + (sd.test_pass_rate || 0), 0);
    const durationSum = testedSDs.reduce((sum, sd) => sum + (sd.test_duration_seconds || 0), 0);

    avgCoverage = coverageSum / testedSDs.length;
    avgPassRate = passRateSum / testedSDs.length;
    avgDuration = durationSum / testedSDs.length;
  }

  return {
    totalCompleted,
    totalTested,
    passed,
    failed,
    errors,
    avgCoverage,
    avgPassRate,
    avgDuration,
    percentComplete: (totalTested / totalCompleted) * 100
  };
}

async function getRecentFailures() {
  const { data } = await supabase
    .from('sd_testing_status')
    .select('sd_id, test_pass_rate, testing_notes')
    .lt('test_pass_rate', 100)
    .order('last_tested_at', { ascending: false })
    .limit(5);

  return data || [];
}

function readProgressLog() {
  try {
    if (fs.existsSync(PROGRESS_LOG)) {
      const content = fs.readFileSync(PROGRESS_LOG, 'utf8');
      const lines = content.split('\n');
      return lines.slice(-10).filter(line => line.trim()); // Last 10 lines
    }
  } catch (err) {
    return [`Log read error: ${err.message}`];
  }
  return [];
}

async function displayMonitor() {
  console.clear();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔬 REAL TESTING CAMPAIGN MONITOR');
  console.log('═══════════════════════════════════════════════════════════\n');

  const stats = await getTestingStats();

  console.log('📊 Overall Progress:');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`   Total Completed SDs: ${stats.totalCompleted}`);
  console.log(`   Tested So Far: ${stats.totalTested} (${stats.percentComplete.toFixed(1)}%)`);
  console.log(`   Remaining: ${stats.totalCompleted - stats.totalTested}\n`);

  console.log('✅ Test Results:');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`   ✅ Passed: ${stats.passed} (${((stats.passed/stats.totalTested)*100).toFixed(1)}%)`);
  console.log(`   ❌ Failed: ${stats.failed} (${((stats.failed/stats.totalTested)*100).toFixed(1)}%)`);
  console.log(`   ⚠️  Errors: ${stats.errors} (${((stats.errors/stats.totalTested)*100).toFixed(1)}%)\n`);

  console.log('📈 Quality Metrics:');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`   Average Pass Rate: ${stats.avgPassRate.toFixed(1)}%`);
  if (stats.avgCoverage > 0) {
    console.log(`   Average Coverage: ${stats.avgCoverage.toFixed(1)}%`);
  }
  console.log(`   Average Duration: ${stats.avgDuration.toFixed(0)}s per SD\n`);

  // Estimate completion
  if (stats.totalTested > 0 && stats.totalTested < stats.totalCompleted) {
    const remaining = stats.totalCompleted - stats.totalTested;
    const estimatedMinutes = (remaining * stats.avgDuration) / 60;
    console.log('⏱️  Estimated Completion:');
    console.log('───────────────────────────────────────────────────────────');
    console.log(`   Remaining SDs: ${remaining}`);
    console.log(`   Estimated Time: ${Math.floor(estimatedMinutes / 60)}h ${Math.floor(estimatedMinutes % 60)}m\n`);
  }

  // Recent failures
  const failures = await getRecentFailures();
  if (failures.length > 0) {
    console.log('❌ Recent Failures:');
    console.log('───────────────────────────────────────────────────────────');
    failures.forEach(f => {
      console.log(`   ${f.sd_id}: ${f.test_pass_rate.toFixed(1)}% pass rate`);
    });
    console.log('');
  }

  // Recent log entries
  const logLines = readProgressLog();
  if (logLines.length > 0) {
    console.log('📝 Recent Activity:');
    console.log('───────────────────────────────────────────────────────────');
    logLines.forEach(line => console.log(`   ${line}`));
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('Last updated: ' + new Date().toLocaleTimeString());
  console.log('Refreshes every 5 minutes. Press Ctrl+C to exit.');
  console.log('═══════════════════════════════════════════════════════════\n');
}

async function monitorCampaign(interval = 300000) { // Default 5 min
  console.log('Starting Real Testing Campaign Monitor...\n');

  // Initial display
  await displayMonitor();

  // Refresh periodically
  setInterval(async () => {
    await displayMonitor();
  }, interval);
}

// Run monitor
const refreshInterval = process.argv[2] ? parseInt(process.argv[2]) * 1000 : 300000;
monitorCampaign(refreshInterval).catch(err => {
  console.error('Monitor error:', err);
  process.exit(1);
});
