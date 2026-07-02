/**
 * SD-LEO-INFRA-CANCEL-SD-VERIFY-ORIGIN-MAIN-NOT-LOCAL-HEAD-001
 *
 * cancel-sd.js's "superseded / already-shipped" cancellation path must verify
 * against ORIGIN/MAIN (PR mergedAt + file diff), never a local/branch HEAD.
 * Incident: a worker cancelled a live SD as "already merged" after checking a
 * LOCAL commit that was actually an UNMERGED PR head. These tests cover the
 * pure classifier and the injectable-runner verification function — no live
 * git/gh calls, mirroring lib/worktree-reaper/detectors.js's
 * isPatchEquivalentToMain pattern.
 */
import { describe, it, expect } from 'vitest';
import { classifyShipReason, verifyShippedOnOriginMain, decideCancelRefusal } from '../../scripts/cancel-sd.js';

describe('classifyShipReason', () => {
  it('classifies already-shipped/superseded/duplicate-of-merged phrasing as requiring verification', () => {
    expect(classifyShipReason('already shipped via PR #999')).toBe(true);
    expect(classifyShipReason('Already Merged in #123')).toBe(true);
    expect(classifyShipReason('Superseded by SD-BAR-001')).toBe(true);
    expect(classifyShipReason('duplicate of merged fix in SD-FOO')).toBe(true);
    expect(classifyShipReason('duplicate-of-merged')).toBe(true);
  });

  it('does NOT classify ordinary kill/deprioritize/duplicate-of-open reasons as requiring verification', () => {
    expect(classifyShipReason('duplicate work, killing this one')).toBe(false);
    expect(classifyShipReason('deprioritized')).toBe(false);
    expect(classifyShipReason('duplicate of open work in SD-BAZ')).toBe(false);
    expect(classifyShipReason('')).toBe(false);
    expect(classifyShipReason(undefined)).toBe(false);
  });
});

describe('verifyShippedOnOriginMain — PR verification', () => {
  it('passes when the PR is MERGED with mergedAt set', () => {
    const runGh = () => ({ code: 0, stdout: JSON.stringify({ state: 'MERGED', mergedAt: '2026-07-01T00:00:00Z' }), stderr: '' });
    const runGit = () => ({ code: 0, stdout: '', stderr: '' });
    const result = verifyShippedOnOriginMain({ pr: '999' }, { runGit, runGh });
    expect(result.verified).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('fails when the PR is OPEN (not merged) — the exact incident scenario', () => {
    const runGh = () => ({ code: 0, stdout: JSON.stringify({ state: 'OPEN', mergedAt: null }), stderr: '' });
    const runGit = () => ({ code: 0, stdout: '', stderr: '' });
    const result = verifyShippedOnOriginMain({ pr: '999' }, { runGit, runGh });
    expect(result.verified).toBe(false);
    expect(result.reasons[0]).toMatch(/not merged/);
  });

  it('fails when gh pr view errors', () => {
    const runGh = () => ({ code: 1, stdout: '', stderr: 'not found' });
    const runGit = () => ({ code: 0, stdout: '', stderr: '' });
    const result = verifyShippedOnOriginMain({ pr: '999' }, { runGit, runGh });
    expect(result.verified).toBe(false);
    expect(result.reasons[0]).toMatch(/gh pr view failed/);
  });
});

describe('verifyShippedOnOriginMain — file verification', () => {
  it('passes when the file is present on origin/main', () => {
    const runGit = (args) => {
      expect(args).toEqual(['cat-file', '-e', 'origin/main:scripts/foo.js']);
      return { code: 0, stdout: '', stderr: '' };
    };
    const result = verifyShippedOnOriginMain({ evidenceFiles: ['scripts/foo.js'] }, { runGit, runGh: () => ({ code: 1 }) });
    expect(result.verified).toBe(true);
  });

  it('fails when the file is absent from origin/main', () => {
    const runGit = () => ({ code: 128, stdout: '', stderr: 'fatal: path not found' });
    const result = verifyShippedOnOriginMain({ evidenceFiles: ['scripts/missing.js'] }, { runGit, runGh: () => ({ code: 1 }) });
    expect(result.verified).toBe(false);
    expect(result.reasons[0]).toMatch(/not found on origin\/main/);
  });

  it('checks against origin/main explicitly, never a bare branch ref', () => {
    let capturedArgs = null;
    const runGit = (args) => { capturedArgs = args; return { code: 0, stdout: '', stderr: '' }; };
    verifyShippedOnOriginMain({ evidenceFiles: ['x.js'] }, { runGit, runGh: () => ({ code: 1 }) });
    expect(capturedArgs.join(' ')).toContain('origin/main:');
  });
});

describe('verifyShippedOnOriginMain — no evidence supplied', () => {
  it('fails closed when neither --pr nor --evidence-file is given', () => {
    const result = verifyShippedOnOriginMain({}, { runGit: () => ({ code: 0 }), runGh: () => ({ code: 0 }) });
    expect(result.verified).toBe(false);
    expect(result.reasons[0]).toMatch(/no evidence supplied/);
  });
});

describe('verifyShippedOnOriginMain — both PR and file required to pass together', () => {
  it('fails overall if PR is merged but the evidence file is missing', () => {
    const runGh = () => ({ code: 0, stdout: JSON.stringify({ state: 'MERGED', mergedAt: '2026-07-01T00:00:00Z' }), stderr: '' });
    const runGit = () => ({ code: 1, stdout: '', stderr: 'not found' });
    const result = verifyShippedOnOriginMain({ pr: '1', evidenceFiles: ['x.js'] }, { runGit, runGh });
    expect(result.verified).toBe(false);
    expect(result.reasons.length).toBe(1);
  });
});

// TS-7: the CLI refuse path. main() gates its call to cancelSD() on this exact
// decision — asserting refuse:true here proves the SD update is never reached
// for a ship-classified reason with no (or failing) evidence, without touching
// resolveSD/cancelSD/Supabase (FR-6 AC: no live network calls in tests).
describe('decideCancelRefusal — CLI refuse-path decision (FR-4, TS-7)', () => {
  it('refuses when no evidence flags are given on a ship-classified reason', () => {
    const result = decideCancelRefusal('already shipped via PR #999', {}, { runGit: () => ({ code: 0 }), runGh: () => ({ code: 0 }) });
    expect(result.refuse).toBe(true);
    expect(result.reasons[0]).toMatch(/no evidence supplied/);
  });

  it('refuses when the supplied evidence fails verification', () => {
    const runGh = () => ({ code: 0, stdout: JSON.stringify({ state: 'OPEN', mergedAt: null }), stderr: '' });
    const result = decideCancelRefusal('already merged in #999', { pr: '999' }, { runGit: () => ({ code: 0 }), runGh });
    expect(result.refuse).toBe(true);
  });

  it('does not refuse when the supplied evidence verifies', () => {
    const runGh = () => ({ code: 0, stdout: JSON.stringify({ state: 'MERGED', mergedAt: '2026-07-01T00:00:00Z' }), stderr: '' });
    const result = decideCancelRefusal('already shipped via PR #999', { pr: '999' }, { runGit: () => ({ code: 0 }), runGh });
    expect(result.refuse).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('never refuses a non-ship-classified reason (FR-5 backward compat), even with zero evidence', () => {
    const result = decideCancelRefusal('duplicate work, killing this one', {}, { runGit: () => ({ code: 0 }), runGh: () => ({ code: 0 }) });
    expect(result.refuse).toBe(false);
    expect(result.reasons).toEqual([]);
  });
});
