#!/usr/bin/env node

/**
 * Test Automation Workflows
 * SD-TEST-MGMT-AUTOMATION-001
 *
 * Provides intelligent test execution based on file changes.
 * Features: watch mode, affected test detection, parallel execution.
 *
 * Usage:
 *   node scripts/test-automation.js [command] [options]
 *
 * Commands:
 *   watch       Start watch mode - auto-run tests on file changes
 *   affected    Run only tests affected by recent changes
 *   parallel    Run tests in parallel across CPU cores
 *   report      Generate automation metrics report
 *
 * Options:
 *   --since <ref>   Git ref to compare for affected tests (default: HEAD~1)
 *   --workers <n>   Number of parallel workers (default: CPU cores)
 *   --pattern <p>   Test file pattern to watch
 *   --verbose, -v   Show detailed output
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const options = {
    since: 'HEAD~1',
    workers: os.cpus().length,
    pattern: null,
    verbose: false
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--since':
        options.since = args[++i];
        break;
      case '--workers':
        options.workers = parseInt(args[++i], 10);
        break;
      case '--pattern':
        options.pattern = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
    }
  }

  return { command, options };
}

/**
 * Get changed files since a git ref
 */
function getChangedFiles(since = 'HEAD~1') {
  try {
    const output = execSync(`git diff --name-only ${since}`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8'
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Map source files to their test files
 */
function mapSourceToTests(sourceFiles) {
  const testFiles = new Set();

  for (const file of sourceFiles) {
    // Skip if already a test file
    if (file.includes('.test.') || file.includes('.spec.')) {
      testFiles.add(file);
      continue;
    }

    // Map source files to potential test files
    const basename = path.basename(file, path.extname(file));
    const dirname = path.dirname(file);

    // Common test file patterns
    const patterns = [
      `tests/unit/${basename}.test.js`,
      `tests/unit/${basename}.test.ts`,
      `tests/unit/**/${basename}.test.js`,
      `tests/unit/**/${basename}.test.ts`,
      `tests/e2e/${basename}.spec.ts`,
      `tests/e2e/**/${basename}.spec.ts`,
      `tests/integration/${basename}.test.js`,
      `${dirname}/__tests__/${basename}.test.js`,
      `${dirname}/${basename}.test.js`
    ];

    // Check which test files exist
    for (const pattern of patterns) {
      const testPath = path.join(PROJECT_ROOT, pattern.replace('**/', ''));
      if (fs.existsSync(testPath)) {
        testFiles.add(pattern.replace('**/', ''));
      }
    }

    // Also add tests that import this file
    const relatedTests = findTestsImporting(file);
    relatedTests.forEach(t => testFiles.add(t));
  }

  return Array.from(testFiles);
}

/**
 * Find tests that import a given file
 */
function findTestsImporting(sourceFile) {
  const tests = [];
  const basename = path.basename(sourceFile, path.extname(sourceFile));

  try {
    // Search for imports in test files
    const output = execSync(
      `grep -r -l "from.*${basename}" tests/ 2>/dev/null || true`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );

    const files = output.trim().split('\n').filter(Boolean);
    files.forEach(f => {
      if (f.includes('.test.') || f.includes('.spec.')) {
        tests.push(f);
      }
    });
  } catch {
    // Ignore grep errors
  }

  return tests;
}

/**
 * Run tests with optional filtering
 */
function runTests(testFiles = [], options = {}) {
  const { workers, verbose } = options;

  let command = 'npm test';
  const args = [];

  if (testFiles.length > 0) {
    // Use Jest's testPathPattern for specific files
    args.push('--', '--testPathPattern', testFiles.join('|'));
  }

  if (workers > 1) {
    args.push('--maxWorkers', workers.toString());
  }

  if (verbose) {
    args.push('--verbose');
  }

  console.log(`\n🧪 Running tests: ${testFiles.length > 0 ? testFiles.length + ' files' : 'all'}`);

  if (verbose && testFiles.length > 0) {
    console.log('   Files:');
    testFiles.forEach(f => console.log(`     • ${f}`));
  }

  const fullCommand = `${command} ${args.join(' ')}`;
  console.log(`   Command: ${fullCommand}\n`);

  try {
    execSync(fullCommand, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '--experimental-vm-modules' }
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Watch mode - monitor files and run tests on changes
 */
async function watchMode(options) {
  console.log('👀 Watch Mode Started');
  console.log('   Monitoring for file changes...');
  console.log('   Press Ctrl+C to stop\n');

  const watchDirs = ['src', 'scripts', 'lib', 'server.js'];
  let debounceTimer = null;
  let changedFiles = new Set();

  // Dynamic import for chokidar
  let chokidar;
  try {
    chokidar = await import('chokidar');
  } catch {
    console.error('❌ chokidar not installed. Run: npm install chokidar');
    process.exit(1);
  }

  const watcher = chokidar.watch(watchDirs, {
    cwd: PROJECT_ROOT,
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/coverage/**',
      '**/dist/**'
    ],
    persistent: true,
    ignoreInitial: true
  });

  watcher.on('change', (filePath) => {
    changedFiles.add(filePath);

    // Debounce to batch rapid changes
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      const files = Array.from(changedFiles);
      changedFiles.clear();

      console.log(`\n📝 Files changed: ${files.join(', ')}`);

      const affectedTests = mapSourceToTests(files);
      if (affectedTests.length > 0) {
        runTests(affectedTests, options);
      } else {
        console.log('   No related tests found');
      }
    }, 500);
  });

  // Keep process running
  process.on('SIGINT', () => {
    console.log('\n\n👋 Watch mode stopped');
    watcher.close();
    process.exit(0);
  });
}

/**
 * Run affected tests based on git changes
 */
function runAffectedTests(options) {
  console.log('🎯 Running Affected Tests');
  console.log(`   Comparing to: ${options.since}\n`);

  const changedFiles = getChangedFiles(options.since);

  if (changedFiles.length === 0) {
    console.log('   No changed files detected');
    return;
  }

  console.log(`   Changed files: ${changedFiles.length}`);
  if (options.verbose) {
    changedFiles.forEach(f => console.log(`     • ${f}`));
  }

  const affectedTests = mapSourceToTests(changedFiles);

  if (affectedTests.length === 0) {
    console.log('   No affected tests found');
    return;
  }

  console.log(`   Affected tests: ${affectedTests.length}`);
  runTests(affectedTests, options);
}

/**
 * Run tests in parallel
 */
function runParallelTests(options) {
  console.log('⚡ Running Tests in Parallel');
  console.log(`   Workers: ${options.workers}\n`);

  runTests([], { ...options, workers: options.workers });
}

/**
 * Generate automation report
 */
function generateReport() {
  console.log('📊 Generating Automation Report\n');

  const report = {
    timestamp: new Date().toISOString(),
    system: {
      cpuCores: os.cpus().length,
      platform: os.platform(),
      nodeVersion: process.version
    },
    tests: {
      total: 0,
      byType: {}
    },
    automation: {
      watchModeAvailable: true,
      affectedTestsAvailable: true,
      parallelExecutionAvailable: true,
      maxWorkers: os.cpus().length
    }
  };

  // Count tests from scanner report if available
  const scannerReportPath = path.join(PROJECT_ROOT, 'test-scanner-report.json');
  if (fs.existsSync(scannerReportPath)) {
    try {
      const scannerReport = JSON.parse(fs.readFileSync(scannerReportPath, 'utf-8'));
      report.tests.total = scannerReport.summary?.totalTests || 0;
      report.tests.byType = scannerReport.summary?.byTestType || {};
    } catch {
      // Ignore parse errors
    }
  }

  // Save report
  const reportPath = path.join(PROJECT_ROOT, 'test-automation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('   Test Statistics:');
  console.log(`     Total tests: ${report.tests.total}`);
  Object.entries(report.tests.byType).forEach(([type, count]) => {
    console.log(`     ${type}: ${count}`);
  });

  console.log('\n   Automation Capabilities:');
  console.log('     Watch mode: ✅');
  console.log('     Affected tests: ✅');
  console.log(`     Parallel execution: ✅ (${report.automation.maxWorkers} workers)`);

  console.log(`\n📄 Report saved to: ${reportPath}`);
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
Test Automation Workflows
SD-TEST-MGMT-AUTOMATION-001

Usage:
  node scripts/test-automation.js [command] [options]

Commands:
  watch       Start watch mode - auto-run tests on file changes
  affected    Run only tests affected by recent changes
  parallel    Run tests in parallel across CPU cores
  report      Generate automation metrics report
  help        Show this help message

Options:
  --since <ref>   Git ref to compare for affected tests (default: HEAD~1)
  --workers <n>   Number of parallel workers (default: ${os.cpus().length})
  --pattern <p>   Test file pattern to watch
  --verbose, -v   Show detailed output

Examples:
  node scripts/test-automation.js watch
  node scripts/test-automation.js affected --since main
  node scripts/test-automation.js parallel --workers 4
  node scripts/test-automation.js report
`);
}

/**
 * Main function
 */
async function main() {
  console.log('🤖 Test Automation Workflows');
  console.log('   SD-TEST-MGMT-AUTOMATION-001\n');
  console.log('='.repeat(60));

  const { command, options } = parseArgs();

  switch (command) {
    case 'watch':
      await watchMode(options);
      break;
    case 'affected':
      runAffectedTests(options);
      break;
    case 'parallel':
      runParallelTests(options);
      break;
    case 'report':
      generateReport();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

// Run main
main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
