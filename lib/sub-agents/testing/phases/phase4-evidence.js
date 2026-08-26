/**
 * Phase 4: Evidence Collection
 *
 * Collects test evidence including screenshots, reports, and logs.
 *
 * Extracted from TESTING sub-agent v3.0
 * SD: SD-LEO-REFAC-TESTING-INFRA-001
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { specFileExists as specFileExistsDefault } from '../../../stories/e2e-path-guard.js';

// Repo root resolved from this module's own location, so the check does not depend on the
// caller's cwd (sub-agents run from worktrees and from the shared root).
const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

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
  // SD-LEO-INFRA-STORY-E2E-AUTO-001 FR-2 — a NON-NULL mapping must name a file that exists.
  //
  // MEASURED over the full population (1390 non-null paths, exact head-count): 234 of 338
  // distinct paths name a file that is not in the repo, and 641 rows (46.1%) claim
  // e2e_test_status='passing' for one of them. Those rows clear clause 2 on path-presence AND
  // clause 3 on status-passing, so nearly half of all mapped stories could pass this gate on
  // a spec nobody ever wrote. Presence of a string was being read as evidence of coverage.
  //
  // This does NOT touch NULL handling. QF-20260801-425 relaxed clause 2 deliberately because
  // 90.5% of completed+validated stories have e2e_test_path NULL and nothing populates it;
  // that relaxation stands, and the tests above pin it in both directions. The difference
  // that makes enforcing THIS case fair is remediation: QF-425's requirement had no action a
  // worker could perform, whereas a fabricated path has an honest one-line fix — set it to
  // NULL, which this filter accepts.
  //
  // Deliberately NOT escapable by validation_status: a path naming a file that does not exist
  // is false regardless of who validated the story, and letting validation excuse it would
  // rebuild the same "auto-populated state reads as achievement" defect one layer up.
  const specExists = options.specFileExists || specFileExistsDefault;
  const repoRoot = options.repoRoot || DEFAULT_REPO_ROOT;
  const fabricatedMapping = (s) => s.e2e_test_path != null && !specExists(repoRoot, s.e2e_test_path);

  // SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 (EXEC review, harness-bug finding; hardened
  // per adversarial /ship review, same pass): status='blocked' is a deliberate, explicit signal
  // that a story is genuinely gated on external human action outside EXEC's control (mirrors
  // the same exclusion added to the EXEC-TO-PLAN USER_STORY_COVERAGE gate,
  // scripts/modules/handoff/executors/exec-to-plan/gates/user-story-coverage.js). Requiring
  // validation_status='skipped' TOO — not status='blocked' alone — means an EXEC agent cannot
  // wave off its own incomplete work with a single self-writable field; two independently-set
  // enum values must agree. Reported distinctly, excluded from the completeness filter that
  // otherwise unconditionally requires status IN (completed, validated).
  const isExternallyBlocked = (s) => s.status === 'blocked' && s.validation_status === 'skipped';
  const externallyBlocked = stories.filter(isExternallyBlocked);
  const evaluable = stories.filter((s) => !isExternallyBlocked(s));

  const incomplete = evaluable.filter(s =>
    !['completed', 'validated'].includes(s.status) ||
    (requireE2EMapping && !s.e2e_test_path && s.validation_status !== 'validated') ||
    fabricatedMapping(s) ||
    (s.e2e_test_status !== 'passing' && s.validation_status !== 'validated')
  );

  if (externallyBlocked.length > 0) {
    console.log(`   ⏸️  ${externallyBlocked.length} user stories externally blocked (excluded from completeness check):`);
    externallyBlocked.forEach(s => console.log(`      - ${s.story_key}: ${s.title}`));
  }

  if (incomplete.length > 0) {
    console.log(`   ❌ ${incomplete.length} user stories not fully implemented`);
    incomplete.forEach(s => {
      console.log(`      - ${s.story_key}: ${s.title}`);
      console.log(`        Status: ${s.status || 'NULL'}, E2E: ${s.e2e_test_path || 'NOT MAPPED'}, Result: ${s.e2e_test_status || 'NOT RUN'}, Validation: ${s.validation_status || 'pending'}`);
    });

    return {
      verified: false,
      stories_count: stories.length,
      externally_blocked: externallyBlocked.map(s => s.story_key),
      incomplete: incomplete.map(s => ({
        story_key: s.story_key,
        status: s.status,
        e2e_mapped: !!s.e2e_test_path
      }))
    };
  }

  console.log(`   ✅ All ${evaluable.length} evaluable user stories fully implemented${externallyBlocked.length ? ` (${externallyBlocked.length} externally blocked, excluded)` : ''}`);
  return {
    verified: true,
    stories_count: stories.length,
    externally_blocked: externallyBlocked.map(s => s.story_key),
    incomplete: []
  };
}
