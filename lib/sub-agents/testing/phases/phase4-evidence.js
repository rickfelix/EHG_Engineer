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
 * @param {Object} [options] - Verification options
 * @param {string} [options.sdType] - SD type (e.g., 'uat', 'infrastructure', 'documentation')
 * @returns {Promise<Object>} User story verification results
 */
export async function verifyUserStories(sdId, supabase, options = {}) {
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

  // SD types that verify existing functionality rather than implementing new stories
  // These don't require e2e_test_path mapping since they validate, not create
  const E2E_EXEMPT_SD_TYPES = ['uat', 'infrastructure', 'documentation', 'docs', 'orchestrator'];
  const sdType = (options.sdType || '').toLowerCase();
  const requireE2EMapping = !E2E_EXEMPT_SD_TYPES.includes(sdType);

  // A story is complete if:
  // 1. status is 'completed' or 'validated'
  // 2. AND (e2e_test_path exists OR validation_status = 'validated') — unless sd_type is exempt
  // 3. AND (e2e_test_status = 'passing' OR validation_status = 'validated')
  //
  // QF-20260801-425 — clause 2 previously accepted NO alternative to an e2e_test_path, while
  // clause 3 directly below it already accepted validation_status='validated' in place of a
  // passing e2e run. The function contradicted itself, and the contradiction was unreachable
  // for most callers: 12,634 of 13,966 completed AND validated stories (90.5%) have
  // e2e_test_path NULL, and nothing in the pipeline populates it for most stories. So for any
  // sd_type outside E2E_EXEMPT_SD_TYPES this clause demanded something nine-tenths of the
  // corpus has never had and cannot obtain — one SD failed three consecutive handoff attempts
  // against it with no remediation a worker could actually perform.
  //
  // The canonical promoter (scripts/auto-validate-user-stories-on-exec-complete.js) keys on
  // validation_status and reports these same rows as fully validated, so the two checks
  // disagreed about what "done" means. Granting clause 2 the alternative clause 3 already
  // grants removes the contradiction rather than removing the check: a story with neither a
  // passing e2e run NOR validation is still blocked, which the test suite pins in both
  // directions.
  const incomplete = stories.filter(s =>
    !['completed', 'validated'].includes(s.status) ||
    (requireE2EMapping && !s.e2e_test_path && s.validation_status !== 'validated') ||
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
