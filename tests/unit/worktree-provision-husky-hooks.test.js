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
import { provisionWorktreeNodeModules } from '../../lib/worktree-provision.js';

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
