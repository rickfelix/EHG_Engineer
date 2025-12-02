#!/usr/bin/env node

/**
 * Supabase Instance Migration Script
 *
 * Purpose: Migrate all references from the deprecated Supabase instance
 * (liapbndqlqxdcgpwntbv) to the consolidated instance (dedlbzhpgkmetvhbkyzq)
 *
 * Reference: SD-ARCH-EHG-006
 * Date: 2025-12-01
 *
 * Usage:
 *   node scripts/migrate-supabase-references.mjs           # Dry run (preview changes)
 *   node scripts/migrate-supabase-references.mjs --apply   # Apply changes
 *   node scripts/migrate-supabase-references.mjs --backup  # Create backups before applying
 */

import fs from 'fs';
import path from 'path';

// Configuration
const OLD_PROJECT_ID = 'liapbndqlqxdcgpwntbv';
const NEW_PROJECT_ID = 'dedlbzhpgkmetvhbkyzq';

const OLD_URL = `https://${OLD_PROJECT_ID}.supabase.co`;
const NEW_URL = `https://${NEW_PROJECT_ID}.supabase.co`;

// Old credentials (for reference matching)
const OLD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXBibmRxbHF4ZGNncHdudGJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNzI4MzcsImV4cCI6MjA3MTk0ODgzN30.YlzzH17RYHsFs3TBmKlbmZPJYfUEWU71cAURwTsu8-M';
const OLD_SERVICE_KEY_1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXBibmRxbHF4ZGNncHdudGJ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjM3MjgzNywiZXhwIjoyMDcxOTQ4ODM3fQ.gm_TpB0fW6VKSdKU8H_xYi4k-VcwFwlLR91g1eMrRHI';
const OLD_SERVICE_KEY_2 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXBibmRxbHF4ZGNncHdudGJ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjM3MjgzNywiZXhwIjoyMDcxOTQ4ODM3fQ.5A8kYUx3qBqWJj2K5sB2gH0jF5N5zJ3xY0uP3wE5dKg';
const OLD_SERVICE_KEY_3 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXBibmRxbHF4ZGNncHdudGJ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjM3MjgzNywiZXhwIjoyMDcxOTQ4ODM3fQ.axmlFH-W13Qdxr8VTrCmSwD-evJ93oyX_R2TRKzNEWc';

// New credentials
const NEW_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g';
const NEW_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg';

// Files to update with their specific replacements
const FILES_TO_UPDATE = [
  // EHG Project - Config Files
  {
    path: '/mnt/c/_EHG/ehg/supabase/config.toml',
    category: 'config',
    replacements: [
      { old: `project_id = "${OLD_PROJECT_ID}"`, new: `project_id = "${NEW_PROJECT_ID}"` },
      { old: OLD_URL, new: NEW_URL }
    ]
  },

  // EHG Project - Environment Files
  {
    path: '/mnt/c/_EHG/ehg/.env.test',
    category: 'env',
    replacements: [
      { old: OLD_URL, new: NEW_URL },
      { old: OLD_PROJECT_ID, new: NEW_PROJECT_ID },
      { old: OLD_ANON_KEY, new: NEW_ANON_KEY },
      { old: OLD_SERVICE_KEY_2, new: NEW_SERVICE_KEY }
    ]
  },
  {
    path: '/mnt/c/_EHG/ehg/.env.test.local',
    category: 'env',
    replacements: [
      { old: OLD_URL, new: NEW_URL },
      { old: OLD_ANON_KEY, new: NEW_ANON_KEY }
    ]
  },

  // EHG Project - Scripts with Hardcoded Credentials
  {
    path: '/mnt/c/_EHG/ehg/verify-test-user.cjs',
    category: 'script',
    replacements: [
      { old: OLD_URL, new: NEW_URL },
      { old: OLD_ANON_KEY, new: NEW_ANON_KEY },
      { old: OLD_SERVICE_KEY_1, new: NEW_SERVICE_KEY }
    ]
  },
  {
    path: '/mnt/c/_EHG/ehg/reset-password.cjs',
    category: 'script',
    replacements: [
      { old: OLD_URL, new: NEW_URL },
      { old: OLD_ANON_KEY, new: NEW_ANON_KEY },
      { old: OLD_SERVICE_KEY_3, new: NEW_SERVICE_KEY }
    ]
  },

  // EHG_Engineer Project - Scripts with Hardcoded Credentials
  {
    path: '/mnt/c/_EHG/EHG_Engineer/scripts/check-crewai-columns.mjs',
    category: 'script',
    replacements: [
      { old: OLD_URL, new: NEW_URL },
      { old: OLD_ANON_KEY, new: NEW_ANON_KEY }
    ]
  },
  {
    path: '/mnt/c/_EHG/EHG_Engineer/scripts/check-supabase-migrations.mjs',
    category: 'script',
    replacements: [
      { old: OLD_URL, new: NEW_URL },
      { old: OLD_ANON_KEY, new: NEW_ANON_KEY }
    ]
  },

  // EHG Project - Scripts with Fallbacks (update fallback URLs)
  {
    path: '/mnt/c/_EHG/ehg/scripts/audit-routes.mjs',
    category: 'script-fallback',
    replacements: [
      { old: OLD_URL, new: NEW_URL }
    ]
  },
  {
    path: '/mnt/c/_EHG/ehg/scripts/avatar-generation-worker.js',
    category: 'script-fallback',
    replacements: [
      { old: OLD_URL, new: NEW_URL }
    ]
  },
  {
    path: '/mnt/c/_EHG/ehg/scripts/cleanup-demo-data.js',
    category: 'script-fallback',
    replacements: [
      { old: OLD_URL, new: NEW_URL }
    ]
  },
  {
    path: '/mnt/c/_EHG/ehg/scripts/audit-opportunity-bridge-database.js',
    category: 'script',
    replacements: [
      { old: OLD_URL, new: NEW_URL },
      { old: OLD_ANON_KEY, new: NEW_ANON_KEY }
    ]
  }
];

