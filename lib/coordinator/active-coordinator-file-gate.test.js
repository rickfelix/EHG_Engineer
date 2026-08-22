// SD-LEO-FIX-ENF-TRUSTS-FILE-001
// Focused tests for the VITEST-gated ACTIVE_COORDINATOR_FILE / COORD_FILE constants themselves
// (resolve.cjs and session-role-orient.cjs) — FR-1, FR-2, FR-6, FR-7.
//
// These constants did not exist before this SD, so no prior test exercises their non-VITEST
// (production) branch. Per FR-7, the require.cache deletion idiom is required to actually reach
// that branch from within a running vitest process (vi.resetModules() alone does not reliably
// re-evaluate a .cjs module's top-level constants here — confirmed during PLAN-phase validation).

import { describe, it, expect } from 'vitest';
import os from 'os';

const RESOLVE_PATH = require.resolve('./resolve.cjs');
const HOOK_PATH = require.resolve('../../scripts/hooks/session-role-orient.cjs');

function freshRequire(resolvedPath) {
  delete require.cache[resolvedPath];
  return require(resolvedPath);
}

describe('ACTIVE_COORDINATOR_FILE / COORD_FILE gate', () => {
  it('resolve.cjs redirects under VITEST (the current, always-true process state)', () => {
    const { ACTIVE_COORDINATOR_FILE } = freshRequire(RESOLVE_PATH);
    expect(ACTIVE_COORDINATOR_FILE.startsWith(os.tmpdir())).toBe(true);
    expect(ACTIVE_COORDINATOR_FILE).not.toContain('.claude');
  });

  it('resolve.cjs resolves to the real path when VITEST is unset (FR-1 AC-1 / TS-2)', () => {
    const saved = process.env.VITEST;
    try {
      delete process.env.VITEST;
      const { ACTIVE_COORDINATOR_FILE } = freshRequire(RESOLVE_PATH);
      expect(ACTIVE_COORDINATOR_FILE).toContain('.claude');
      expect(ACTIVE_COORDINATOR_FILE.endsWith('active-coordinator.json')).toBe(true);
    } finally {
      process.env.VITEST = saved;
      freshRequire(RESOLVE_PATH); // restore the module to its gated state for subsequent tests
    }
  });

  it('session-role-orient.cjs COORD_FILE redirects under VITEST', () => {
    const { COORD_FILE } = freshRequire(HOOK_PATH);
    expect(COORD_FILE.startsWith(os.tmpdir())).toBe(true);
  });

  it('session-role-orient.cjs COORD_FILE resolves to the real path when VITEST is unset (FR-2 AC-3 / TS-9)', () => {
    const saved = process.env.VITEST;
    try {
      delete process.env.VITEST;
      const { COORD_FILE } = freshRequire(HOOK_PATH);
      expect(COORD_FILE).toContain('.claude');
      expect(COORD_FILE.endsWith('active-coordinator.json')).toBe(true);
    } finally {
      process.env.VITEST = saved;
      freshRequire(HOOK_PATH);
    }
  });

  it('both gated constants agree under identical process.env.VITEST state (FR-2 AC-4 / TS-10)', () => {
    const { ACTIVE_COORDINATOR_FILE } = freshRequire(RESOLVE_PATH);
    const { COORD_FILE } = freshRequire(HOOK_PATH);
    // Both must use the same per-PID isolation pattern -- proves the two independently
    // hardcoded copies did not silently diverge.
    expect(ACTIVE_COORDINATOR_FILE.startsWith(os.tmpdir())).toBe(true);
    expect(COORD_FILE.startsWith(os.tmpdir())).toBe(true);
    expect(ACTIVE_COORDINATOR_FILE).toContain(`leo-coord-test-${process.pid}`);
    expect(COORD_FILE).toContain(`leo-coord-test-${process.pid}`);
  });

  it("treats VITEST='1' identically to VITEST='true' (FR-6 AC-2 / TS-12)", () => {
    const saved = process.env.VITEST;
    try {
      process.env.VITEST = '1';
      const { ACTIVE_COORDINATOR_FILE } = freshRequire(RESOLVE_PATH);
      const { COORD_FILE } = freshRequire(HOOK_PATH);
      expect(ACTIVE_COORDINATOR_FILE.startsWith(os.tmpdir())).toBe(true);
      expect(COORD_FILE.startsWith(os.tmpdir())).toBe(true);
    } finally {
      process.env.VITEST = saved;
      freshRequire(RESOLVE_PATH);
      freshRequire(HOOK_PATH);
    }
  });
});
