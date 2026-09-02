/**
 * SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001
 *
 * Integration-level tests for the wired-in evidence-reuse fast-path in
 * lib/sub-agents/testing/index.js: checkTestEvidence() (test_runs path),
 * checkApiTestEvidence() (sd_testing_status path), buildPhase3FromEvidence(), and the
 * REAL (unmocked) processPhase3Results()/generateVerdict() consumers -- so the invariant
 * "PASS with unexpected>0 is impossible" is proven through the actual consumer chain
 * (per prospective-TESTING finding GAP-2), not just against an isolated deriver.
 *
 * artifact-verification.js's readArtifact/isArtifactFresh/classifyProvenance are mocked
 * per-test to control the artifact scenario deterministically; deriveCountsFromArtifact is
 * left REAL (already covered by artifact-verification.test.js) so the counts flowing
 * through this integration path are the genuine formula, not a test double.
 *
 * index.js's verifyArtifact() calls the combined readArtifactWithSha() (single read, to
 * close a TOCTOU window -- security review, SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001), so
 * that is what's mocked here; it's composed from the same readArtifactMock/
 * computeArtifactShaMock knobs each test already configures, so per-test setup is unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above imports/const declarations; referencing outer
// variables inside them requires vi.hoisted() so the reference is initialized in time.
const { readArtifactMock, isArtifactFreshMock, classifyProvenanceMock, computeArtifactShaMock } = vi.hoisted(() => ({
  readArtifactMock: vi.fn(),
  isArtifactFreshMock: vi.fn(),
  classifyProvenanceMock: vi.fn(),
  computeArtifactShaMock: vi.fn(() => null)
}));

vi.mock('../../../lib/sub-agents/testing/artifact-verification.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readArtifact: (...args) => readArtifactMock(...args),
    isArtifactFresh: (...args) => isArtifactFreshMock(...args),
    classifyProvenance: (...args) => classifyProvenanceMock(...args),
    computeArtifactSha: (...args) => computeArtifactShaMock(...args),
    readArtifactWithSha: (...args) => ({ artifact: readArtifactMock(...args), sha: computeArtifactShaMock(...args) })
  };
});

vi.mock('../../../lib/sub-agent-executor/results-storage.js', () => ({
  resolveEvaluatedCommitSha: vi.fn(() => 'deadbeef'),
  resolveCommitTimestamp: vi.fn(() => '2026-09-01T21:00:00.000Z')
}));

// Chainable no-op query builder (matches the established convention in this test dir).
function makeChainable(overrides = {}) {
  const handler = {
    get(_target, prop) {
      if (prop in overrides) return overrides[prop];
      if (prop === 'then') return (resolve) => resolve({ data: null, error: null });
      return vi.fn(() => proxy);
    }
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}

const state = vi.hoisted(() => ({
  sdTestingStatusRow: null,
  checkTestEvidenceFreshnessResult: { isFresh: false, evidence: null }
}));

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({
    from: vi.fn((table) => {
      if (table === 'sd_testing_status') {
        return makeChainable({
          single: () => Promise.resolve(state.sdTestingStatusRow
            ? { data: state.sdTestingStatusRow, error: null }
            : { data: null, error: { code: 'PGRST116' } })
        });
      }
      return makeChainable();
    })
  }))
}));
vi.mock('../../../scripts/lib/test-evidence-ingest.js', () => ({
  checkTestEvidenceFreshness: vi.fn(async () => state.checkTestEvidenceFreshnessResult)
}));
vi.mock('../../../scripts/lib/handoff-preflight.js', () => ({
  quickPreflightCheck: vi.fn(async () => ({ ready: true, missing: [] }))
}));
vi.mock('../../../scripts/lib/branch-resolver.js', () => ({
  resolveBranch: vi.fn(async () => ({ success: true, branch: 'feat/x', repoPath: '/fake/repo', source: 'sd_row', validated: true }))
}));
vi.mock('../../../lib/utils/adaptive-validation.js', () => ({
  detectValidationMode: vi.fn(async () => 'retrospective'),
  logValidationMode: vi.fn()
}));
vi.mock('../../../lib/utils/test-intelligence.js', () => ({
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
  tests_executed: 0, tests_passed: 0, failed_tests: 0, skipped_tests: 0, execution_time_ms: 1, failures: []
}));
vi.mock('../../../lib/sub-agents/testing/phases/phase3-execution.js', () => ({
  executeE2ETests: (...args) => executeE2ETestsMock(...args)
}));
vi.mock('../../../lib/sub-agents/testing/phases/phase4-evidence.js', () => ({
  collectEvidence: vi.fn(async () => ({})),
  verifyUserStories: vi.fn(async () => ({ verified: true, incomplete: [] }))
}));
// Deliberately NOT mocked: phase5-verdict.js -- the real generateVerdict is exercised so
// TS-6's invariant is proven through the actual consumer, matching GAP-2's finding.

describe('TESTING evidence-reuse: checkTestEvidence (test_runs path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.sdTestingStatusRow = null;
    state.checkTestEvidenceFreshnessResult = { isFresh: false, evidence: null };
  });

  it('TS-1: happy path — clean, fresh, runner-provenance artifact yields an unqualified PASS', async () => {
    state.checkTestEvidenceFreshnessResult = {
      isFresh: true,
      ageMinutes: 5,
      evidence: { verdict: 'PASS', pass_rate: 100, report_file_path: '/fake/evidence/playwright-results.json', triggered_by: 'PLAYWRIGHT_REPORTER' }
    };
    readArtifactMock.mockReturnValue({ expected: 51, unexpected: 0, skipped: 0, flaky: 0, startTime: '2026-09-01T22:00:00.000Z' });
    isArtifactFreshMock.mockReturnValue(true);
    classifyProvenanceMock.mockReturnValue(true);

    const { execute } = await import('../../../lib/sub-agents/testing/index.js');
    const results = await execute('test-sd-ts1', {}, { full_e2e: false });

    expect(results.findings.phase3_execution.evidence_reused).toBe(true);
    expect(results.findings.phase3_execution.failed_tests).toBe(0);
    expect(results.verdict).toBe('PASS');
    expect(executeE2ETestsMock).not.toHaveBeenCalled();
  });

  it('FR-5 AC-4: a clean, fresh, runner-provenance artifact whose sha does NOT match the row\'s report_hash still reuses (non-blocking) but surfaces a warning naming the mismatch', async () => {
    state.checkTestEvidenceFreshnessResult = {
      isFresh: true,
      ageMinutes: 5,
      evidence: {
        verdict: 'PASS', pass_rate: 100,
        report_file_path: '/fake/evidence/playwright-results.json',
        triggered_by: 'PLAYWRIGHT_REPORTER',
        report_hash: 'expected-hash-from-original-ingest'
      }
    };
    readArtifactMock.mockReturnValue({ expected: 51, unexpected: 0, skipped: 0, flaky: 0, startTime: '2026-09-01T22:00:00.000Z' });
    isArtifactFreshMock.mockReturnValue(true);
    classifyProvenanceMock.mockReturnValue(true);
    computeArtifactShaMock.mockReturnValue('different-hash-borrowed-artifact');

    const { execute } = await import('../../../lib/sub-agents/testing/index.js');
    const results = await execute('test-sd-hash-mismatch', {}, { full_e2e: false });

    expect(results.findings.phase3_execution.evidence_reused).toBe(true);
    expect(results.warnings.some((w) => /report_hash|mismatch|substitution/i.test(w.issue))).toBe(true);
  });

  it('FR-5 AC-4: matching artifact_sha/report_hash produces no mismatch warning', async () => {
    state.checkTestEvidenceFreshnessResult = {
      isFresh: true,
      ageMinutes: 5,
      evidence: {
        verdict: 'PASS', pass_rate: 100,
        report_file_path: '/fake/evidence/playwright-results.json',
        triggered_by: 'PLAYWRIGHT_REPORTER',
        report_hash: 'same-hash'
      }
    };
    readArtifactMock.mockReturnValue({ expected: 51, unexpected: 0, skipped: 0, flaky: 0, startTime: '2026-09-01T22:00:00.000Z' });
    isArtifactFreshMock.mockReturnValue(true);
    classifyProvenanceMock.mockReturnValue(true);
    computeArtifactShaMock.mockReturnValue('same-hash');

    const { execute } = await import('../../../lib/sub-agents/testing/index.js');
    const results = await execute('test-sd-hash-match', {}, { full_e2e: false });

    expect(results.warnings.some((w) => /report_hash|mismatch|substitution/i.test(w.issue))).toBe(false);
  });

  it('TS-3: the witnessed incident, reproduced — artifact contradicts a claimed-clean row, verdict is never PASS', async () => {
    state.checkTestEvidenceFreshnessResult = {
      isFresh: true,
      ageMinutes: -240, // the original incident's own naive-negative-age shape
      evidence: { verdict: 'PASS', pass_rate: 100, report_file_path: '/fake/evidence/playwright-results.json', triggered_by: 'PLAYWRIGHT_REPORTER' }
    };
    // The DB row claims 51/51 passed; the artifact tells the truth.
    readArtifactMock.mockReturnValue({ expected: 481, unexpected: 1276, skipped: 1673, flaky: 0, startTime: '2026-09-01T00:58:49.000Z' });
    isArtifactFreshMock.mockReturnValue(true);
    classifyProvenanceMock.mockReturnValue(true);

    const { execute } = await import('../../../lib/sub-agents/testing/index.js');
    const results = await execute('test-sd-ts3', {}, { full_e2e: false });

    expect(results.findings.phase3_execution.failed_tests).toBe(1276);
    expect(results.verdict).not.toBe('PASS');
    expect(results.verdict).toBe('BLOCKED');
  });

  it('TS-4: stale artifact (fails freshness) is refused even though it would parse cleanly', async () => {
    state.checkTestEvidenceFreshnessResult = {
      isFresh: true,
      ageMinutes: 5,
      evidence: { verdict: 'PASS', pass_rate: 100, report_file_path: '/fake/evidence/playwright-results.json', triggered_by: 'PLAYWRIGHT_REPORTER' }
    };
    readArtifactMock.mockReturnValue({ expected: 51, unexpected: 0, skipped: 0, flaky: 0, startTime: '2020-01-01T00:00:00.000Z' });
    isArtifactFreshMock.mockReturnValue(false); // stale
    classifyProvenanceMock.mockReturnValue(true);

    const { execute } = await import('../../../lib/sub-agents/testing/index.js');
    const results = await execute('test-sd-ts4', {}, { full_e2e: false });

    expect(results.findings.phase3_execution.evidence_reused).toBeUndefined();
    expect(executeE2ETestsMock).toHaveBeenCalled();
  });

  it('TS-5: non-runner provenance caps a clean, fresh artifact at CONDITIONAL_PASS, naming the source', async () => {
    state.checkTestEvidenceFreshnessResult = {
      isFresh: true,
      ageMinutes: 5,
      evidence: { verdict: 'PASS', pass_rate: 100, report_file_path: '/fake/evidence/playwright-results.json', triggered_by: 'claude-code' }
    };
    readArtifactMock.mockReturnValue({ expected: 51, unexpected: 0, skipped: 0, flaky: 0, startTime: '2026-09-01T22:00:00.000Z' });
    isArtifactFreshMock.mockReturnValue(true);
    classifyProvenanceMock.mockReturnValue(false); // NOT a recognized runner

    const { execute } = await import('../../../lib/sub-agents/testing/index.js');
    const results = await execute('test-sd-ts5', {}, { full_e2e: false });

    expect(results.verdict).toBe('CONDITIONAL_PASS');
    expect(results.justification).toContain('claude-code');
  });

  it('TS-7/TS-8: readArtifact returning null (missing/malformed) refuses reuse, falls through to real execution', async () => {
    state.checkTestEvidenceFreshnessResult = {
      isFresh: true,
      ageMinutes: 5,
      evidence: { verdict: 'PASS', pass_rate: 100, report_file_path: '/fake/evidence/playwright-results.json', triggered_by: 'PLAYWRIGHT_REPORTER' }
    };
    readArtifactMock.mockReturnValue(null);

    const { execute } = await import('../../../lib/sub-agents/testing/index.js');
    await execute('test-sd-ts78', {}, { full_e2e: false });

    expect(executeE2ETestsMock).toHaveBeenCalled();
  });

  it('TS-11: all-skipped artifact (expected=0) never reaches PASS despite unexpected=0', async () => {
    state.checkTestEvidenceFreshnessResult = {
      isFresh: true,
      ageMinutes: 5,
      evidence: { verdict: 'PASS', pass_rate: 100, report_file_path: '/fake/evidence/playwright-results.json', triggered_by: 'PLAYWRIGHT_REPORTER' }
    };
    readArtifactMock.mockReturnValue({ expected: 0, unexpected: 0, skipped: 1673, flaky: 0, startTime: '2026-09-01T22:00:00.000Z' });
    isArtifactFreshMock.mockReturnValue(true);
    classifyProvenanceMock.mockReturnValue(true);

    const { execute } = await import('../../../lib/sub-agents/testing/index.js');
    const results = await execute('test-sd-ts11', {}, { full_e2e: false });

    expect(results.findings.phase3_execution.tests_executed).toBe(0);
    expect(results.verdict).not.toBe('PASS');
  });

  it('TS-11: flaky-but-passing artifact (flaky>0, unexpected=0) yields PASS with flaky visible in metadata', async () => {
    state.checkTestEvidenceFreshnessResult = {
      isFresh: true,
      ageMinutes: 5,
      evidence: { verdict: 'PASS', pass_rate: 100, report_file_path: '/fake/evidence/playwright-results.json', triggered_by: 'PLAYWRIGHT_REPORTER' }
    };
    readArtifactMock.mockReturnValue({ expected: 48, unexpected: 0, skipped: 0, flaky: 3, startTime: '2026-09-01T22:00:00.000Z' });
    isArtifactFreshMock.mockReturnValue(true);
    classifyProvenanceMock.mockReturnValue(true);

    const { execute } = await import('../../../lib/sub-agents/testing/index.js');
    const results = await execute('test-sd-ts11b', {}, { full_e2e: false });

    expect(results.verdict).toBe('PASS');
    expect(results.findings.phase3_execution.flaky).toBe(3);
  });
});

describe('TESTING evidence-reuse: checkApiTestEvidence (sd_testing_status path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.sdTestingStatusRow = null;
    state.checkTestEvidenceFreshnessResult = { isFresh: false, evidence: null };
  });

  it('TS-2: the witnessed incident\'s exact shape (no e2e_evidence path) can never produce an unqualified PASS', async () => {
    state.sdTestingStatusRow = {
      tested: true,
      tests_passed: 51,
      test_count: 51,
      tests_failed: 0,
      last_tested_at: new Date().toISOString(),
      test_framework: 'playwright',
      test_results: {}, // no e2e_evidence at all -- the exact incident shape
      updated_by: 'claude-code'
    };

    const { execute } = await import('../../../lib/sub-agents/testing/index.js');
    const results = await execute('test-sd-ts2', {}, { full_e2e: false });

    expect(results.findings.phase2_5_api_test_evidence).toBeUndefined();
    expect(executeE2ETestsMock).toHaveBeenCalled();
    expect(results.verdict).not.toBe('PASS');
  });

  it('TS-10 (frozen, injected fixture): a genuinely fresh, artifact-backed sd_testing_status row still reuses', async () => {
    state.sdTestingStatusRow = {
      tested: true,
      tests_passed: 1,
      test_count: 1,
      tests_failed: 0,
      last_tested_at: new Date().toISOString(),
      test_framework: 'playwright',
      test_results: { e2e_evidence: 'tests/e2e/evidence/frozen-fixture/playwright-results.json' },
      updated_by: 'PLAYWRIGHT_REPORTER'
    };
    readArtifactMock.mockReturnValue({ expected: 1, unexpected: 0, skipped: 0, flaky: 0, startTime: '2026-09-01T22:00:00.000Z' });
    isArtifactFreshMock.mockReturnValue(true); // frozen: injected fresh regardless of real clock
    classifyProvenanceMock.mockReturnValue(true);

    const { execute } = await import('../../../lib/sub-agents/testing/index.js');
    const results = await execute('test-sd-ts10', {}, { full_e2e: false });

    expect(results.findings.phase2_5_api_test_evidence.tests_passed).toBe(1);
    expect(executeE2ETestsMock).not.toHaveBeenCalled();
    expect(results.verdict).toBe('PASS');
  });
});
