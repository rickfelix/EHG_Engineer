/**
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-D
 *
 * lib/sub-agents/testing/index.js execute() builds `enhancedOptions` (options + branch
 * context, including repoPath resolved from the SD's DB row) but was passing the
 * un-enhanced `options` to executeE2ETests at Phase 3 -- repoPath never reached Phase 3.
 * This test drives execute() through to the Phase 3 call and asserts executeE2ETests
 * receives repoPath, which is present ONLY on enhancedOptions and absent from the
 * caller-supplied base `options` object (a sentinel absent from the caller's options,
 * per PLAN-phase testing-agent review G6 -- so this test actually fails on a revert to
 * `options`, not just on a wrong value).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const REPO_PATH_SENTINEL = '/sentinel/only-on-enhanced-options-repo';

// Chainable no-op query builder: every method returns `this`, terminal calls resolve
// to {data:null, error:null} (or await directly resolves the same via a thenable).
function makeChainable() {
  const handler = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve) => resolve({ data: null, error: null });
      }
      return vi.fn(() => proxy);
    }
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({ from: vi.fn(() => makeChainable()) }))
}));
vi.mock('../../../scripts/lib/test-evidence-ingest.js', () => ({
  checkTestEvidenceFreshness: vi.fn(async () => ({ isFresh: false, evidence: null }))
}));
vi.mock('../../../scripts/lib/handoff-preflight.js', () => ({
  quickPreflightCheck: vi.fn(async () => ({ ready: true, missing: [] }))
}));
vi.mock('../../../scripts/lib/branch-resolver.js', () => ({
  resolveBranch: vi.fn(async () => ({
    success: true,
    branch: 'feat/sentinel',
    repoPath: REPO_PATH_SENTINEL,
    source: 'sd_row',
    validated: true
  }))
}));
vi.mock('../../utils/adaptive-validation.js', () => ({
  detectValidationMode: vi.fn(async () => 'prospective'),
  logValidationMode: vi.fn()
}));
vi.mock('../../utils/test-intelligence.js', () => ({
  validateTestSelectors: vi.fn(async () => ({ mismatches_found: 0, suggestions: [], confidence: 100 })),
  validateNavigationFlow: vi.fn(async () => ({ broken_paths: [] })),
  analyzeTestComponentMapping: vi.fn(async () => ({ missing_components: [] }))
}));
vi.mock('../../../lib/sub-agents/testing/phases/phase1-preflight.js', () => ({
  preflightChecks: vi.fn(async () => ({ blocked: false, critical_issues: [], warnings: [] }))
}));
vi.mock('../../../lib/sub-agents/testing/phases/phase2-generation.js', () => ({
  generateTestCases: vi.fn(async () => ({ user_stories_count: 1 }))
}));
const executeE2ETestsMock = vi.fn(async () => ({
  tests_executed: 1, tests_passed: 1, failed_tests: 0, skipped_tests: 0, execution_time_ms: 1, failures: []
}));
vi.mock('../../../lib/sub-agents/testing/phases/phase3-execution.js', () => ({
  executeE2ETests: executeE2ETestsMock
}));
vi.mock('../../../lib/sub-agents/testing/phases/phase4-evidence.js', () => ({
  collectEvidence: vi.fn(async () => ({})),
  verifyUserStories: vi.fn(async () => ({}))
}));
vi.mock('../../../lib/sub-agents/testing/phases/phase5-verdict.js', () => ({
  generateVerdict: vi.fn(() => ({ verdict: 'PASS', confidence: 95, recommendations: [] }))
}));

describe('testing/index.js execute() — enhancedOptions threading into Phase 3', () => {
  beforeEach(() => {
    executeE2ETestsMock.mockClear();
  });

  it('passes repoPath (present only on enhancedOptions) to executeE2ETests', async () => {
    const { execute } = await import('../../../lib/sub-agents/testing/index.js');
    const baseOptions = { full_e2e: true }; // deliberately has NO repoPath key
    await execute('test-sd-enhanced-options', {}, baseOptions);

    expect(executeE2ETestsMock).toHaveBeenCalled();
    const [, passedOptions] = executeE2ETestsMock.mock.calls[0];
    expect(passedOptions.repoPath).toBe(REPO_PATH_SENTINEL);
    // Guard: the sentinel must NOT already be on the caller's base options (it isn't --
    // asserting this documents why the test fails on a revert to `options`).
    expect(baseOptions.repoPath).toBeUndefined();
  });
});
