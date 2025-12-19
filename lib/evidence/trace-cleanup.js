#!/usr/bin/env node
/**
 * LEO v4.4 Trace Cleanup Library
 *
 * Reusable cleanup functions for Playwright trace file retention.
 * Extracted from scripts/cleanup-passing-traces.js for integration
 * with leo-playwright-reporter.js auto-cleanup.
 *
 * Part of LEO Protocol v4.4 - Unified Test Evidence Architecture
 *
 * @module trace-cleanup
 */

import fs from 'fs';
import path from 'path';

/**
 * Default configuration for trace cleanup
 */
const DEFAULT_CONFIG = {
  keepPassedRuns: 0,
  maxAgeDays: 7,
  dryRun: false,
  verbose: false,
};

/**
 * Statistics tracked during cleanup
 * @typedef {Object} CleanupStats
 * @property {number} tracesScanned
 * @property {number} tracesDeleted
 * @property {number} bytesFreed
 * @property {number} harsDeleted
 * @property {number} videosDeleted
 * @property {number} failedTracesKept
 * @property {number} recentTracesKept
 * @property {Array<{file: string, error: string}>} errors
 */

/**
 * Create a fresh stats object
 * @returns {CleanupStats}
 */
function createStats() {
  return {
    tracesScanned: 0,
    tracesDeleted: 0,
    bytesFreed: 0,
    harsDeleted: 0,
    videosDeleted: 0,
    failedTracesKept: 0,
    recentTracesKept: 0,
    errors: []
  };
}

/**
 * Get file size in bytes
 * @param {string} filePath
 * @returns {number}
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
 * @param {number} bytes
 * @returns {string}
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
 * @param {string} tracePath - Path to trace.zip
 * @param {Object} [testResultsMap] - Optional map of test file paths to results
 * @returns {boolean}
 */
function isFailedTestTrace(tracePath, testResultsMap = null) {
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

    // If we have a testResultsMap from the reporter, use it
    if (testResultsMap) {
      const testName = extractTestNameFromPath(tracePath);
      if (testName && testResultsMap[testName]) {
        return testResultsMap[testName].status === 'failed';
      }
    }

    return false;
  } catch {
    return true; // Err on the side of keeping if unsure
  }
}

/**
 * Extract test name from trace directory path
 * @param {string} tracePath
 * @returns {string|null}
 */
function extractTestNameFromPath(tracePath) {
  const dirName = path.basename(path.dirname(tracePath));
  // Playwright names trace dirs like: test-name-chromium
  const match = dirName.match(/^(.+)-(?:chromium|firefox|webkit)$/);
  return match ? match[1] : null;
}

/**
 * Check if file is within retention period
 * @param {string} filePath
 * @param {number} maxAgeDays
 * @returns {boolean}
 */
function isWithinRetentionPeriod(filePath, maxAgeDays) {
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtime.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays <= maxAgeDays;
  } catch {
    return true; // Keep if can't determine age
  }
}

/**
 * Delete a file with dry-run support
 * @param {string} filePath
 * @param {CleanupStats} stats
 * @param {Object} config
 * @param {string} fileType
 * @returns {number} - Bytes freed
 */
function deleteFile(filePath, stats, config, fileType = 'file') {
  const size = getFileSize(filePath);

  if (config.dryRun) {
    if (config.verbose) {
      console.log(`[DRY-RUN] Would delete ${fileType}: ${filePath} (${formatBytes(size)})`);
    }
    return size;
  }

  try {
    fs.unlinkSync(filePath);
    if (config.verbose) {
      console.log(`Deleted ${fileType}: ${filePath}`);
    }
    return size;
  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    return 0;
  }
}

/**
 * Clean up trace files in artifacts directory
 * @param {string} testResultsDir
 * @param {CleanupStats} stats
 * @param {Object} config
 * @param {Object} [testResultsMap] - Optional map of test results from reporter
 */
