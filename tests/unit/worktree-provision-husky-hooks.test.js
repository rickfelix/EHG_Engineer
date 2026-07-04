/**
 * Regression test for QF-20260703-311 (fix 2/2): both worktree node_modules
 * provisioning strategies (junction, and isolate's `--ignore-scripts` install)
 * skip npm's "prepare" lifecycle script, so `.husky/_` — which core.hooksPath
 * points at — never gets created and every git hook silently never fires in a
 * fresh worktree. provisionWorktreeNodeModules must always call an injectable
 * ensureHuskyHooks step, for both strategies, without ever failing the
 * worktree provisioning itself if hook re-linking fails.
 */
import { describe, it, expect, vi } from 'vitest';
import { provisionWorktreeNodeModules, defaultEnsureHuskyHooks } from '../../lib/worktree-provision.js';

function makeDeps(overrides = {}) {
  return {
    decide: vi.fn(() => ({ strategy: 'junction', reason: 'test' })),
    symlink: vi.fn(),
    runInstall: vi.fn(),
    writeMarker: vi.fn(),
    rm: vi.fn(),
    ensureHuskyHooks: vi.fn(() => ({ ok: true })),
    log: vi.fn(),
    ...overrides,
  };
}

describe('provisionWorktreeNodeModules — husky hook re-link (QF-20260703-311)', () => {
  it('calls ensureHuskyHooks on the junction path', () => {
    const deps = makeDeps({ decide: vi.fn(() => ({ strategy: 'junction', reason: 'auto_solo' })) });
    provisionWorktreeNodeModules('/fake/wt', { deps });
    expect(deps.ensureHuskyHooks).toHaveBeenCalledWith('/fake/wt');
  });

  it('calls ensureHuskyHooks on the isolate path', () => {
    const deps = makeDeps({ decide: vi.fn(() => ({ strategy: 'isolate', reason: 'auto_concurrent' })) });
    provisionWorktreeNodeModules('/fake/wt', { deps });
    expect(deps.ensureHuskyHooks).toHaveBeenCalledWith('/fake/wt');
  });

  it('does not throw and still returns success when hook re-linking fails', () => {
    const deps = makeDeps({
      decide: vi.fn(() => ({ strategy: 'junction', reason: 'auto_solo' })),
      ensureHuskyHooks: vi.fn(() => ({ ok: false, error: 'npx husky failed' })),
    });
    const result = provisionWorktreeNodeModules('/fake/wt', { deps });
    expect(result.strategy).toBe('junction');
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('husky hook re-link failed'));
  });
});

describe('defaultEnsureHuskyHooks (SD-FDBK-ENH-SECURITY-FOLLOW-NON-001)', () => {
  it('invokes husky via a direct node call, never via npx (registry-fallthrough hardening)', () => {
    const execSyncImpl = vi.fn(() => '');
    defaultEnsureHuskyHooks('/fake/wt', { execSyncImpl });
    expect(execSyncImpl).toHaveBeenCalledTimes(1);
    const [command, options] = execSyncImpl.mock.calls[0];
    expect(command).not.toMatch(/npx/i);
    expect(command).toMatch(/node\s+node_modules[\\/]husky[\\/]bin\.js/);
    expect(options.cwd).toBe('/fake/wt');
  });

  it('is fail-open: returns {ok:false, error} instead of throwing when the local husky binary is missing', () => {
    const execSyncImpl = vi.fn(() => {
      throw new Error("Cannot find module 'node_modules/husky/bin.js'");
    });
    const result = defaultEnsureHuskyHooks('/fake/wt', { execSyncImpl });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/husky/);
  });

  it('returns {ok:true} on success', () => {
    const execSyncImpl = vi.fn(() => '');
    const result = defaultEnsureHuskyHooks('/fake/wt', { execSyncImpl });
    expect(result).toEqual({ ok: true });
  });
});
