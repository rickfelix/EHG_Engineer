#!/usr/bin/env node
/**
 * Migration Consolidation Script
 * Reorganizes migrations into database-specific directories
 *
 * Usage:
 *   node scripts/consolidate-migrations.cjs --dry-run    # Preview changes
 *   node scripts/consolidate-migrations.cjs --execute    # Execute moves
 *   node scripts/consolidate-migrations.cjs --help       # Show help
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load analysis results
const ANALYSIS_PATH = path.join(__dirname, '../database/docs/migration-analysis.json');

// Target directories
const TARGETS = {
  EHG_ENGINEER: path.join(__dirname, '../supabase/ehg_engineer/migrations'),
  EHG_APP: path.join(__dirname, '../supabase/ehg_app/migrations'),
  MANUAL_REVIEW: path.join(__dirname, '../archive/migrations/manual_review'),
  SUPERSEDED: path.join(__dirname, '../archive/migrations/superseded')
};

/**
 * Generate timestamp from file metadata
 */
function generateTimestamp(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const mtime = new Date(stats.mtime);

    const year = mtime.getFullYear();
    const month = String(mtime.getMonth() + 1).padStart(2, '0');
    const day = String(mtime.getDate()).padStart(2, '0');
    const hour = String(mtime.getHours()).padStart(2, '0');
    const minute = String(mtime.getMinutes()).padStart(2, '0');
    const second = String(mtime.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hour}${minute}${second}`;
  } catch (error) {
    // Fallback to current timestamp
    const now = new Date();
    return now.toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
  }
}

/**
 * Extract description from filename
 */
function extractDescription(filename) {
  // Remove extension
  const base = filename.replace('.sql', '');

  // Remove timestamp patterns
  const patterns = [
    /^\d{14}_/,           // 20250828094259_
    /^\d{4}-\d{2}-\d{2}-/,  // 2025-09-22-
    /^\d{12}__/,          // 202509221300__
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_?/  // UUID
  ];

  let description = base;
  for (const pattern of patterns) {
    description = description.replace(pattern, '');
  }

  // Remove numbered prefixes like 001_, 002_
  description = description.replace(/^\d{3}_/, '');

  // Clean up
  description = description
    .replace(/__/g, '_')
    .replace(/^eng_/, '')
    .replace(/^vh_/, '')
    .toLowerCase()
    .substring(0, 100); // Limit length

  return description;
}

/**
 * Generate standardized filename
 */
function generateFilename(originalPath, category) {
  const timestamp = generateTimestamp(originalPath);
  const description = extractDescription(path.basename(originalPath));

  // Add category prefix if not already present
  let finalDescription = description;
  if (category && !description.startsWith(category + '_')) {
    finalDescription = `${category}_${description}`;
  }

  return `${timestamp}_${finalDescription}.sql`;
}

/**
 * Determine migration category from content
 */
function categorizeByContent(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8').toLowerCase();

    if (content.includes('create table')) return 'schema';
    if (content.includes('alter table')) return 'alter';
    if (content.includes('create policy') || content.includes('enable row level security')) return 'rls';
    if (content.includes('create trigger')) return 'trigger';
    if (content.includes('create index')) return 'index';
    if (content.includes('insert into') && !content.includes('create')) return 'data';
    if (content.includes('create function')) return 'function';
    if (content.includes('create view')) return 'view';

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Copy migration file to target directory
 */
function copyMigration(sourcePath, targetDir, newFilename, dryRun = true) {
  const targetPath = path.join(targetDir, newFilename);

  if (dryRun) {
    console.log(`[DRY RUN] Would copy:`);
    console.log(`  FROM: ${sourcePath}`);
    console.log(`  TO:   ${targetPath}`);
    return { success: true, targetPath };
  }

  try {
    // Ensure target directory exists
    fs.mkdirSync(targetDir, { recursive: true });

    // Copy file
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`✓ Copied to ${targetPath}`);

    return { success: true, targetPath };
  } catch (error) {
    console.error(`✗ Failed to copy ${sourcePath}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process migrations for a specific category
 */
function processMigrations(migrations, targetDir, dryRun = true) {
  const results = {
    total: migrations.length,
    success: 0,
    failed: 0,
    skipped: 0,
    files: []
  };

  for (const migration of migrations) {
    const category = categorizeByContent(migration.filePath);
    const newFilename = generateFilename(migration.filePath, category);

    const result = copyMigration(migration.filePath, targetDir, newFilename, dryRun);

    if (result.success) {
      results.success++;
      results.files.push({
        original: migration.filePath,
        target: result.targetPath,
        category,
        score: migration.engineerScore || migration.appScore
      });
    } else {
      results.failed++;
    }
  }

  return results;
}

/**
 * Generate manifest file
 */
function generateManifest(results, targetPath, dryRun = true) {
  const manifest = {
    generated: new Date().toISOString(),
    total_migrations: results.total,
    successful: results.success,
    failed: results.failed,
    migrations: results.files.map(f => ({
      original_path: path.relative(path.join(__dirname, '..'), f.original),
      new_path: path.relative(path.join(__dirname, '..'), f.target),
      category: f.category,
      confidence_score: f.score
    }))
  };

  if (dryRun) {
    console.log(`\n[DRY RUN] Would create manifest: ${targetPath}`);
    return;
  }

  fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2));
  console.log(`✓ Created manifest: ${targetPath}`);
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Migration Consolidation Script

