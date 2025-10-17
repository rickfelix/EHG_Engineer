#!/usr/bin/env node
/**
 * Fix APP001 Migration Filename Collisions
 * Reads original migration files and generates descriptive filenames
 *
 * Usage: node scripts/fix-app001-collisions.cjs [--dry-run|--execute]
 */

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, '../supabase/ehg_app/migrations/manifest.json');
const MIGRATIONS_DIR = path.join(__dirname, '../supabase/ehg_app/migrations');

/**
 * Analyze SQL file content to determine purpose
 */
function analyzeSQLContent(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').slice(0, 100); // First 100 lines

    // Look for table names in CREATE TABLE statements
    const tableMatches = content.match(/CREATE TABLE (\w+)/gi);
    if (tableMatches && tableMatches.length > 0) {
      const tableName = tableMatches[0].replace(/CREATE TABLE /i, '').toLowerCase();
      return `schema_${tableName}`;
    }

    // Look for ALTER TABLE statements
    const alterMatches = content.match(/ALTER TABLE (\w+)/gi);
    if (alterMatches && alterMatches.length > 0) {
      const tableName = alterMatches[0].replace(/ALTER TABLE /i, '').toLowerCase();
      return `alter_${tableName}`;
    }

    // Look for INSERT statements (seed data)
    const insertMatches = content.match(/INSERT INTO (\w+)/gi);
    if (insertMatches && insertMatches.length > 0) {
      const tableName = insertMatches[0].replace(/INSERT INTO /i, '').toLowerCase();
      return `data_seed_${tableName}`;
    }

    // Look for CREATE POLICY (RLS)
    if (content.includes('CREATE POLICY') || content.includes('ENABLE ROW LEVEL SECURITY')) {
      const policyMatch = content.match(/ON (\w+)/i);
      if (policyMatch) {
        return `rls_${policyMatch[1].toLowerCase()}`;
      }
      return 'rls_policies';
    }

    // Look for CREATE TYPE (enums)
    const typeMatches = content.match(/CREATE TYPE (\w+)/gi);
    if (typeMatches && typeMatches.length > 0) {
      const typeName = typeMatches[0].replace(/CREATE TYPE /i, '').toLowerCase();
      return `schema_enum_${typeName}`;
    }

    // Look for CREATE FUNCTION
    const functionMatches = content.match(/CREATE FUNCTION (\w+)/gi);
    if (functionMatches && functionMatches.length > 0) {
      const funcName = functionMatches[0].replace(/CREATE FUNCTION /i, '').toLowerCase();
      return `function_${funcName}`;
    }

    // Look for CREATE INDEX
    const indexMatches = content.match(/CREATE INDEX (\w+)/gi);
    if (indexMatches && indexMatches.length > 0) {
      const indexName = indexMatches[0].replace(/CREATE INDEX /i, '').toLowerCase();
      return `index_${indexName}`;
    }

    // Check for comments at the top
    const commentMatch = content.match(/^--\s*(.+)/);
    if (commentMatch) {
      const description = commentMatch[1]
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .substring(0, 50);
      return description;
    }

    return 'migration';
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
    return 'unknown';
  }
}

/**
 * Extract timestamp from original filename
 */
function extractTimestamp(filename) {
  const match = filename.match(/^(\d{14})/);
  return match ? match[1] : null;
}

/**
 * Generate new filename based on analysis
 */
function generateNewFilename(originalPath, category) {
  const originalFilename = path.basename(originalPath);
  const timestamp = extractTimestamp(originalFilename);

  if (!timestamp) {
    console.error(`Could not extract timestamp from ${originalFilename}`);
    return null;
  }

  const description = analyzeSQLContent(originalPath);

  // If category is provided and not already in description, add it
  let finalDescription = description;
  if (category && !description.startsWith(category + '_')) {
    finalDescription = `${category}_${description}`;
  }

  return `${timestamp}_${finalDescription}.sql`;
}

/**
 * Find migrations that need renaming
 */
