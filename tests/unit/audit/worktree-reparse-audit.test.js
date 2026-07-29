// SD-FDBK-ENH-SCOPE-REPLACE-WORKTREE-001 FR-5 — pins for the reparse regression guard.
//
// The 0/0 rule is the reason this file exists. The SD shipped with acceptance
// `reparse_point_worktrees / total_worktrees == 0`, which was ALREADY true at LEAD — a permanent
// vacuous green. Worse, a detector that reports zero is indistinguishable from one that is blind,
// and an EMPTY DENOMINATOR reads as a pass to anyone skimming. classifyAudit is exported precisely
// so that rule is pinned rather than asserted in prose.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { classifyAudit, isReparsePoint, collectWorktrees, resolveMainRepoRoot, isArchivedWorktree, auditWorktrees, partitionWorktrees } from '../../../scripts/audit/worktree-reparse-audit.mjs';

describe('classifyAudit — 0/0 is a FAILURE TO MEASURE, never a pass', () => {
  it('refuses an empty denominator', () => {
    expect(classifyAudit({ total: 0, reparse: [] })).toMatchObject({ verdict: 'FAILED_TO_MEASURE', exitCode: 2 });
  });

  it('refuses a non-numeric denominator rather than defaulting to clean', () => {
    expect(classifyAudit({ total: NaN, reparse: [] }).exitCode).toBe(2);
    expect(classifyAudit({ total: undefined, reparse: [] }).exitCode).toBe(2);
  });

  it('reports CLEAN only when the denominator is real', () => {
    expect(classifyAudit({ total: 52, reparse: [] })).toMatchObject({ verdict: 'CLEAN', exitCode: 0 });
  });

  it('reports REGRESSION when a reparse point is found, and names the count over the denominator', () => {
    const r = classifyAudit({ total: 52, reparse: ['/wt/a'] });
    expect(r.verdict).toBe('REGRESSION');
    expect(r.exitCode).toBe(1);
    expect(r.reason).toMatch(/1 of 52/);
  });
});

describe('isReparsePoint — lstat, never stat', () => {
  it('detects a REAL junction', (ctx) => {
    // NEGATIVE CONTROL as a unit test: if this cannot fire, every zero the audit prints is
    // meaningless. The CLI runs the same check as a --self-test before it will report anything.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reparse-unit-'));
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'reparse-unit-target-'));
    const link = path.join(dir, 'node_modules');
    try {
      fs.symlinkSync(target, link, 'junction');
    } catch {
      // ctx.skip(), NOT a bare return: vitest reports an early return as PASSED, so on a host that
      // cannot create junctions this becomes a SILENT GREEN on the exact regression it guards.
      ctx.skip();
    }
    expect(isReparsePoint(link)).toBe(true);
    fs.unlinkSync(link);
  });

  it('does NOT flag a real directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reparse-unit-real-'));
    fs.mkdirSync(path.join(dir, 'node_modules'));
    expect(isReparsePoint(path.join(dir, 'node_modules'))).toBe(false);
  });

  it('is false, not throwing, on an absent path', () => {
    expect(isReparsePoint(path.join(os.tmpdir(), 'definitely-not-here-9d3f'))).toBe(false);
  });
});

describe('collectWorktrees — the denominator is RECURSIVE (TR-1)', () => {
  it('finds a worktree nested one level down, which single-level enumeration missed', () => {
    // The concrete error this pins: LEAD published the denominator twice and was wrong both times,
    // once by missing the nested .worktrees/qf/ layout entirely.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-collect-'));
    fs.mkdirSync(path.join(root, 'top', '.git'), { recursive: true });
    fs.mkdirSync(path.join(root, 'qf', 'nested', '.git'), { recursive: true });
    const found = collectWorktrees(root).map((p) => path.basename(p)).sort();
    expect(found).toEqual(['nested', 'top']);
  });

  it('returns an empty list for an absent root rather than throwing', () => {
    expect(collectWorktrees(path.join(os.tmpdir(), 'no-such-root-77a2'))).toEqual([]);
  });
});

describe('resolveMainRepoRoot — the guard must measure the FLEET, not the caller cwd', () => {
  // ADDED AFTER A RE-REVIEW FINDING, and the finding is worth recording: this function carried the
  // ENTIRE fix for "the audit reports FAILED_TO_MEASURE when run from inside a worktree", and
  // NOTHING tested it. Replacing its body with `return cwd` fully reverted that fix while 896
  // tests stayed green. I had fixed an un-failable-pin finding by adding an unpinned function.
  it('walks OUT of a worktree to the main repo root', () => {
    expect(resolveMainRepoRoot('C:/repo/.worktrees/SD-X-001')).toBe('C:/repo');
  });

  it('walks out of a NESTED worktree layout too', () => {
    // .worktrees/qf/<id> is a real layout here, and a single-level assumption missed it once already.
    expect(resolveMainRepoRoot('C:/repo/.worktrees/qf/QF-1')).toBe('C:/repo');
  });

  it('returns the repo root UNCHANGED when already at it', () => {
    expect(resolveMainRepoRoot('C:/repo')).toBe('C:/repo');
  });

  it('normalises Windows separators so the match is not platform-dependent', () => {
    // String.raw, deliberately: written as a normal quoted literal the \r in \repo becomes a
    // CARRIAGE RETURN and the test silently asserts on a different string than it appears to.
    expect(resolveMainRepoRoot(String.raw`C:\repo\.worktrees\SD-X-001`)).toBe('C:/repo');
  });

  it('does not truncate on a path that merely CONTAINS the word worktrees', () => {
    // Guards against matching a bare substring instead of the path segment.
    expect(resolveMainRepoRoot('C:/repo/my-worktrees-notes')).toBe('C:/repo/my-worktrees-notes');
  });
});

