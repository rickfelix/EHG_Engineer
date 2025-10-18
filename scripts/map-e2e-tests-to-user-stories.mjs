#!/usr/bin/env node
/**
 * Map E2E Tests to User Stories (Automated)
 *
 * Purpose:
 * - Scan E2E test files for US-XXX references
 * - Map test file paths to user_stories table
 * - Update e2e_test_path and e2e_test_status columns
 * - Enforce 100% user story coverage requirement
 *
 * Root Cause:
 * - LEO Protocol requires user story → E2E test mapping
 * - But no automation existed to create/maintain this mapping
 * - Gap: User stories created in PLAN, tests in EXEC, but no reconnection step
 *
 * Usage:
 *   node scripts/map-e2e-tests-to-user-stories.mjs SD-VIF-INTEL-001
 *   node scripts/map-e2e-tests-to-user-stories.mjs SD-VIF-INTEL-001 --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const EHG_APP_PATH = '/mnt/c/_EHG/ehg';
const E2E_TEST_DIR = `${EHG_APP_PATH}/tests/e2e`;

/**
 * Recursively find all .spec.ts files in directory
 */
async function findTestFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await findTestFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Scan E2E test files and extract US-XXX references
 *
 * @returns {Promise<Array>} Array of { storyKey, testFilePath, testName }
 */
async function scanE2ETestFiles() {
  console.log(`📂 Scanning E2E test files in ${E2E_TEST_DIR}...\n`);

  // Find all .spec.ts files
  const testFiles = await findTestFiles(E2E_TEST_DIR);
  console.log(`   Found ${testFiles.length} test files\n`);

  const mappings = [];

  for (const file of testFiles) {
    const content = await fs.readFile(file, 'utf-8');
    const relativePath = file.replace(`${EHG_APP_PATH}/`, '');

    // Extract all test() declarations with US-XXX references
    // Matches: test('US-001: Description', async ({ page }) => {
    // Matches: test("US-002: Description", async ({ page }) => {
    const regex = /test\s*\(\s*['"]((US-[A-Z0-9-]+):([^'"]+))['"]/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const fullTestName = match[1]; // "US-001: Description"
      const storyKey = match[2];     // "US-001"
      const description = match[3].trim(); // "Description"

      mappings.push({
        storyKey,
        testFilePath: relativePath,
        testName: fullTestName,
        description
      });
    }
  }

  console.log(`   Extracted ${mappings.length} US-XXX references from tests\n`);
  return mappings;
}

/**
 * Get all user stories for SD
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Array>} User stories
 */
async function getUserStories(sdId) {
  const { data, error } = await supabase
    .from('user_stories')
    .select('id, story_key, title, e2e_test_path, e2e_test_status')
    .eq('sd_id', sdId)
    .order('story_key');

  if (error) {
    throw new Error(`Failed to fetch user stories: ${error.message}`);
  }

  return data || [];
}

/**
 * Map E2E tests to user stories and update database
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {boolean} dryRun - If true, don't update database
 * @returns {Promise<Object>} Mapping results
 */
