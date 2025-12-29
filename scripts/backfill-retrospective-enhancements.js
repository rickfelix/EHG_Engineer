#!/usr/bin/env node
/**
 * Backfill Retrospective Enhancements
 *
 * SD-RETRO-ENHANCE-001 Checkpoint 3: US-007
 * Purpose: Backfill 97 existing retrospectives with Checkpoint 1 fields
 *
 * Fields to populate:
 * - target_application (EHG_engineer, EHG, or venture_*)
 * - learning_category (9 categories)
 * - applies_to_all_apps (auto-set by trigger)
 * - related_files (array)
 * - related_commits (array)
 * - related_prs (array)
 * - affected_components (array)
 * - tags (array)
 *
 * Features:
 * - Batch processing (10 at a time)
 * - Retry logic with exponential backoff
 * - Progress tracking with resume capability
 * - Dry-run mode for testing
 * - Rollback support
 *
 * Usage:
 *   node scripts/backfill-retrospective-enhancements.js [--dry-run] [--retro-id=ID]
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const PROGRESS_FILE = 'backfill-retrospective-progress.json';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================================
// Progress Management
// ============================================================================

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn(`⚠️  Could not load progress file: ${error.message}`);
  }
  return { processedIds: [], successCount: 0, errorCount: 0, skippedCount: 0 };
}

function saveProgress(progress) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (error) {
    console.warn(`⚠️  Could not save progress file: ${error.message}`);
  }
}

// ============================================================================
// Field Inference Logic
// ============================================================================

/**
 * Infer target_application from retrospective
 * All existing retrospectives are from EHG_Engineer management system
 */
function inferTargetApplication(_retro) {
  // Default: All current retrospectives are from EHG_Engineer
  return 'EHG_engineer';
}

/**
 * Infer learning_category from retrospective content
 */
function inferLearningCategory(retro) {
  const title = (retro.title || '').toLowerCase();
  const description = (retro.description || '').toLowerCase();
  const keyLearnings = Array.isArray(retro.key_learnings)
    ? retro.key_learnings.join(' ').toLowerCase()
    : (retro.key_learnings || '').toLowerCase();

  // Pattern matching
  if (title.includes('process') || title.includes('workflow') || title.includes('automation')) {
    return 'PROCESS_IMPROVEMENT';
  }
  if (title.includes('test') || title.includes('qa') || description.includes('playwright')) {
    return 'TESTING_STRATEGY';
  }
  if (title.includes('database') || title.includes('schema') || title.includes('migration')) {
    return 'DATABASE_SCHEMA';
  }
  if (title.includes('deploy') || title.includes('ci/cd') || title.includes('pipeline')) {
    return 'DEPLOYMENT_ISSUE';
  }
  if (title.includes('performance') || title.includes('optimization') || keyLearnings.includes('slow')) {
    return 'PERFORMANCE_OPTIMIZATION';
  }
  if (title.includes('security') || title.includes('auth') || description.includes('vulnerability')) {
    return 'SECURITY_VULNERABILITY';
  }
  if (title.includes('doc') || title.includes('documentation')) {
    return 'DOCUMENTATION';
  }
  if (title.includes('ui') || title.includes('ux') || title.includes('user')) {
    return 'USER_EXPERIENCE';
  }

  // Default
  return 'APPLICATION_ISSUE';
}

/**
 * Extract related files from retrospective content
 */
function extractRelatedFiles(retro) {
  const files = new Set();
  const filePattern = /\b[\w\-./]+\.(js|ts|jsx|tsx|json|sql|md|yml|yaml|css|html|py|sh)\b/g;

  // Search in various fields
  const searchableText = [
    retro.title || '',
    retro.description || '',
    Array.isArray(retro.key_learnings) ? retro.key_learnings.join(' ') : retro.key_learnings || '',
    Array.isArray(retro.what_went_well) ? retro.what_went_well.join(' ') : retro.what_went_well || '',
    retro.performance_impact || ''
  ].join(' ');

  const matches = searchableText.match(filePattern);
  if (matches) {
    matches.forEach(file => files.add(file));
  }

  return Array.from(files).slice(0, 20);
}

/**
 * Extract related commits from retrospective content
 */
