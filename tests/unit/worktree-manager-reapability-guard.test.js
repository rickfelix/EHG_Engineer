/**
 * SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 — FR-2 / AC-1 / AC-2.
 *
 * Pins the opt-in reapability guard on the bare choke point removeWorktreeViaGit:
 *   - guard:true + live owner   → SKIPPED no-op (never removed)        [AC-1]
 *   - guard:true + dirty tree   → SKIPPED no-op, dir survives          [AC-2]
 *   - guard:false (default)     → guard bypassed (byte-identical path) [back-compat]
 *
 * The exhaustive four-quadrant predicate logic is covered in
 * worktree-reapability.test.js; this file covers the WIRING at the choke point.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeWorktreeViaGit } from '../../lib/worktree-manager.js';

describe('removeWorktreeViaGit — FR-2 reapability guard wiring', () => {
  it('guard:true + liveOwner → SKIPPED, never removes (deterministic, no git)', () => {
    const bogus = path.join(os.tmpdir(), 'reap-guard-live-owner-does-not-exist');
    const r = removeWorktreeViaGit(bogus, os.tmpdir(), {
      guard: true, liveOwner: true, allowFail: true, logger: () => {},
    });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('live_owner');
    expect(r.ok).toBe(false);
  });

  it('guard:false (default) → guard bypassed, proceeds to git (no skipped flag)', () => {
    // Bogus path: git worktree remove fails, allowFail catches it. The point is
    // that the result is an ERROR (git ran), NOT a protective skip.
    const bogus = path.join(os.tmpdir(), 'reap-guard-default-off-does-not-exist');
    const r = removeWorktreeViaGit(bogus, os.tmpdir(), { allowFail: true });
    expect(r.skipped).toBeUndefined();
    expect(r.ok).toBe(false);
  });
});

describe('removeWorktreeViaGit — FR-2 protects a DIRTY tree at the choke point (AC-2)', () => {
  let repo;
  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'reap-guard-dirty-'));
    const opts = { cwd: repo, stdio: 'pipe' };
    execSync('git init -q', opts);
    execSync('git config user.email test@example.com', opts);
    execSync('git config user.name test', opts);
    execSync('git config commit.gpgsign false', opts);
    fs.writeFileSync(path.join(repo, 'base.txt'), 'base\n');
    execSync('git add base.txt', opts);
    execSync('git commit -q -m base', opts);
    // Make the tree DIRTY (uncommitted change) — the data-loss scenario.
    fs.writeFileSync(path.join(repo, 'uncommitted.txt'), 'work in progress\n');
  });
  afterAll(() => { try { fs.rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('guard:true on a dirty repo → SKIPPED (dirty_tree), directory + uncommitted file survive', () => {
    const r = removeWorktreeViaGit(repo, repo, { guard: true, liveOwner: false, allowFail: true, logger: () => {} });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('dirty_tree');
    // The uncommitted work was NOT destroyed.
    expect(fs.existsSync(path.join(repo, 'uncommitted.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(repo, 'uncommitted.txt'), 'utf8')).toContain('work in progress');
  });
});
