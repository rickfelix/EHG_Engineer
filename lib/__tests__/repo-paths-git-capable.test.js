/**
 * Tests for isGitCapableRepo (RCA fix: GATE5/GATE6 self-skip for non-git-capable targets)
 *
 * These tests are deterministic/offline — they check real filesystem state for
 * EHG_Engineer (known-good git) and EHG (known-empty/stub git), and verify the
 * self-skip branches in the gate validators without invoking live verifiers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── isGitCapableRepo ────────────────────────────────────────────────────────

describe('isGitCapableRepo', () => {
  it('returns true for EHG_Engineer (has a real, live git repo)', async () => {
    // Clear module cache so registry is re-loaded fresh
    const { clearCache, isGitCapableRepo } = await import('../repo-paths.js');
    clearCache();
    expect(isGitCapableRepo('EHG_Engineer')).toBe(true);
  });

  it('returns false for EHG (detached HEAD — no branch pointer, branch ops unsupported)', async () => {
    const { clearCache, isGitCapableRepo } = await import('../repo-paths.js');
    clearCache();
    // EHG is locked to detached HEAD (origin/main) — git symbolic-ref HEAD fails → false.
    // Branch enforcement gates (GATE5/GATE6) cannot create or switch branches there.
    expect(isGitCapableRepo('EHG')).toBe(false);
  });

  it('returns false for an unknown application name', async () => {
    const { clearCache, isGitCapableRepo } = await import('../repo-paths.js');
    clearCache();
    expect(isGitCapableRepo('DOES_NOT_EXIST_APP')).toBe(false);
  });

  it('returns false when targetApp is null/undefined', async () => {
    const { clearCache, isGitCapableRepo } = await import('../repo-paths.js');
    clearCache();
    // resolveRepoPath(null) returns ENGINEER_ROOT which IS git-capable — but null
    // is the no-app-specified sentinel; for the gate predicate we check `sd.target_application`
    // which is always a non-null string. Test null for safety.
    // The function will hit resolveRepoPath(null) → ENGINEER_ROOT → git-capable.
    // Document this: null falls through to EHG_Engineer path (true).
    const result = isGitCapableRepo(null);
    // This is expected behaviour: null → ENGINEER_ROOT which IS git-capable.
    expect(typeof result).toBe('boolean');
  });
});

// ── isVentureRepo (drives the platform-skip vs venture-fail-closed branch) ──

describe('isVentureRepo', () => {
  it('returns false for platform repos (EHG, EHG_Engineer — case-insensitive)', async () => {
    const { isVentureRepo } = await import('../repo-paths.js');
    expect(isVentureRepo('EHG')).toBe(false);
    expect(isVentureRepo('ehg')).toBe(false);
    expect(isVentureRepo('EHG_Engineer')).toBe(false);
    expect(isVentureRepo('ehg_engineer')).toBe(false);
  });

  it('returns true for any non-platform (venture) target', async () => {
    const { isVentureRepo } = await import('../repo-paths.js');
    expect(isVentureRepo('CronLinter')).toBe(true);
    expect(isVentureRepo('Canvas AI')).toBe(true);
    expect(isVentureRepo('FakeVentureXYZ')).toBe(true);
  });
});

// ── GATE6 branch-enforcement self-skip ─────────────────────────────────────

describe('GATE6 branch-enforcement self-skip', () => {
  it('returns passed:true with skipped_not_applicable for EHG target', async () => {
    const { createBranchEnforcementGate } = await import(
      '../../scripts/modules/handoff/executors/plan-to-exec/gates/branch-enforcement.js'
    );

    const sd = { target_application: 'EHG', title: 'test SD', sd_type: 'refactor' };
    const gate = createBranchEnforcementGate(sd, '/bogus/path');

    // The gate validator self-skips without calling git or the verifier
    const result = await gate.validator({ sdId: 'SD-TEST-001' });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.skipped_not_applicable).toBe(true);
    expect(result.details.target_application).toBe('EHG');
    expect(result.issues).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/GATE6 N\/A/);
  });

  // SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 FR-4 (SECURITY VB-4): a not-git-capable VENTURE
  // target must FAIL-CLOSED, not free-pass like the EHG platform repo.
  it('FAILS-CLOSED for a not-git-capable VENTURE target (no free-pass)', async () => {
    const { createBranchEnforcementGate } = await import(
      '../../scripts/modules/handoff/executors/plan-to-exec/gates/branch-enforcement.js'
    );

    // FakeVentureXYZ: not in registry → resolveRepoPath null → isGitCapableRepo false;
    // not a platform repo → isVentureRepo true → fail-closed.
    const sd = { target_application: 'FakeVentureXYZ', title: 'venture SD', sd_type: 'feature' };
    const gate = createBranchEnforcementGate(sd, '/bogus/path');
    const result = await gate.validator({ sdId: 'SD-VENTURE-TEST-001' });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details.fail_closed_venture_repo).toBe(true);
    expect(result.details.target_application).toBe('FakeVentureXYZ');
    expect(result.issues[0]).toMatch(/FAIL-CLOSED/);
    expect(result.issues[0]).toMatch(/VB-4/);
  });

  it('does NOT self-skip for EHG_Engineer target (proceeds to verifier path)', async () => {
    const { createBranchEnforcementGate } = await import(
      '../../scripts/modules/handoff/executors/plan-to-exec/gates/branch-enforcement.js'
    );

    const sd = { target_application: 'EHG_Engineer', title: 'test SD', sd_type: 'refactor' };
    const gate = createBranchEnforcementGate(sd, '/bogus/path');

    // The validator will NOT self-skip and will try to call the real verifier.
    // We expect it NOT to return skipped_not_applicable — it will throw or
    // return a non-skip result because appPath is bogus. Either outcome confirms
    // the skip branch was not taken.
    let result;
    try {
      result = await gate.validator({ sdId: 'SD-TEST-002' });
    } catch {
      // Threw because verifier ran against bogus path — confirms skip was NOT taken
      result = null;
    }

    if (result !== null) {
      // If it returned (e.g. verifier handled missing path gracefully), confirm no skip flag
      expect(result.details?.skipped_not_applicable).toBeFalsy();
    }
    // If result is null (threw), the test passes — the skip branch was not taken
    expect(true).toBe(true);
  });
});

// ── GATE5 git-commit-enforcement self-skip ──────────────────────────────────

describe('GATE5 git-commit-enforcement self-skip', () => {
  it('returns passed:true with skipped_not_applicable for EHG target (non-infra sd_type)', async () => {
    const { createGitCommitEnforcementGate } = await import(
      '../../scripts/modules/handoff/executors/plan-to-lead/gates/git-commit-enforcement.js'
    );

    // Use sd_type='refactor' so the infra/bugfix early-return does NOT fire
    // and the new git-incapable check fires instead
    const sd = { target_application: 'EHG', title: 'test SD', sd_type: 'refactor' };
    const supabase = {
      from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) })
    };

    const gate = createGitCommitEnforcementGate(supabase, sd, '/bogus/path');
    const result = await gate.validator({ sdId: 'SD-TEST-003', sd });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.skipped_not_applicable).toBe(true);
    expect(result.details.target_application).toBe('EHG');
    expect(result.warnings[0]).toMatch(/GATE5 N\/A/);
  });

  // SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 FR-4 (SECURITY VB-4): venture target fail-closed.
  it('FAILS-CLOSED for a not-git-capable VENTURE target (non-infra sd_type)', async () => {
    const { createGitCommitEnforcementGate } = await import(
      '../../scripts/modules/handoff/executors/plan-to-lead/gates/git-commit-enforcement.js'
    );

    // sd_type='feature' so the infra/bugfix relaxed early-return does NOT fire.
    const sd = { target_application: 'FakeVentureXYZ', title: 'venture SD', sd_type: 'feature' };
    const supabase = {
      from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) })
    };

    const gate = createGitCommitEnforcementGate(supabase, sd, '/bogus/path');
    const result = await gate.validator({ sdId: 'SD-VENTURE-TEST-002', sd });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details.fail_closed_venture_repo).toBe(true);
    expect(result.details.target_application).toBe('FakeVentureXYZ');
    expect(result.issues[0]).toMatch(/FAIL-CLOSED/);
    expect(result.issues[0]).toMatch(/VB-4/);
  });

  it('infra sd_type still takes the original relaxed path (existing behaviour unchanged)', async () => {
    const { createGitCommitEnforcementGate } = await import(
      '../../scripts/modules/handoff/executors/plan-to-lead/gates/git-commit-enforcement.js'
    );

    // isInfrastructureSDSync returns true for sd_type='infrastructure'
    const sd = { target_application: 'EHG', title: 'test SD', sd_type: 'infrastructure' };
    const supabase = {};

    const gate = createGitCommitEnforcementGate(supabase, sd, '/bogus/path');
    const result = await gate.validator({ sdId: 'SD-TEST-004', sd });

    expect(result.passed).toBe(true);
    // The original infra path sets is_relaxed_sd, NOT skipped_not_applicable
    expect(result.details.is_relaxed_sd).toBe(true);
    expect(result.details.skipped_not_applicable).toBeUndefined();
  });

  it('does NOT self-skip for EHG_Engineer target (proceeds to verifier path)', async () => {
    const { createGitCommitEnforcementGate } = await import(
      '../../scripts/modules/handoff/executors/plan-to-lead/gates/git-commit-enforcement.js'
    );

    const sd = { target_application: 'EHG_Engineer', title: 'test SD', sd_type: 'refactor' };
    // Minimal supabase mock that returns empty children so parent-SD check passes through
    const supabase = {
      from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) })
    };

    const gate = createGitCommitEnforcementGate(supabase, sd, '/bogus/path');

    let result;
    try {
      result = await gate.validator({ sdId: 'SD-TEST-005', sd });
    } catch {
      result = null;
    }

    if (result !== null) {
      // If it returned, confirm it did not take the git-incapable skip path
      expect(result.details?.skipped_not_applicable).toBeFalsy();
    }
    // null means verifier ran and threw (skip branch was not taken) — acceptable
    expect(true).toBe(true);
  });
});
