#!/usr/bin/env node
/**
 * Cleanup Documentation in Prohibited Locations
 * Moves .md files from src/, lib/, scripts/, tests/ to correct docs/ locations
 *
 * Usage:
 *   node scripts/cleanup-prohibited-locations.js --dry-run  # Preview changes
 *   node scripts/cleanup-prohibited-locations.js            # Execute moves
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Prohibited locations for .md files
const PROHIBITED_LOCATIONS = [
  { dir: 'src', label: 'Source code' },
  { dir: 'lib', label: 'Libraries' },
  { dir: 'scripts', label: 'Scripts' },
  { dir: 'tests', label: 'Tests' },
  { dir: 'public', label: 'Public assets' }
];

// Special handling for certain paths
const SPECIAL_MAPPINGS = {
  // Scripts archive - these are likely archived documentation
  'scripts/archive': 'docs/archive/2026/scripts',

  // Agent documentation
  'lib/agents': 'docs/reference/sub-agents',

  // Test documentation
  'tests': 'docs/05_testing',

  // Source README files
  'src/db': 'docs/database',
  'src/components': 'docs/04_features',
  'src/pages': 'docs/04_features',
  'src/lib': 'docs/reference',
  'src/utils': 'docs/reference',
  'src/hooks': 'docs/reference',
  'src/services': 'docs/02_api'
};

// File placement rubric
function classifyFile(relativePath, content) {
  const _lowerPath = relativePath.toLowerCase();
  const _lowerContent = content.toLowerCase().substring(0, 1000);

  // Check special mappings first
  for (const [prefix, target] of Object.entries(SPECIAL_MAPPINGS)) {
    if (relativePath.startsWith(prefix + '/') || relativePath.startsWith(prefix + '\\')) {
      return target;
    }
  }

  // Database-related
  if (/database|schema|migration|rls|supabase|db/i.test(relativePath)) {
    return 'docs/database';
  }

  // Testing-related
  if (/test|spec|e2e|playwright/i.test(relativePath)) {
    return 'docs/05_testing';
  }

  // API-related
  if (/api|endpoint|route/i.test(relativePath)) {
    return 'docs/02_api';
  }

  // Agent/Sub-agent documentation
  if (/agent/i.test(relativePath)) {
    return 'docs/reference/sub-agents';
  }

  // Archive content (scripts/archive, etc.)
  if (/archive/i.test(relativePath)) {
    return 'docs/archive/2026/misc';
  }

  // README files - usually belong with what they document
  if (relativePath.endsWith('README.md')) {
    // Extract parent directory context
    const parentDir = path.dirname(relativePath);
    if (/db|database/i.test(parentDir)) {
      return 'docs/database';
    }
    if (/component|ui/i.test(parentDir)) {
      return 'docs/04_features';
    }
    if (/agent/i.test(parentDir)) {
      return 'docs/reference/sub-agents';
    }
    return 'docs/reference';
  }

  // Default: archive with location prefix
  const topLevel = relativePath.split(/[/\\]/)[0];
  return `docs/archive/2026/${topLevel}`;
}

function findProhibitedMdFiles() {
  const results = [];

  for (const { dir, label } of PROHIBITED_LOCATIONS) {
    const dirPath = path.join(ROOT_DIR, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = findMdFilesRecursive(dirPath, dir);
    for (const file of files) {
      results.push({
        ...file,
        prohibitedLocation: dir,
        locationLabel: label
      });
    }
  }

  return results;
}

function findMdFilesRecursive(dir, relativeTo) {
  const results = [];

  if (!fs.existsSync(dir)) return results;

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const relativePath = path.relative(path.join(ROOT_DIR, relativeTo), fullPath);
      const rootRelative = path.join(relativeTo, relativePath);

      // Skip node_modules and .git
      if (item.name === 'node_modules' || item.name === '.git') continue;

      if (item.isDirectory()) {
        results.push(...findMdFilesRecursive(fullPath, relativeTo));
      } else if (item.isFile() && item.name.endsWith('.md')) {
        results.push({
          filename: item.name,
          fullPath,
          relativePath: rootRelative
        });
      }
    }
  } catch (_error) {
    // Skip directories we can't read
  }

  return results;
}

function generateMovePlan(files) {
  const plan = [];

  for (const file of files) {
    const content = fs.readFileSync(file.fullPath, 'utf8');
    const targetDir = classifyFile(file.relativePath, content);
    const targetPath = path.join(ROOT_DIR, targetDir, file.filename);

    plan.push({
      ...file,
      source: file.relativePath,
      targetDir,
      target: path.join(targetDir, file.filename),
      exists: fs.existsSync(targetPath)
    });
  }

  return plan;
}

function executeMove(plan, dryRun = true) {
  const results = { moved: [], skipped: [], errors: [] };

  for (const item of plan) {
    if (item.exists) {
      results.skipped.push({ ...item, reason: 'Target already exists' });
      continue;
    }

    if (dryRun) {
      results.moved.push(item);
      continue;
    }

    try {
      // Ensure target directory exists
      const targetDir = path.join(ROOT_DIR, item.targetDir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Move file
      const targetPath = path.join(ROOT_DIR, item.target);
      fs.renameSync(item.fullPath, targetPath);

      results.moved.push(item);
    } catch (error) {
      results.errors.push({ ...item, error: error.message });
    }
  }

  return results;
}

function cleanEmptyDirs(dirs) {
  for (const { dir } of dirs) {
    const dirPath = path.join(ROOT_DIR, dir);
    cleanEmptyDirsRecursive(dirPath);
  }
}

function cleanEmptyDirsRecursive(dir) {
  if (!fs.existsSync(dir)) return;

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    // First clean subdirectories
    for (const item of items) {
      if (item.isDirectory() && item.name !== 'node_modules' && item.name !== '.git') {
        cleanEmptyDirsRecursive(path.join(dir, item.name));
      }
    }

    // Then check if this directory is now empty
    const remaining = fs.readdirSync(dir);
    if (remaining.length === 0) {
      fs.rmdirSync(dir);
    }
  } catch (_error) {
    // Skip errors
  }
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');
  const cleanDirs = process.argv.includes('--clean-empty');

  console.log('🧹 Prohibited Locations Documentation Cleanup');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log(`Locations: ${PROHIBITED_LOCATIONS.map(l => l.dir).join(', ')}`);
  console.log('');

  // Find files in prohibited locations
  const files = findProhibitedMdFiles();
  console.log(`Found ${files.length} .md files in prohibited locations`);

  if (files.length === 0) {
    console.log('✅ No files to move');
    process.exit(0);
  }

  // Group by location for display
  const byLocation = {};
  for (const file of files) {
    if (!byLocation[file.prohibitedLocation]) {
      byLocation[file.prohibitedLocation] = [];
    }
    byLocation[file.prohibitedLocation].push(file);
  }

  console.log('\n📊 Files by location:');
  for (const [loc, locFiles] of Object.entries(byLocation)) {
    console.log(`   ${loc}/: ${locFiles.length} files`);
  }

  // Generate move plan
  const plan = generateMovePlan(files);

  // Show plan (grouped by target)
  const byTarget = {};
  for (const item of plan) {
    if (!byTarget[item.targetDir]) {
      byTarget[item.targetDir] = [];
    }
    byTarget[item.targetDir].push(item);
  }

  console.log('\n📋 Move Plan (by target):');
  for (const [target, items] of Object.entries(byTarget)) {
    console.log(`\n   → ${target}/`);
    for (const item of items.slice(0, 5)) {
      const status = item.exists ? '⚠️' : '✓';
      console.log(`      ${status} ${item.source}`);
    }
    if (items.length > 5) {
      console.log(`      ... and ${items.length - 5} more`);
    }
  }

  // Execute or simulate
  console.log('\n🔄 Executing...');
  const results = executeMove(plan, dryRun);

  // Clean empty directories if requested and not dry run
  if (cleanDirs && !dryRun) {
    console.log('\n🗑️  Cleaning empty directories...');
    cleanEmptyDirs(PROHIBITED_LOCATIONS);
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Moved: ${results.moved.length}`);
  console.log(`   Skipped: ${results.skipped.length}`);
  console.log(`   Errors: ${results.errors.length}`);

  if (results.skipped.length > 0 && verbose) {
    console.log('\n⚠️  Skipped files:');
    for (const item of results.skipped) {
      console.log(`   ${item.source}: ${item.reason}`);
    }
  }

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const item of results.errors) {
      console.log(`   ${item.source}: ${item.error}`);
    }
  }

  if (dryRun) {
    console.log('\n💡 This was a dry run. Run without --dry-run to execute moves.');
    console.log('   Add --clean-empty to remove empty directories after moving.');
  } else {
    console.log('\n✅ Cleanup complete!');
    console.log('   Run `git status` to see moved files');
    console.log('   Run `npm run docs:validate-links` to check for broken references');
  }

  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