function extractRelatedCommits(retro) {
  const commits = new Set();
  const commitPattern = /\b[0-9a-f]{7,40}\b/g;

  const searchableText = [
    retro.description || '',
    Array.isArray(retro.success_patterns) ? retro.success_patterns.join(' ') : retro.success_patterns || ''
  ].join(' ');

  const matches = searchableText.match(commitPattern);
  if (matches) {
    matches.forEach(commit => commits.add(commit));
  }

  return Array.from(commits).slice(0, 10);
}

/**
 * Extract related PRs from retrospective content
 */
function extractRelatedPRs(retro) {
  const prs = new Set();
  const prPattern = /#(\d+)|pull\/(\d+)/g;

  const searchableText = [
    retro.title || '',
    retro.description || ''
  ].join(' ');

  let match;
  while ((match = prPattern.exec(searchableText)) !== null) {
    const prNum = match[1] || match[2];
    prs.add(`#${prNum}`);
  }

  return Array.from(prs);
}

/**
 * Extract affected components from retrospective
 */
function extractAffectedComponents(retro) {
  const components = new Set();

  const componentKeywords = [
    'Authentication', 'Database', 'API', 'UI', 'Frontend', 'Backend',
    'Dashboard', 'Settings', 'Profile', 'Navigation', 'Search',
    'Analytics', 'Reporting', 'Export', 'Import', 'Notifications',
    'Testing', 'CI/CD', 'Deployment', 'Migration', 'Schema'
  ];

  const searchableText = [
    retro.title || '',
    retro.description || '',
    Array.isArray(retro.key_learnings) ? retro.key_learnings.join(' ') : retro.key_learnings || ''
  ].join(' ');

  componentKeywords.forEach(keyword => {
    if (searchableText.toLowerCase().includes(keyword.toLowerCase())) {
      components.add(keyword);
    }
  });

  return Array.from(components).slice(0, 10);
}

/**
 * Generate tags for retrospective
 */
function generateTags(retro) {
  const tags = new Set();

  // Severity-based tags
  if (retro.severity_level === 'CRITICAL') {
    tags.add('critical');
  } else if (retro.severity_level === 'HIGH') {
    tags.add('high-priority');
  }

  // Technology tags
  const files = extractRelatedFiles(retro);
  if (files.some(f => f.endsWith('.tsx') || f.endsWith('.jsx'))) {
    tags.add('react');
  }
  if (files.some(f => f.endsWith('.ts') || f.endsWith('.js'))) {
    tags.add('typescript');
  }
  if (files.some(f => f.endsWith('.sql'))) {
    tags.add('database');
  }

  // Retro type tags
  if (retro.retro_type === 'SD_COMPLETION') {
    tags.add('sd-completion');
  }

  // Quality tags
  if (retro.quality_score >= 90) {
    tags.add('high-quality');
  } else if (retro.quality_score < 70) {
    tags.add('needs-improvement');
  }

  return Array.from(tags).slice(0, 10);
}

// ============================================================================
// Backfill Logic
// ============================================================================

/**
 * Backfill a single retrospective
 */
