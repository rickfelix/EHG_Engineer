#!/usr/bin/env node

/**
 * Test Migration Runner
 * SD-TEST-MGMT-CLEANUP-001
 *
 * Executes the migration of scattered test files to proper locations.
 * Uses the report from test-cleanup-analyzer.js to determine migrations.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Load migration report
 */
function loadReport() {
  const reportPath = path.join(PROJECT_ROOT, 'test-cleanup-report.json');

  if (!fs.existsSync(reportPath)) {
    console.error('❌ Migration report not found.');
    console.error('   Run: node scripts/test-cleanup-analyzer.js first');
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
}

/**
 * Update imports in a file after moving
 */
function updateImportsInFile(filePath, oldPath, newPath) {
  if (!fs.existsSync(filePath)) return false;

  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;

  // Calculate relative path changes
  const oldDir = path.dirname(oldPath);
  const newDir = path.dirname(newPath);

  // Common import patterns to update
  const importPatterns = [
    // ES6 imports
    /from ['"](\.[^'"]+)['"]/g,
    // require
    /require\(['"](\.[^'"]+)['"]\)/g
  ];

  for (const pattern of importPatterns) {
    content = content.replace(pattern, (match, importPath) => {
      // Only update relative imports
      if (!importPath.startsWith('.')) return match;

      // Resolve the old absolute path
      const oldAbsPath = path.resolve(path.dirname(path.join(PROJECT_ROOT, oldPath)), importPath);

      // Calculate new relative path from new location
      const newRelPath = path.relative(path.dirname(path.join(PROJECT_ROOT, newPath)), oldAbsPath);

      // Ensure it starts with ./ or ../
      const normalizedPath = newRelPath.startsWith('.') ? newRelPath : './' + newRelPath;

      return match.replace(importPath, normalizedPath.replace(/\\/g, '/'));
    });
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    return true;
  }

  return false;
}

/**
 * Execute a single migration
 */
function executeMigration(migration, dryRun = false) {
  const { source, target } = migration;
  const sourcePath = path.join(PROJECT_ROOT, source);
  const targetPath = path.join(PROJECT_ROOT, target);

  // Check source exists
  if (!fs.existsSync(sourcePath)) {
    return {
      success: false,
      error: `Source file not found: ${source}`
    };
  }

  // Create target directory
  const targetDir = path.dirname(targetPath);

  if (dryRun) {
    return {
      success: true,
      action: 'dry-run',
      message: `Would move: ${source} → ${target}`
    };
  }

  try {
    // Create directory if needed
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Read source content
    const content = fs.readFileSync(sourcePath, 'utf-8');

    // Write to target
    fs.writeFileSync(targetPath, content);

    // Update imports in the moved file
    updateImportsInFile(targetPath, source, target);

    // Delete source using git rm if in git
    try {
      execSync(`git rm "${sourcePath}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    } catch {
      // If git rm fails, just delete the file
      fs.unlinkSync(sourcePath);
    }

    // Add new file to git
    try {
      execSync(`git add "${targetPath}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    } catch {
      // Ignore git add errors
    }

    return {
      success: true,
      action: 'migrated',
      message: `Moved: ${source} → ${target}`
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Clean up empty directories after migration
 */
function cleanupEmptyDirs(dirs) {
  for (const dir of dirs) {
    const fullPath = path.join(PROJECT_ROOT, dir);

    if (fs.existsSync(fullPath)) {
      try {
        const files = fs.readdirSync(fullPath);
        if (files.length === 0) {
          fs.rmdirSync(fullPath);
          console.log(`   🗑️  Removed empty directory: ${dir}`);
        }
      } catch {
        // Ignore errors
      }
    }
  }
}

/**
 * Main migration function
 */
async function migrate(options = {}) {
  const { dryRun = false } = options;

  console.log('🚀 Test Migration Runner');
  console.log('   SD-TEST-MGMT-CLEANUP-001\n');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('   MODE: DRY RUN (no changes will be made)\n');
  }

  // Load report
  const report = loadReport();
  const migrations = report.migration_plan || [];

  if (migrations.length === 0) {
    console.log('\n✅ No migrations needed!');
    return;
  }

  console.log(`\n📋 Found ${migrations.length} files to migrate:\n`);

  const results = {
    success: 0,
    failed: 0,
    skipped: 0
  };

  const dirsToClean = new Set();

  for (const migration of migrations) {
    const result = executeMigration(migration, dryRun);

    if (result.success) {
      console.log(`   ✅ ${result.message}`);
      results.success++;
      dirsToClean.add(path.dirname(migration.source));
    } else {
      console.log(`   ❌ ${migration.source}: ${result.error}`);
      results.failed++;
    }
  }

  // Cleanup empty directories
  if (!dryRun && dirsToClean.size > 0) {
    console.log('\n🧹 Cleaning up empty directories...');
    cleanupEmptyDirs([...dirsToClean]);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`   ✅ Successful: ${results.success}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log(`   ⏭️  Skipped: ${results.skipped}`);

  if (!dryRun && results.success > 0) {
    // Generate post-migration report
    const postReport = {
      timestamp: new Date().toISOString(),
      sd_id: 'SD-TEST-MGMT-CLEANUP-001',
      migration_results: {
        total: migrations.length,
        success: results.success,
        failed: results.failed,
        skipped: results.skipped
      },
      migrations: migrations.map(m => ({
        ...m,
        status: 'completed'
      }))
    };

    const postReportPath = path.join(PROJECT_ROOT, 'test-migration-results.json');
    fs.writeFileSync(postReportPath, JSON.stringify(postReport, null, 2));
    console.log(`\n📄 Results saved to: ${postReportPath}`);

    console.log('\n💡 Next steps:');
    console.log('   1. Run: npm test (verify all tests still pass)');
    console.log('   2. Run: node scripts/test-cleanup-analyzer.js (verify cleanup)');
    console.log('   3. Commit changes if tests pass');
  }

  console.log('');

  return results;
}

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-n');

migrate({ dryRun }).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
