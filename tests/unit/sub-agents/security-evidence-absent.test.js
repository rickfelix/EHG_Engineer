/**
 * QF/F2 SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-B
 *
 * Regression: SECURITY execute() must FAIL LOUD when its scans could not run. Each scan
 * helper swallows its own error and returns { checked:false, error, <count>:0 }, and the
 * phase blocks inspect only the count — so pre-fix an ALL-errored scan stayed PASS@100
 * (a zero-evidence result indistinguishable from a clean one). This RED-pre-fix test
 * drives every scan to error (via execAsync rejection + a throwing supabase.rpc) and
 * asserts the verdict is NOT PASS and confidence is NOT 100. A companion test proves a
 * genuinely-clean scan (all helpers ran, zero issues) still yields PASS@100.
 *
 * The scan helpers are not exported, so we stub their sole I/O seam: execAsync =
 * promisify(exec). We mock child_process.exec with a util.promisify.custom implementation
 * whose behavior is toggled by `state.mode`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ mode: 'error' }));

// child_process.exec — security.js does `const execAsync = promisify(exec)`. Attaching the
// promisify.custom symbol makes promisify(exec) resolve to this function directly, so every
// grep|wc-l scan either rejects (mode 'error') or resolves stdout '0' (mode 'clean').
vi.mock('child_process', async () => {
  const { promisify } = await import('util');
  const exec = function exec() {};
  exec[promisify.custom] = () => {
    if (state.mode === 'error') {
      return Promise.reject(new Error('scan command failed: command not found'));
    }
    return Promise.resolve({ stdout: '0\n', stderr: '' });
  };
  return { exec, default: { exec } };
});

// Supabase client used by checkRLSPolicies + set as module-level `supabase`.
vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({
    rpc: async () => {
      // In error mode, throw so RLS falls through to the (also-erroring) migration
      // fallback and returns { checked:false, error }. In clean mode, report zero
      // unprotected tables.
      if (state.mode === 'error') throw new Error('rpc get_tables_without_rls failed');
      return { data: [], error: null };
    }
  }))
}));

vi.mock('../../../scripts/lib/handoff-preflight.js', () => ({
  quickPreflightCheck: vi.fn(async () => ({ ready: true, missing: [] }))
}));

vi.mock('../../../lib/sub-agents/resolve-repo.js', () => ({
  resolveSubAgentRepo: vi.fn(async () => ({ repoPath: '/fake/repo' })),
  applySubAgentRepoVerdict: vi.fn()
}));

const { execute } = await import('../../../lib/sub-agents/security.js');

describe('QF/F2 SECURITY execute() — evidence-absence is non-passing', () => {
  beforeEach(() => {
    state.mode = 'error';
  });

  it('every scan errors (checked:false) => verdict NOT PASS, confidence NOT 100', async () => {
    state.mode = 'error';
    const results = await execute('SD-TEST-EVIDENCE-ABSENT', {}, {});

    expect(results.verdict).not.toBe('PASS');
    expect(results.confidence).not.toBe(100);
    // Must be a verdict result-aggregation.js treats as unconditionally non-passing.
    expect(results.verdict).toBe('BLOCKED');
    expect(results.confidence).toBe(0);
    // The errored scans are surfaced loudly, not silently counted as issues:0-and-secure.
    expect(results.critical_issues.some(ci => /could not run|no evidence/i.test(ci.issue))).toBe(true);
  });

  it('clean scan (all helpers ran, zero issues) still yields PASS@100', async () => {
    state.mode = 'clean';
    const results = await execute('SD-TEST-CLEAN', {}, {});

    expect(results.verdict).toBe('PASS');
    expect(results.confidence).toBe(100);
  });
});
