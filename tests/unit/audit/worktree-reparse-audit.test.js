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
import { classifyAudit, isReparsePoint, collectWorktrees } from '../../../scripts/audit/worktree-reparse-audit.mjs';

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
  it('detects a REAL junction', () => {
    // NEGATIVE CONTROL as a unit test: if this cannot fire, every zero the audit prints is
    // meaningless. The CLI runs the same check as a --self-test before it will report anything.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reparse-unit-'));
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'reparse-unit-target-'));
    const link = path.join(dir, 'node_modules');
    try {
      fs.symlinkSync(target, link, 'junction');
    } catch {
      return; // environment cannot create junctions — skip rather than false-pass
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
