#!/usr/bin/env node
/**
 * LEO v4.4 Artifact Cleaner
 *
 * Comprehensive cleanup script for all LEO-generated artifacts:
 * - Playwright traces and test results
 * - IPC temp files
 * - HAR network captures
 * - Evidence pack artifacts
 * - Old log files
 *
 * Part of LEO Protocol v4.4 - Unified Test Evidence Architecture
 *
 * Usage:
 *   npm run leo:artifacts:clean           # Default cleanup
 *   npm run leo:artifacts:clean:dry       # Dry run (show what would be deleted)
 *   npm run leo:artifacts:clean:full      # Full cleanup (including recent)
 *
 * @module leo-artifact-cleaner
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// Configuration
const CONFIG = {
  dryRun: process.argv.includes('--dry-run'),
  fullCleanup: process.argv.includes('--full'),
  verbose: process.argv.includes('--verbose'),

  // Directories to clean
  directories: {
    traces: path.join(PROJECT_ROOT, 'test-results', 'artifacts'),
    har: path.join(PROJECT_ROOT, 'test-results', 'har'),
    htmlReports: path.join(PROJECT_ROOT, 'test-results', 'html-report'),
    ipc: path.join(PROJECT_ROOT, '.leo-ipc'),
    logs: path.join(PROJECT_ROOT, 'logs'),
    tempCache: path.join(PROJECT_ROOT, '.leo-cache'),
  },

  // Retention policies (in hours)
  retention: {
    traces: 24,         // 1 day for passing traces
    failedTraces: 168,  // 7 days for failed traces
    har: 48,            // 2 days for HAR files
    ipc: 1,             // 1 hour for IPC temp files
    logs: 168,          // 7 days for logs
    htmlReports: 24,    // 1 day for HTML reports (regenerated each run)
  },

  // Size limits (in MB) - warn if exceeded
  sizeLimits: {
    traces: 500,
    har: 100,
    htmlReports: 200,
    total: 1000,
  }
};

// Statistics
const stats = {
  filesScanned: 0,
  filesDeleted: 0,
  bytesFreed: 0,
  dirsScanned: 0,
  dirsCleaned: 0,
  errors: [],
  warnings: []
};

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get age of file in hours
 */
function getFileAgeHours(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtime.getTime();
    return ageMs / (1000 * 60 * 60);
  } catch {
    return 0;
  }
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Get directory size recursively
 */
function getDirSize(dirPath) {
  let size = 0;

  if (!fs.existsSync(dirPath)) return size;

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        size += getDirSize(itemPath);
      } else {
        size += getFileSize(itemPath);
      }
    }
  } catch (err) {
    stats.errors.push({ path: dirPath, error: err.message });
  }

  return size;
}

/**
 * Delete file with stats tracking
 */
function deleteFile(filePath) {
  const size = getFileSize(filePath);

  if (CONFIG.dryRun) {
    console.log(`  [DRY-RUN] Would delete: ${filePath} (${formatBytes(size)})`);
    return size;
  }

  try {
    fs.unlinkSync(filePath);
    if (CONFIG.verbose) {
      console.log(`  Deleted: ${filePath}`);
    }
    stats.filesDeleted++;
    stats.bytesFreed += size;
    return size;
  } catch (err) {
    stats.errors.push({ path: filePath, error: err.message });
    return 0;
  }
}

/**
 * Delete directory recursively
 */
function deleteDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;

  const size = getDirSize(dirPath);

  if (CONFIG.dryRun) {
    console.log(`  [DRY-RUN] Would delete directory: ${dirPath} (${formatBytes(size)})`);
    return size;
  }

  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    stats.dirsCleaned++;
    stats.bytesFreed += size;
    return size;
  } catch (err) {
    stats.errors.push({ path: dirPath, error: err.message });
    return 0;
  }
}

/**
 * Check if file is from a failed test
 */
