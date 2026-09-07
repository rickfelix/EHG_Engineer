/**
 * QF-20260905-829
 *
 * lib/sub-agents/testing/index.js's checkForNonUISdType() computed `git diff main...HEAD` to
 * decide E2E applicability. When executed_from_cwd is the shared root checked out on main
 * itself, HEAD IS main there, so the diff is empty BY CONSTRUCTION -- not a genuine "no
 * changes" signal. The zero-UI-by-diff gate (QF-20260902-796) correctly fails an empty diff
 * closed to the normal E2E flow, which then times out / reports 0 tests: BLOCKED,
 * measured=false, with no cause recorded on the evidence row.
 *
 * Specimen: SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-F, TESTING row executed_from_cwd=shared root,
 * playwright 0 tests, BLOCKED -- while sibling -D, run from its own worktree, got
 * applicability_rule=policy_non_applicable_code_measured, vitest 108/108 PASS.
 *
 * Fix: detect the shared-root-on-main case before the diff. If the SD's real feature branch is
 * known (branchContext.branch), diff main...<branch> instead (worktrees share one .git, so the
 * branch ref is visible from the shared root with no checkout needed) -- this measures the REAL
 * diff, not an artifact. Only when no branch is resolvable does this become a distinct REFUSED
 * verdict (applicability_rule=cwd_shared_root_refused), never a silent fail-closed into a doomed
 * full E2E run.
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

describe('QF-20260905-829: cwd-shared-root-on-main refusal / real-branch diff', () => {
  it('shared-root-on-main WITH a known SD branch: diffs main...<branch> instead of main...HEAD, and still resolves normally', async () => {
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'git rev-parse --abbrev-ref HEAD') return 'main';
      if (cmd === 'git diff --name-only main...feat/sd-real-branch') return 'lib/fleet/claim-eligibility.cjs\n';
      throw new Error(`unexpected execSync call: ${cmd}`);
    });
    const sb = mockSupabase(bugfixWithKeyChanges);
    const result = await checkForNonUISdType(
      'sd-shared-root-branch-known', 'prospective', {},
      { repoPath: '/shared-root', branch: 'feat/sd-real-branch' }, sb
    );
    expect(result).not.toBeNull();
    expect(result.detailed_analysis.applicability_source).toBe('measured_diff');
    expect(execSyncMock).toHaveBeenCalledWith(
      'git diff --name-only main...feat/sd-real-branch',
      expect.objectContaining({ cwd: '/shared-root' })
    );
  });

  it('shared-root-on-main with NO resolvable SD branch: REFUSED distinctly, not a silent fail-closed to E2E', async () => {
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'git rev-parse --abbrev-ref HEAD') return 'main';
      throw new Error(`unexpected execSync call (diff should never run): ${cmd}`);
    });
    const sb = mockSupabase(bugfixWithKeyChanges);
    const result = await checkForNonUISdType(
      'sd-shared-root-no-branch', 'prospective', {}, { repoPath: '/shared-root' }, sb
    );
    expect(result).not.toBeNull();
    expect(result.verdict).toBe('BLOCKED');
    expect(result.detailed_analysis.applicability_rule).toBe('cwd_shared_root_refused');
    expect(result.metadata.measured).toBe(false);
    expect(result.metadata.applicability_rule).toBe('cwd_shared_root_refused');
  });

  it('shared-root-on-main where the resolved branchContext.branch IS itself "main": still REFUSED (no real branch to diff against)', async () => {
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'git rev-parse --abbrev-ref HEAD') return 'main';
      throw new Error(`unexpected execSync call: ${cmd}`);
    });
    const sb = mockSupabase(bugfixWithKeyChanges);
    const result = await checkForNonUISdType(
      'sd-shared-root-branch-is-main', 'prospective', {}, { repoPath: '/shared-root', branch: 'main' }, sb
    );
    expect(result.verdict).toBe('BLOCKED');
    expect(result.detailed_analysis.applicability_rule).toBe('cwd_shared_root_refused');
  });

  it('an explicit --diff-range bypasses the shared-root check entirely (post-merge re-verify path unaffected)', async () => {
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'git diff --name-only abc1234~1..abc1234') return 'lib/fleet/claim-eligibility.cjs\n';
      throw new Error(`unexpected execSync call (rev-parse should never run): ${cmd}`);
    });
    const sb = mockSupabase(bugfixWithKeyChanges);
    const result = await checkForNonUISdType(
      'sd-explicit-range', 'retrospective', { diff_range: 'abc1234~1..abc1234' },
      { repoPath: '/shared-root' }, sb
    );
    expect(result).not.toBeNull();
    expect(result.detailed_analysis.applicability_source).toBe('measured_diff');
  });

  it('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-F fixture: non-exempt type, shared-root cwd, no branch known -- reproduces as REFUSED (was: playwright 0 tests, BLOCKED with no cause)', async () => {
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'git rev-parse --abbrev-ref HEAD') return 'main';
      throw new Error(`unexpected execSync call (diff should never run for the F fixture): ${cmd}`);
    });
    // -F was a non-exempt type reaching the measured-diff gate (unlike sibling -D, which was
    // declared-exempt and reached the scoped-unit path instead, applicability_rule=
    // policy_non_applicable_code_measured, vitest 108/108 PASS). Before this fix, -F's empty
    // main...HEAD diff (shared-root artifact) fell through silently to the full E2E flow.
    const sb = mockSupabase(bugfixWithKeyChanges);
    const result = await checkForNonUISdType(
      'sd-001-F-shape', 'prospective', {}, { repoPath: '/shared-root' }, sb
    );
    expect(result.verdict).toBe('BLOCKED');
    expect(result.detailed_analysis.applicability_rule).toBe('cwd_shared_root_refused');
    expect(result.metadata.measured).toBe(false);
  });
});
