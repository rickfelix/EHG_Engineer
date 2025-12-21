#!/usr/bin/env node
/**
 * E2E Test → User Story Mapping Module
 *
 * Integrates with EXEC→PLAN handoff to ensure 100% user story → E2E test mapping
 *
 * ROOT CAUSE FIX: Addresses systemic gap where E2E tests were created but not
 * linked back to user_stories table, causing validation failures.
 */

import fs from 'fs/promises';
import path from 'path';

const EHG_APP_PATH = '/mnt/c/_EHG/EHG';
const E2E_TEST_DIR = `${EHG_APP_PATH}/tests/e2e`;

/**
 * Recursively find all .spec.ts files in directory
 */
async function findTestFiles(dir) {
  try {
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
  } catch (error) {
    // Directory doesn't exist or not accessible
    return [];
  }
}

/**
 * Scan E2E test files and extract US-XXX references
 *
 * @returns {Promise<Array>} Array of { storyKey, testFilePath, testName }
 */
async function scanE2ETestFiles() {
  const testFiles = await findTestFiles(E2E_TEST_DIR);
  const mappings = [];

  for (const file of testFiles) {
    try {
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
    } catch (error) {
      // Skip files that can't be read
      console.warn(`   ⚠️  Could not read ${file}: ${error.message}`);
    }
  }

  return mappings;
}

/**
 * Map E2E tests to user stories and update database
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @param {Object} options - Options
 * @returns {Promise<Object>} Mapping results
 */
export async function mapE2ETestsToUserStories(sdId, supabase, options = {}) {
  const { silent = false } = options;

  if (!silent) {
    console.log('\n🔗 E2E Test → User Story Mapping');
    console.log('-'.repeat(50));
  }

  // Step 1: Get user stories from database
  const { data: userStories } = await supabase
    .from('user_stories')
    .select('id, story_key, title, e2e_test_path')
    .eq('sd_id', sdId)
    .order('story_key');

  if (!userStories || userStories.length === 0) {
    if (!silent) {
      console.log('   ⚠️  No user stories found for this SD');
    }
    return {
      success: true,
      matched: 0,
      unmatched: 0,
      total: 0,
      coverage: 100, // No stories = no mapping required
      unmatchedStories: []
    };
  }

  // Step 2: Scan E2E test files
  const testMappings = await scanE2ETestFiles();

  if (!silent) {
    console.log(`   User Stories: ${userStories.length}`);
    console.log(`   E2E Tests Found: ${testMappings.length} US-XXX references`);
  }

  // Step 3: Match user stories to test files
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

  // Step 4: Update database
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
      if (!silent) {
        console.error(`   ❌ Failed to update ${update.story_key}: ${error.message}`);
      }
      errorCount++;
    } else {
      successCount++;
    }
  }

  const coveragePercentage = userStories.length > 0
    ? ((successCount / userStories.length) * 100).toFixed(1)
    : 100;

  if (!silent) {
    console.log(`   ✅ Mapped: ${successCount}/${userStories.length} stories (${coveragePercentage}%)`);

    if (unmatchedStories.length > 0) {
      console.log(`   ⚠️  Unmapped: ${unmatchedStories.length} stories (likely backend features)`);
    }
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

/**
 * Validate E2E coverage meets minimum threshold
 *
 * @param {Object} mappingResult - Result from mapE2ETestsToUserStories
 * @param {number} minCoverage - Minimum coverage percentage (default: 50%)
 * @returns {Object} Validation result
 */
export function validateE2ECoverage(mappingResult, minCoverage = 50) {
  const { coverage, unmatchedStories, total } = mappingResult;

  // If no user stories, coverage is 100%
  if (total === 0) {
    return {
      passed: true,
      coverage: 100,
      message: 'No user stories defined - coverage requirement N/A'
    };
  }

  // Coverage meets threshold
  if (coverage >= minCoverage) {
    return {
      passed: true,
      coverage,
      message: `E2E coverage ${coverage}% exceeds ${minCoverage}% threshold`
    };
  }

  // Coverage below threshold
  return {
    passed: false,
    coverage,
    message: `E2E coverage ${coverage}% is below ${minCoverage}% threshold`,
    unmatchedStories,
    remediation: `Create E2E tests for ${unmatchedStories.length} unmapped user stories (or validate via deliverables)`
  };
}

export default {
  mapE2ETestsToUserStories,
  validateE2ECoverage
};