function isFailedTestArtifact(filePath) {
  const dirName = path.dirname(filePath);
  const baseName = path.basename(dirName);

  // Check directory naming conventions
  if (baseName.includes('failed') || baseName.includes('retry')) {
    return true;
  }

  // Check for error indicators in accompanying files
  const resultFile = filePath.replace(/\.zip$/, '-result.json');
  if (fs.existsSync(resultFile)) {
    try {
      const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      return result.status === 'failed' || result.status === 'timedOut';
    } catch {
      // Assume not failed if can't parse
    }
  }

  return false;
}

/**
 * Clean IPC temp files
 */
function cleanIPCFiles() {
  const dir = CONFIG.directories.ipc;
  console.log('\n📁 Cleaning IPC temp files...');

  if (!fs.existsSync(dir)) {
    console.log('   No IPC directory found');
    return;
  }

  stats.dirsScanned++;
  const files = fs.readdirSync(dir);
  let cleaned = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const ageHours = getFileAgeHours(filePath);
    stats.filesScanned++;

    // IPC files are always safe to delete after 1 hour
    if (ageHours > CONFIG.retention.ipc || CONFIG.fullCleanup) {
      deleteFile(filePath);
      cleaned++;
    }
  }

  console.log(`   Scanned: ${files.length}, Cleaned: ${cleaned}`);
}

/**
 * Clean trace files
 */
function cleanTraceFiles() {
  const dir = CONFIG.directories.traces;
  console.log('\n📁 Cleaning trace files...');

  if (!fs.existsSync(dir)) {
    console.log('   No traces directory found');
    return;
  }

  stats.dirsScanned++;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let cleaned = 0;

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    stats.filesScanned++;

    if (entry.isDirectory()) {
      // Check for trace.zip inside
      const traceZip = path.join(entryPath, 'trace.zip');
      if (fs.existsSync(traceZip)) {
        const ageHours = getFileAgeHours(traceZip);
        const isFailed = isFailedTestArtifact(traceZip);
        const retention = isFailed ? CONFIG.retention.failedTraces : CONFIG.retention.traces;

        if (ageHours > retention || CONFIG.fullCleanup) {
          // Delete entire test result directory
          deleteDirectory(entryPath);
          cleaned++;
        }
      }
    }
  }

  console.log(`   Scanned: ${entries.length}, Cleaned: ${cleaned}`);
}

/**
 * Clean HAR files
 */
function cleanHARFiles() {
  const dir = CONFIG.directories.har;
  console.log('\n📁 Cleaning HAR files...');

  if (!fs.existsSync(dir)) {
    console.log('   No HAR directory found');
    return;
  }

  stats.dirsScanned++;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.har'));
  let cleaned = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const ageHours = getFileAgeHours(filePath);
    stats.filesScanned++;

    if (ageHours > CONFIG.retention.har || CONFIG.fullCleanup) {
      deleteFile(filePath);
      cleaned++;
    }
  }

  console.log(`   Scanned: ${files.length}, Cleaned: ${cleaned}`);
}

/**
 * Clean old HTML reports
 */
function cleanHTMLReports() {
  const dir = CONFIG.directories.htmlReports;
  console.log('\n📁 Cleaning HTML reports...');

  if (!fs.existsSync(dir)) {
    console.log('   No HTML reports directory found');
    return;
  }

  // HTML reports are regenerated each run, only clean if explicitly requested
  if (CONFIG.fullCleanup) {
    const size = getDirSize(dir);
    console.log(`   Directory size: ${formatBytes(size)}`);

    if (size > CONFIG.sizeLimits.htmlReports * 1024 * 1024) {
      deleteDirectory(dir);
      console.log('   Cleaned: entire directory');
    } else {
      console.log('   Skipped: within size limit');
    }
  } else {
    const size = getDirSize(dir);
    console.log(`   Current size: ${formatBytes(size)} (skipped, use --full to clean)`);
  }
}

/**
 * Clean old log files
 */
