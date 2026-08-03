/**
 * SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 — FR-4 (report enumerates the population) + FR-5 (_archive is
 * never a scan root).
 *
 * FR-4's motivation is the incident's own summary row (audit_log 0c9875ad):
 *   {scanned:4, reapable:4, excluded_count:0, reclaimed_count:1, reclaimed_bytes:601021494, failed_count:3}
 * Every number is correct and the record is still operationally useless — it names no directory.
 * Nothing in it says WHAT was deleted or WHAT still needs a human, which is how a 707MB tree sat
 * unattributed for two days afterwards. Counting is not enumerating.
 *
 * WHY THE END-TO-END TEST BELOW EXISTS: while wiring this I found that selectReapableOrphans built
 * its merged result with no `refused` key and never copied r.refused, so refusals from
 * classifyOrphanDirs were silently DROPPED before reaching the sweep. FR-3 was implemented and
 * operationally inert — the directory would have been spared, and nobody would ever have learned
 * it needed a decision. A unit test on classifyOrphanDirs alone cannot see that seam.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  selectReapableOrphans, buildOrphanSummary, ARCHIVE_DIR_NAME,
} from '../../../lib/worktree-reaper/orphan-sweep.js';
import { WORKTREE_QUOTA_HELPERS } from '../../../lib/worktree-quota.js';
import { REASON } from '../../../lib/worktree-reaper/orphan-content-probe.mjs';

let root, worktreesDir;

const mkDir = (rel, files = []) => {
  const dir = path.join(worktreesDir, rel);
  fs.mkdirSync(dir, { recursive: true });
  for (const [n, c] of files) fs.writeFileSync(path.join(dir, n), c);
  return dir;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-report-'));
  worktreesDir = path.join(root, '.worktrees');
  fs.mkdirSync(worktreesDir, { recursive: true });
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('FR-4 — refusals survive the merge and reach the report', () => {
  it('END-TO-END: a high-content orphan is refused AND named in the selection', () => {
    // The seam that was broken: classifyOrphanDirs refused it, selectReapableOrphans dropped it.
    mkDir('heavy', [['a.txt', 'x'.repeat(50)], ['b.txt', 'y'.repeat(50)], ['c.txt', 'z'.repeat(50)]]);
    const sel = selectReapableOrphans({ worktreesDir, registered: [], minAgeMs: 0 });

    const hit = (sel.refused || []).find((r) => r.dir === 'heavy');
    expect(hit).toBeDefined();
    expect(hit.reason).toBe(REASON.HIGH_CONTENT);
    expect(hit.files).toBe(3);
    expect(sel.reapableDirs.find((d) => d.dir === 'heavy')).toBeUndefined();
  });

  it('the summary ENUMERATES refusals, not just a count', () => {
    mkDir('heavy', [['a.txt', 'x'.repeat(50)], ['b.txt', 'y'.repeat(50)], ['c.txt', 'z'.repeat(50)]]);
    const sel = selectReapableOrphans({ worktreesDir, registered: [], minAgeMs: 0 });
    const summary = buildOrphanSummary(sel, { reclaimed_count: 0, reclaimed_bytes: 0, failed: [], dry_run: true });

    expect(summary.refused_count).toBe(1);
    // A count alone reproduces the incident summary's defect: correct and unactionable.
    expect(summary.refused[0].dir).toBe('heavy');
    expect(summary.refused[0].reason).toBe(REASON.HIGH_CONTENT);
    expect(summary.refused[0].files).toBe(3);
    expect(summary.refused[0]).toHaveProperty('newest_mtime_ms');
  });

  it('an empty orphan is still reaped and NOT refused — the population is real, not blanket', () => {
    mkDir('empty-one');
    const sel = selectReapableOrphans({ worktreesDir, registered: [], minAgeMs: 0 });
    expect(sel.reapableDirs.find((d) => d.dir === 'empty-one')).toBeDefined();
    expect((sel.refused || []).find((r) => r.dir === 'empty-one')).toBeUndefined();
  });

  it('typed-subdir refusals carry their prefix so the report is unambiguous', () => {
    mkDir('qf/heavy-qf', [['a.txt', 'x'.repeat(50)], ['b.txt', 'y'.repeat(50)], ['c.txt', 'z'.repeat(50)]]);
    const sel = selectReapableOrphans({ worktreesDir, registered: [], minAgeMs: 0 });
    const hit = (sel.refused || []).find((r) => r.dir === 'qf/heavy-qf');
    expect(hit).toBeDefined();
    expect(hit.reason).toBe(REASON.HIGH_CONTENT);
  });

  it('a summary with no refusals reports 0 and an empty list, never undefined', () => {
    const sel = selectReapableOrphans({ worktreesDir, registered: [], minAgeMs: 0 });
    const summary = buildOrphanSummary(sel, { reclaimed_count: 0, reclaimed_bytes: 0, failed: [], dry_run: true });
    expect(summary.refused_count).toBe(0);
    expect(summary.refused).toEqual([]);
  });
});

describe('FR-5 — _archive is never scanned, by two independent layers', () => {
  it('layer 1: _archive is skipped as a TOP-LEVEL entry', () => {
    expect(WORKTREE_QUOTA_HELPERS.has(ARCHIVE_DIR_NAME)).toBe(true);
  });

  it('layer 2: _archive is not a scan root — BEHAVIOURAL, not a constant check', () => {
    // The one that matters. isReapable's container guard matches path.basename ONLY, so an
    // archived tree at _archive/<name>-<ts> has basename <name>-<ts> and would look like an
    // ordinary orphan if _archive ever became a scan root. FR-1 makes _archive the sole custodian
    // of everything the sweep preserves, so this is now load-bearing in a way it was not before.
    const archived = path.join(worktreesDir, ARCHIVE_DIR_NAME, 'SD-PRESERVED-2026-08-03T00-00-00-000Z');
    fs.mkdirSync(archived, { recursive: true });
    fs.writeFileSync(path.join(archived, 'precious.txt'), 'x'.repeat(9000));

    const sel = selectReapableOrphans({ worktreesDir, registered: [], minAgeMs: 0 });

    const names = [
      ...sel.reapableDirs.map((d) => d.dir),
      ...sel.excluded.map((e) => e.dir),
      ...(sel.refused || []).map((r) => r.dir),
    ];
    // It must not appear in ANY bucket — not reapable, and not merely "refused" either. A refused
    // verdict would still mean the sweep walked into the archive.
    expect(names.some((n) => n.includes('SD-PRESERVED'))).toBe(false);
    expect(names.some((n) => n.includes(ARCHIVE_DIR_NAME))).toBe(false);
    expect(fs.existsSync(path.join(archived, 'precious.txt'))).toBe(true);
  });

  it('CONTROL: the same tree placed OUTSIDE _archive IS seen — proving the scan works at all', () => {
    // Without this, the assertion above passes on a scan that finds nothing anywhere.
    const loose = path.join(worktreesDir, 'SD-PRESERVED-loose');
    fs.mkdirSync(loose, { recursive: true });
    fs.writeFileSync(path.join(loose, 'precious.txt'), 'x'.repeat(9000));

    const sel = selectReapableOrphans({ worktreesDir, registered: [], minAgeMs: 0 });
    const names = [
      ...sel.reapableDirs.map((d) => d.dir),
      ...sel.excluded.map((e) => e.dir),
      ...(sel.refused || []).map((r) => r.dir),
    ];
    expect(names.some((n) => n.includes('SD-PRESERVED-loose'))).toBe(true);
  });
});
