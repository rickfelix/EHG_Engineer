/**
 * Integration tests for scripts/worktree-reaper.mjs
 * SD-LEO-INFRA-FORMALIZED-WORKTREE-REAPER-001
 *
 * Exercises the exported helper functions against real filesystem fixtures.
 * Does not spin up a full git repo + worktrees; those lifecycle concerns
 * are covered by unit tests for the detectors + a manual dry-run against
 * the live fleet (documented in the SD retrospective).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  parseArgs,
  stageForCategories,
  buildRecord,
  preserveUntrackedFiles,
  runPhantomOnlyMode,
} from '../../scripts/worktree-reaper.mjs';

// ── parseArgs ──────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('defaults to dry-run', () => {
    const opts = parseArgs(['node', 'reaper.mjs']);
    expect(opts.execute).toBe(false);
    expect(opts.stage2).toBe(false);
    expect(opts.days).toBe(7);
    expect(opts.help).toBe(false);
  });

  it('parses --execute and --stage2', () => {
    const opts = parseArgs(['node', 'reaper.mjs', '--execute', '--stage2']);
    expect(opts.execute).toBe(true);
    expect(opts.stage2).toBe(true);
  });

  it('parses --days <n>', () => {
    const opts = parseArgs(['node', 'reaper.mjs', '--days', '14']);
    expect(opts.days).toBe(14);
  });

  it('parses --preserve-root <path>', () => {
    const opts = parseArgs(['node', 'reaper.mjs', '--preserve-root', '/tmp/x']);
    expect(opts.preserveRoot).toBe('/tmp/x');
  });

  it('parses --phantom-only and --help and --yes', () => {
    const opts = parseArgs(['node', 'reaper.mjs', '--phantom-only', '--help', '--yes']);
    expect(opts.phantomOnly).toBe(true);
    expect(opts.help).toBe(true);
    expect(opts.yes).toBe(true);
  });
});

// ── stageForCategories ─────────────────────────────────────────────────

describe('stageForCategories', () => {
  it('returns keep for empty categories', () => {
    const res = stageForCategories([]);
    expect(res.verdict).toBe('keep');
    expect(res.stage).toBe(null);
  });

  it('prefers stage 1 when nested matches', () => {
    const res = stageForCategories(['nested', 'orphan-sd']);
    expect(res.stage).toBe(1);
    expect(res.verdict).toBe('stage1_remove');
  });

  it('prefers stage 1 when shipped-stale matches', () => {
    const res = stageForCategories(['shipped-stale', 'idle']);
    expect(res.stage).toBe(1);
  });

  it('returns stage 2 for zombie-on-main without stage 1 matches', () => {
    const res = stageForCategories(['zombie-on-main']);
    expect(res.stage).toBe(2);
    expect(res.verdict).toBe('stage2_remove');
  });

  it('returns stage 2 for orphan-sd alone', () => {
    const res = stageForCategories(['orphan-sd']);
    expect(res.stage).toBe(2);
  });

  it('returns stage 2 for idle alone', () => {
    const res = stageForCategories(['idle']);
    expect(res.stage).toBe(2);
  });
});

// ── buildRecord ────────────────────────────────────────────────────────

describe('buildRecord', () => {
  it('produces a full JSON-lines record with required schema', () => {
    const rec = buildRecord({
      schema_version: '1.0',
      wt: { path: '/repo/.worktrees/SD-X', branch: 'feat/X' },
      categories: ['idle'],
      verdict: 'stage2_remove',
      reason: 'idle',
      claim_status: 'absent',
      dirtyCount: 2,
      unpushedCount: 0,
      ageDays: 30,
      preserveCount: 0,
      shipStatus: 'not_on_main',
      evidence: { idle: { matched: true } },
    });
    expect(rec.schema_version).toBe('1.0');
    expect(rec.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rec.worktree_path).toBe('/repo/.worktrees/SD-X');
    expect(rec.branch).toBe('feat/X');
    expect(rec.categories).toEqual(['idle']);
    expect(rec.dirty_file_count).toBe(2);
    expect(rec.unpushed_commit_count).toBe(0);
    expect(rec.age_days).toBe(30);
    expect(rec.verdict).toBe('stage2_remove');
  });
});

// ── preserveUntrackedFiles ─────────────────────────────────────────────

describe('preserveUntrackedFiles', () => {
  let tmpDir;
  let wtDir;
  let preserveRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-preserve-'));
    wtDir = path.join(tmpDir, '.worktrees', 'SD-TEST');
    preserveRoot = path.join(tmpDir, 'scratch');
    fs.mkdirSync(wtDir, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('copies non-exempt untracked files to scratch/preserved-from-<basename>/', () => {
    fs.writeFileSync(path.join(wtDir, 'important.sql'), 'CREATE TABLE x;');
    fs.mkdirSync(path.join(wtDir, 'db', 'migrations'), { recursive: true });
    fs.writeFileSync(path.join(wtDir, 'db', 'migrations', 'abc.sql'), '-- migration');

    const res = preserveUntrackedFiles({
      wtPath: wtDir,
      preserveRoot,
      untracked: ['important.sql', 'db/migrations/abc.sql'],
      repoRoot: tmpDir,
    });

    expect(res.preserved).toContain('important.sql');
    expect(res.preserved).toContain('db/migrations/abc.sql');
    expect(fs.existsSync(path.join(preserveRoot, 'preserved-from-SD-TEST', 'important.sql'))).toBe(true);
    expect(fs.existsSync(path.join(preserveRoot, 'preserved-from-SD-TEST', 'db', 'migrations', 'abc.sql'))).toBe(true);
  });

  it('skips exempt files (tmp-, scratch-, .claude/, .worktree.json, .ehg-session.json)', () => {
    fs.writeFileSync(path.join(wtDir, 'tmp-foo.log'), 'noise');
    fs.writeFileSync(path.join(wtDir, 'scratch-notes.md'), 'scratch');
    fs.writeFileSync(path.join(wtDir, '.worktree.json'), '{}');
    fs.writeFileSync(path.join(wtDir, '.ehg-session.json'), '{}');
    fs.mkdirSync(path.join(wtDir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(wtDir, '.claude', 'state.json'), '{}');
    fs.writeFileSync(path.join(wtDir, 'keep-me.txt'), 'important');

    const res = preserveUntrackedFiles({
      wtPath: wtDir,
      preserveRoot,
      untracked: [
        'tmp-foo.log',
        'scratch-notes.md',
        '.worktree.json',
        '.ehg-session.json',
        '.claude/state.json',
        'keep-me.txt',
      ],
      repoRoot: tmpDir,
    });

    expect(res.preserved).toEqual(['keep-me.txt']);
    expect(res.skipped).toContain('tmp-foo.log');
    expect(res.skipped).toContain('scratch-notes.md');
    expect(res.skipped).toContain('.worktree.json');
    expect(res.skipped).toContain('.ehg-session.json');
    expect(res.skipped).toContain('.claude/state.json');
  });

  it('returns empty preserved list when untracked is empty', () => {
    const res = preserveUntrackedFiles({
      wtPath: wtDir,
      preserveRoot,
      untracked: [],
      repoRoot: tmpDir,
    });
    expect(res.preserved).toEqual([]);
    expect(res.skipped).toEqual([]);
  });
});

// ── runPhantomOnlyMode ─────────────────────────────────────────────────

describe('runPhantomOnlyMode (legacy compatibility)', () => {
  it('returns 0 when no phantoms and reports clean', () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    const realPath = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-phantom-clean-'));
    try {
      const code = runPhantomOnlyMode({
        repoRoot: '/repo',
        worktrees: [{ path: realPath, branch: 'feat/X' }],
      });
      expect(code).toBe(0);
      expect(logs.join('\n')).toMatch(/No phantoms detected/);
    } finally {
      console.log = origLog;
      try { fs.rmSync(realPath, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('returns 1 and lists phantoms when directory missing or prunable', () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    try {
      const code = runPhantomOnlyMode({
        repoRoot: '/repo',
        worktrees: [
          { path: '/nonexistent/path/.worktrees/SD-GHOST', branch: 'feat/GHOST' },
          { path: '/another/prunable', branch: 'feat/Y', prunable: true },
        ],
      });
      expect(code).toBe(1);
      expect(logs.join('\n')).toMatch(/Found 2 phantom/);
      expect(logs.join('\n')).toMatch(/directory missing/);
      expect(logs.join('\n')).toMatch(/marked prunable/);
    } finally { console.log = origLog; }
  });
});
