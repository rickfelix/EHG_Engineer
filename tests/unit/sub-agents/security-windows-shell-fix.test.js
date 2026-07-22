/**
 * SD-LEARN-FIX-ADDRESS-SAL-SECURITY-001
 *
 * Regression: on Windows, child_process.exec defaults to cmd.exe, which cannot parse the
 * POSIX '2>/dev/null' redirect the SECURITY scan commands rely on -- it fails with "The
 * system cannot find the path specified", so every scan errors and execute() returns
 * BLOCKED@0 even for a perfectly clean, non-vulnerable repo. This test does NOT mock
 * child_process (unlike security-evidence-absent.test.js, which mocks it entirely) --
 * it exercises the real shell execution path against a real directory that has no `src/`
 * (mirroring EHG_Engineer itself), proving the scans complete without erroring.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({
    rpc: async () => ({ data: [], error: null })
  }))
}));

vi.mock('../../../scripts/lib/handoff-preflight.js', () => ({
  quickPreflightCheck: vi.fn(async () => ({ ready: true, missing: [] }))
}));

vi.mock('../../../lib/sub-agents/resolve-repo.js', () => ({
  // Real repo root, which (like EHG_Engineer) has no top-level src/ -- the exact shape
  // that triggered the pre-fix Windows shell failure.
  resolveSubAgentRepo: vi.fn(async () => ({ repoPath: process.cwd() })),
  applySubAgentRepoVerdict: vi.fn()
}));

const { execute } = await import('../../../lib/sub-agents/security.js');

describe('SECURITY execute() — real shell execution against a repo with no src/ (SD-LEARN-FIX-ADDRESS-SAL-SECURITY-001)', () => {
  it('scans complete without erroring, even when the redirect + missing src/ dir combination that broke Windows cmd.exe is present', async () => {
    const results = await execute('SD-TEST-REAL-SHELL', {}, {});

    // Pre-fix on Windows: every scan helper caught an execAsync rejection and returned
    // { checked:false, error }, which makes execute() BLOCKED@0. Post-fix: the scans
    // actually run (checked:true) regardless of whether src/ exists.
    expect(results.findings.authentication_check.checked).toBe(true);
    expect(results.findings.authorization_check.checked).toBe(true);
    expect(results.findings.input_validation.checked).toBe(true);
    expect(results.findings.data_protection.checked).toBe(true);

    for (const key of ['authentication_check', 'authorization_check', 'input_validation', 'data_protection']) {
      expect(results.findings[key].error).toBeUndefined();
    }
  });
});