describe('isArchivedWorktree — the denominator must be the LIVE fleet', () => {
  // ADDED AFTER THE COORDINATOR TURNED THEIR OWN WARNING ON THIS FILE. They cautioned against
  // reading an unreaped pool as evidence; the reaper is currently refusing to reap, so archived
  // trees accumulate. This audit swept _archive into the denominator and reported 52-53 when the
  // live population was 17 -- a ratio over a stale-inflated base, which is the same
  // wrong-population error this SD LEAD phase made twice before.
  it('classifies an _archive path as archived', () => {
    expect(isArchivedWorktree('C:/repo/.worktrees/_archive/SD-OLD-001-2026-07-27T15-15-41')).toBe(true);
  });

  it('classifies a live worktree as NOT archived', () => {
    expect(isArchivedWorktree('C:/repo/.worktrees/SD-LIVE-001')).toBe(false);
  });

  it('handles Windows separators', () => {
    // This literal was CORRUPTED on first write and STILL PASSED. A shell heredoc ate the
    // backslash in \repo, so the assertion ran against 'C:<CR>epo\...' and matched for a
    // COINCIDENTAL reason -- the mangled string still contained /_archive/ after normalisation.
    // A green test on a string that is not the string you wrote is the same class as the
    // un-failable pins this SD keeps surfacing, so the input is now pinned FIRST.
    const winPath = String.raw`C:\repo\.worktrees\_archive\SD-OLD-001`;
    expect(winPath).toContain('\\repo\\');   // the input is what it appears to be
    expect(winPath).not.toContain(String.fromCharCode(13));  // no CR smuggled in
    expect(isArchivedWorktree(winPath)).toBe(true);
  });

  it('does NOT match a name that merely CONTAINS _archive', () => {
    // Guards substring matching: the segment is /_archive/, not the bare token.
    expect(isArchivedWorktree('C:/repo/.worktrees/SD-_archive-tooling-001')).toBe(false);
  });
});

describe('auditWorktrees — archived trees are REPORTED but never move the verdict', () => {
  // THE FIRST VERSION OF THIS BLOCK WAS UN-FAILABLE and I wrote it. It asserted
  // `classifyAudit({total: 17})` directly, which stays green no matter what main() passes in — so
  // it pinned nothing about the live-vs-archived rule it claimed to guard. The rule only became
  // testable once the partition was extracted into a function a test can actually drive.
  const isArchivedFake = (w) => w.includes('_archive');

  it('a junction in an ARCHIVED tree does NOT fail the live fleet', () => {
    const r = auditWorktrees(['/wt/a', '/wt/b', '/wt/_archive/old'], isArchivedFake);
    expect(r.verdict).toBe('CLEAN');
    expect(r.archivedReparse).toHaveLength(1);   // still surfaced, never hidden
  });

  it('the DENOMINATOR counts live trees only', () => {
    // Fold the archive in and this reads "0 of 3" — the stale-pool dilution this guards against.
    const r = auditWorktrees(['/wt/a', '/wt/b', '/wt/_archive/old'], isArchivedFake);
    expect(r.reason).toMatch(/0 of 2/);
    expect(r.live).toHaveLength(2);
  });

  it('a junction in a LIVE tree DOES fail — the guard still has teeth', () => {
    const r = auditWorktrees(['/wt/a', '/wt/_archive/old'], (w) => w === '/wt/a');
    expect(r.verdict).toBe('REGRESSION');
    expect(r.exitCode).toBe(1);
  });

  it('an all-archived population is FAILED_TO_MEASURE, not a free pass', () => {
    // The stalled-reaper worst case: every tree archived, live denominator 0. Reporting CLEAN here
    // would be a vacuous green over an empty base — the exact 0/0 trap this file exists for.
    expect(auditWorktrees(['/wt/_archive/a'], isArchivedFake).verdict).toBe('FAILED_TO_MEASURE');
  });
});

describe('partitionWorktrees', () => {
  it('splits without dropping or duplicating any tree', () => {
    const all = ['/wt/a', '/wt/_archive/x', '/wt/b', '/wt/_archive/y'];
    const { live, archived } = partitionWorktrees(all);
    expect(live).toEqual(['/wt/a', '/wt/b']);
    expect(archived).toEqual(['/wt/_archive/x', '/wt/_archive/y']);
    expect(live.length + archived.length).toBe(all.length);
  });
});
