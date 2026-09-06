// QF-20260906-751: capture-session-id.cjs spawns session-tick.cjs detached with no `cwd`
// option, so the daemon inherits the hook's cwd (a worktree) and holds it open for its whole
// life — a Windows EPERM on `git worktree remove` long after the worktree's own work is done.
// resolveRepoRoot() and findLiveTickPid() are the two pure/testable pieces of the fix: finding
// the shared repo root regardless of which worktree the hook runs from, and detecting whether a
// live tick daemon already exists for this session (so a SessionStart re-fire reuses it instead
// of spawning a duplicate).

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { resolveRepoRoot, findLiveTickPid } = require('../../scripts/hooks/capture-session-id.cjs');

describe('resolveRepoRoot', () => {
  it('resolves to the SAME shared root from this checkout\'s own cwd (sanity — this repo IS a git repo)', () => {
    const root = resolveRepoRoot(process.cwd());
    expect(typeof root).toBe('string');
    expect(fs.existsSync(path.join(root, '.git'))).toBe(true);
  });

  it('resolves the identical root whether run from the checkout root or a subdirectory', () => {
    const fromRoot = resolveRepoRoot(process.cwd());
    const fromSubdir = resolveRepoRoot(path.join(process.cwd(), 'scripts', 'hooks'));
    expect(fromSubdir).toBe(fromRoot);
  });

  it('fails open to the given cwd when git is unavailable / not a repo (never throws)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-751-not-a-repo-'));
    try {
      expect(() => resolveRepoRoot(tmp)).not.toThrow();
      const result = resolveRepoRoot(tmp);
      // Not a git repo at all -- fails open to the given directory itself.
      expect(result).toBe(tmp);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('findLiveTickPid', () => {
  it('returns null when no marker file exists at all', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-751-no-marker-'));
    try {
      expect(findLiveTickPid(tmp, 'nonexistent-session')).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns the pid when the marker names a genuinely live process (this test process itself)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-751-live-marker-'));
    try {
      fs.mkdirSync(path.join(tmp, '.claude', 'pids'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, '.claude', 'pids', 'tick-live-session.json'),
        JSON.stringify({ session_id: 'live-session', tick_pid: process.pid })
      );
      expect(findLiveTickPid(tmp, 'live-session')).toBe(process.pid);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns null when the marker names a pid that is not alive (stale marker, dead daemon)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-751-dead-marker-'));
    try {
      fs.mkdirSync(path.join(tmp, '.claude', 'pids'), { recursive: true });
      // A PID astronomically unlikely to be alive on any real system.
      fs.writeFileSync(
        path.join(tmp, '.claude', 'pids', 'tick-dead-session.json'),
        JSON.stringify({ session_id: 'dead-session', tick_pid: 999999999 })
      );
      expect(findLiveTickPid(tmp, 'dead-session')).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns null (never throws) on a malformed marker file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-751-malformed-marker-'));
    try {
      fs.mkdirSync(path.join(tmp, '.claude', 'pids'), { recursive: true });
      fs.writeFileSync(path.join(tmp, '.claude', 'pids', 'tick-bad-session.json'), 'not json');
      expect(() => findLiveTickPid(tmp, 'bad-session')).not.toThrow();
      expect(findLiveTickPid(tmp, 'bad-session')).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns null when tick_pid is missing/non-numeric/non-positive', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-751-badpid-marker-'));
    try {
      fs.mkdirSync(path.join(tmp, '.claude', 'pids'), { recursive: true });
      const cases = [{}, { tick_pid: 'not-a-number' }, { tick_pid: 0 }, { tick_pid: -5 }];
      cases.forEach((marker, i) => {
        const p = path.join(tmp, '.claude', 'pids', `tick-badpid-${i}.json`);
        fs.writeFileSync(p, JSON.stringify(marker));
        expect(findLiveTickPid(tmp, `badpid-${i}`)).toBeNull();
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
