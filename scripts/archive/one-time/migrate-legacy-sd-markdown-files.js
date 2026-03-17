#!/usr/bin/env node

/**
 * Migrate Legacy SD Markdown Files to Database-First Architecture
 *
 * SD: SD-TECH-DEBT-DOCS-001
 * PRD: PRD-SD-TECH-DEBT-DOCS-001
 * User Story: US-002 - Create Content Migration Script
 *
 * This script:
 * 1. Archives SD implementation directories to .git/archived-markdown/
 * 2. Migrates lessons learned content to database (retrospectives table)
 * 3. Logs all operations for audit trail
 *
 * Usage: node scripts/migrate-legacy-sd-markdown-files.js [--dry-run]
 */

import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ROOT = join(__dirname, '..');
const ARCHIVE_DIR = join(PROJECT_ROOT, '.git', 'archived-markdown');

// Supabase setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Migration log
const migrationLog = {
  startTime: new Date().toISOString(),
  dryRun: DRY_RUN,
  archivedDirectories: [],
  archivedFiles: [],
  migratedToDatabase: [],
  errors: [],
  skipped: []
};

// Directories to archive (completed SD documentation)
const DIRECTORIES_TO_ARCHIVE = [
  {
    source: 'docs/strategic-directives/SD-CREWAI-ARCHITECTURE-001',
    reason: 'SD completed - historical documentation',
    fileCount: 25,
    estimatedSize: '1.5MB'
  },
  {
    source: 'docs/strategic_directives/SD-CREWAI-COMPETITIVE-INTELLIGENCE-001',
    reason: 'SD completed - testing documentation',
    fileCount: 4,
    estimatedSize: '70KB'
  }
];

// Files to migrate to database (lessons learned)
const FILES_TO_MIGRATE = [
  {
    source: 'docs/lessons-learned-database-agent-rls-policy-chain.md',
    targetTable: 'retrospectives',
    contentType: 'lessons_learned'
  },
  {
    source: 'docs/lessons-learned/QF-20251120-702-python-none-strip-error.md',
    targetTable: 'retrospectives',
    contentType: 'quick_fix_lesson'
  },
  {
    source: 'docs/lessons-learned/always-check-existing-patterns-first.md',
    targetTable: 'retrospectives',
    contentType: 'pattern_lesson'
  },
  {
    source: 'docs/lessons-learned/user-story-validation-gap.md',
    targetTable: 'retrospectives',
    contentType: 'validation_lesson'
  },
  {
    source: 'docs/lessons-learned/user-story-validation-monitoring.md',
    targetTable: 'retrospectives',
    contentType: 'monitoring_lesson'
  }
];

/**
 * Ensure archive directory exists
 */
function ensureArchiveDir(subDir = '') {
  const targetDir = subDir ? join(ARCHIVE_DIR, subDir) : ARCHIVE_DIR;
  if (!fs.existsSync(targetDir)) {
    if (!DRY_RUN) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    console.log(`📁 Created archive directory: ${targetDir}`);
  }
  return targetDir;
}

/**
 * Archive a directory by moving it to .git/archived-markdown/
 */
function archiveDirectory(config) {
  const sourcePath = join(PROJECT_ROOT, config.source);
  const dirName = basename(config.source);
  const targetPath = join(ARCHIVE_DIR, dirName);

  console.log(`\n📦 Archiving directory: ${config.source}`);
  console.log(`   Reason: ${config.reason}`);
  console.log(`   Files: ${config.fileCount}, Size: ${config.estimatedSize}`);

  if (!fs.existsSync(sourcePath)) {
    console.log('   ⚠️  Source directory not found - may already be archived');
    migrationLog.skipped.push({ path: config.source, reason: 'not_found' });
    return false;
  }

  if (fs.existsSync(targetPath)) {
    console.log('   ⚠️  Target already exists in archive');
    migrationLog.skipped.push({ path: config.source, reason: 'already_archived' });
    return false;
  }

  if (DRY_RUN) {
    console.log(`   🔍 [DRY RUN] Would move to: ${targetPath}`);
    migrationLog.archivedDirectories.push({ ...config, dryRun: true });
    return true;
  }

  try {
    // Ensure parent archive directory exists
    ensureArchiveDir();

    // Move directory
    fs.renameSync(sourcePath, targetPath);

    // Create migration metadata file
    const metadataPath = join(targetPath, '_migration-metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify({
      originalPath: config.source,
      archivedAt: new Date().toISOString(),
      reason: config.reason,
      sd: 'SD-TECH-DEBT-DOCS-001'
    }, null, 2));

    console.log('   ✅ Archived successfully');
    migrationLog.archivedDirectories.push(config);
    return true;
  } catch (error) {
    console.error(`   ❌ Error archiving: ${error.message}`);
    migrationLog.errors.push({ path: config.source, error: error.message });
    return false;
  }
}

