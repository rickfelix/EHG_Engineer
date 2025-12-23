#!/usr/bin/env node

/**
 * Human-Like E2E Testing Retrospective Generator
 *
 * Analyzes test results and generates improvement opportunities
 * Part of the continuous improvement loop for Human-Like E2E testing
 *
 * Usage:
 *   node scripts/human-like-e2e-retrospective.js [--results-file <path>]
 *
 * Outputs:
 *   - Console summary of findings
 *   - Improvement suggestions saved to database
 *   - Metrics tracked for trend analysis
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const RESULTS_DIR = path.join(__dirname, '..', 'test-results');
const DEFAULT_RESULTS_FILE = path.join(RESULTS_DIR, 'results.json');

// Thresholds for improvement suggestions
const THRESHOLDS = {
  slowTest: 10000,        // Tests slower than 10s need attention
  targetDuration: 60000,  // Full suite should complete in 60s
  flakyThreshold: 0.9,    // Tests with <90% pass rate are flaky
  timeoutThreshold: 0.05, // More than 5% timeouts is concerning
};

// Load environment
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

/**
 * Parse test results from Playwright JSON output
 */
function parseResults(resultsPath) {
  if (!fs.existsSync(resultsPath)) {
    console.error(`Results file not found: ${resultsPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const tests = [];
  let totalDuration = 0;

  // Extract test data from Playwright's nested structure
  function extractTests(suite, filePath = '') {
    if (suite.file) filePath = suite.file;

    if (suite.specs) {
      for (const spec of suite.specs) {
        for (const test of spec.tests || []) {
          const result = test.results?.[0] || {};
          const testData = {
            name: spec.title,
            file: filePath,
            status: result.status || 'unknown',
            duration: result.duration || 0,
            error: result.error?.message || null,
            retries: (test.results?.length || 1) - 1,
          };

          // Categorize test
          if (filePath.includes('accessibility')) {
            testData.category = 'accessibility';
          } else if (filePath.includes('resilience') || filePath.includes('chaos')) {
            testData.category = 'chaos';
          } else if (filePath.includes('visual')) {
            testData.category = 'visual';
          } else if (filePath.includes('ux-evaluation')) {
            testData.category = 'ux_eval';
          } else if (filePath.includes('keyboard')) {
            testData.category = 'keyboard';
          } else {
            testData.category = 'other';
          }

          tests.push(testData);
          totalDuration += testData.duration;
        }
      }
    }

    if (suite.suites) {
      for (const sub of suite.suites) {
        extractTests(sub, filePath);
      }
    }
  }

  for (const suite of raw.suites || []) {
    extractTests(suite);
  }

  return { tests, totalDuration, raw };
}

/**
 * Analyze test results and generate improvement opportunities
 */
function analyzeResults(tests, totalDuration) {
  const improvements = [];
  const metrics = {
    total: tests.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    timedOut: 0,
    byCategory: {},
    slowTests: [],
    failedTests: [],
  };

  // Calculate metrics
  for (const test of tests) {
    metrics[test.status === 'passed' ? 'passed' :
            test.status === 'failed' ? 'failed' :
            test.status === 'timedOut' ? 'timedOut' : 'skipped']++;

    if (!metrics.byCategory[test.category]) {
      metrics.byCategory[test.category] = { passed: 0, failed: 0 };
    }
    metrics.byCategory[test.category][test.status === 'passed' ? 'passed' : 'failed']++;

    if (test.duration > THRESHOLDS.slowTest) {
      metrics.slowTests.push(test);
    }

    if (test.status === 'failed' || test.status === 'timedOut') {
      metrics.failedTests.push(test);
    }
  }

  // Generate improvement suggestions

  // 1. Speed improvements
  if (totalDuration > THRESHOLDS.targetDuration) {
    improvements.push({
      category: 'speed',
      priority: 'high',
      title: 'Test suite exceeds target duration',
      description: `Suite took ${(totalDuration / 1000).toFixed(1)}s, target is ${THRESHOLDS.targetDuration / 1000}s. ` +
                   'Consider parallelizing tests or optimizing slow tests.',
    });
  }

  if (metrics.slowTests.length > 0) {
    const slowestTest = metrics.slowTests.sort((a, b) => b.duration - a.duration)[0];
    improvements.push({
      category: 'speed',
      priority: 'medium',
      title: `${metrics.slowTests.length} tests exceed ${THRESHOLDS.slowTest / 1000}s threshold`,
      description: `Slowest: "${slowestTest.name}" at ${(slowestTest.duration / 1000).toFixed(1)}s. ` +
                   'Consider adding timeouts, optimizing selectors, or using faster assertions.',
    });
  }

  // 2. Stability improvements
  const timeoutRate = metrics.timedOut / metrics.total;
  if (timeoutRate > THRESHOLDS.timeoutThreshold) {
    improvements.push({
      category: 'stability',
      priority: 'high',
      title: 'High timeout rate detected',
      description: `${(timeoutRate * 100).toFixed(1)}% of tests timed out. ` +
                   'Check for slow page loads, missing waits, or infrastructure issues.',
    });
  }

  // 3. Accuracy improvements
  for (const test of metrics.failedTests) {
    if (test.error?.includes('No elements found') || test.error?.includes('not found')) {
      improvements.push({
        category: 'accuracy',
        priority: 'medium',
        title: `Test "${test.name}" may need selector updates`,
        description: `Error: "${test.error?.substring(0, 100)}...". ` +
                     'The app structure may have changed - update selectors or add existence checks.',
      });
    }
  }

  // 4. Coverage improvements
  const categories = Object.keys(metrics.byCategory);
  const missingCategories = ['accessibility', 'chaos', 'visual', 'ux_eval'].filter(
    c => !categories.includes(c) || metrics.byCategory[c].passed === 0
  );

  if (missingCategories.length > 0) {
    improvements.push({
      category: 'coverage',
      priority: 'low',
      title: 'Missing test coverage in some categories',
      description: `Categories with no passing tests: ${missingCategories.join(', ')}. ` +
                   'Consider adding tests or fixing existing ones.',
    });
  }

  // 5. DX (Developer Experience) improvements
  if (metrics.skipped > metrics.total * 0.3) {
    improvements.push({
      category: 'dx',
      priority: 'medium',
      title: 'High skip rate - tests may be too fragile',
      description: `${metrics.skipped} tests were skipped (${(metrics.skipped / metrics.total * 100).toFixed(1)}%). ` +
                   'Consider making tests more resilient or fixing underlying issues.',
    });
  }

  return { metrics, improvements };
}

/**
 * Save metrics and improvements to database
 */
async function saveToDatabase(runId, metrics, improvements, tests, totalDuration) {
  if (!supabase) {
    console.log('⚠️  Supabase not configured - skipping database save');
    return;
  }

  try {
    // Save run metrics
    const { error: runError } = await supabase.from('human_like_e2e_runs').upsert({
      run_id: runId,
      completed_at: new Date().toISOString(),
      duration_ms: totalDuration,
      total_tests: metrics.total,
      passed: metrics.passed,
      failed: metrics.failed,
      skipped: metrics.skipped,
      timed_out: metrics.timedOut,
      accessibility_passed: metrics.byCategory.accessibility?.passed || 0,
      accessibility_failed: metrics.byCategory.accessibility?.failed || 0,
      chaos_passed: metrics.byCategory.chaos?.passed || 0,
      chaos_failed: metrics.byCategory.chaos?.failed || 0,
      visual_passed: metrics.byCategory.visual?.passed || 0,
      visual_failed: metrics.byCategory.visual?.failed || 0,
      ux_eval_passed: metrics.byCategory.ux_eval?.passed || 0,
      ux_eval_failed: metrics.byCategory.ux_eval?.failed || 0,
      avg_test_duration_ms: Math.round(totalDuration / metrics.total),
      slowest_test_name: metrics.slowTests[0]?.name || null,
      slowest_test_duration_ms: metrics.slowTests[0]?.duration || null,
      target_url: process.env.BASE_URL || 'http://localhost:8080',
      venture_name: process.env.VENTURE_NAME || 'EHG',
      stringency: process.env.E2E_STRINGENCY || 'standard',
      ci_run: process.env.CI === 'true',
      branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME,
      commit_sha: process.env.GITHUB_SHA,
      retrospective_generated: true,
      improvement_suggestions: improvements,
    }, { onConflict: 'run_id' });

    if (runError) {
      console.error('Error saving run metrics:', runError.message);
    }

    // Save individual test metrics
    const testMetrics = tests.map(t => ({
      run_id: runId,
      test_name: t.name,
      test_file: t.file,
      category: t.category,
      status: t.status,
      duration_ms: t.duration,
      error_message: t.error,
      error_type: t.error ? (t.status === 'timedOut' ? 'timeout' : 'assertion') : null,
      retry_count: t.retries,
    }));

    const { error: testError } = await supabase
      .from('human_like_e2e_test_metrics')
      .insert(testMetrics);

    if (testError && !testError.message.includes('duplicate')) {
      console.error('Error saving test metrics:', testError.message);
    }

    // Save new improvements
    for (const imp of improvements) {
      const { error: impError } = await supabase
        .from('human_like_e2e_improvements')
        .insert({
          source_run_id: runId,
          ...imp,
        });

      if (impError && !impError.message.includes('duplicate')) {
        console.error('Error saving improvement:', impError.message);
      }
    }

    console.log('✅ Metrics saved to database');
  } catch (err) {
    console.error('Database error:', err.message);
  }
}

/**
 * Print retrospective summary to console
 */
function printRetrospective(metrics, improvements, totalDuration) {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 HUMAN-LIKE E2E TESTING RETROSPECTIVE');
  console.log('='.repeat(60));

  // Summary
  console.log('\n📊 TEST RESULTS:');
  console.log(`   Total: ${metrics.total} | Passed: ${metrics.passed} | Failed: ${metrics.failed} | Skipped: ${metrics.skipped} | Timeout: ${metrics.timedOut}`);
  console.log(`   Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`   Pass Rate: ${(metrics.passed / metrics.total * 100).toFixed(1)}%`);

  // Category breakdown
  console.log('\n📂 BY CATEGORY:');
  for (const [cat, data] of Object.entries(metrics.byCategory)) {
    const total = data.passed + data.failed;
    const rate = total > 0 ? (data.passed / total * 100).toFixed(0) : 'N/A';
    console.log(`   ${cat}: ${data.passed}/${total} (${rate}%)`);
  }

  // Slow tests
  if (metrics.slowTests.length > 0) {
    console.log('\n🐢 SLOW TESTS (>10s):');
    for (const t of metrics.slowTests.slice(0, 5)) {
      console.log(`   - ${t.name}: ${(t.duration / 1000).toFixed(1)}s`);
    }
  }

  // Failed tests
  if (metrics.failedTests.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    for (const t of metrics.failedTests.slice(0, 5)) {
      console.log(`   - ${t.name} (${t.category})`);
      if (t.error) {
        console.log(`     ${t.error.substring(0, 80)}...`);
      }
    }
  }

  // Improvement suggestions
  if (improvements.length > 0) {
    console.log('\n💡 IMPROVEMENT OPPORTUNITIES:');
    const byPriority = { high: [], medium: [], low: [] };
    for (const imp of improvements) {
      byPriority[imp.priority].push(imp);
    }

    for (const priority of ['high', 'medium', 'low']) {
      if (byPriority[priority].length > 0) {
        const icon = priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '🟢';
        console.log(`\n   ${icon} ${priority.toUpperCase()} PRIORITY:`);
        for (const imp of byPriority[priority]) {
          console.log(`   • [${imp.category}] ${imp.title}`);
          console.log(`     ${imp.description}`);
        }
      }
    }
  } else {
    console.log('\n✅ No improvement opportunities identified - tests are in good shape!');
  }

  console.log('\n' + '='.repeat(60));
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  let resultsFile = DEFAULT_RESULTS_FILE;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--results-file' && args[i + 1]) {
      resultsFile = args[i + 1];
      i++;
    }
  }

  console.log(`\n📋 Analyzing results from: ${resultsFile}`);

  // Parse results
  const { tests, totalDuration, raw } = parseResults(resultsFile);

  if (tests.length === 0) {
    console.log('⚠️  No test results found');
    process.exit(0);
  }

  // Analyze and generate improvements
  const { metrics, improvements } = analyzeResults(tests, totalDuration);

  // Get run ID from evidence pack or generate one
  const manifestPath = path.join(RESULTS_DIR, 'evidence-pack-manifest.json');
  let runId = `RUN-${Date.now()}`;
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    runId = manifest.packId || runId;
  }

  // Print retrospective
  printRetrospective(metrics, improvements, totalDuration);

  // Save to database
  await saveToDatabase(runId, metrics, improvements, tests, totalDuration);

  // Exit with appropriate code
  if (metrics.failed > 0 || metrics.timedOut > 0) {
    console.log('\n⚠️  Some tests failed - review issues above\n');
  }
}

main().catch(err => {
  console.error('Retrospective failed:', err);
  process.exit(1);
});
