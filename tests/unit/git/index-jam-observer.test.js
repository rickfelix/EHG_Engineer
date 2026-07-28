/**
 * SD-LEO-INFRA-JAMMED-GIT-INDEX-001 — observer seams (TS-5, TS-13, TS-14, TS-15).
 *
 * TESTING at EXEC flagged that FR-5 AC-1 and AC-3 literally say "asserted by test" and no such
 * assertion existed — the read-only guarantee, which is the ENTIRE safety argument, was carried
 * only by code reading. It also flagged the observer seams as the weakest area: zero automated
 * coverage on resolveGitDir, the ENOENT-vs-other-error split, and loadState/saveState.
 *
 * These use a real temp directory rather than mocks, because the properties under test are about
 * actual filesystem behaviour. They NEVER touch the shared root or any .worktrees path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveGitDir, observeIndexLock, loadState, saveState, stateFileFor,
} from '../../../scripts/cron/index-jam-detector.mjs';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jam-obs-')); });
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

const mainRepo = () => { fs.mkdirSync(path.join(tmp, '.git'), { recursive: true }); return tmp; };

describe('TS-14 — the observer refuses to guess a repo (TR-5)', () => {
  it('THROWS rather than defaulting to cwd', () => {
    // Without this, a caller that forgets the argument silently observes the REAL shared index.
    for (const bad of [undefined, null, '', 0, {}]) {
      expect(() => observeIndexLock(bad)).toThrow(/explicit repo path/i);
    }
  });
});

describe('TS-15 — dotGitKind discrimination (TR-3)', () => {
  it('treats a .git DIRECTORY as a main root', () => {
    expect(resolveGitDir(mainRepo())).toEqual({ gitDir: path.join(tmp, '.git'), kind: 'main_root' });
  });

  it('follows a .git FILE gitdir pointer as a worktree', () => {
    const real = path.join(tmp, 'realgitdir');
    fs.mkdirSync(real, { recursive: true });
    const wt = path.join(tmp, 'wt');
    fs.mkdirSync(wt, { recursive: true });
    fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${real}\n`);
    expect(resolveGitDir(wt)).toEqual({ gitDir: real, kind: 'worktree' });
  });

  it('REFUSES a pointer whose target does not exist — a pruned worktree must not read as healthy', () => {
    // The alarm-suppressing bug: a pruned worktrees/<name> makes the index.lock stat return
    // ENOENT, which the caller treats as "lock absent" -> HEALTHY FOREVER, indistinguishable
    // from a genuinely healthy tree.
    const wt = path.join(tmp, 'pruned');
    fs.mkdirSync(wt, { recursive: true });
    fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${path.join(tmp, 'gone')}\n`);
    expect(() => resolveGitDir(wt)).toThrow();
    // And the observer surfaces it as UNAVAILABLE, never as an absent lock.
    const obs = observeIndexLock(wt);
    expect(obs.error).toBeTruthy();
    expect(obs.lockPresent).toBe(false);
  });

  it('REFUSES a pointer target that is a file rather than a directory', () => {
    const notDir = path.join(tmp, 'afile');
    fs.writeFileSync(notDir, 'x');
    const wt = path.join(tmp, 'wt2');
    fs.mkdirSync(wt, { recursive: true });
    fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${notDir}\n`);
    expect(() => resolveGitDir(wt)).toThrow(/not a directory/i);
  });

  it('rejects a .git file that is not a gitdir pointer', () => {
    const wt = path.join(tmp, 'wt3');
    fs.mkdirSync(wt, { recursive: true });
    fs.writeFileSync(path.join(wt, '.git'), 'garbage\n');
    expect(() => resolveGitDir(wt)).toThrow(/gitdir pointer/i);
  });
});

describe('observeIndexLock — ENOENT is an observation, other errors are not', () => {
  it('reports lock ABSENT (not an error) when there is no lock', () => {
    const obs = observeIndexLock(mainRepo());
    expect(obs.lockPresent).toBe(false);
    expect(obs.error).toBeUndefined(); // ENOENT must NOT become UNAVAILABLE — it resets the counter
  });

  it('reports lock PRESENT with an identity when one exists', () => {
    const repo = mainRepo();
    fs.writeFileSync(path.join(repo, '.git', 'index.lock'), '');
    const obs = observeIndexLock(repo);
    expect(obs.lockPresent).toBe(true);
    expect(obs.lockIdentity).toMatch(/^\d+(\.\d+)?:\d+$/); // mtimeMs:ino
    expect(obs.error).toBeUndefined();
  });

  it('reports UNAVAILABLE — never absent — when the repo does not exist', () => {
    const obs = observeIndexLock(path.join(tmp, 'nope'));
    expect(obs.error).toBeTruthy();
  });
});

describe('TS-5 / TS-13 — READ-ONLY guarantee (FR-5 AC-1, AC-3)', () => {
  it('creates NO index.lock when observing a repo that has none', () => {
    const repo = mainRepo();
    observeIndexLock(repo);
    expect(fs.existsSync(path.join(repo, '.git', 'index.lock'))).toBe(false);
  });

  it('leaves an EXISTING lock byte-identical — never opens, truncates or removes it', () => {
    // The whole safety argument: a detector that acquired the lock could, if killed mid-write,
    // leave the very orphan lock that IS the incident.
    const repo = mainRepo();
    const lock = path.join(repo, '.git', 'index.lock');
    fs.writeFileSync(lock, 'sentinel');
    const before = fs.statSync(lock);

    observeIndexLock(repo);

    const after = fs.statSync(lock);
    expect(fs.readFileSync(lock, 'utf8')).toBe('sentinel');
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.ino).toBe(before.ino);
  });

  it('makes NO destructive fs call while observing — write-spy', () => {
    const repo = mainRepo();
    fs.writeFileSync(path.join(repo, '.git', 'index.lock'), '');
    const spies = ['unlinkSync', 'writeFileSync', 'appendFileSync', 'rmSync', 'openSync', 'truncateSync']
      .map((fn) => [fn, vi.spyOn(fs, fn)]);

    observeIndexLock(repo);

    for (const [name, spy] of spies) {
      expect(spy, `observeIndexLock must not call fs.${name}`).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});

describe('state store round-trip (TR-7)', () => {
  it('persists per-repo state beside the OBSERVED repo, not relative to cwd', () => {
    // The cwd-dependent path was the highest-severity suppression bug: because persistence IS the
    // signal, a state file that moves with cwd means the counter never accumulates.
    const repo = mainRepo();
    expect(stateFileFor(repo)).toBe(path.join(repo, '.claude', 'index-jam-detector-state.json'));

    const st = { firstBlockedAtMs: 1234, lockIdentity: 'A' };
    saveState(repo, st);
    expect(loadState(repo)).toEqual(st);
  });

  it('returns undefined rather than throwing when no state exists yet', () => {
    expect(loadState(mainRepo())).toBeUndefined();
  });

  it('returns undefined on a corrupt state file rather than propagating a parse error', () => {
    const repo = mainRepo();
    const f = stateFileFor(repo);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '{not json');
    expect(loadState(repo)).toBeUndefined();
  });

  it('keeps entries for other repos when saving', () => {
    const repo = mainRepo();
    saveState(repo, { firstBlockedAtMs: 1, lockIdentity: 'A' });
    saveState('C:/other/repo', { firstBlockedAtMs: 2, lockIdentity: 'B' }, stateFileFor(repo));
    const all = JSON.parse(fs.readFileSync(stateFileFor(repo), 'utf8'));
    expect(Object.keys(all)).toHaveLength(2);
  });
});
