/**
 * QF-20260902-796
 *
 * checkForNonUISdType previously gated the scoped-unit measured path (index.js:525-615) on
 * isE2EApplicabilityExempt(sd_type) ALONE, so a non-exempt but genuinely zero-UI bugfix SD
 * (e.g. touching only lib/ and scripts/) fell through to the full E2E flow -- unsatisfiable for
 * the TESTING sub-agent's own prospective-mode BLOCKED-if-not-full-e2e rule, and --full-e2e
 * itself times out on a large unrelated Playwright suite. This pins the fix: the gate now
 * applies "exempt-by-type OR zero-UI-by-measured-diff", with an empty/unresolvable diff
 * FAILING CLOSED (still requires E2E) so a missing diff can never accidentally exempt anything.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execSyncMock = vi.fn();
vi.mock('node:child_process', () => ({ execSync: (...args) => execSyncMock(...args) }));
vi.mock('../../../scripts/modules/complete-quick-fix/test-runner.js', () => ({
  runTests: vi.fn(() => ({ passed: true, summary: { passed: 2, failed: 0, skipped: 0, total: 2 } }))
}));

const { checkForNonUISdType } = await import('../../../lib/sub-agents/testing/index.js');

function mockSupabase(sdRow) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          single: vi.fn(async () => ({ data: sdRow, error: null }))
        }))
      }))
    }))
  };
}

const bugfixWithKeyChanges = {
  sd_type: 'bugfix',
  category: null,
  key_changes: [{ change: 'modify lib/fleet/claim-eligibility.cjs to add setHold()' }],
  scope: '',
  title: 'x'
};

beforeEach(() => {
  execSyncMock.mockReset();
});

describe('QF-20260902-796: zero-UI-by-diff gate on checkForNonUISdType', () => {
  it('a bugfix touching only lib/scripts (zero-UI diff) takes the scoped-unit measured path, not E2E', async () => {
    execSyncMock.mockReturnValue('lib/fleet/claim-eligibility.cjs\nscripts/lib/claimable-leaves.mjs\n');
    const sb = mockSupabase(bugfixWithKeyChanges);
    const result = await checkForNonUISdType('sd-zero-ui', 'prospective', {}, { repoPath: '/fake-repo' }, sb);
    expect(result).not.toBeNull();
    expect(result.detailed_analysis.applicability_source).toBe('measured_diff');
    expect(result.detailed_analysis.sd_type).toBe('bugfix');
  });

  it('a bugfix touching a UI file still requires the normal E2E flow (returns null)', async () => {
    execSyncMock.mockReturnValue('src/components/Button.tsx\n');
    const sb = mockSupabase(bugfixWithKeyChanges);
    const result = await checkForNonUISdType('sd-ui-touch', 'prospective', {}, { repoPath: '/fake-repo' }, sb);
    expect(result).toBeNull();
  });

  it('an unresolvable/empty diff FAILS CLOSED -- still requires E2E, never exempted', async () => {
    execSyncMock.mockImplementation(() => { throw new Error('git diff failed: no such ref'); });
    const sb = mockSupabase(bugfixWithKeyChanges);
    const result = await checkForNonUISdType('sd-unresolvable', 'prospective', {}, { repoPath: '/fake-repo' }, sb);
    expect(result).toBeNull();
  });

  it('a declared-exempt type (infrastructure) still applicability_source=declared_type, no diff-gate involvement', async () => {
    execSyncMock.mockReturnValue('lib/some-infra-file.js\n');
    const sb = mockSupabase({ sd_type: 'infrastructure', category: null, key_changes: [{ change: 'modify lib/x.js' }], scope: '', title: 'x' });
    const result = await checkForNonUISdType('sd-infra', 'prospective', {}, { repoPath: '/fake-repo' }, sb);
    expect(result).not.toBeNull();
    expect(result.detailed_analysis.applicability_source).toBe('declared_type');
  });
});

// SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-8, coordinator scope note 5bd643ca): once a branch is
// merged, main...HEAD is empty (HEAD is an ancestor of main) and this gate would otherwise fail
// closed forever for an already-merged, genuinely zero-UI SD. options.diff_range lets a
// post-merge re-verify run supply the SD's real pre-merge range instead.
describe('SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-8): post-merge --diff-range override', () => {
  it('a valid diff_range is used for the git diff instead of the default main...HEAD', async () => {
    execSyncMock.mockReturnValue('lib/fleet/claim-eligibility.cjs\n');
    const sb = mockSupabase(bugfixWithKeyChanges);
    const result = await checkForNonUISdType(
      'sd-post-merge', 'retrospective', { diff_range: 'abc1234~1..abc1234' }, { repoPath: '/fake-repo' }, sb
    );
    expect(result).not.toBeNull();
    expect(result.detailed_analysis.applicability_source).toBe('measured_diff');
    expect(execSyncMock).toHaveBeenCalledWith(
      'git diff --name-only abc1234~1..abc1234',
      expect.objectContaining({ cwd: '/fake-repo' })
    );
  });

  it('a malformed diff_range is rejected and falls back to the default main...HEAD range', async () => {
    execSyncMock.mockReturnValue('lib/fleet/claim-eligibility.cjs\n');
    const sb = mockSupabase(bugfixWithKeyChanges);
    await checkForNonUISdType(
      'sd-post-merge-bad', 'retrospective', { diff_range: 'abc..def; rm -rf /' }, { repoPath: '/fake-repo' }, sb
    );
    expect(execSyncMock).toHaveBeenCalledWith(
      'git diff --name-only main...HEAD',
      expect.objectContaining({ cwd: '/fake-repo' })
    );
  });

  it('an empty diff even with an explicit diff_range still FAILS CLOSED (never exempted)', async () => {
    execSyncMock.mockReturnValue('');
    const sb = mockSupabase(bugfixWithKeyChanges);
    const result = await checkForNonUISdType(
      'sd-post-merge-empty', 'retrospective', { diff_range: 'abc1234~1..abc1234' }, { repoPath: '/fake-repo' }, sb
    );
    expect(result).toBeNull();
  });
});
