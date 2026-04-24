/**
 * Regression tests for SD-LEO-INFRA-FIX-GATE-FILE-001 Phase 2.
 *
 * Verifies the branch-aware path of `cross-repo-build-check`:
 *   - With a branch option, build runs in a disposable worktree created from
 *     origin/<branch> (not the shared ehg checkout).
 *   - Temp worktree is removed via `git worktree remove --force` on both pass
 *     and fail (finally-block cleanup).
 *   - Without a branch option, legacy shared-checkout behavior is preserved.
 *   - Auth-pattern escalation (shouldForceCheck) is unchanged.
 *
 * Addresses the bug class where gates read from the shared checkout and
 * false-pass / false-fail when parallel sessions toggle its branch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────
let execSyncMock;
let existsSyncMock;
let mkdtempSyncMock;
let rmSyncMock;

vi.mock('child_process', () => ({
  execSync: (...args) => execSyncMock(...args),
}));

vi.mock('fs', () => ({
  existsSync: (...args) => existsSyncMock(...args),
  mkdtempSync: (...args) => mkdtempSyncMock(...args),
  rmSync: (...args) => rmSyncMock(...args),
}));

vi.mock('../../../lib/multi-repo/index.js', () => ({
  getPrimaryRepos: () => ({ ehg: { path: '/repos/ehg' } }),
}));

async function importModule() {
  vi.resetModules();
  return import('../../../lib/gates/cross-repo-build-check.js');
}

// ─── Shared helpers ──────────────────────────────────────────────────────────
function stubFsDefaults() {
  existsSyncMock = vi.fn().mockReturnValue(true);
  mkdtempSyncMock = vi.fn().mockReturnValue('/tmp/ehg-build-abc123');
  rmSyncMock = vi.fn();
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe('cross-repo-build-check branch-aware path (SD-LEO-INFRA-FIX-GATE-FILE-001)', () => {
  beforeEach(() => {
    stubFsDefaults();
  });
  afterEach(() => vi.clearAllMocks());

  it('with { branch } creates a temp worktree from origin/<branch> and builds there', async () => {
    const calls = [];
    execSyncMock = vi.fn((cmd, opts) => {
      calls.push({ cmd, cwd: opts?.cwd });
      return 'build ok';
    });

    const { checkEhgBuild } = await importModule();
    const result = checkEhgBuild({ branch: 'feat/SD-X-001', timeout: 5000 });

    expect(result.pass).toBe(true);
    // Verify the command sequence: fetch → worktree add → build (in temp dir) → worktree remove
    expect(calls[0].cmd).toMatch(/git -C "\/repos\/ehg" fetch origin feat\/SD-X-001/);
    expect(calls[1].cmd).toMatch(/git -C "\/repos\/ehg" worktree add --detach ".*ehg-build-abc123" origin\/feat\/SD-X-001/);
    expect(calls[2].cmd).toBe('npm run build');
    expect(calls[2].cwd).toBe('/tmp/ehg-build-abc123');
    expect(calls[3].cmd).toMatch(/git -C "\/repos\/ehg" worktree remove --force ".*ehg-build-abc123"/);
  });

  it('cleans up the temp worktree even when the build fails', async () => {
    const err = Object.assign(new Error('build failed'), { stderr: 'tsc error' });
    execSyncMock = vi.fn((cmd) => {
      if (cmd === 'npm run build') throw err;
      return '';
    });

    const { checkEhgBuild } = await importModule();
    const result = checkEhgBuild({ branch: 'feat/SD-X-001' });

    expect(result.pass).toBe(false);
    // worktree remove MUST still be called in the finally block
    const removed = execSyncMock.mock.calls.some(([cmd]) => /worktree remove --force/.test(cmd));
    expect(removed).toBe(true);
  });

  it('falls back to rmSync if `git worktree remove` fails (defensive cleanup)', async () => {
    execSyncMock = vi.fn((cmd) => {
      if (/worktree remove/.test(cmd)) throw new Error('worktree locked');
      if (cmd === 'npm run build') return 'build ok';
      return '';
    });

    const { checkEhgBuild } = await importModule();
    checkEhgBuild({ branch: 'feat/SD-X-001' });

    expect(rmSyncMock).toHaveBeenCalledWith('/tmp/ehg-build-abc123', { recursive: true, force: true });
  });

  it('without { branch } builds in the shared checkout (legacy path, no worktree)', async () => {
    const calls = [];
    execSyncMock = vi.fn((cmd, opts) => {
      calls.push({ cmd, cwd: opts?.cwd });
      return 'build ok';
    });

    const { checkEhgBuild } = await importModule();
    const result = checkEhgBuild();

    expect(result.pass).toBe(true);
    expect(mkdtempSyncMock).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ cmd: 'npm run build', cwd: '/repos/ehg' });
  });

  it('shouldForceCheck detects auth-pattern files (advisory → required escalation)', async () => {
    const { shouldForceCheck } = await importModule();
    expect(shouldForceCheck(['src/lib/authedFetch.ts'])).toBe(true);
    expect(shouldForceCheck(['src/session/login.ts'])).toBe(true);
    expect(shouldForceCheck(['README.md', 'src/components/Foo.tsx'])).toBe(false);
    expect(shouldForceCheck([])).toBe(false);
    expect(shouldForceCheck(undefined)).toBe(false);
  });

  it('createCrossRepoBuildGate routes the resolved SD branch into checkEhgBuild', async () => {
    const calls = [];
    // branch lookup returns feat/SD-Y-001, then build/cleanup
    execSyncMock = vi.fn((cmd, opts) => {
      calls.push({ cmd, cwd: opts?.cwd });
      if (/branch -r/.test(cmd)) return '  origin/main\n  origin/feat/SD-Y-001\n';
      if (cmd === 'npm run build') return 'build ok';
      return '';
    });

    const { createCrossRepoBuildGate } = await importModule();
    const gate = createCrossRepoBuildGate();
    const result = await gate.validator({ sd: { sd_key: 'SD-Y-001' } });

    expect(result.pass).toBe(true);
    // Must have used the temp worktree (legacy path would not call git worktree add)
    const usedWorktree = execSyncMock.mock.calls.some(([cmd]) => /worktree add --detach/.test(cmd));
    expect(usedWorktree).toBe(true);
  });
});
