/**
 * Unit tests for SD-FDBK-ENH-SECOND-CASE-DESTRUCTIVE-001
 * Phase 1: drift detection, threshold evaluation, and WorktreeForkDriftError shape.
 *
 * Tests cover the pure functions exported by lib/worktree-manager.js for
 * fork-drift detection. Integration with `git worktree add` is exercised by
 * the system itself during sd-start invocations and by the integration tests
 * (worktree-recovery.test.js, T-4..T-7) — kept out of this file so unit tests
 * stay fast and free of git fixtures.
 *
 * PRD test IDs covered:
 *   T-1: branchExists=true + driftBehind=0 → reuse without warning (decision=allow)
 *   T-2: branchExists=true + driftBehind under threshold → reuse with allow + drift recorded
 *   T-3: branchExists=true + driftBehind=threshold → throw WorktreeForkDriftError with full message shape
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';

vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

import {
  WorktreeForkDriftError,
  WorktreeBaseFetchFailedError,
  checkBranchForkDrift,
  evaluateDriftDecision,
} from '../../../lib/worktree-manager.js';

const REPO = '/tmp/fixture-repo';
const BRANCH = 'feat/SD-FAKE-001';
const BASE = 'origin/main';

function configureGitMock({ behind = 0, ahead = 0, tipEpochSecondsAgo = 0, sample = '' }) {
  execSync.mockImplementation((cmd) => {
    if (cmd.startsWith(`git rev-list --count ${BRANCH}..${BASE}`)) return Buffer.from(`${behind}\n`);
    if (cmd.startsWith(`git rev-list --count ${BASE}..${BRANCH}`)) return Buffer.from(`${ahead}\n`);
    if (cmd.startsWith(`git log -1 --format=%ct ${BRANCH}`)) {
      const epoch = Math.floor(Date.now() / 1000) - tipEpochSecondsAgo;
      return Buffer.from(`${epoch}\n`);
    }
    if (cmd.startsWith(`git log --oneline --no-merges -5 ${BRANCH}..${BASE}`)) return Buffer.from(sample);
    throw new Error(`Unexpected git invocation in mock: ${cmd}`);
  });
}

describe('SD-FDBK-ENH-SECOND-CASE-DESTRUCTIVE-001 — drift detection (Phase 1)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.LEO_FORK_DRIFT_THRESHOLD_COMMITS;
    delete process.env.LEO_FORK_DRIFT_THRESHOLD_HOURS;
    execSync.mockReset();
  });

  afterEach(() => {
    Object.keys(process.env).forEach((k) => {
      if (k.startsWith('LEO_FORK_DRIFT_')) delete process.env[k];
    });
    Object.assign(process.env, originalEnv);
  });

  describe('checkBranchForkDrift()', () => {
    it('returns zero drift when branch is at base tip (T-1 happy path)', () => {
      configureGitMock({ behind: 0, ahead: 0 });
      const result = checkBranchForkDrift(REPO, BRANCH, BASE);
      expect(result.driftBehind).toBe(0);
      expect(result.driftAhead).toBe(0);
      expect(result.sampleSubjects).toEqual([]);
      expect(typeof result.branchTipAgeHours === 'number' || result.branchTipAgeHours === null).toBe(true);
    });

    it('records ahead/behind counts and tip age (T-2 partial drift)', () => {
      configureGitMock({ behind: 1, ahead: 2, tipEpochSecondsAgo: 3600, sample: 'abc1234 fix: stuff\ndef5678 feat: more stuff' });
      const result = checkBranchForkDrift(REPO, BRANCH, BASE);
      expect(result.driftBehind).toBe(1);
      expect(result.driftAhead).toBe(2);
      expect(result.sampleSubjects).toHaveLength(2);
      expect(result.sampleSubjects[0]).toContain('abc1234');
      expect(result.branchTipAgeHours).toBeGreaterThanOrEqual(0.9);
      expect(result.branchTipAgeHours).toBeLessThan(1.5);
    });

    it('does not throw on rev-list failure (fail-open on count probe)', () => {
      execSync.mockImplementation(() => {
        throw new Error('fatal: bad revision');
      });
      const result = checkBranchForkDrift(REPO, BRANCH, BASE);
      expect(result.driftBehind).toBe(0);
      expect(result.driftAhead).toBe(0);
    });

    it('only collects sample subjects when driftBehind > 0', () => {
      configureGitMock({ behind: 0, ahead: 5, sample: 'should-not-be-read' });
      const result = checkBranchForkDrift(REPO, BRANCH, BASE);
      expect(result.sampleSubjects).toEqual([]);
    });
  });

  describe('evaluateDriftDecision()', () => {
    it('allows zero drift (T-1)', () => {
      const r = evaluateDriftDecision({ driftBehind: 0, driftAhead: 0, branchTipAgeHours: 0, sampleSubjects: [] });
      expect(r.decision).toBe('allow');
      expect(r.kind).toBe('none');
      expect(r.threshold).toBe(5); // default
    });

    it('allows drift below default commit threshold (T-2)', () => {
      const r = evaluateDriftDecision({ driftBehind: 1, driftAhead: 0, branchTipAgeHours: 1, sampleSubjects: [] });
      expect(r.decision).toBe('allow');
      expect(r.kind).toBe('none');
    });

    it('blocks at the default commit threshold (T-3)', () => {
      const r = evaluateDriftDecision({ driftBehind: 5, driftAhead: 0, branchTipAgeHours: 1, sampleSubjects: [] });
      expect(r.decision).toBe('block');
      expect(r.kind).toBe('commits');
      expect(r.threshold).toBe(5);
    });

    it('blocks when commits-behind below threshold but tip age exceeds hours threshold', () => {
      const r = evaluateDriftDecision({ driftBehind: 1, driftAhead: 0, branchTipAgeHours: 25, sampleSubjects: [] });
      expect(r.decision).toBe('block');
      expect(r.kind).toBe('hours');
      expect(r.threshold).toBe(24);
    });

    it('does NOT block on hours alone when driftBehind=0 (no behind = no risk)', () => {
      const r = evaluateDriftDecision({ driftBehind: 0, driftAhead: 0, branchTipAgeHours: 9999, sampleSubjects: [] });
      expect(r.decision).toBe('allow');
    });

    it('honors LEO_FORK_DRIFT_THRESHOLD_COMMITS env override (AC-4)', () => {
      process.env.LEO_FORK_DRIFT_THRESHOLD_COMMITS = '2';
      const r = evaluateDriftDecision({ driftBehind: 2, driftAhead: 0, branchTipAgeHours: 1, sampleSubjects: [] });
      expect(r.decision).toBe('block');
      expect(r.threshold).toBe(2);
    });

    it('honors LEO_FORK_DRIFT_THRESHOLD_HOURS env override', () => {
      process.env.LEO_FORK_DRIFT_THRESHOLD_HOURS = '1';
      const r = evaluateDriftDecision({ driftBehind: 1, driftAhead: 0, branchTipAgeHours: 2, sampleSubjects: [] });
      expect(r.decision).toBe('block');
      expect(r.kind).toBe('hours');
      expect(r.threshold).toBe(1);
    });

    it('rejects malformed env values silently and uses defaults', () => {
      process.env.LEO_FORK_DRIFT_THRESHOLD_COMMITS = 'not-a-number';
      const r = evaluateDriftDecision({ driftBehind: 4, driftAhead: 0, branchTipAgeHours: 1, sampleSubjects: [] });
      expect(r.decision).toBe('allow'); // default 5 commits, drift=4 → below
    });
  });

  describe('WorktreeForkDriftError shape (T-3 message contract)', () => {
    it('exposes structured fields and discriminator cause', () => {
      const err = new WorktreeForkDriftError({
        branch: 'feat/SD-X',
        baseRef: 'origin/main',
        driftBehind: 7,
        driftAhead: 1,
        threshold: 5,
        kind: 'commits',
        sampleSubjects: ['aaa1111 feat: alpha', 'bbb2222 fix: beta'],
      });
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('WORKTREE_FORK_DRIFT');
      expect(err.cause).toBe('fork_drift');
      expect(err.driftBehind).toBe(7);
      expect(err.driftAhead).toBe(1);
      expect(err.threshold).toBe(5);
      expect(err.kind).toBe('commits');
      expect(err.sampleSubjects).toHaveLength(2);
    });

    it('message includes the 3 remediation options + sample subjects', () => {
      const err = new WorktreeForkDriftError({
        branch: 'feat/SD-X',
        baseRef: 'origin/main',
        driftBehind: 7,
        driftAhead: 1,
        threshold: 5,
        kind: 'commits',
        sampleSubjects: ['aaa1111 feat: alpha'],
      });
      expect(err.message).toMatch(/Rebase:.*git rebase origin\/main/);
      expect(err.message).toMatch(/Cherry-pick/);
      expect(err.message).toMatch(/Abandon-and-reset/);
      expect(err.message).toMatch(/aaa1111 feat: alpha/);
    });

    it('uses hours-based reason line when kind=hours', () => {
      const err = new WorktreeForkDriftError({
        branch: 'feat/SD-X',
        baseRef: 'origin/main',
        driftBehind: 1,
        driftAhead: 0,
        threshold: 24,
        kind: 'hours',
        sampleSubjects: [],
      });
      expect(err.message).toMatch(/predates origin\/main by more than the configured 24h threshold/);
    });

    it('is structurally distinguishable from WorktreeBaseFetchFailedError (cause discriminator)', () => {
      const fetchErr = new WorktreeBaseFetchFailedError({ baseRef: 'origin/main', gitOutput: 'x', exitCode: 1 });
      const driftErr = new WorktreeForkDriftError({
        branch: 'b', baseRef: 'origin/main', driftBehind: 5, driftAhead: 0, threshold: 5, kind: 'commits', sampleSubjects: [],
      });
      expect(fetchErr.cause).toBe('fetch_failed');
      expect(driftErr.cause).toBe('fork_drift');
      expect(fetchErr.cause).not.toBe(driftErr.cause);
    });
  });
});
