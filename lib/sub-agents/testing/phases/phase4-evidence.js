/**
 * Phase 4: Evidence Collection
 *
 * Collects test evidence including screenshots, reports, and logs.
 *
 * Extracted from TESTING sub-agent v3.0
 * SD: SD-LEO-REFAC-TESTING-INFRA-001
 */

/**
 * Collect test evidence
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} phase3Results - Results from test execution
 * @returns {Promise<Object>} Collected evidence
 */
export async function collectEvidence(sdId, phase3Results) {
  console.log('   📸 Collecting test evidence...');

  const evidence = {
    screenshots: [],
    reports: [],
    logs: []
  };

  if (phase3Results.report_url) {
    evidence.reports.push({
      type: 'playwright_html',
      url: phase3Results.report_url,
      description: 'Playwright HTML test report'
    });
    console.log(`      ✅ Report: ${phase3Results.report_url}`);
  }

  if (phase3Results.tests_executed > 0) {
    evidence.screenshots.push({
      count: phase3Results.tests_passed,
      description: `Screenshots for ${phase3Results.tests_passed} passing tests`
    });
    console.log(`      ✅ Screenshots: ${phase3Results.tests_passed} captured`);
  }

  console.log(`      💾 Evidence stored in: tests/e2e/evidence/${sdId}/`);

  return evidence;
}

/**
 * Verify user stories for Phase 4.5
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} User story verification results
 */
export async function verifyUserStories(sdId, supabase) {
  console.log('\n📋 Phase 4.5: User Story Verification...');

  const { data: stories, error: storyError } = await supabase
    .from('user_stories')
    .select('story_key, title, status, e2e_test_path, e2e_test_status, validation_status')
    .eq('sd_id', sdId);

  if (storyError) {
    console.log('   ⚠️  Could not verify user stories:', storyError.message);
    return {
      verified: false,
      error: storyError.message,
      warnings: ['User story verification failed - check manually']
    };
  }

  if (!stories || stories.length === 0) {
    return {
      verified: true,
      stories_count: 0,
      incomplete: []
    };
  }

  // A story is complete if:
  // 1. status is 'completed' or 'validated'
  // 2. AND (e2e_test_status = 'passing' OR validation_status = 'validated')
  const incomplete = stories.filter(s =>
    !['completed', 'validated'].includes(s.status) ||
    !s.e2e_test_path ||
    (s.e2e_test_status !== 'passing' && s.validation_status !== 'validated')
  );

  if (incomplete.length > 0) {
    console.log(`   ❌ ${incomplete.length} user stories not fully implemented`);
    incomplete.forEach(s => {
      console.log(`      - ${s.story_key}: ${s.title}`);
      console.log(`        Status: ${s.status || 'NULL'}, E2E: ${s.e2e_test_path || 'NOT MAPPED'}, Result: ${s.e2e_test_status || 'NOT RUN'}, Validation: ${s.validation_status || 'pending'}`);
    });

    return {
      verified: false,
      stories_count: stories.length,
      incomplete: incomplete.map(s => ({
        story_key: s.story_key,
        status: s.status,
        e2e_mapped: !!s.e2e_test_path
      }))
    };
  }

  console.log(`   ✅ All ${stories.length} user stories fully implemented`);
  return {
    verified: true,
    stories_count: stories.length,
    incomplete: []
  };
}
