/**
 * ENFORCEMENT 12e — worktree-placement sibling guard (SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001)
 *
 * Integration tests that invoke pre-tool-enforce.cjs as a subprocess, mirroring the
 * ENFORCEMENT 12 (npm-install-guard) test pattern.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

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
});