function cleanLogFiles() {
  const dir = CONFIG.directories.logs;
  console.log('\n📁 Cleaning log files...');

  if (!fs.existsSync(dir)) {
    console.log('   No logs directory found');
    return;
  }

  stats.dirsScanned++;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.log') || f.endsWith('.txt'));
  let cleaned = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const ageHours = getFileAgeHours(filePath);
    stats.filesScanned++;

    if (ageHours > CONFIG.retention.logs || CONFIG.fullCleanup) {
      deleteFile(filePath);
      cleaned++;
    }
  }

  console.log(`   Scanned: ${files.length}, Cleaned: ${cleaned}`);
}

/**
 * Clean temp cache files
 */
function cleanTempCache() {
  const dir = CONFIG.directories.tempCache;
  console.log('\n📁 Cleaning temp cache...');

  if (!fs.existsSync(dir)) {
    console.log('   No temp cache directory found');
    return;
  }

  const size = getDirSize(dir);
  console.log(`   Directory size: ${formatBytes(size)}`);

  // Clean stale cache files (older than 24 hours)
  const files = fs.readdirSync(dir);
  let cleaned = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const ageHours = getFileAgeHours(filePath);

    if (ageHours > 24 || CONFIG.fullCleanup) {
      if (fs.statSync(filePath).isFile()) {
        deleteFile(filePath);
        cleaned++;
      }
    }
  }

  console.log(`   Cleaned: ${cleaned} files`);
}

/**
 * Calculate total artifact storage
 */
function calculateTotalStorage() {
  console.log('\n📊 Storage Summary:');

  let total = 0;
  const sizes = {};

  for (const [name, dir] of Object.entries(CONFIG.directories)) {
    if (fs.existsSync(dir)) {
      const size = getDirSize(dir);
      sizes[name] = size;
      total += size;
      console.log(`   ${name}: ${formatBytes(size)}`);
    }
  }

  console.log(`   TOTAL: ${formatBytes(total)}`);

  // Check against limits
  if (total > CONFIG.sizeLimits.total * 1024 * 1024) {
    stats.warnings.push(`Total artifact storage (${formatBytes(total)}) exceeds limit (${CONFIG.sizeLimits.total} MB)`);
  }

  return { total, sizes };
}

/**
 * Main cleanup function
 */
async function main() {
  console.log('═'.repeat(60));
  console.log('LEO v4.4 Artifact Cleaner');
  console.log('═'.repeat(60));
  console.log(`Mode: ${CONFIG.dryRun ? 'DRY-RUN' : (CONFIG.fullCleanup ? 'FULL CLEANUP' : 'STANDARD')}`);
  console.log(`Project root: ${PROJECT_ROOT}`);

  // Calculate initial storage (also displays summary)
  calculateTotalStorage();

  // Run cleanup tasks
  cleanIPCFiles();
  cleanTraceFiles();
  cleanHARFiles();
  cleanHTMLReports();
  cleanLogFiles();
  cleanTempCache();

  // Final summary
  console.log('\n═'.repeat(60));
  console.log('Cleanup Summary');
  console.log('═'.repeat(60));
  console.log(`Files scanned: ${stats.filesScanned}`);
  console.log(`Files deleted: ${stats.filesDeleted}`);
  console.log(`Directories cleaned: ${stats.dirsCleaned}`);
  console.log(`Space freed: ${formatBytes(stats.bytesFreed)}`);

  if (stats.errors.length > 0) {
    console.log('\n⚠️  Errors:');
    stats.errors.forEach(err => {
      console.log(`   - ${err.path}: ${err.error}`);
    });
  }

  if (stats.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    stats.warnings.forEach(warn => {
      console.log(`   - ${warn}`);
    });
  }

  if (CONFIG.dryRun) {
    console.log('\n[DRY-RUN] No files were actually deleted.');
    console.log('Run without --dry-run to perform cleanup.');
  }

  console.log('═'.repeat(60));

  // Exit with error code if there were errors
  process.exit(stats.errors.length > 0 ? 1 : 0);
}

// Run
main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