Usage:
  node scripts/consolidate-migrations.cjs [options]

Options:
  --dry-run     Preview changes without executing (default)
  --execute     Execute the migration consolidation
  --help        Show this help message

Examples:
  node scripts/consolidate-migrations.cjs --dry-run
  node scripts/consolidate-migrations.cjs --execute
    `);
    return;
  }

  const dryRun = !args.includes('--execute');

  console.log('=== Migration Consolidation Tool ===\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No files will be modified\n');
  } else {
    console.log('⚠️  EXECUTE MODE - Files will be copied\n');
  }

  // Load analysis results
  if (!fs.existsSync(ANALYSIS_PATH)) {
    console.error('❌ Analysis file not found. Run analyze-migrations.cjs first.');
    process.exit(1);
  }

  const analysis = JSON.parse(fs.readFileSync(ANALYSIS_PATH, 'utf8'));

  // Process EHG_Engineer migrations
  console.log('=== Processing EHG_Engineer Migrations ===');
  const engineerResults = processMigrations(
    analysis.EHG_ENGINEER,
    TARGETS.EHG_ENGINEER,
    dryRun
  );
  console.log(`Total: ${engineerResults.total}, Success: ${engineerResults.success}, Failed: ${engineerResults.failed}\n`);

  // Process EHG_App migrations
  console.log('=== Processing EHG App Migrations ===');
  const appResults = processMigrations(
    analysis.EHG_APP,
    TARGETS.EHG_APP,
    dryRun
  );
  console.log(`Total: ${appResults.total}, Success: ${appResults.success}, Failed: ${appResults.failed}\n`);

  // Process MIXED migrations (manual review)
  console.log('=== Processing MIXED Migrations (Manual Review) ===');
  const mixedResults = processMigrations(
    analysis.MIXED,
    TARGETS.MANUAL_REVIEW,
    dryRun
  );
  console.log(`Total: ${mixedResults.total}, Success: ${mixedResults.success}, Failed: ${mixedResults.failed}\n`);

  // Process UNKNOWN migrations (manual review)
  console.log('=== Processing UNKNOWN Migrations (Manual Review) ===');
  const unknownResults = processMigrations(
    analysis.UNKNOWN,
    TARGETS.MANUAL_REVIEW,
    dryRun
  );
  console.log(`Total: ${unknownResults.total}, Success: ${unknownResults.success}, Failed: ${unknownResults.failed}\n`);

  // Generate manifests
  if (!dryRun || true) {  // Always show manifest preview
    console.log('=== Generating Manifests ===');
    generateManifest(
      engineerResults,
      path.join(TARGETS.EHG_ENGINEER, 'manifest.json'),
      dryRun
    );
    generateManifest(
      appResults,
      path.join(TARGETS.EHG_APP, 'manifest.json'),
      dryRun
    );
    generateManifest(
      { ...mixedResults, ...unknownResults, files: [...mixedResults.files, ...unknownResults.files] },
      path.join(TARGETS.MANUAL_REVIEW, 'manifest.json'),
      dryRun
    );
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`EHG_Engineer: ${engineerResults.success}/${engineerResults.total} migrations`);
  console.log(`EHG App: ${appResults.success}/${appResults.total} migrations`);
  console.log(`Manual Review: ${mixedResults.success + unknownResults.success}/${mixedResults.total + unknownResults.total} migrations`);

  if (dryRun) {
    console.log('\n💡 To execute these changes, run:');
    console.log('   node scripts/consolidate-migrations.cjs --execute');
  } else {
    console.log('\n✅ Migration consolidation complete!');
    console.log('\nNext steps:');
    console.log('1. Review manifest files in each directory');
    console.log('2. Manually review files in archive/migrations/manual_review/');
    console.log('3. Update supabase config.toml for each database');
    console.log('4. Test migration path on fresh databases');
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateFilename, categorizeByContent, processMigrations };