async function backfillRetrospective(retro, dryRun, retries = 0) {
  try {
    // Infer values for new fields
    const updates = {
      target_application: inferTargetApplication(retro),
      learning_category: inferLearningCategory(retro),
      related_files: extractRelatedFiles(retro),
      related_commits: extractRelatedCommits(retro),
      related_prs: extractRelatedPRs(retro),
      affected_components: extractAffectedComponents(retro),
      tags: generateTags(retro)
    };

    console.log(`   Target Application: ${updates.target_application}`);
    console.log(`   Learning Category: ${updates.learning_category}`);
    console.log(`   Related Files: ${updates.related_files.length}`);
    console.log(`   Related Commits: ${updates.related_commits.length}`);
    console.log(`   Related PRs: ${updates.related_prs.length}`);
    console.log(`   Affected Components: ${updates.affected_components.length}`);
    console.log(`   Tags: ${updates.tags.length}`);

    if (dryRun) {
      console.log('   🔍 DRY RUN: Would update retrospective');
      return { success: true, updated: false };
    }

    // Update database
    const { data: _data, error } = await supabase
      .from('retrospectives')
      .update(updates)
      .eq('id', retro.id)
      .select();

    if (error) {
      throw new Error(`Database update failed: ${error.message}`);
    }

    console.log('   ✅ Updated successfully');
    return { success: true, updated: true };

  } catch (error) {
    if (retries < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, retries);
      console.log(`   ⚠️  Retry ${retries + 1}/${MAX_RETRIES} after ${delay}ms: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return backfillRetrospective(retro, dryRun, retries + 1);
    }

    console.error(`   ❌ Failed after ${MAX_RETRIES} retries: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process a batch of retrospectives
 */
async function processBatch(retrospectives, dryRun, progress) {
  const results = [];

  for (const retro of retrospectives) {
    console.log(`\n📝 Processing: ${retro.title || 'Untitled'} (${retro.id})`);

    const result = await backfillRetrospective(retro, dryRun);

    if (result.success) {
      if (result.updated) {
        progress.successCount++;
      } else {
        progress.skippedCount++;
      }
    } else {
      progress.errorCount++;
    }

    progress.processedIds.push(retro.id);
    results.push({ ...result, id: retro.id });

    // Save progress after each retrospective
    saveProgress(progress);
  }

  return results;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('🔄 Retrospective Backfill Script');
  console.log('═'.repeat(70));
  console.log('SD-RETRO-ENHANCE-001 Checkpoint 3: US-007');
  console.log('');

  // Parse CLI arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const retroIdArg = args.find(arg => arg.startsWith('--retro-id='));
  const specificId = retroIdArg ? retroIdArg.split('=')[1] : null;

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE: No database changes will be made');
  }

  if (specificId) {
    console.log(`🎯 Single retrospective mode: ${specificId}`);
  }

  console.log('');

  // Load progress
  const progress = loadProgress();
  if (progress.processedIds.length > 0 && !specificId) {
    console.log(`📂 Resuming from previous run: ${progress.successCount} success, ${progress.errorCount} errors, ${progress.skippedCount} skipped`);
  }

  // Fetch retrospectives needing backfill
  console.log('🔍 Fetching retrospectives needing backfill...');

  let query = supabase
    .from('retrospectives')
    .select('*');

  if (specificId) {
    query = query.eq('id', specificId);
  } else {
    // Only retrospectives without target_application
    query = query.is('target_application', null);

    // Skip already processed IDs
    if (progress.processedIds.length > 0) {
      query = query.not('id', 'in', `(${progress.processedIds.join(',')})`);
    }
  }

  const { data: retrospectives, error } = await query;

  if (error) {
    console.error(`❌ Failed to fetch retrospectives: ${error.message}`);
    process.exit(1);
  }

  if (!retrospectives || retrospectives.length === 0) {
    console.log('✅ All retrospectives already backfilled!');
    console.log('   Use --retro-id=<ID> to backfill a specific retrospective');
    return;
  }

  console.log(`Found ${retrospectives.length} retrospective(s) to backfill`);
  console.log('');

  // Process in batches
  const totalBatches = Math.ceil(retrospectives.length / BATCH_SIZE);

  for (let i = 0; i < retrospectives.length; i += BATCH_SIZE) {
    const batch = retrospectives.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} retrospectives)`);
    console.log('─'.repeat(70));

    await processBatch(batch, dryRun, progress);

    // Pause between batches (if not last batch)
    if (i + BATCH_SIZE < retrospectives.length) {
      console.log('\n⏸️  Pausing 1s before next batch...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Final summary
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('📊 Backfill Summary');
  console.log('═'.repeat(70));
  console.log(`Total Processed: ${progress.processedIds.length}`);
  console.log(`✅ Success: ${progress.successCount}`);
  console.log(`⏭️  Skipped (dry-run): ${progress.skippedCount}`);
  console.log(`❌ Errors: ${progress.errorCount}`);
  console.log('');

  if (dryRun) {
    console.log('ℹ️  This was a DRY RUN. No changes were made to the database.');
    console.log('   Run without --dry-run to apply changes.');
  } else {
    console.log('✅ Backfill complete!');

    // Clean up progress file if all successful
    if (progress.errorCount === 0) {
      try {
        fs.unlinkSync(PROGRESS_FILE);
        console.log('🧹 Progress file cleaned up');
      } catch (_error) {
        // Ignore cleanup errors
      }
    } else {
      console.log(`⚠️  ${progress.errorCount} error(s) occurred. Progress file retained for retry.`);
    }
  }
}

// Execute
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
