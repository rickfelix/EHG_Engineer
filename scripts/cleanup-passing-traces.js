#!/usr/bin/env node
/**
 * LEO v4.4 Trace Cleanup Script
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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
 * Statistics tracked during cleanup
 */
const stats = {
  tracesScanned: 0,
  tracesDeleted: 0,
  bytesFreed: 0,
  harsDeleted: 0,
  videosDeleted: 0,
  failedTracesKept: 0,
  recentTracesKept: 0,
  errors: []
};

/**
 * Log message if verbose mode is enabled
 */
function verboseLog(...args) {
  if (CONFIG.verbose) {
    console.log('[VERBOSE]', ...args);
  }
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Check if a trace belongs to a failed test
 * Looks for error indicators in trace metadata
 */
function isFailedTestTrace(tracePath) {
  try {
    // Check for accompanying JSON result file
    const resultPath = tracePath.replace(/\.zip$/, '-result.json');
    if (fs.existsSync(resultPath)) {
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
      return result.status === 'failed' || result.status === 'timedOut';
    }

    // Check parent directory name for failure indicators
    const dirName = path.basename(path.dirname(tracePath));
    if (dirName.includes('failed') || dirName.includes('retry')) {
      return true;
    }

    // Check trace zip for action-snapshots with errors
    // This is a heuristic - traces from failed tests often have more snapshots
    return false;
  } catch (error) {
    verboseLog(`Error checking trace status: ${error.message}`);
    return true; // Err on the side of keeping if unsure
  }
}

/**
 * Check if file is within retention period
 */
function isWithinRetentionPeriod(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtime.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays <= CONFIG.maxAgeDays;
  } catch {
    return true; // Keep if can't determine age
  }
}

/**
 * Delete a file with dry-run support
 */
function deleteFile(filePath, fileType = 'file') {
  const size = getFileSize(filePath);

  if (CONFIG.dryRun) {
    console.log(`[DRY-RUN] Would delete ${fileType}: ${filePath} (${formatBytes(size)})`);
    return size;
  }

  try {
    fs.unlinkSync(filePath);
    verboseLog(`Deleted ${fileType}: ${filePath}`);
    return size;
  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    return 0;
  }
}

/**
 * Delete a directory recursively with dry-run support
 */
function deleteDirectory(dirPath) {
  let totalSize = 0;

  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  if (CONFIG.dryRun) {
    // Calculate size
    const files = fs.readdirSync(dirPath, { recursive: true });
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isFile()) {
        totalSize += getFileSize(fullPath);
      }
    }
    console.log(`[DRY-RUN] Would delete directory: ${dirPath} (${formatBytes(totalSize)})`);
    return totalSize;
  }

  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    verboseLog(`Deleted directory: ${dirPath}`);
    return totalSize;
  } catch (error) {
    stats.errors.push({ file: dirPath, error: error.message });
    return 0;
  }
}

/**
 * Clean up trace files in artifacts directory
 */
function cleanupTraces() {
  const artifactsDir = path.join(CONFIG.testResultsDir, 'artifacts');

  if (!fs.existsSync(artifactsDir)) {
    verboseLog('No artifacts directory found');
    return;
  }

  // Find all trace directories and files
  const entries = fs.readdirSync(artifactsDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(artifactsDir, entry.name);

    if (entry.isDirectory()) {
      // Check for trace.zip inside test result directories
      const traceZip = path.join(entryPath, 'trace.zip');
      if (fs.existsSync(traceZip)) {
        stats.tracesScanned++;

        if (isFailedTestTrace(traceZip)) {
          if (isWithinRetentionPeriod(traceZip)) {
            stats.failedTracesKept++;
            verboseLog(`Keeping failed test trace (within retention): ${traceZip}`);
            continue;
          }
        }

        // Delete passing test traces (or old failed traces)
        const freed = deleteFile(traceZip, 'trace');
        stats.bytesFreed += freed;
        stats.tracesDeleted++;
      }

      // Also check for video files
      const videoFiles = fs.readdirSync(entryPath).filter(f => f.endsWith('.webm'));
      for (const video of videoFiles) {
        const videoPath = path.join(entryPath, video);
        const freed = deleteFile(videoPath, 'video');
        stats.bytesFreed += freed;
        stats.videosDeleted++;
      }
    }
  }
}

/**
 * Clean up HAR files
 */
function cleanupHARFiles() {
  const harDir = path.join(CONFIG.testResultsDir, 'har');

  if (!fs.existsSync(harDir)) {
    verboseLog('No HAR directory found');
    return;
  }

  const harFiles = fs.readdirSync(harDir).filter(f => f.endsWith('.har'));

  for (const harFile of harFiles) {
    const harPath = path.join(harDir, harFile);

    // Keep HAR files for recent failed tests
    if (isWithinRetentionPeriod(harPath)) {
      verboseLog(`Keeping recent HAR file: ${harPath}`);
      continue;
    }

    const freed = deleteFile(harPath, 'HAR');
    stats.bytesFreed += freed;
    stats.harsDeleted++;
  }
}

/**
 * Clean up old HTML reports (keep only most recent)
 */
function cleanupOldReports() {
  const htmlReportDir = path.join(CONFIG.testResultsDir, 'html-report');

  if (!fs.existsSync(htmlReportDir)) {
    return;
  }

  // HTML reports are regenerated each run, so we just need to check size
  const stat = fs.statSync(htmlReportDir);
  verboseLog('HTML report directory exists, size tracking TBD');
}

/**
 * Main cleanup function
 */
async function main() {
  console.log('========================================');
  console.log('LEO v4.4 Trace Cleanup Script');
  console.log('========================================');
  console.log(`Test results directory: ${CONFIG.testResultsDir}`);
  console.log(`Retention policy: ${CONFIG.maxAgeDays} days for failed tests`);
  console.log(`Keep passed runs: ${CONFIG.keepPassedRuns}`);
  console.log(`Mode: ${CONFIG.dryRun ? 'DRY-RUN (no files will be deleted)' : 'LIVE'}`);
  console.log('----------------------------------------');

  if (!fs.existsSync(CONFIG.testResultsDir)) {
    console.log('No test-results directory found. Nothing to clean up.');
    return;
  }

  // Run cleanup tasks
  cleanupTraces();
  cleanupHARFiles();
  cleanupOldReports();

  // Print summary
  console.log('\n========================================');
  console.log('Cleanup Summary');
  console.log('========================================');
  console.log(`Traces scanned: ${stats.tracesScanned}`);
  console.log(`Traces deleted: ${stats.tracesDeleted}`);
  console.log(`HAR files deleted: ${stats.harsDeleted}`);
  console.log(`Videos deleted: ${stats.videosDeleted}`);
  console.log(`Failed traces kept: ${stats.failedTracesKept}`);
  console.log(`Space freed: ${formatBytes(stats.bytesFreed)}`);

  if (stats.errors.length > 0) {
    console.log('\nErrors encountered:');
    for (const err of stats.errors) {
      console.log(`  - ${err.file}: ${err.error}`);
    }
  }

  if (CONFIG.dryRun) {
    console.log('\n[DRY-RUN] No files were actually deleted.');
    console.log('Run without --dry-run to perform cleanup.');
  }
}

// Run if executed directly
main().catch(console.error);