async function mapE2ETestsToUserStories(sdId, dryRun = false) {
  console.log('═'.repeat(70));
  console.log(`🔗 Mapping E2E Tests to User Stories: ${sdId}`);
  console.log('═'.repeat(70));
  console.log('');

  // Step 1: Get user stories from database
  console.log('📊 Step 1: Fetching user stories from database...\n');
  const userStories = await getUserStories(sdId);
  console.log(`   Found ${userStories.length} user stories for ${sdId}\n`);

  if (userStories.length === 0) {
    console.log('❌ No user stories found. Exiting.\n');
    return { success: false, error: 'No user stories found' };
  }

  // Step 2: Scan E2E test files
  console.log('🔍 Step 2: Scanning E2E test files...\n');
  const testMappings = await scanE2ETestFiles();

  if (testMappings.length === 0) {
    console.log('❌ No E2E tests with US-XXX references found. Exiting.\n');
    return { success: false, error: 'No E2E tests found' };
  }

  // Step 3: Match user stories to test files
  console.log('🔗 Step 3: Matching user stories to E2E tests...\n');

  const updates = [];
  const matched = [];
  const unmatchedStories = [];

  for (const story of userStories) {
    // Find all test references for this story
    // Match either exact key or SD-prefixed key (e.g., "US-001" matches "SD-VIF-INTEL-001:US-001")
    const testRefs = testMappings.filter(m =>
      m.storyKey === story.story_key || story.story_key.endsWith(`:${m.storyKey}`)
    );

    if (testRefs.length > 0) {
      // Use first test file path (most tests have 1 file per story)
      const primaryTest = testRefs[0];

      updates.push({
        id: story.id,
        story_key: story.story_key,
        title: story.title,
        old_test_path: story.e2e_test_path,
        new_test_path: primaryTest.testFilePath,
        test_count: testRefs.length
      });

      matched.push({
        story_key: story.story_key,
        test_file: primaryTest.testFilePath,
        test_count: testRefs.length
      });
    } else {
      unmatchedStories.push({
        story_key: story.story_key,
        title: story.title
      });
    }
  }

  // Step 4: Display mapping results
  console.log('📋 Mapping Results:\n');
  console.log(`   ✅ Matched: ${matched.length} / ${userStories.length} user stories`);
  console.log(`   ❌ Unmatched: ${unmatchedStories.length} user stories\n`);

  if (matched.length > 0) {
    console.log('   Matched User Stories:');
    matched.forEach((m, idx) => {
      console.log(`   ${idx + 1}. ${m.story_key} → ${m.test_file} (${m.test_count} test${m.test_count > 1 ? 's' : ''})`);
    });
    console.log('');
  }

  if (unmatchedStories.length > 0) {
    console.log('   ⚠️  Unmatched User Stories (no E2E tests found):');
    unmatchedStories.forEach((s, idx) => {
      console.log(`   ${idx + 1}. ${s.story_key}: ${s.title}`);
    });
    console.log('');
  }

  // Step 5: Update database (unless dry run)
  if (dryRun) {
    console.log('🔍 DRY RUN MODE: No database updates performed\n');
    console.log(`   Would update ${updates.length} user stories\n`);
    return {
      success: true,
      dryRun: true,
      matched: matched.length,
      unmatched: unmatchedStories.length,
      total: userStories.length,
      updates
    };
  }

  console.log('💾 Step 5: Updating database...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const update of updates) {
    const { error } = await supabase
      .from('user_stories')
      .update({
        e2e_test_path: update.new_test_path,
        e2e_test_status: 'created'
      })
      .eq('id', update.id);

    if (error) {
      console.error(`   ❌ Failed to update ${update.story_key}: ${error.message}`);
      errorCount++;
    } else {
      console.log(`   ✅ Updated ${update.story_key} → ${update.new_test_path}`);
      successCount++;
    }
  }

  console.log('');
  console.log('═'.repeat(70));
  console.log('📊 Final Results:');
  console.log('═'.repeat(70));
  console.log(`   User Stories: ${userStories.length}`);
  console.log(`   E2E Tests Found: ${testMappings.length}`);
  console.log(`   ✅ Successfully Mapped: ${successCount}`);
  console.log(`   ❌ Failed to Map: ${errorCount}`);
  console.log(`   ⚠️  No E2E Test: ${unmatchedStories.length}`);
  console.log('');

  const coveragePercentage = ((successCount / userStories.length) * 100).toFixed(1);
  console.log(`   📈 E2E Coverage: ${coveragePercentage}%`);

  if (coveragePercentage >= 100) {
    console.log('   ✅ 100% COVERAGE ACHIEVED - PASS\n');
  } else if (coveragePercentage >= 80) {
    console.log('   ⚠️  PARTIAL COVERAGE - Review unmapped stories\n');
  } else {
    console.log('   ❌ INSUFFICIENT COVERAGE - Create missing E2E tests\n');
  }

  return {
    success: true,
    matched: successCount,
    unmatched: unmatchedStories.length,
    failed: errorCount,
    total: userStories.length,
    coverage: parseFloat(coveragePercentage),
    unmatchedStories
  };
}

// ============================================
// MAIN EXECUTION
// ============================================

const sdId = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!sdId) {
  console.error('❌ Usage: node scripts/map-e2e-tests-to-user-stories.mjs <SD-ID> [--dry-run]');
  console.error('   Example: node scripts/map-e2e-tests-to-user-stories.mjs SD-VIF-INTEL-001');
  process.exit(1);
}

try {
  const result = await mapE2ETestsToUserStories(sdId, dryRun);

  if (!result.success) {
    process.exit(1);
  }

  if (result.unmatched > 0) {
    console.log('⚠️  WARNING: Some user stories have no E2E tests');
    console.log('   Consider creating tests for:');
    result.unmatchedStories?.forEach((s, idx) => {
      console.log(`   ${idx + 1}. ${s.story_key}: ${s.title}`);
    });
    console.log('');
  }

  console.log('✅ E2E test mapping complete!\n');
} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
