/**
 * ENFORCEMENT 12e — worktree-placement sibling guard (SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001)
 *
 * Integration tests that invoke pre-tool-enforce.cjs as a subprocess, mirroring the
 * ENFORCEMENT 12 (npm-install-guard) test pattern.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// This suite may run from EITHER the main repo or an SD/QF worktree checkout (both carry an
// identical copy of the hook). `path.resolve('.')` would silently pick whichever one the
// runner happens to be invoked from — exactly the F-A polarity-inversion class the hook
// itself was fixed for (TESTING sub-agent finding, evidence c94b16a8). Resolve the actual
// MAIN repo root via `git rev-parse --git-common-dir`, the same mechanism ENFORCEMENT 12e
// uses, so `cwd` below is deterministic regardless of where this suite is invoked from.
const hookPath = path.resolve('scripts/hooks/pre-tool-enforce.cjs');
const commonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim();
const repoRoot = path.dirname(path.isAbsolute(commonDir) ? commonDir : path.resolve(commonDir));

function runHook(toolName, toolInput, env = {}) {
  const mergedEnv = {
    ...process.env,
    CLAUDE_TOOL_NAME: toolName,
    CLAUDE_TOOL_INPUT: JSON.stringify(toolInput),
    LEO_RCA_ENFORCEMENT: 'off',
    ...env,
  };
  try {
    const stdout = execSync(`node "${hookPath}"`, {
      env: mergedEnv,
      cwd: repoRoot,
      timeout: 15000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

describe('pre-tool-enforce — ENFORCEMENT 12e (worktree-add sibling guard)', () => {
  it('REFUSES a relative sibling `git worktree add ../x -b y`', () => {
    const result = runHook('Bash', { command: 'git worktree add ../EHG_Engineer-smoke-test -b smoke/outside-guard', cwd: repoRoot });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/ENF-12e/);
    expect(result.stderr).toMatch(/\.worktrees\/\{sd,qf,adhoc\}\/<key>/);
  });

  it('ALLOWS an in-tree `git worktree add .worktrees/qf/<id> -b <branch>`', () => {
    const result = runHook('Bash', { command: 'git worktree add .worktrees/qf/QF-SMOKE-TEST-001 -b qf/QF-SMOKE-TEST-001', cwd: repoRoot });
    expect(result.stderr).not.toMatch(/ENF-12e/);
  });

  it('does NOT intercept `git worktree remove` (owned by ENFORCEMENT 12d, unaffected)', () => {
    const result = runHook('Bash', { command: 'git worktree remove .worktrees/qf/QF-SMOKE-TEST-001', cwd: repoRoot }, { LEO_WORKTREE_REMOVE_GUARD: 'off' });
    expect(result.stderr).not.toMatch(/ENF-12e/);
  });

  it('does NOT intercept `git worktree move`', () => {
    const result = runHook('Bash', { command: 'git worktree move .worktrees/qf/QF-1 .worktrees/qf/QF-2', cwd: repoRoot });
    expect(result.stderr).not.toMatch(/ENF-12e/);
  });

  it('REFUSES the separator-anchor bypass `.worktrees-evil` (F5)', () => {
    const result = runHook('Bash', { command: 'git worktree add ../EHG_Engineer.worktrees-evil/x -b y', cwd: repoRoot });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/ENF-12e/);
  });

  it('honors the LEO_WORKTREE_ADD_GUARD=off escape hatch', () => {
    const result = runHook('Bash', { command: 'git worktree add ../EHG_Engineer-smoke-test -b smoke/outside-guard', cwd: repoRoot }, { LEO_WORKTREE_ADD_GUARD: 'off' });
    expect(result.stderr).not.toMatch(/ENF-12e/);
  });

  // SECURITY sub-agent finding S-1 (evidence c15134e8): the block previously entered its
  // try{} and ran (require + `git rev-parse` execSync) for EVERY Bash call, not just a
  // matched `git worktree add` -- loading 82 .env secret keys into the hook process on
  // every call. Fixed by gating on the cheap, pure extractTargetPath() first. This test
  // doesn't (can't, without mocking require) prove the heavy path was skipped, but it does
  // confirm an UNRELATED command produces zero ENF-12e output and a clean exit, which the
  // fix's shape (early `if (extractTargetPath(...))` before any heavy require) guarantees
  // structurally -- see lib/__tests__/worktree-add-sibling-guard.test.js for `extractTargetPath`
  // returning null on unrelated commands, the actual gate this depends on.
  it('does not engage for an unrelated command (git status)', () => {
    const result = runHook('Bash', { command: 'git status', cwd: repoRoot });
    expect(result.stderr).not.toMatch(/ENF-12e/);
  });

  it('ALLOWS the correct in-tree target when cwd is itself an SD/QF worktree (F-A regression, evidence c94b16a8)', () => {
    // The polarity-inversion bug: a naive .git-marker walk from an SD-worktree cwd stops at
    // that worktree's OWN .git FILE (worktrees carry a .git file, not a dir), wrongly treating
    // the worktree itself as "repo root" -- so the CORRECT command below was refused. Fixed by
    // deriving repoRoot via `git rev-parse --git-common-dir` instead.
    // Use THIS SD's own real, currently-checked-out worktree as the fixture cwd (a fake
    // nonexistent path would fail to spawn the `git` subprocess before the guard even runs).
    const worktreeCwd = path.join(repoRoot, '.worktrees', 'SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001');
    const result = runHook('Bash', { command: 'git worktree add .worktrees/qf/QF-FA-REGRESSION -b qf/QF-FA-REGRESSION', cwd: worktreeCwd });
    expect(result.stderr).not.toMatch(/ENF-12e/);
  });

  // QF-20260904-283: quota enforcement at the registration event itself, not only in the three
  // canonical creator scripts. A live-count-40 fixture would require actually registering 40 real
  // worktrees against this repo, which is both slow and would corrupt a real developer/CI
  // checkout -- the same "top-level CLI script, real side effects" constraint that
  // tests/unit/worktree-reaper/qf-quota-relocation.test.js documents for qf-start.js/
  // create-quick-fix.js. Mirrors that file's established convention: source-order / static-content
  // assertions instead of full behavioural execution, PLUS the live "does not falsely block a
  // normal in-tree add under today's real (well-under-cap) count" regression check above.
  describe('quota enforcement (source-order assertions, mirrors qf-quota-relocation.test.js convention)', () => {
    const src = fs.readFileSync(hookPath, 'utf8');

    it('calls enforceWorktreeQuota inside the ENF-12e block', () => {
      const blockIdx = src.indexOf('ENFORCEMENT 12e');
      const quotaIdx = src.indexOf('enforceWorktreeQuota(', blockIdx);
      expect(blockIdx, 'ENFORCEMENT 12e block not found').toBeGreaterThan(-1);
      expect(quotaIdx, 'enforceWorktreeQuota( call not found inside ENF-12e').toBeGreaterThan(blockIdx);
    });

    it('on WORKTREE_QUOTA_EXCEEDED, blocks via auditAndExit(_, 2, _) with the quota error text', () => {
      const quotaIdx = src.indexOf('enforceWorktreeQuota(');
      const exceededIdx = src.indexOf("quotaErr.errorCode === 'WORKTREE_QUOTA_EXCEEDED'", quotaIdx);
      expect(exceededIdx, 'WORKTREE_QUOTA_EXCEEDED branch not found after the quota call').toBeGreaterThan(quotaIdx);
      const exitIdx = src.indexOf('auditAndExit(auditPromise, 2, 1000)', exceededIdx);
      expect(exitIdx, 'no exit(2) found in the quota-exceeded branch').toBeGreaterThan(exceededIdx);
      // "same error text so every path meets the same count" (QF FIX text) — reuses
      // quotaErr.message verbatim (createQuotaExceededError's text), never a re-authored string.
      const branch = src.slice(exceededIdx, exitIdx);
      expect(branch).toContain('quotaErr.message');
    });

    it('a non-quota error from enforceWorktreeQuota is fail-open (never blocks)', () => {
      const quotaIdx = src.indexOf('enforceWorktreeQuota(');
      const exceededIdx = src.indexOf("quotaErr.errorCode === 'WORKTREE_QUOTA_EXCEEDED'", quotaIdx);
      const catchEnd = src.indexOf('}\n      }\n    } catch { /* fail-open on any internal error */ }', exceededIdx);
      expect(catchEnd, 'expected the quota try/catch to close before the outer ENF-12e catch').toBeGreaterThan(exceededIdx);
      const afterBranch = src.slice(exceededIdx, catchEnd);
      // Only ONE auditAndExit call in this whole span (the quota-exceeded branch) — any other
      // thrown error falls through with no second exit call, i.e. fail-open.
      const exitCount = (afterBranch.match(/auditAndExit\(/g) || []).length;
      expect(exitCount).toBe(1);
    });
  });
});