function findCollisions(manifest) {
  const filenameCounts = {};
  const collisions = [];

  for (const migration of manifest.migrations) {
    const newFilename = path.basename(migration.new_path);

    // Count occurrences
    if (!filenameCounts[newFilename]) {
      filenameCounts[newFilename] = [];
    }
    filenameCounts[newFilename].push(migration);
  }

  // Find files with empty or duplicate names
  for (const [filename, migrations] of Object.entries(filenameCounts)) {
    // Empty description (ends with just category or nothing)
    if (filename.match(/(_\.sql|_schema_\.sql|_data_\.sql|_rls_\.sql)$/)) {
      collisions.push(...migrations);
    }
    // Multiple files with same name
    else if (migrations.length > 1) {
      collisions.push(...migrations);
    }
  }

  return collisions;
}

/**
 * Rename migrations
 */
function renameMigrations(collisions, dryRun = true) {
  const renameMap = [];

  for (const collision of collisions) {
    const originalPath = path.join(__dirname, '..', collision.original_path);
    const currentPath = path.join(__dirname, '..', collision.new_path);
    const category = collision.category;

    const newFilename = generateNewFilename(originalPath, category);

    if (!newFilename) {
      console.error(`Skipping ${collision.original_path} - could not generate filename`);
      continue;
    }

    const newPath = path.join(MIGRATIONS_DIR, newFilename);

    if (dryRun) {
      console.log(`[DRY RUN] Would rename:`);
      console.log(`  FROM: ${path.basename(currentPath)}`);
      console.log(`  TO:   ${newFilename}`);
      console.log(`  ORIGINAL: ${collision.original_path}`);
      console.log('');
    } else {
      try {
        if (fs.existsSync(currentPath)) {
          fs.renameSync(currentPath, newPath);
          console.log(`✓ Renamed ${path.basename(currentPath)} → ${newFilename}`);
        } else {
          console.log(`⚠ File not found: ${currentPath}`);
        }
      } catch (error) {
        console.error(`✗ Failed to rename ${currentPath}: ${error.message}`);
      }
    }

    renameMap.push({
      original: collision.original_path,
      oldNew: collision.new_path,
      newPath: `supabase/ehg_app/migrations/${newFilename}`,
      category
    });
  }

  return renameMap;
}

/**
 * Update manifest with new paths
 */
function updateManifest(renameMap, dryRun = true) {
  if (dryRun) {
    console.log('[DRY RUN] Would update manifest with new paths');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  for (const rename of renameMap) {
    const migration = manifest.migrations.find(m => m.original_path === rename.original);
    if (migration) {
      migration.new_path = rename.newPath;
    }
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('✓ Updated manifest.json');
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('=== Fix APP001 Migration Collisions ===\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No files will be modified\n');
  } else {
    console.log('⚠️  EXECUTE MODE - Files will be renamed\n');
  }

  // Load manifest
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('❌ Manifest not found:', MANIFEST_PATH);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  // Find collisions
  console.log('=== Finding Collisions ===');
  const collisions = findCollisions(manifest);
  console.log(`Found ${collisions.length} files that need renaming\n`);

  if (collisions.length === 0) {
    console.log('✅ No collisions found!');
    return;
  }

  // Rename migrations
  console.log('=== Renaming Files ===');
  const renameMap = renameMigrations(collisions, dryRun);
  console.log(`Processed ${renameMap.length} renames\n`);

  // Update manifest
  console.log('=== Updating Manifest ===');
  updateManifest(renameMap, dryRun);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Files to rename: ${collisions.length}`);
  console.log(`Successfully processed: ${renameMap.length}`);

  if (dryRun) {
    console.log('\n💡 To execute these changes, run:');
    console.log('   node scripts/fix-app001-collisions.cjs --execute');
  } else {
    console.log('\n✅ Collision fixes complete!');
    console.log('\nNext steps:');
    console.log('1. Verify renamed files');
    console.log('2. Check manifest.json');
    console.log('3. Test migration path');
  }
}

if (require.main === module) {
  main();
}

module.exports = { analyzeSQLContent, generateNewFilename, findCollisions };