/**
 * Extract title and key info from markdown content
 */
function parseMarkdownContent(content, filename) {
  // Extract title from first H1
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : basename(filename, '.md');

  // Extract any summary/overview section
  const summaryMatch = content.match(/##\s*(Summary|Overview|Executive Summary)\s*\n([\s\S]*?)(?=\n##|\n$)/i);
  const summary = summaryMatch ? summaryMatch[2].trim().slice(0, 500) : '';

  // Extract key lessons if present
  const lessonsMatch = content.match(/##\s*(Key Lessons|Lessons Learned|Takeaways)\s*\n([\s\S]*?)(?=\n##|\n$)/i);
  const lessons = lessonsMatch ? lessonsMatch[2].trim() : '';

  return { title, summary, lessons, fullContent: content };
}

/**
 * Migrate a lessons learned file to database
 */
async function migrateToDatabase(config) {
  const sourcePath = join(PROJECT_ROOT, config.source);

  console.log(`\n📄 Migrating to database: ${config.source}`);
  console.log(`   Target table: ${config.targetTable}`);
  console.log(`   Content type: ${config.contentType}`);

  if (!fs.existsSync(sourcePath)) {
    console.log('   ⚠️  Source file not found');
    migrationLog.skipped.push({ path: config.source, reason: 'not_found' });
    return false;
  }

  const content = fs.readFileSync(sourcePath, 'utf8');
  const parsed = parseMarkdownContent(content, config.source);
  const fileSize = fs.statSync(sourcePath).size;

  console.log(`   Title: ${parsed.title}`);
  console.log(`   Size: ${(fileSize / 1024).toFixed(1)}KB`);

  if (DRY_RUN) {
    console.log(`   🔍 [DRY RUN] Would insert into ${config.targetTable}`);
    migrationLog.migratedToDatabase.push({ ...config, title: parsed.title, dryRun: true });
    return true;
  }

  try {
    // Insert into retrospectives table as a lessons learned entry
    // Schema reference: docs/reference/schema/engineer/tables/retrospectives.md
    // Valid values from constraints:
    // - target_application: 'EHG' or 'EHG_Engineer'
    // - retro_type: SPRINT, SD_COMPLETION, INCIDENT, MILESTONE, WEEKLY, MONTHLY, ARCHITECTURE_DECISION, RELEASE
    // - status: DRAFT, PUBLISHED, ARCHIVED
    // - learning_category: APPLICATION_ISSUE, PROCESS_IMPROVEMENT, TESTING_STRATEGY, DATABASE_SCHEMA, etc.
    const retrospectiveData = {
      sd_id: 'SD-TECH-DEBT-DOCS-001', // Link to this migration SD
      retro_type: 'MILESTONE', // Using MILESTONE for migrated lessons learned
      title: `[Migrated] ${parsed.title}`,
      description: parsed.summary || 'Content migrated from legacy markdown file.',
      what_went_well: [{ item: 'Successfully migrated to database-first architecture' }],
      key_learnings: [{ lesson: parsed.lessons || parsed.fullContent.slice(0, 2000) }],
      status: 'PUBLISHED', // DRAFT, PUBLISHED, or ARCHIVED
      quality_score: 70, // Default score for migrated content
      target_application: 'EHG_Engineer', // 'EHG' or 'EHG_Engineer' (case-sensitive)
      learning_category: 'PROCESS_IMPROVEMENT', // Required field
      tags: ['migrated', 'legacy-cleanup', config.contentType],
      related_files: [config.source],
      bmad_insights: {
        migrated_from: config.source,
        migrated_at: new Date().toISOString(),
        original_size_bytes: fileSize,
        content_type: config.contentType,
        full_content_available: true
      }
    };

    const { data, error } = await supabase
      .from('retrospectives')
      .insert(retrospectiveData)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    console.log(`   ✅ Inserted into database (ID: ${data.id})`);

    // Archive the original file
    const archiveTarget = join(ARCHIVE_DIR, 'lessons-learned', basename(config.source));
    ensureArchiveDir('lessons-learned');
    fs.renameSync(sourcePath, archiveTarget);
    console.log('   ✅ Original file archived');

    migrationLog.migratedToDatabase.push({
      ...config,
      title: parsed.title,
      dbId: data.id,
      archivedTo: archiveTarget
    });
    return true;
  } catch (error) {
    console.error(`   ❌ Error migrating: ${error.message}`);
    migrationLog.errors.push({ path: config.source, error: error.message });
    return false;
  }
}

/**
 * Clean up empty directories
 */
function cleanupEmptyDirs() {
  const dirsToCheck = [
    'docs/strategic-directives',
    'docs/strategic_directives',
    'docs/lessons-learned'
  ];

  for (const dir of dirsToCheck) {
    const fullPath = join(PROJECT_ROOT, dir);
    if (fs.existsSync(fullPath)) {
      try {
        const contents = fs.readdirSync(fullPath);
        if (contents.length === 0) {
          if (!DRY_RUN) {
            fs.rmdirSync(fullPath);
          }
          console.log(`🧹 Removed empty directory: ${dir}`);
        }
      } catch (_e) {
        // Directory not empty or other issue, skip
      }
    }
  }
}

/**
 * Write migration log
 */
function writeMigrationLog() {
  migrationLog.endTime = new Date().toISOString();
  const logPath = join(PROJECT_ROOT, 'docs', 'analysis', 'legacy-sd-migration-log.json');

  if (!DRY_RUN) {
    fs.writeFileSync(logPath, JSON.stringify(migrationLog, null, 2));
  }

  console.log(`\n📊 Migration log saved to: ${logPath}`);
}

/**
 * Print summary
 */
function printSummary() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes made)' : '✅ LIVE RUN'}`);
  console.log(`Directories archived: ${migrationLog.archivedDirectories.length}`);
  console.log(`Files migrated to DB: ${migrationLog.migratedToDatabase.length}`);
  console.log(`Items skipped: ${migrationLog.skipped.length}`);
  console.log(`Errors: ${migrationLog.errors.length}`);

  if (migrationLog.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    for (const err of migrationLog.errors) {
      console.log(`   - ${err.path}: ${err.error}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to execute migration');
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Legacy SD Markdown Migration Script');
  console.log('='.repeat(70));
  console.log('SD: SD-TECH-DEBT-DOCS-001');
  console.log('PRD: PRD-SD-TECH-DEBT-DOCS-001');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('='.repeat(70));

  // Ensure archive directory exists
  ensureArchiveDir();

  // Step 1: Archive directories
  console.log('\n📦 STEP 1: Archiving SD Implementation Directories');
  for (const config of DIRECTORIES_TO_ARCHIVE) {
    archiveDirectory(config);
  }

  // Step 2: Migrate lessons learned to database
  console.log('\n📄 STEP 2: Migrating Lessons Learned to Database');
  for (const config of FILES_TO_MIGRATE) {
    await migrateToDatabase(config);
  }

  // Step 3: Cleanup
  console.log('\n🧹 STEP 3: Cleanup');
  cleanupEmptyDirs();

  // Step 4: Write log and summary
  writeMigrationLog();
  printSummary();
}

// Execute
main().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
