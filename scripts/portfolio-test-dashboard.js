#!/usr/bin/env node

/**
 * Portfolio Test Dashboard
 * Aggregates test results across all venture repos and displays status.
 *
 * Usage: node scripts/portfolio-test-dashboard.js [--verbose]
 *
 * Shows:
 * - Venture name, test count, pass/fail/skip, last run time
 * - Scaffold version and drift detection
 * - Overall portfolio test health
 *
 * SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-F
 */

import dotenv from 'dotenv';
dotenv.config();

import { existsSync, readFileSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';

// Known venture repos (registry-based in production)
const VENTURE_REPOS = [
  { name: 'EHG', path: resolve(process.cwd(), '..', 'ehg'), port: 8080 },
  { name: 'EHG_Engineer', path: process.cwd(), port: 3000 },
];

// Current scaffold version
const SCAFFOLD_VERSION = '1.0.0';

function getTestResults(repoPath) {
  const resultsPath = join(repoPath, 'test-results', 'results.json');

  if (!existsSync(resultsPath)) {
    return { available: false, reason: 'No test-results/results.json found' };
  }

  try {
    const stat = statSync(resultsPath);
    const raw = readFileSync(resultsPath, 'utf-8');
    const data = JSON.parse(raw);

    // Parse Playwright JSON reporter format
    let total = 0, passed = 0, failed = 0, skipped = 0;

    if (data.suites) {
      function walk(suites) {
        for (const suite of suites) {
          if (suite.specs) {
            for (const spec of suite.specs) {
              if (spec.tests) {
                for (const test of spec.tests) {
                  total++;
                  const status = test.status || test.results?.[0]?.status;
                  if (status === 'expected' || status === 'passed') passed++;
                  else if (status === 'skipped') skipped++;
                  else failed++;
                }
              }
            }
          }
          if (suite.suites) walk(suite.suites);
        }
      }
      walk(data.suites);
    }

    return {
      available: true,
      total,
      passed,
      failed,
      skipped,
      lastRun: stat.mtime,
      duration: data.stats?.duration || 0
    };
  } catch (err) {
    return { available: false, reason: `Parse error: ${err.message}` };
  }
}

function getScaffoldVersion(repoPath) {
  const configPath = join(repoPath, 'playwright.config.js');
  if (!existsSync(configPath)) return { hasPlaywright: false, version: null };

  try {
    const content = readFileSync(configPath, 'utf-8');
    // Check for scaffold version marker
    const versionMatch = content.match(/venture-scaffold v([\d.]+)/);
    return {
      hasPlaywright: true,
      version: versionMatch ? versionMatch[1] : 'pre-scaffold',
      isDrifted: versionMatch ? versionMatch[1] !== SCAFFOLD_VERSION : true
    };
  } catch {
    return { hasPlaywright: false, version: null };
  }
}

function getGitInfo(repoPath) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoPath, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    const lastCommit = execSync('git log -1 --format="%h %s" 2>/dev/null', {
      cwd: repoPath, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return { branch, lastCommit };
  } catch {
    return { branch: 'unknown', lastCommit: '' };
  }
}

function formatAge(date) {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function main() {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

  console.log('\n' + '='.repeat(70));
  console.log('  PORTFOLIO TEST DASHBOARD');
  console.log('  Scaffold Version: ' + SCAFFOLD_VERSION);
  console.log('='.repeat(70));

  let totalTests = 0, totalPassed = 0, totalFailed = 0, totalSkipped = 0;
  let venturesWithTests = 0;

  for (const venture of VENTURE_REPOS) {
    const exists = existsSync(venture.path);
    if (!exists) {
      console.log(`\n  ${venture.name}: PATH NOT FOUND (${venture.path})`);
      continue;
    }

    const results = getTestResults(venture.path);
    const scaffold = getScaffoldVersion(venture.path);
    const git = getGitInfo(venture.path);

    console.log(`\n  ${venture.name}`);
    console.log(`  ${'─'.repeat(40)}`);
    console.log(`  Branch: ${git.branch}`);
    console.log(`  Playwright: ${scaffold.hasPlaywright ? 'Yes' : 'No'}`);

    if (scaffold.hasPlaywright) {
      const driftBadge = scaffold.isDrifted ? ' ⚠️  DRIFT' : ' ✅';
      console.log(`  Scaffold Version: ${scaffold.version || 'unknown'}${driftBadge}`);
    }

    if (results.available) {
      venturesWithTests++;
      totalTests += results.total;
      totalPassed += results.passed;
      totalFailed += results.failed;
      totalSkipped += results.skipped;

      const passRate = results.total > 0 ? Math.round((results.passed / results.total) * 100) : 0;
      const statusBadge = results.failed === 0 ? '✅' : '❌';

      console.log(`  Tests: ${results.total} total | ${results.passed} passed | ${results.failed} failed | ${results.skipped} skipped`);
      console.log(`  Pass Rate: ${passRate}% ${statusBadge}`);
      console.log(`  Last Run: ${formatAge(results.lastRun)}`);

      if (verbose && results.failed > 0) {
        console.log(`  ⚠️  ${results.failed} test(s) failing — investigate before handoff`);
      }
    } else {
      console.log(`  Tests: ${results.reason}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  PORTFOLIO SUMMARY');
  console.log('─'.repeat(70));
  console.log(`  Ventures with tests: ${venturesWithTests}/${VENTURE_REPOS.length}`);
  console.log(`  Total tests: ${totalTests}`);
  console.log(`  Passed: ${totalPassed} | Failed: ${totalFailed} | Skipped: ${totalSkipped}`);

  if (totalTests > 0) {
    const overallRate = Math.round((totalPassed / totalTests) * 100);
    console.log(`  Overall pass rate: ${overallRate}%`);
  }

  console.log('='.repeat(70) + '\n');
}

main();