// Additional files found in original scan - scripts in ehg root
const ADDITIONAL_EHG_SCRIPTS = [
  '/mnt/c/_EHG/ehg/check-crewai-schema.mjs',
  '/mnt/c/_EHG/ehg/check-ideas-schema.js',
  '/mnt/c/_EHG/ehg/check-venture-drafts-schema.mjs',
  '/mnt/c/_EHG/ehg/check-nav-tables.mjs',
  '/mnt/c/_EHG/ehg/query-actual-schema.mjs',
  '/mnt/c/_EHG/ehg/query-nav-routes.mjs',
  '/mnt/c/_EHG/ehg/test-research-api.mjs',
  '/mnt/c/_EHG/ehg/verify-agent-schema.mjs',
  '/mnt/c/_EHG/ehg/validate-ideas-schema-after-migration.js',
  '/mnt/c/_EHG/ehg/database/migrations/apply-rls-fix.mjs',
  '/mnt/c/_EHG/ehg/apply-llm-migration.mjs',
  '/mnt/c/_EHG/ehg/apply-migration-direct.mjs',
  '/mnt/c/_EHG/ehg/apply-migration.mjs',
  '/mnt/c/_EHG/ehg/execute-migration.mjs'
];

// Add these to FILES_TO_UPDATE with generic replacements
ADDITIONAL_EHG_SCRIPTS.forEach(scriptPath => {
  FILES_TO_UPDATE.push({
    path: scriptPath,
    category: 'script-additional',
    replacements: [
      { old: OLD_URL, new: NEW_URL },
      { old: OLD_PROJECT_ID, new: NEW_PROJECT_ID },
      { old: OLD_ANON_KEY, new: NEW_ANON_KEY },
      { old: OLD_SERVICE_KEY_1, new: NEW_SERVICE_KEY },
      { old: OLD_SERVICE_KEY_2, new: NEW_SERVICE_KEY },
      { old: OLD_SERVICE_KEY_3, new: NEW_SERVICE_KEY },
      // Also update dashboard URLs in console messages
      { old: `supabase.com/dashboard/project/${OLD_PROJECT_ID}`, new: `supabase.com/dashboard/project/${NEW_PROJECT_ID}` }
    ]
  });
});

// Agent Platform files
const AGENT_PLATFORM_FILES = [
  '/mnt/c/_EHG/ehg/agent-platform/.env.example',
  '/mnt/c/_EHG/ehg/agent-platform/.env.production'
];

AGENT_PLATFORM_FILES.forEach(filePath => {
  FILES_TO_UPDATE.push({
    path: filePath,
    category: 'agent-platform',
    replacements: [
      { old: OLD_URL, new: NEW_URL },
      { old: OLD_PROJECT_ID, new: NEW_PROJECT_ID },
      { old: OLD_ANON_KEY, new: NEW_ANON_KEY },
      { old: OLD_SERVICE_KEY_1, new: NEW_SERVICE_KEY },
      { old: OLD_SERVICE_KEY_2, new: NEW_SERVICE_KEY },
      { old: OLD_SERVICE_KEY_3, new: NEW_SERVICE_KEY }
    ]
  });
});

// Intentionally excluded files (for auditing/comparison purposes)
const EXCLUDED_FILES = [
  '/mnt/c/_EHG/EHG_Engineer/scripts/comprehensive-db-audit.mjs', // Compares old vs new DB intentionally
  '/mnt/c/_EHG/EHG_Engineer/supabase/migrations/20251201_sync_old_ehg_schema.sql' // Historical migration record
];

// Results tracking
const results = {
  updated: [],
  skipped: [],
  errors: [],
  notFound: [],
  noChanges: []
};

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const createBackups = args.includes('--backup');

console.log('='.repeat(70));
console.log('SUPABASE INSTANCE MIGRATION SCRIPT');
console.log('='.repeat(70));
console.log(`\nOLD Instance: ${OLD_PROJECT_ID} (DEPRECATED)`);
console.log(`NEW Instance: ${NEW_PROJECT_ID} (CONSOLIDATED)`);
console.log(`\nMode: ${dryRun ? 'DRY RUN (preview only)' : 'APPLYING CHANGES'}`);
console.log(`Backups: ${createBackups ? 'ENABLED' : 'DISABLED'}`);
console.log('='.repeat(70));

