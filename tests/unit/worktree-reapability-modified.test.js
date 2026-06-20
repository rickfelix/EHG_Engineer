/**
 * collectDirtyStatus.modified — SD-LEO-FEAT-DATA-LOSS-HIGH-001 (FR-1).
 *
 * The reaper's preserve-before-delete step copied ONLY untracked files; uncommitted edits to
 * TRACKED files (the ~56-LOC data-loss class) were destroyed by `git worktree remove --force`.
 * collectDirtyStatus now also returns `modified` (tracked changed paths) so the removal path can
 * preserve them too. These tests pin the porcelain parse (modified vs untracked, renames,
 * deletions, quoted paths) using an injected gitRunner — PURE, no real git.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectDirtyStatus } from '../../lib/worktree-reapability.js';

const git = (stdout, code = 0) => () => ({ code, stdout, stderr: '' });

describe('collectDirtyStatus.modified (FR-1)', () => {
  let wt;
  beforeAll(() => { wt = fs.mkdtempSync(path.join(os.tmpdir(), 'reap-mod-')); });
  afterAll(() => { try { fs.rmSync(wt, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('splits tracked-modified from untracked', () => {
    const s = collectDirtyStatus(wt, { gitRunner: git(' M lib/a.js\nM  lib/b.js\n?? new.txt\n') });
    expect(s.modified).toEqual(['lib/a.js', 'lib/b.js']);
    expect(s.untracked).toEqual(['new.txt']);
    expect(s.dirtyCount).toBe(3);
  });

  it('rename keeps the NEW path', () => {
    const s = collectDirtyStatus(wt, { gitRunner: git('R  old/x.js -> new/x.js\n') });
    expect(s.modified).toEqual(['new/x.js']);
  });

  it('skips deletions (no working-tree file to preserve)', () => {
    const s = collectDirtyStatus(wt, { gitRunner: git(' D gone.js\nD  staged-gone.js\n M kept.js\n') });
    expect(s.modified).toEqual(['kept.js']);
    expect(s.dirtyCount).toBe(3); // deletions still count as dirty
  });

  it('unquotes git-quoted special-char paths', () => {
    const s = collectDirtyStatus(wt, { gitRunner: git(' M "lib/with space.js"\n') });
    expect(s.modified).toEqual(['lib/with space.js']);
  });

  it('added (staged-new) tracked files are preserved', () => {
    const s = collectDirtyStatus(wt, { gitRunner: git('A  lib/added.js\n') });
    expect(s.modified).toEqual(['lib/added.js']);
  });

  it('clean tree → modified=[] untracked=[] dirtyCount=0 (no regression)', () => {
    const s = collectDirtyStatus(wt, { gitRunner: git('') });
    expect(s.modified).toEqual([]);
    expect(s.untracked).toEqual([]);
    expect(s.dirtyCount).toBe(0);
  });

  it('missing path → exists:false with empty modified', () => {
    const s = collectDirtyStatus(path.join(wt, 'nope'), { gitRunner: git(' M x.js\n') });
    expect(s.exists).toBe(false);
    expect(s.modified).toEqual([]);
  });

  it('git error → fail-safe empty modified (never blocks)', () => {
    const s = collectDirtyStatus(wt, { gitRunner: git('', 128) });
    expect(s.modified).toEqual([]);
    expect(s.dirtyCount).toBe(0);
  });
});
