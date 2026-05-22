/**
 * QF-20260520-358 — PLAN-TO-EXEC / PLAN-TO-LEAD precheck _appPath fallback.
 *
 * Root cause: HandoffOrchestrator.precheckHandoff() calls executor.getRequiredGates()
 * WITHOUT first running setup(), but setup() is the only place options._appPath is set.
 * So in the precheck path appPath was undefined and the branch / git-commit enforcement
 * gates defaulted to EHG_ROOT (often detached HEAD) -> false "Could not determine current
 * branch" on every SD precheck regardless of target_application.
 *
 * Fix: getRequiredGates falls back to `options._appPath || this.determineTargetRepository(sd)`
 * in both executors, so precheck resolves the SD's target repo identically to execute().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import { PlanToExecExecutor } from '../../../../scripts/modules/handoff/executors/plan-to-exec/index.js';
import { PlanToLeadExecutor } from '../../../../scripts/modules/handoff/executors/plan-to-lead/index.js';

// SD-LEO-INFRA-BRANCH-AWARE-PLAN-001: the git verifiers (GATE5 commit / GATE6
// branch) now resolve the SD's worktree before their branch + dirty-file checks.
// Mock listActiveWorktrees so resolveWorktreeCwd can be exercised deterministically.
vi.mock('../../../../lib/worktree-quota.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, listActiveWorktrees: vi.fn() };
});
import { resolveWorktreeCwd, extractSdId, stripRefsHeads } from '../../../../lib/resolve-worktree-cwd.js';
import { listActiveWorktrees } from '../../../../lib/worktree-quota.js';
import GitCommitVerifier from '../../../../scripts/verify-git-commit-status.js';

const fakeSupabase = {
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({}) }) }) }) }) }),
};

// Parent orchestrator (plan-to-exec) / orchestrator child (plan-to-lead) take the lighter
// gate sets — the appPath fallback at the top of getRequiredGates fires for ALL paths, so
// the lighter set is sufficient to exercise the fix with minimal gate-factory surface.
const SD_EXEC = {
  id: 'SD-QF-358-TEST', sd_key: 'SD-QF-358-TEST', sd_type: 'infrastructure',
  target_application: 'EHG_Engineer', title: 'precheck appPath fallback test', metadata: {},
};
const SD_LEAD = { ...SD_EXEC, parent_sd_id: 'SD-PARENT-XYZ', metadata: { parent_orchestrator: 'SD-PARENT-XYZ' } };

describe('QF-20260520-358: precheck _appPath fallback (plan-to-exec)', () => {
  it('resolves appPath via determineTargetRepository when options._appPath is absent (precheck path)', async () => {
    const ex = new PlanToExecExecutor({ supabase: fakeSupabase });
    vi.spyOn(ex, '_loadValidators').mockResolvedValue();
    const spy = vi.spyOn(ex, 'determineTargetRepository').mockReturnValue('/sentinel/repo');
    await ex.getRequiredGates(SD_EXEC, { _isParentOrchestrator: true });
    expect(spy).toHaveBeenCalledWith(SD_EXEC);
  });

  it('uses the provided options._appPath without calling the resolver (execute path)', async () => {
    const ex = new PlanToExecExecutor({ supabase: fakeSupabase });
    vi.spyOn(ex, '_loadValidators').mockResolvedValue();
    const spy = vi.spyOn(ex, 'determineTargetRepository').mockReturnValue('/sentinel/repo');
    await ex.getRequiredGates(SD_EXEC, { _appPath: '/already/set', _isParentOrchestrator: true });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('QF-20260520-358: precheck _appPath fallback (plan-to-lead)', () => {
  it('resolves appPath via determineTargetRepository when options._appPath is absent', () => {
    const ex = new PlanToLeadExecutor({ supabase: fakeSupabase });
    const spy = vi.spyOn(ex, 'determineTargetRepository').mockReturnValue('/sentinel/repo');
    ex.getRequiredGates(SD_LEAD, {});
    expect(spy).toHaveBeenCalledWith(SD_LEAD);
  });

  it('uses the provided options._appPath without calling the resolver', () => {
    const ex = new PlanToLeadExecutor({ supabase: fakeSupabase });
    const spy = vi.spyOn(ex, 'determineTargetRepository').mockReturnValue('/sentinel/repo');
    ex.getRequiredGates(SD_LEAD, { _appPath: '/already/set' });
    expect(spy).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// SD-LEO-INFRA-BRANCH-AWARE-PLAN-001: worktree resolution for GATE5/GATE6
// ──────────────────────────────────────────────────────────────────────────
describe('SD-LEO-INFRA-BRANCH-AWARE-PLAN-001: resolveWorktreeCwd', () => {
  beforeEach(() => {
    vi.mocked(listActiveWorktrees).mockReset();
  });

  it('helper: stripRefsHeads removes the refs/heads/ prefix', () => {
    expect(stripRefsHeads('refs/heads/feat/SD-X-001-slug')).toBe('feat/SD-X-001-slug');
    expect(stripRefsHeads('feat/SD-X-001')).toBe('feat/SD-X-001');
    expect(stripRefsHeads(undefined)).toBe('');
  });

  it('helper: extractSdId pulls the canonical SD-ID and stops at the lowercase slug', () => {
    expect(extractSdId('feat/SD-LEO-INFRA-BRANCH-AWARE-PLAN-001-some-slug')).toBe('SD-LEO-INFRA-BRANCH-AWARE-PLAN-001');
    expect(extractSdId('feat/SD-LEO-INFRA-BRANCH-AWARE-PLAN-001')).toBe('SD-LEO-INFRA-BRANCH-AWARE-PLAN-001');
    expect(extractSdId('main')).toBeNull();
  });

  it('case (a): EHG_Engineer SD with a worktree resolves to that worktree (exact branch match, refs/heads/ stripped)', () => {
    vi.mocked(listActiveWorktrees).mockReturnValue([
      { path: '/repo/.worktrees/SD-X-001', branch: 'refs/heads/feat/SD-X-001' },
    ]);
    const out = resolveWorktreeCwd('/repo', { expectedBranch: 'feat/SD-X-001', sdId: 'SD-X-001' });
    expect(out).toBe(path.resolve('/repo/.worktrees/SD-X-001'));
  });

  it('case (b): EHG cross-repo SD — ehg main is on ANOTHER branch, SD branch lives in a worktree -> resolves the worktree (SD-ID fallback)', () => {
    vi.mocked(listActiveWorktrees).mockReturnValue([
      // ehg main is checked out on a different SD's branch (not returned by
      // listActiveWorktrees since it filters the main worktree); the SD's branch
      // is in a worktree. Match by SD-ID even though expectedBranch is unknown (GATE5 path).
      { path: '/ehg/.worktrees/SD-FDBK-001', branch: 'refs/heads/feat/SD-FDBK-001-restrict-approve' },
      { path: '/ehg/.worktrees/SD-OTHER-999', branch: 'refs/heads/feat/SD-OTHER-999' },
    ]);
    const out = resolveWorktreeCwd('/ehg', { sdId: 'SD-FDBK-001' });
    expect(out).toBe(path.resolve('/ehg/.worktrees/SD-FDBK-001'));
  });

  it('case (c): no worktree matches -> returns null so the caller falls back to appPath (byte-identical legacy behavior)', () => {
    vi.mocked(listActiveWorktrees).mockReturnValue([
      { path: '/repo/.worktrees/SD-OTHER-001', branch: 'refs/heads/feat/SD-OTHER-001' },
    ]);
    expect(resolveWorktreeCwd('/repo', { expectedBranch: 'feat/SD-X-001', sdId: 'SD-X-001' })).toBeNull();
  });

  it('matches slug vs no-slug canonical branch forms via SD-ID extraction', () => {
    vi.mocked(listActiveWorktrees).mockReturnValue([
      { path: '/repo/.worktrees/SD-X-001', branch: 'refs/heads/feat/SD-X-001' }, // no-slug canonical
    ]);
    // expected branch is the slugged form; should still match the no-slug worktree
    const out = resolveWorktreeCwd('/repo', { expectedBranch: 'feat/SD-X-001-some-slug', sdId: 'SD-X-001' });
    expect(out).toBe(path.resolve('/repo/.worktrees/SD-X-001'));
  });

  it('guards against SD-ID prefix collisions (SD-X-001 must not match SD-X-001-B)', () => {
    vi.mocked(listActiveWorktrees).mockReturnValue([
      { path: '/repo/.worktrees/SD-X-001-B', branch: 'refs/heads/feat/SD-X-001-B' },
    ]);
    // Only a child SD's worktree is present; the parent SD-X-001 must NOT match it.
    expect(resolveWorktreeCwd('/repo', { sdId: 'SD-X-001' })).toBeNull();
  });

  it('normalizes the returned worktree path (Windows backslashes -> path.resolve)', () => {
    const winPath = 'C:\\\\repo\\\\.worktrees\\\\SD-X-001';
    vi.mocked(listActiveWorktrees).mockReturnValue([
      { path: winPath, branch: 'refs/heads/feat/SD-X-001' },
    ]);
    const out = resolveWorktreeCwd('C:\\\\repo', { expectedBranch: 'feat/SD-X-001', sdId: 'SD-X-001' });
    // The function returns path.resolve(wt.path) — assert it equals the normalized form,
    // proving normalization happens rather than passing the raw mixed-separator string.
    expect(out).toBe(path.resolve(winPath));
  });

  it('returns null when listActiveWorktrees yields [] (git failure -> graceful fallback)', () => {
    vi.mocked(listActiveWorktrees).mockReturnValue([]);
    expect(resolveWorktreeCwd('/repo', { sdId: 'SD-X-001' })).toBeNull();
  });

  it('returns null when appPath is falsy', () => {
    expect(resolveWorktreeCwd('', { sdId: 'SD-X-001' })).toBeNull();
    expect(resolveWorktreeCwd(undefined, { sdId: 'SD-X-001' })).toBeNull();
  });

  it('ignores detached / branch-less worktrees', () => {
    vi.mocked(listActiveWorktrees).mockReturnValue([
      { path: '/repo/.worktrees/detached', head: 'abc123' }, // no branch field
    ]);
    expect(resolveWorktreeCwd('/repo', { sdId: 'SD-X-001' })).toBeNull();
  });
});

describe('SD-LEO-INFRA-BRANCH-AWARE-PLAN-001: GATE5 ignores worktree-runtime artifacts', () => {
  it('isRootTempFile excludes .worktree.json and .worktree-nm-mode (routinely dirty in every worktree)', () => {
    const v = new GitCommitVerifier('SD-X', '/repo');
    // Now that GATE5 reads the SD worktree, these tooling-maintained files would
    // otherwise block every worktree-based handoff.
    expect(v.isRootTempFile('.worktree.json')).toBe(true);
    expect(v.isRootTempFile('.worktree-nm-mode')).toBe(true);
    // Sanity: genuine source changes are still NOT treated as temp artifacts.
    expect(v.isRootTempFile('config.json')).toBe(false);
    expect(v.isRootTempFile('scripts/foo.js')).toBe(false);
  });
});