/**
 * Create backup of a file
 */
function createBackup(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup-${timestamp}`;

  try {
    fs.copyFileSync(filePath, backupPath);
    console.log(`  [BACKUP] Created: ${backupPath}`);
    return backupPath;
  } catch (err) {
    console.error(`  [ERROR] Failed to create backup: ${err.message}`);
    return null;
  }
}

/**
 * Process a single file
 */
function processFile(fileConfig) {
  const { path: filePath, category, replacements } = fileConfig;

  console.log(`\n[${category.toUpperCase()}] ${filePath}`);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.log('  [NOT FOUND] File does not exist');
    results.notFound.push(filePath);
    return;
  }

  // Read file content
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`  [ERROR] Failed to read file: ${err.message}`);
    results.errors.push({ path: filePath, error: err.message });
    return;
  }

  // Check if file contains old references
  const hasOldRefs = content.includes(OLD_PROJECT_ID) || content.includes(OLD_URL);
  if (!hasOldRefs) {
    console.log('  [SKIP] No old references found');
    results.noChanges.push(filePath);
    return;
  }

  // Apply replacements
  let newContent = content;
  let changeCount = 0;

  for (const { old: oldStr, new: newStr } of replacements) {
    if (newContent.includes(oldStr)) {
      const count = (newContent.match(new RegExp(escapeRegExp(oldStr), 'g')) || []).length;
      newContent = newContent.split(oldStr).join(newStr);
      console.log(`  [REPLACE] "${truncate(oldStr, 50)}" -> "${truncate(newStr, 50)}" (${count} occurrences)`);
      changeCount += count;
    }
  }

  if (changeCount === 0) {
    console.log('  [SKIP] No matching patterns found');
    results.noChanges.push(filePath);
    return;
  }

  // In dry run mode, just report what would change
  if (dryRun) {
    console.log(`  [DRY RUN] Would update ${changeCount} occurrences`);
    results.updated.push({ path: filePath, changes: changeCount, dryRun: true });
    return;
  }

  // Create backup if requested
  if (createBackups) {
    const backupPath = createBackup(filePath);
    if (!backupPath) {
      results.errors.push({ path: filePath, error: 'Backup failed' });
      return;
    }
  }

  // Write updated content
  try {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`  [UPDATED] Successfully updated ${changeCount} occurrences`);
    results.updated.push({ path: filePath, changes: changeCount, dryRun: false });
  } catch (err) {
    console.error(`  [ERROR] Failed to write file: ${err.message}`);
    results.errors.push({ path: filePath, error: err.message });
  }
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Truncate string for display
 */
function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

/**
 * Main execution
 */
function main() {
  console.log(`\nProcessing ${FILES_TO_UPDATE.length} files...\n`);

  // Process each file
  for (const fileConfig of FILES_TO_UPDATE) {
    // Skip excluded files
    if (EXCLUDED_FILES.includes(fileConfig.path)) {
      console.log(`\n[EXCLUDED] ${fileConfig.path}`);
      console.log('  [SKIP] Intentionally excluded (used for DB comparison/auditing)');
      results.skipped.push(fileConfig.path);
      continue;
    }

    processFile(fileConfig);
  }

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(70));

  console.log(`\n${dryRun ? 'Would update' : 'Updated'}: ${results.updated.length} files`);
  results.updated.forEach(f => console.log(`  - ${f.path} (${f.changes} changes)`));

  if (results.noChanges.length > 0) {
    console.log(`\nNo changes needed: ${results.noChanges.length} files`);
    results.noChanges.forEach(f => console.log(`  - ${f}`));
  }

  if (results.notFound.length > 0) {
    console.log(`\nNot found: ${results.notFound.length} files`);
    results.notFound.forEach(f => console.log(`  - ${f}`));
  }

  if (results.skipped.length > 0) {
    console.log(`\nSkipped (intentional): ${results.skipped.length} files`);
    results.skipped.forEach(f => console.log(`  - ${f}`));
  }

  if (results.errors.length > 0) {
    console.log(`\nErrors: ${results.errors.length} files`);
    results.errors.forEach(e => console.log(`  - ${e.path}: ${e.error}`));
  }

  console.log('\n' + '='.repeat(70));

  if (dryRun) {
    console.log('\nThis was a DRY RUN. No files were modified.');
    console.log('To apply changes, run: node scripts/migrate-supabase-references.mjs --apply');
    console.log('To create backups first: node scripts/migrate-supabase-references.mjs --apply --backup');
  } else {
    console.log('\nMigration complete!');
    console.log('\nNext steps:');
    console.log('1. Review the changes with: git diff');
    console.log('2. Test the application to ensure connectivity');
    console.log('3. Commit the changes if everything works');
  }

  console.log('='.repeat(70));
}

// Run the script
main();
