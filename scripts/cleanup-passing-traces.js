#!/usr/bin/env node
/**
 * LEO v4.4 Trace Cleanup Script
 *
 * CLI wrapper for lib/evidence/trace-cleanup.js library.
 *
 * Manages Playwright trace file retention to prevent storage explosion
 * while preserving traces for failed tests and recent runs.
 *
 * Part of LEO Protocol v4.4 - Unified Test Evidence Architecture
 *
 * Retention Policy:
 * - FAILED tests: Keep traces for 7 days (configurable)
 * - PASSED tests: Delete immediately after run (keep only last N runs)
 * - FLAKY tests: Keep traces for analysis
 *
 * Usage:
 *   node scripts/cleanup-passing-traces.js [options]
 *
 * Options:
 *   --dry-run          Show what would be deleted without deleting
 *   --keep-passed=N    Keep traces from last N passing runs (default: 0)
 *   --max-age-days=N   Maximum age for failed test traces (default: 7)
 *   --verbose          Show detailed output
 *
 * Environment:
 *   TEST_RESULTS_DIR   Override default test-results directory
 *
 * @module cleanup-passing-traces
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { cleanupPassingTraces, formatBytes } from '../lib/evidence/trace-cleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  testResultsDir: process.env.TEST_RESULTS_DIR || path.join(__dirname, '..', 'test-results'),
  keepPassedRuns: parseInt(process.env.KEEP_PASSED_RUNS || '0', 10),
  maxAgeDays: parseInt(process.env.MAX_AGE_DAYS || '7', 10),
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
};

// Parse command line arguments
process.argv.forEach(arg => {
  if (arg.startsWith('--keep-passed=')) {
    CONFIG.keepPassedRuns = parseInt(arg.split('=')[1], 10);
  }
  if (arg.startsWith('--max-age-days=')) {
    CONFIG.maxAgeDays = parseInt(arg.split('=')[1], 10);
  }
});

/**
 * Main cleanup function
 */
async function main() {
  console.log('========================================');
  console.log('LEO v4.4 Trace Cleanup Script');
  console.log('========================================');
  console.log('Test results directory: ' + CONFIG.testResultsDir);
  console.log('Retention policy: ' + CONFIG.maxAgeDays + ' days for failed tests');
  console.log('Keep passed runs: ' + CONFIG.keepPassedRuns);
  console.log('Mode: ' + (CONFIG.dryRun ? 'DRY-RUN (no files will be deleted)' : 'LIVE'));
  console.log('----------------------------------------');

  // Run cleanup using library function
  const stats = cleanupPassingTraces({
    testResultsDir: CONFIG.testResultsDir,
    keepPassedRuns: CONFIG.keepPassedRuns,
    maxAgeDays: CONFIG.maxAgeDays,
    dryRun: CONFIG.dryRun,
    verbose: CONFIG.verbose,
    cleanupPassing: true
  });

  // Print summary
  console.log('\n========================================');
  console.log('Cleanup Summary');
  console.log('========================================');
  console.log('Traces scanned: ' + stats.tracesScanned);
  console.log('Traces deleted: ' + stats.tracesDeleted);
  console.log('HAR files deleted: ' + stats.harsDeleted);
  console.log('Videos deleted: ' + stats.videosDeleted);
  console.log('Failed traces kept: ' + stats.failedTracesKept);
  console.log('Space freed: ' + formatBytes(stats.bytesFreed));

  if (stats.errors.length > 0) {
    console.log('\nErrors encountered:');
    for (const err of stats.errors) {
      console.log('  - ' + err.file + ': ' + err.error);
    }
  }

  if (CONFIG.dryRun) {
    console.log('\n[DRY-RUN] No files were actually deleted.');
    console.log('Run without --dry-run to perform cleanup.');
  }
}

// Run if executed directly
main().catch(console.error);
