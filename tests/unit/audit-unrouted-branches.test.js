/**
 * QF-20260725-085 — unit tests for the unrouted-branch detector's pure logic.
 *
 * The classification is the part that matters and the part naive versions get
 * wrong: "already merged" is TWO checks, because this repo squash-merges, so a
 * landed branch's tip is NOT an ancestor of main. Ancestry alone would report
 * thousands of already-shipped branches as outstanding (measured at authoring:
 * 3418 of 5050 refs are ancestry-unmerged, mostly squash-landed).
 *
 * Pure functions only — no git, no gh, no network, no DB.
 */
import { describe, it, expect } from 'vitest';
import { classifyBranch, withinAgeWindow } from '../../scripts/audit-unrouted-branches.mjs';

const NOW = Date.parse('2026-07-25T18:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();

describe('classifyBranch — merged-by-any-route detection', () => {
  it('reports a branch with unmerged commits and no open PR', () => {
    const hit = classifyBranch({
      branch: 'fix/spawn-inherits-child-session-marker',
      ref: 'origin/fix/spawn-inherits-child-session-marker',
      unmergedPatchCount: 1,
      hasOpenPR: false,
      newestCommitISO: hoursAgo(7),
    }, NOW);
    // The live incident: one commit, pushed, no PR, sat 7 hours as the root blocker.
    expect(hit).not.toBeNull();
    expect(hit.branch).toBe('fix/spawn-inherits-child-session-marker');
    expect(hit.unmerged_commits).toBe(1);
    expect(hit.age_hours).toBe(7);
  });

  it('does NOT report a squash-merged branch (zero patch-equivalent commits remain)', () => {
    // This is the case ancestry cannot see: the tip is not an ancestor of main,
    // but git cherry finds every commit already applied upstream.
    expect(classifyBranch({
      branch: 'qf/QF-20260725-598',
      ref: 'origin/qf/QF-20260725-598',
      unmergedPatchCount: 0,
      hasOpenPR: false,
      newestCommitISO: hoursAgo(5),
    }, NOW)).toBeNull();
  });

  it('does NOT report a branch that already has an open PR', () => {
    expect(classifyBranch({
      branch: 'feat/whatever',
      ref: 'origin/feat/whatever',
      unmergedPatchCount: 3,
      hasOpenPR: true,
      newestCommitISO: hoursAgo(2),
    }, NOW)).toBeNull();
  });

  it('never consults the branch name — an unmerged main-ish name is still reported', () => {
    // Guards the QF requirement to verify by ancestry/patch-id, not by naming.
    const hit = classifyBranch({
      branch: 'mainline-ish-name',
      ref: 'origin/mainline-ish-name',
      unmergedPatchCount: 2,
      hasOpenPR: false,
      newestCommitISO: hoursAgo(9),
    }, NOW);
    expect(hit).not.toBeNull();
    expect(hit.unmerged_commits).toBe(2);
  });

  it('tolerates a missing commit date rather than throwing', () => {
    const hit = classifyBranch({
      branch: 'feat/no-date',
      ref: 'origin/feat/no-date',
      unmergedPatchCount: 1,
      hasOpenPR: false,
      newestCommitISO: null,
    }, NOW);
    expect(hit).not.toBeNull();
    expect(hit.age_hours).toBeNull();
    expect(hit.newest_commit).toBeNull();
  });
});

describe('withinAgeWindow — bounds the expensive patch-equivalence pass', () => {
  it('excludes a branch committed minutes ago so mid-work does not alarm', () => {
    expect(withinAgeWindow(hoursAgo(0.2), {}, NOW)).toBe(false);
  });

  it('includes a branch a few hours old — the live incident window', () => {
    expect(withinAgeWindow(hoursAgo(7), {}, NOW)).toBe(true);
  });

  it('excludes a branch older than the window (branch cleanup owns those)', () => {
    expect(withinAgeWindow(hoursAgo(24 * 30), { maxAgeDays: 3 }, NOW)).toBe(false);
  });

  it('honours a widened window', () => {
    expect(withinAgeWindow(hoursAgo(24 * 10), { maxAgeDays: 14 }, NOW)).toBe(true);
  });

  it('excludes an unparseable or missing date instead of throwing', () => {
    expect(withinAgeWindow(null, {}, NOW)).toBe(false);
    expect(withinAgeWindow('not-a-date', {}, NOW)).toBe(false);
  });
});
