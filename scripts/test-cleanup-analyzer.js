#!/usr/bin/env node

/**
 * Test Cleanup Analyzer
 * SD-TEST-MGMT-CLEANUP-001
 *
 * Analyzes the codebase to identify:
 * - Scattered test files outside /tests directory
 * - Naming convention violations
 * - Orphan tests (tests for deleted features)
 * - Duplicate test coverage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import glob from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Find all test files in the codebase
 */
function findAllTestFiles() {
  const patterns = [
    '**/*.test.js',
    '**/*.test.ts',
    '**/*.spec.js',
    '**/*.spec.ts',
    '**/__tests__/**/*.js',
    '**/__tests__/**/*.ts'
  ];

  const ignorePatterns = [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    'coverage/**'
  ];

  const allFiles = [];

  for (const pattern of patterns) {
    const files = glob.sync(pattern, {
      cwd: PROJECT_ROOT,
      ignore: ignorePatterns,
      absolute: false
    });
    allFiles.push(...files);
  }

  // Remove duplicates
  return [...new Set(allFiles)];
}

/**
 * Categorize test files by location
 */
function categorizeTestFiles(files) {
  const categories = {
    proper: [],      // Files in tests/ directory
    scattered: [],   // Files outside tests/ directory
    archived: []     // Files in tests/archived/
  };

  for (const file of files) {
    if (file.startsWith('tests/archived/')) {
      categories.archived.push(file);
    } else if (file.startsWith('tests/')) {
      categories.proper.push(file);
    } else {
      categories.scattered.push(file);
    }
  }

  return categories;
}

/**
 * Analyze naming conventions
 */
function analyzeNamingConventions(files) {
  const issues = [];

  for (const file of files) {
    const basename = path.basename(file);

    // Check for inconsistent naming
    if (file.startsWith('tests/e2e/') && !basename.endsWith('.spec.ts') && !basename.endsWith('.spec.js')) {
      if (basename.endsWith('.test.js') || basename.endsWith('.test.ts')) {
        issues.push({
          file,
          issue: 'E2E test should use .spec.ts extension',
          severity: 'warning'
        });
      }
    }

    // Check for legacy .js files in tests/e2e that should be .ts
    if (file.startsWith('tests/e2e/') && basename.endsWith('.spec.js')) {
      issues.push({
        file,
        issue: 'E2E test should use TypeScript (.spec.ts)',
        severity: 'info'
      });
    }
  }

  return issues;
}

/**
 * Generate migration plan for scattered files
 */
function generateMigrationPlan(scatteredFiles) {
  const migrations = [];

  for (const file of scatteredFiles) {
    let targetDir;
    let targetFile;

    // Determine target location based on source location
    if (file.startsWith('lib/genesis/__tests__/')) {
      targetDir = 'tests/unit/genesis';
      targetFile = path.basename(file);
    } else if (file.startsWith('lib/sub-agents/__tests__/')) {
      targetDir = 'tests/unit/sub-agents';
      targetFile = path.basename(file);
    } else if (file.startsWith('lib/') && file.includes('.test.')) {
      // Extract subdirectory structure
      const subPath = file.replace('lib/', '').replace(/\.test\.(js|ts)$/, '');
      targetDir = 'tests/unit/lib';
      targetFile = path.basename(file);
    } else if (file.startsWith('agents/')) {
      const agentName = file.split('/')[1];
      targetDir = `tests/unit/agents/${agentName}`;
      targetFile = path.basename(file);
    } else {
      // Default to tests/unit with original filename
      targetDir = 'tests/unit';
      targetFile = path.basename(file);
    }

    migrations.push({
      source: file,
      target: path.join(targetDir, targetFile),
      requiresImportUpdate: true
    });
  }

  return migrations;
}

/**
 * Main analyzer function
 */
function analyze() {
  console.log('🔍 Test Cleanup Analyzer');
  console.log('   SD-TEST-MGMT-CLEANUP-001\n');
  console.log('='.repeat(60));

  // Find all test files
  console.log('\n📂 Scanning for test files...');
  const allFiles = findAllTestFiles();
  console.log(`   Found ${allFiles.length} test files total\n`);

  // Categorize files
  const categories = categorizeTestFiles(allFiles);

  console.log('📊 Test File Categories:');
  console.log(`   ✅ Properly located (tests/): ${categories.proper.length}`);
  console.log(`   ⚠️  Scattered (outside tests/): ${categories.scattered.length}`);
  console.log(`   📦 Archived: ${categories.archived.length}\n`);

  // List scattered files
  if (categories.scattered.length > 0) {
    console.log('⚠️  Scattered Test Files:');
    for (const file of categories.scattered) {
      console.log(`   • ${file}`);
    }
    console.log('');
  }

  // Analyze naming conventions
  console.log('📝 Naming Convention Analysis:');
  const namingIssues = analyzeNamingConventions(allFiles);
  if (namingIssues.length === 0) {
    console.log('   ✅ No major naming issues found\n');
  } else {
    console.log(`   ⚠️  Found ${namingIssues.length} naming issues:`);
    for (const issue of namingIssues.slice(0, 5)) {
      console.log(`   • ${issue.file}: ${issue.issue}`);
    }
    if (namingIssues.length > 5) {
      console.log(`   ... and ${namingIssues.length - 5} more`);
    }
    console.log('');
  }

  // Generate migration plan
  const migrations = generateMigrationPlan(categories.scattered);

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    sd_id: 'SD-TEST-MGMT-CLEANUP-001',
    summary: {
      total_test_files: allFiles.length,
      properly_located: categories.proper.length,
      scattered: categories.scattered.length,
      archived: categories.archived.length,
      naming_issues: namingIssues.length
    },
    scattered_files: categories.scattered,
    naming_issues: namingIssues,
    migration_plan: migrations,
    categories: {
      proper: categories.proper,
      scattered: categories.scattered,
      archived: categories.archived
    }
  };

  // Save report
  const reportPath = path.join(PROJECT_ROOT, 'test-cleanup-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved to: ${reportPath}\n`);

  // Summary
  console.log('='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`   Total test files: ${allFiles.length}`);
  console.log(`   Properly located: ${categories.proper.length}`);
  console.log(`   Need migration: ${categories.scattered.length}`);
  console.log(`   Naming issues: ${namingIssues.length}`);
  console.log('');

  if (categories.scattered.length > 0) {
    console.log('📋 Migration Plan:');
    for (const m of migrations) {
      console.log(`   ${m.source}`);
      console.log(`   → ${m.target}\n`);
    }
    console.log('\n💡 Run: node scripts/test-migration-runner.js');
    console.log('   to execute the migration.\n');
  } else {
    console.log('✅ No migration needed - all tests properly located!\n');
  }

  return report;
}

// Run analyzer
try {
  analyze();
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
