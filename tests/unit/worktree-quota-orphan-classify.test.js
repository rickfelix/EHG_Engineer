/**
 * SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 — FR-4 / AC-3.
 *
 * The ORPHAN_DETECTED count must EXCLUDE dirs that are owned by a live session
 * or hold uncommitted/unpushed work — they are not safe-to-reap orphans, and
 * counting them inflated the "N orphan directories" warning that preceded the
 * active-claim reaping incident. Plain leftover dirs (no .git) ARE genuine
 * orphans and still count: such a dir cannot carry its own git state (git would
 * report the enclosing repo), so only worktree-root dirs get the dirty/unpushed
 * predicate.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyOrphanDirs, emitOrphanWarningIfAny } from '../../lib/worktree-quota.js';

const norm = (p) => path.resolve(p).replace(/\\/g, '/'); // mirrors quota-local normalizePath

// Per-dir mock git: branch on cwd so each fixture worktree reports its own state.
function mockGit(args, cwd) {
  const c = norm(cwd);
  if (args[0] === 'status') {
    return { code: 0, stdout: c.includes('dirty-orphan') ? ' M work.js\n' : '', stderr: '' };
  }
  if (args[0] === 'cherry') {
    return { code: 0, stdout: c.includes('unpushed-orphan') ? '+ abc123 wip\n' : '', stderr: '' };
  }
  return { code: 0, stdout: '', stderr: '' };
}

describe('worktree-quota — classifyOrphanDirs (FR-4)', () => {
  let wtDir;
  // worktree-root fixtures get a .git marker so the dirty/unpushed predicate runs;
  // plain-leftover has NO .git (genuine orphan); registered-wt is filtered out.
  const worktreeRoots = ['clean-orphan', 'dirty-orphan', 'unpushed-orphan', 'live-orphan', 'registered-wt'];
  beforeAll(() => {
    wtDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-orphan-'));
    for (const d of worktreeRoots) {
      fs.mkdirSync(path.join(wtDir, d));
      fs.writeFileSync(path.join(wtDir, d, '.git'), 'gitdir: /fake\n');
    }
    fs.mkdirSync(path.join(wtDir, 'plain-leftover')); // no .git → genuine orphan
  });
  afterAll(() => { try { fs.rmSync(wtDir, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('counts reapable orphans (clean worktree + plain leftover); excludes registered/dirty/unpushed/live', () => {
    const registered = [{ path: path.join(wtDir, 'registered-wt') }];
    const liveOwners = new Set([norm(path.join(wtDir, 'live-orphan'))]);
    const r = classifyOrphanDirs(wtDir, registered, { liveOwners, gitRunner: mockGit });

    // 5 unregistered dirs (registered-wt filtered out before classification).
    expect(r.total).toBe(5);
    // clean-orphan (predicate=clean) + plain-leftover (no .git) are reapable.
    expect(r.reapable).toBe(2);
    const byDir = Object.fromEntries(r.excluded.map((e) => [e.dir, e.reason]));
    expect(byDir['dirty-orphan']).toBe('dirty_tree');
    expect(byDir['unpushed-orphan']).toBe('unpushed');
    expect(byDir['live-orphan']).toBe('live_owner');
    expect(byDir['plain-leftover']).toBeUndefined(); // counted, not excluded
    expect(byDir['registered-wt']).toBeUndefined();  // filtered, never classified
  });

  it('emitOrphanWarningIfAny with options reports the ADJUSTED (reapable-only) count', () => {
    const registered = [{ path: path.join(wtDir, 'registered-wt') }];
    const liveOwners = new Set([norm(path.join(wtDir, 'live-orphan'))]);
    const logs = [];
    // Legacy arithmetic (fs=6, registered=1) would say 5 orphans; adjusted = 2.
    const adjusted = emitOrphanWarningIfAny(6, 1, (m) => logs.push(m), {
      worktreesDir: wtDir, registered, liveOwners, gitRunner: mockGit,
    });
    expect(adjusted).toBe(2);
    expect(logs.join('\n')).toMatch(/ORPHAN_DETECTED: 2 orphan/);
    expect(logs.join('\n')).toMatch(/excluded 3 owned\/dirty\/unpushed/);
  });

  it('emitOrphanWarningIfAny WITHOUT options falls back to legacy arithmetic (back-compat)', () => {
    const logs = [];
    const n = emitOrphanWarningIfAny(5, 1, (m) => logs.push(m));
    expect(n).toBe(4);
    expect(logs.join('\n')).toMatch(/ORPHAN_DETECTED: 4 orphan/);
  });
});
