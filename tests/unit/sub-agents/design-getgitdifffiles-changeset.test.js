/**
 * SD-LEO-INFRA-DESIGN-GATE-CROSSREPO-DIFF-001 (FR-1/FR-3/FR-4) — getGitDiffFiles changeset + fail-loud.
 *
 * Bug: getGitDiffFiles ran `git diff --name-only HEAD` (working-tree vs HEAD), which is EMPTY once
 * the worker's changes are COMMITTED by EXEC-TO-PLAN → the design gate reported files_analyzed:0 on
 * every committed SD (and always on a cross-repo ehg checkout). Fix: compare the branch changeset
 * `<baseRef>..HEAD` (default origin/main), honor an overridable baseRef, run against the caller-
 * resolved repoPath, and FAIL LOUD (return null, not []) on a git failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// getGitDiffFiles uses `promisify(exec)`. Attach util.promisify.custom to the mocked exec so
// promisify(exec) returns our directly-controllable async fn (execAsyncImpl) — no callback dance.
const execAsyncImpl = vi.hoisted(() => vi.fn());
const execMock = vi.hoisted(() => {
  const { promisify } = require('node:util');
  const fn = vi.fn();
  fn[promisify.custom] = execAsyncImpl;
  return fn;
});
vi.mock('child_process', () => ({ exec: execMock }));
// Stub utils.js's heavy transitive imports so importing the SUT stays lightweight + hermetic.
vi.mock('../../../lib/utils/risk-context.js', () => ({
  getRiskContext: vi.fn(),
  calculateContextualConfidence: vi.fn(),
  getAggregateRiskStats: vi.fn(),
}));
vi.mock('../../../scripts/modules/contract-validation.js', () => ({
  validateComponentAgainstUxContract: vi.fn(),
  getInheritedContracts: vi.fn(),
}));

const { getGitDiffFiles } = await import('../../../lib/sub-agents/design/utils.js');

/** execAsync(cmd, opts) resolves to { stdout } (the promisify.custom contract). */
function execResolves(stdout) {
  execAsyncImpl.mockResolvedValue({ stdout, stderr: '' });
}
/** execAsync rejects (git failure). Use the ONE-SHOT `mockRejectedValueOnce` rather than the
 *  persistent `mockImplementation`/`mockRejectedValue`. A PERSISTENT rejecting mock leaves a
 *  rejected promise in vitest's mock bookkeeping that its onUnhandledRejection listener flags as
 *  unhandled and (mis)attributes to whichever test is in flight — even though getGitDiffFiles
 *  awaits the call inside its own try/catch and returns null (verified: the throw never escapes the
 *  SUT). A no-op `.catch` on a local promise reference does NOT cover the copy vitest inspects, so
 *  that workaround does not help. The one-shot variant produces the rejected promise exactly once,
 *  at call time, where the awaiting SUT consumes it immediately — no lingering tracked rejection. */
function execRejects(message) {
  execAsyncImpl.mockRejectedValueOnce(new Error(message));
}

describe('getGitDiffFiles — committed-changeset diff (FR-1/FR-3)', () => {
  beforeEach(() => execAsyncImpl.mockReset());

  it('diffs the branch changeset vs origin/main (NOT the working tree HEAD) against the given repoPath', async () => {
    execResolves('src/a.tsx\nsrc/b.js\nsrc/c.jsx\nREADME.md\n');
    const files = await getGitDiffFiles('/repos/ehg');
    expect(files).toEqual(['src/a.tsx', 'src/c.jsx']); // .tsx/.jsx only; .js/.md excluded
    const [cmd, opts] = execAsyncImpl.mock.calls[0];
    expect(cmd).toContain('git diff --name-only origin/main..HEAD');
    expect(cmd).not.toMatch(/diff --name-only HEAD\b/); // not the working-tree form
    expect(opts.cwd).toBe('/repos/ehg'); // runs against the caller-resolved (cross-repo) root
  });

  it('returns [] for a genuinely empty changeset (not a failure)', async () => {
    execResolves('\n');
    expect(await getGitDiffFiles('/repos/ehg')).toEqual([]);
  });

  it('honors an overridable baseRef', async () => {
    execResolves('x.tsx\n');
    await getGitDiffFiles('/repos/ehg', 'origin/develop');
    expect(execAsyncImpl.mock.calls[0][0]).toContain('origin/develop..HEAD');
  });

  it('FR-4: returns null + logs loudly on a git failure (never a silent 0)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    execRejects('fatal: bad revision origin/main..HEAD');
    const result = await getGitDiffFiles('/repos/ehg');
    expect(result).toBeNull(); // null (failure) is DISTINCT from [] (empty changeset)
    expect(errSpy).toHaveBeenCalledOnce();
    expect(errSpy.mock.calls[0][0]).toMatch(/git diff failed/i);
    errSpy.mockRestore();
  });
});