function cleanupTraces(testResultsDir, stats, config, testResultsMap = null) {
  const artifactsDir = path.join(testResultsDir, 'artifacts');

  if (!fs.existsSync(artifactsDir)) {
    return;
  }

  const entries = fs.readdirSync(artifactsDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(artifactsDir, entry.name);

    if (entry.isDirectory()) {
      // Check for trace.zip inside test result directories
      const traceZip = path.join(entryPath, 'trace.zip');
      if (fs.existsSync(traceZip)) {
        stats.tracesScanned++;

        if (isFailedTestTrace(traceZip, testResultsMap)) {
          if (isWithinRetentionPeriod(traceZip, config.maxAgeDays)) {
            stats.failedTracesKept++;
            continue;
          }
        }

        // Delete passing test traces (or old failed traces)
        const freed = deleteFile(traceZip, stats, config, 'trace');
        stats.bytesFreed += freed;
        stats.tracesDeleted++;
      }

      // Also check for video files
      try {
        const videoFiles = fs.readdirSync(entryPath).filter(f => f.endsWith('.webm'));
        for (const video of videoFiles) {
          const videoPath = path.join(entryPath, video);
          const freed = deleteFile(videoPath, stats, config, 'video');
          stats.bytesFreed += freed;
          stats.videosDeleted++;
        }
      } catch {
        // Directory may have been deleted
      }
    }
  }
}

/**
 * Clean up HAR files
 * @param {string} testResultsDir
 * @param {CleanupStats} stats
 * @param {Object} config
 */
function cleanupHARFiles(testResultsDir, stats, config) {
  const harDir = path.join(testResultsDir, 'har');

  if (!fs.existsSync(harDir)) {
    return;
  }

  const harFiles = fs.readdirSync(harDir).filter(f => f.endsWith('.har'));

  for (const harFile of harFiles) {
    const harPath = path.join(harDir, harFile);

    // Keep HAR files for recent failed tests
    if (isWithinRetentionPeriod(harPath, config.maxAgeDays)) {
      continue;
    }

    const freed = deleteFile(harPath, stats, config, 'HAR');
    stats.bytesFreed += freed;
    stats.harsDeleted++;
  }
}

/**
 * Clean up passing test traces based on test results
 *
 * Main entry point for reporter integration.
 * Uses test results to determine which traces to keep/delete.
 *
 * @param {Object} options
 * @param {string} options.testResultsDir - Path to test-results directory
 * @param {Array<{file: string, status: string}>} [options.testResults] - Test results from reporter
 * @param {boolean} [options.dryRun=false] - Show what would be deleted without deleting
 * @param {number} [options.keepPassedRuns=0] - Number of recent passing runs to keep
 * @param {number} [options.maxAgeDays=7] - Max age for failed test traces
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @param {boolean} [options.cleanupPassing=true] - Whether to cleanup passing test traces
 * @returns {CleanupStats}
 */
function cleanupPassingTraces(options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...options
  };

  const testResultsDir = options.testResultsDir || process.cwd();
  const stats = createStats();

  if (!fs.existsSync(testResultsDir)) {
    return stats;
  }

  // Build testResultsMap from reporter data if provided
  let testResultsMap = null;
  if (options.testResults && Array.isArray(options.testResults)) {
    testResultsMap = {};
    for (const test of options.testResults) {
      if (test.file) {
        const testName = path.basename(test.file, path.extname(test.file));
        testResultsMap[testName] = test;
      }
    }
  }

  // Only cleanup passing traces if enabled (default true)
  if (options.cleanupPassing !== false) {
    cleanupTraces(testResultsDir, stats, config, testResultsMap);
  }

  // Always cleanup old HAR files
  cleanupHARFiles(testResultsDir, stats, config);

  return stats;
}

/**
 * Clean up old artifacts based on age only (used by artifact cleaner)
 *
 * @param {Object} options
 * @param {string} options.testResultsDir - Path to test-results directory
 * @param {number} [options.maxAgeDays=7] - Max age in days
 * @param {boolean} [options.dryRun=false] - Dry run mode
 * @param {boolean} [options.verbose=false] - Verbose logging
 * @returns {CleanupStats}
 */
function cleanupOldArtifacts(options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...options
  };

  const testResultsDir = options.testResultsDir || process.cwd();
  const stats = createStats();

  if (!fs.existsSync(testResultsDir)) {
    return stats;
  }

  cleanupTraces(testResultsDir, stats, config);
  cleanupHARFiles(testResultsDir, stats, config);

  return stats;
}

export {
  cleanupPassingTraces,
  cleanupOldArtifacts,
  isFailedTestTrace,
  isWithinRetentionPeriod,
  formatBytes,
  createStats
};
