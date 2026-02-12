#!/usr/bin/env node

/**
 * Test Scanner & Auto-Registration
 * SD-TEST-MGMT-SCANNER-001
 *
 * Scans the codebase for test files, parses them to extract test cases,
 * and registers them in the UAT database schema.
 *
 * Usage:
 *   node scripts/test-scanner.js [options]
 *
 * Options:
 *   --dry-run, -n    Preview changes without modifying database
 *   --verbose, -v    Show detailed output
 *   --register, -r   Register tests in database (default: scan only)
 *   --stats, -s      Show registration statistics
 *   --path <path>    Scan specific path only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import glob from 'glob';
import { _parseTestFile, parseTestFiles, generateSummary } from './lib/test-parser.js';
import { registerAllTests, getRegistrationStats } from './lib/test-registrar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Find all test files in the codebase
 * @param {string} basePath - Base path to search
 * @returns {string[]} Array of test file paths
 */
function findTestFiles(basePath = PROJECT_ROOT) {
  const patterns = [
    'tests/**/*.test.js',
    'tests/**/*.test.ts',
    'tests/**/*.spec.js',
    'tests/**/*.spec.ts'
  ];

  const ignorePatterns = [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    'coverage/**',
    'tests/archived/**'
  ];

  const allFiles = [];

  for (const pattern of patterns) {
    const files = glob.sync(pattern, {
      cwd: basePath,
      ignore: ignorePatterns,
      absolute: false
    });
    allFiles.push(...files);
  }

  // Remove duplicates and sort
  return [...new Set(allFiles)].sort();
}

/**
 * Print scan results
 * @param {Object[]} parsedTests - Parsed test data
 * @param {Object} summary - Summary statistics
 * @param {boolean} verbose - Show detailed output
 */
function printScanResults(parsedTests, summary, verbose = false) {
  console.log('\n📊 SCAN RESULTS');
  console.log('='.repeat(60));

  console.log(`\n   Total Files: ${summary.totalFiles}`);
  console.log(`   Total Tests: ${summary.totalTests}`);
  console.log(`   Total Describe Blocks: ${summary.totalDescribes}`);
  console.log(`   Files with Errors: ${summary.filesWithErrors}`);

  console.log('\n   By Framework:');
  for (const [framework, count] of Object.entries(summary.byFramework)) {
    console.log(`     • ${framework}: ${count} files`);
  }

  console.log('\n   By Language:');
  for (const [lang, count] of Object.entries(summary.byLanguage)) {
    console.log(`     • ${lang}: ${count} files`);
  }

  console.log('\n   By Test Type:');
  for (const [type, count] of Object.entries(summary.byTestType)) {
    console.log(`     • ${type}: ${count} tests`);
  }

  if (verbose) {
    console.log('\n📋 FILES SCANNED:');
    for (const parsed of parsedTests) {
      if (parsed.error) {
        console.log(`   ❌ ${parsed.filePath}: ${parsed.error}`);
      } else {
        console.log(`   ✅ ${parsed.filePath}: ${parsed.testCount} tests`);
        for (const tc of parsed.testCases) {
          console.log(`      • ${tc.fullName} (${tc.testType})`);
        }
      }
    }
  }
}

/**
 * Print registration results
 * @param {Object} results - Registration results
 */
function printRegistrationResults(results) {
  console.log('\n📝 REGISTRATION RESULTS');
  console.log('='.repeat(60));

  console.log(`\n   Files Processed: ${results.processedFiles}/${results.totalFiles}`);
  console.log(`   Tests Registered: ${results.totalRegistered}`);
  console.log(`   Tests Updated: ${results.totalUpdated}`);
  console.log(`   Tests Failed: ${results.totalFailed}`);

  if (results.errors.length > 0) {
    console.log('\n   ⚠️ Errors:');
    for (const err of results.errors) {
      console.log(`     • ${err.filePath}: ${err.error}`);
    }
  }
}

/**
 * Print database statistics
 * @param {Object} stats - Statistics from database
 */
function printStats(stats) {
  console.log('\n📈 DATABASE STATISTICS');
  console.log('='.repeat(60));

  console.log(`\n   Total Suites: ${stats.totalSuites}`);
  console.log(`   Total Tests: ${stats.totalTests}`);

  if (stats.suites && stats.suites.length > 0) {
    console.log('\n   Suites:');
    for (const suite of stats.suites) {
      console.log(`     • ${suite.suite_name}: ${suite.total_tests || 0} tests (${suite.test_type})`);
    }
  }

  if (stats.byType && Object.keys(stats.byType).length > 0) {
    console.log('\n   By Test Type:');
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`     • ${type}: ${count}`);
    }
  }
}

/**
 * Main scanner function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const register = args.includes('--register') || args.includes('-r');
  const showStats = args.includes('--stats') || args.includes('-s');

  // Get custom path if specified
  let scanPath = PROJECT_ROOT;
  const pathIdx = args.indexOf('--path');
  if (pathIdx !== -1 && args[pathIdx + 1]) {
    scanPath = path.resolve(args[pathIdx + 1]);
  }

  console.log('🔍 Test Scanner & Auto-Registration');
  console.log('   SD-TEST-MGMT-SCANNER-001\n');
  console.log('='.repeat(60));

  if (showStats) {
    try {
      const stats = await getRegistrationStats();
      printStats(stats);
    } catch (err) {
      console.error('   ❌ Failed to get stats:', err.message);
    }
    return;
  }

  // Find test files
  console.log('\n📂 Scanning for test files...');
  console.log(`   Path: ${scanPath}`);

  const testFiles = findTestFiles(scanPath);
  console.log(`   Found ${testFiles.length} test files\n`);

  if (testFiles.length === 0) {
    console.log('   ⚠️ No test files found');
    return;
  }

  // Parse test files
  console.log('📖 Parsing test files...');
  const absolutePaths = testFiles.map(f => path.join(scanPath, f));
  const parsedTests = parseTestFiles(absolutePaths);
  const summary = generateSummary(parsedTests);

  printScanResults(parsedTests, summary, verbose);

  // Generate report
  const reportPath = path.join(PROJECT_ROOT, 'test-scanner-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    sd_id: 'SD-TEST-MGMT-SCANNER-001',
    scan_path: scanPath,
    summary,
    files: parsedTests.map(p => ({
      filePath: p.filePath,
      fileName: p.fileName,
      framework: p.framework,
      language: p.language,
      testCount: p.testCount,
      describeCount: p.describeCount,
      error: p.error || null
    }))
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved to: ${reportPath}`);

  // Register if requested
  if (register) {
    console.log('\n📝 Registering tests in database...');

    if (dryRun) {
      console.log('   MODE: DRY RUN (no changes will be made)\n');
    }

    try {
      const results = await registerAllTests(parsedTests, { dryRun });
      printRegistrationResults(results);

      // Save registration report
      const regReportPath = path.join(PROJECT_ROOT, 'test-registration-report.json');
      fs.writeFileSync(regReportPath, JSON.stringify({
        ...report,
        registration: results
      }, null, 2));
      console.log(`   📄 Registration report saved to: ${regReportPath}`);
    } catch (err) {
      console.error('   ❌ Registration failed:', err.message);
    }
  } else {
    console.log('\n💡 To register tests in database, run:');
    console.log('   node scripts/test-scanner.js --register');
    console.log('   node scripts/test-scanner.js --register --dry-run (preview)');
  }

  console.log('');
}

// Run scanner
main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
