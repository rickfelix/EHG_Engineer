import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PROTECTED_MARKER_FILENAME,
  writeReapProtectedMarker,
  isReapProtectedMarkerInherited,
} from '../../lib/worktree-reaper/reap-protected-marker.js';

/**
 * QF-20260912-235 — PR #8690 briefly committed .reap-protected.json to main; every worktree
 * branched from main before PR #8701 removed it inherited the file as a TRACKED path. The
 * existing hasReapProtectedMarker() is a bare existsSync check and cannot tell an inherited
 * marker from a genuine operator opt-out, so nine worker trees read as protected forever.
 */
let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reap-inherited-')); });
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } });

function initGitRepo(dir) {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
}

describe('isReapProtectedMarkerInherited (QF-20260912-235)', () => {
  it('a marker TRACKED in the tree (committed) is inherited, not a real opt-out', () => {
    initGitRepo(tmp);
    fs.writeFileSync(path.join(tmp, PROTECTED_MARKER_FILENAME), JSON.stringify({ reason: 'from main' }), 'utf8');
    execFileSync('git', ['add', PROTECTED_MARKER_FILENAME], { cwd: tmp });
    execFileSync('git', ['commit', '-q', '-m', 'inherited marker'], { cwd: tmp });

    const result = isReapProtectedMarkerInherited(tmp);
    expect(result.inherited).toBe(true);
    expect(typeof result.commit).toBe('string');
    expect(result.commit.length).toBeGreaterThan(0);
  });

  it('a marker written directly into the tree (untracked) is NOT inherited — genuine opt-out', () => {
    initGitRepo(tmp);
    writeReapProtectedMarker(tmp, { reason: 'operator opt-out' });

    const result = isReapProtectedMarkerInherited(tmp);
    expect(result.inherited).toBe(false);
    expect(result.commit).toBeNull();
  });

  it('belt-and-braces: an untracked marker whose protected_at predates the tree birth time is inherited', () => {
    // No git repo at all — ls-files throws (not a git path), exercising the timestamp fallback.
    fs.writeFileSync(
      path.join(tmp, PROTECTED_MARKER_FILENAME),
      JSON.stringify({ reason: 'stale copy', protected_at: '2020-01-01T00:00:00.000Z' }),
      'utf8'
    );

    const result = isReapProtectedMarkerInherited(tmp);
    expect(result.inherited).toBe(true);
  });

  it('never throws on a nonexistent path', () => {
    const missing = path.join(tmp, 'does', 'not', 'exist');
    expect(() => isReapProtectedMarkerInherited(missing)).not.toThrow();
    expect(isReapProtectedMarkerInherited(missing).inherited).toBe(false);
  });
});

describe('the reaper falls through an inherited marker instead of force-keeping (QF-20260912-235)', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'worktree-reaper.mjs'),
    'utf-8',
  );

  it('imports isReapProtectedMarkerInherited', () => {
    expect(src).toMatch(/isReapProtectedMarkerInherited/);
  });

  it('the main-loop marker guard checks inheritance before taking the keep:protected branch', () => {
    const at = src.indexOf("reason: 'reap_protected_marker'");
    expect(at).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, at - 900), at);
    expect(before).toMatch(/isReapProtectedMarkerInherited/);
  });

  it('selectStage0Reclaim no longer force-skips an inherited marker', () => {
    const stage0 = src.slice(src.indexOf('export function selectStage0Reclaim'));
    const body = stage0.slice(0, stage0.indexOf('\n}'));
    expect(body).toMatch(/isReapProtectedMarkerInherited/);
  });

  it('an inherited marker still attaches marker_inherited evidence when kept for another reason', () => {
    expect(src).toMatch(/marker_inherited/);
  });
});
