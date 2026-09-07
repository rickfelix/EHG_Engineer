/**
 * QF-20260905-149 — unregistered+stale bypass for the orphan sweep's content-cap refusal,
 * independent of SD/QF DB status. Closes the deadlock: a large orphan of a LIVE SD is refused
 * cap_exceeded/high_content, the only existing bypass (QF-20260901-005) requires the SD to
 * already be completed/cancelled, and the orphan dir itself blocks sd-start.js for that SD.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { partitionUnregisteredStaleRefusals, runOrphanSweep } from '../../../lib/worktree-reaper/orphan-sweep.js';
import { REASON, CONTENT_REFUSE_MIN_FILES } from '../../../lib/worktree-reaper/orphan-content-probe.mjs';

describe('partitionUnregisteredStaleRefusals', () => {
  const now = Date.now();
  const minAgeMs = 30 * 60 * 1000;
  const stale = now - 2 * minAgeMs;
  const fresh = now - 1000;

  function fakeFs({ hasGit = false, hasReparseNodeModules = false } = {}) {
    return {
      existsSync: (p) => hasGit && p.endsWith(path.join('x', '.git')),
      lstatSync: (p) => ({ isSymbolicLink: () => hasReparseNodeModules && p.endsWith('node_modules') }),
    };
  }

  it('bypasses a stale, no-.git, no-reparse high_content refusal regardless of DB status', () => {
    const refused = [{ dir: 'sd/SD-LIVE-1', full: '/x', reason: REASON.HIGH_CONTENT, newestMtimeMs: stale }];
    const { bypassed, stillRefused } = partitionUnregisteredStaleRefusals(refused, { minAgeMs, now, fsImpl: fakeFs() });
    expect(bypassed).toEqual([{ dir: 'sd/SD-LIVE-1', full: '/x', unregisteredStaleBypass: true, noGitFile: true, noReparsePoints: true, staleMtime: true }]);
    expect(stillRefused).toEqual([]);
  });

  it('bypasses cap_exceeded the same way', () => {
    const refused = [{ dir: 'sd/SD-LIVE-2', full: '/x', reason: REASON.CAP_EXCEEDED, newestMtimeMs: stale }];
    const { bypassed } = partitionUnregisteredStaleRefusals(refused, { minAgeMs, now, fsImpl: fakeFs() });
    expect(bypassed).toHaveLength(1);
  });

  it('never bypasses walk_timeout or walk_error (FR-3b, same guard as the DB-status bypass)', () => {
    const refused = [
      { dir: 'sd/SD-LIVE-3', full: '/x', reason: REASON.WALK_TIMEOUT, newestMtimeMs: stale },
      { dir: 'sd/SD-LIVE-4', full: '/x', reason: REASON.WALK_ERROR, newestMtimeMs: stale },
    ];
    const { bypassed, stillRefused } = partitionUnregisteredStaleRefusals(refused, { minAgeMs, now, fsImpl: fakeFs() });
    expect(bypassed).toEqual([]);
    expect(stillRefused).toHaveLength(2);
  });

  it('refuses when a .git file is present (a real, checked-out worktree, never bypassable)', () => {
    const refused = [{ dir: 'sd/SD-LIVE-5', full: '/x', reason: REASON.HIGH_CONTENT, newestMtimeMs: stale }];
    const { bypassed, stillRefused } = partitionUnregisteredStaleRefusals(refused, { minAgeMs, now, fsImpl: fakeFs({ hasGit: true }) });
    expect(bypassed).toEqual([]);
    expect(stillRefused).toHaveLength(1);
  });

  it('refuses when node_modules is a reparse point (a junction into the shared store, not a real copy)', () => {
    const refused = [{ dir: 'sd/SD-LIVE-6', full: '/x', reason: REASON.HIGH_CONTENT, newestMtimeMs: stale }];
    const { bypassed, stillRefused } = partitionUnregisteredStaleRefusals(refused, { minAgeMs, now, fsImpl: fakeFs({ hasReparseNodeModules: true }) });
    expect(bypassed).toEqual([]);
    expect(stillRefused).toHaveLength(1);
  });

  it('refuses when the newest mtime is not yet stale (a worktree mid-creation)', () => {
    const refused = [{ dir: 'sd/SD-LIVE-7', full: '/x', reason: REASON.HIGH_CONTENT, newestMtimeMs: fresh }];
    const { bypassed, stillRefused } = partitionUnregisteredStaleRefusals(refused, { minAgeMs, now, fsImpl: fakeFs() });
    expect(bypassed).toEqual([]);
    expect(stillRefused).toHaveLength(1);
  });
});

describe('runOrphanSweep + partitionUnregisteredStaleRefusals (end-to-end, real fs)', () => {
  let root, worktreesDir;

  function mkHeavyOrphan(name, { withGitFile = false } = {}) {
    const dir = path.join(worktreesDir, name);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < CONTENT_REFUSE_MIN_FILES + 1; i += 1) {
      fs.writeFileSync(path.join(dir, `f${i}.txt`), 'x'.repeat(50));
    }
    if (withGitFile) fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /elsewhere\n');
    const when = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (const e of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, e), when, when);
    fs.utimesSync(dir, when, when);
    return dir;
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-sweep-unregstale-'));
    worktreesDir = path.join(root, '.worktrees');
    fs.mkdirSync(worktreesDir, { recursive: true });
  });

  afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } });

  it('reclassifies a high_content refusal as reapable even with NO DB-status resolver bypass, and stamps the bypass predicates on the reap row', async () => {
    mkHeavyOrphan('SD-LIVE-PARENT');
    const result = await runOrphanSweep({
      worktreesDir,
      minAgeMs: 30 * 60 * 1000,
      execute: true,
      remove: () => ({ ok: true, method: 'archive' }),
      resolveTerminalStatusKeys: async () => new Set(), // no DB-status bypass at all
    });
    expect(result.summary.refused_count).toBe(0);
    expect(result.summary.reapable).toBe(1);
    expect(result.reclamation.reclaimed).toEqual([
      expect.objectContaining({ unregisteredStaleBypass: true, noGitFile: true, noReparsePoints: true, staleMtime: true }),
    ]);
  });

  it('leaves a high_content refusal refused when a .git file is present, even with no DB-status bypass (never touches a real checked-out worktree)', async () => {
    mkHeavyOrphan('SD-LIVE-REAL', { withGitFile: true });
    const result = await runOrphanSweep({
      worktreesDir,
      minAgeMs: 30 * 60 * 1000,
      resolveTerminalStatusKeys: async () => new Set(),
    });
    expect(result.summary.refused_count).toBe(1);
    expect(result.summary.reapable).toBe(0);
  });
});
