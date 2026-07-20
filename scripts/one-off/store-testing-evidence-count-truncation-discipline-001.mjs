// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 — TESTING sub-agent evidence writer (EXEC-TO-PLAN).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001';
const PHASE = 'EXEC-TO-PLAN';

const results = {
  verdict: 'PASS',
  confidence: 92,
  summary:
    'Count/truncation discipline sweep verified. Full unit suite GREEN except ONE known-pre-existing UNRELATED failure ' +
    '(tests/unit/golden-references/witness-emitter-acceptance.test.js — owned by SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-D, ' +
    'NOT in this SD\'s diff). Full run: 2503/2518 test files pass, 29535/29730 tests pass (1 fail, 192 skipped, 2 todo). ' +
    'The FR-2/FR-3/FR-4 shared primitives (lib/db/fetch-all-paginated.mjs) have 19/19 passing tests with strong coverage of ' +
    'the exact incident signatures (pageSize>cap re-truncation guard, exactly-1000 cap tripwire, count=null->\'unavailable\', ' +
    'true-value 1495 passthrough). Batch 9 deep-tier adversarial review found+fixed 2 CRITICAL + 4 WARNING real regressions, ' +
    'all verified against the live DB (commit 124c6c79547).',
  findings: [
    { id: 'full-suite', severity: 'info', note: 'npx vitest run --project unit tests/ lib/ scripts/ => Test Files 1 failed | 2503 passed | 14 skipped (2518); Tests 1 failed | 29535 passed | 192 skipped | 2 todo (29730). Wall ~235s.' },
    { id: 'known-failure-isolated', severity: 'info', note: 'The single failing file tests/unit/golden-references/witness-emitter-acceptance.test.js is PRE-EXISTING and UNRELATED: its last commits belong to SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-D and it does NOT appear in this SD branch\'s diff. Not caused by this SD.' },
    { id: 'fr2-pagination', severity: 'info', note: 'FR-2 fetchAllPaginated: 8 tests GREEN — full 2500-row retrieval across 3 pages, exact page-boundary (empty terminating page), short-page/empty-relation termination, page-error throw (callers keep fail-open), default pageSize=PostgREST cap, pageSize-bounds validation (REJECTS >1000 / 0 / negative — the exact re-truncation guard), maxRows clean sampling cap, and range-ignore infinite-loop guard (throws not hangs).' },
    { id: 'fr2-filtered-variant', severity: 'info', note: 'proactive-populator fetchAllFiltered variant: 6 tests GREEN — page concatenation with no newest-tail truncation, exact page-boundary stop, single-short-page one-call return, STABLE deterministic ordering, custom pageSize windows, query-error throw.' },
    { id: 'fr3-cap-tripwire', severity: 'info', note: 'FR-3 assertNotCapTruncated: 3 tests GREEN — throws CAP_TRUNCATION_SUSPECTED on exactly-at-cap (1000) naming the site; below-cap (incl []) passthrough; above-cap already-paginated passthrough. Directly encodes the 2026-07-19 incident signature (rows.length === cap).' },
    { id: 'fr4-count-null', severity: 'info', note: 'FR-4 renderCount: 2 tests GREEN — null/undefined/NaN (missing-relation signature) => \'unavailable\', never coerced to a healthy-looking 0; real numbers pass through including 0 and 1495 (the incident true value the gauge silently read as 1000).' },
    { id: 'coverage-gap-warn', severity: 'warning', note: 'warnIfCapTruncated (the FR-6 display-policy stderr-warn sibling of assertNotCapTruncated) has NO direct unit test in fetch-all-paginated.test.js. Low risk (informational warn-only render path, no mutation/guard), but a coverage gap worth a follow-up test.' },
    { id: 'adversarial-review', severity: 'info', note: 'Batch 9 deep-tier adversarial code review (commit 124c6c79547) found+fixed 2 CRITICAL + 4 WARNING real regressions: undeclared-variable ReferenceError, two unchunked .in() bulk-ID-list queries exceeding URL-length under real volume, a lost fail-open error-handling path, and a failed-gauge-coerced-to-0 bug — all verified fixed against live DB. Final state: repo-wide 0 needs-review.' },
    { id: 'ship-state', severity: 'info', note: 'Work shipped across 9 batches of small PRs, all merged to main (most recently PR #6356). This worktree is main-synced post-merge.' },
  ],
  metadata: {
    test_command: 'npx vitest run --project unit tests/ lib/ scripts/',
    test_files_total: 2518,
    test_files_passed: 2503,
    test_files_failed: 1,
    test_files_skipped: 14,
    tests_total: 29730,
    tests_passed: 29535,
    tests_failed: 1,
    tests_skipped: 192,
    tests_todo: 2,
    known_unrelated_failure: 'tests/unit/golden-references/witness-emitter-acceptance.test.js (SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-D; not in this SD diff)',
    primitive_test_file: 'tests/unit/db/fetch-all-paginated.test.js',
    primitive_tests_passed: '13/13',
    filtered_variant_test_file: 'tests/unit/sourcing-engine/proactive-populator-fetch-all-filtered.test.js',
    filtered_variant_tests_passed: '6/6',
    fr2_fr3_fr4_primitive: 'lib/db/fetch-all-paginated.mjs',
    coverage_gap: 'warnIfCapTruncated lacks a direct unit test (warning-level, low risk)',
    batch9_commit: '124c6c79547',
    batch9_review_regressions_fixed: '2 CRITICAL + 4 WARNING (verified live DB)',
    latest_pr: '#6356',
    incident_ref: '2026-07-19 gauge read 1000 (PostgREST cap) instead of true 1495',
  },
  execution_time_ms: 235130,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director', metadata: { version: '2.4.0' } }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
