/**
 * SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001
 * TS-1, TS-2, TS-3: mergeWork() P1-P5 precondition ladder — OBSERVE-ONLY.
 */
import { describe, it, expect } from 'vitest';
import {
  RUNG_STATUS,
  evaluateP1Admission,
  evaluateP2Witness,
  evaluateP3CI,
  evaluateP4ProtectionIntegrity,
  evaluateP5PostVerify,
  evaluateMergeWorkLadder,
} from '../../../lib/ship/merge-witness-ladder.mjs';

function rungFor(verdict, id) {
  return verdict.rungs.find((r) => r.id === id);
}

describe('evaluateP1Admission', () => {
  it('pass: workKey resolves to a real SD/QF row', async () => {
    const r = await evaluateP1Admission({ workKey: 'SD-XXX-001', lookupWorkKeyReal: async () => true });
    expect(r.status).toBe(RUNG_STATUS.PASS);
  });

  it('fail: workKey does not resolve to a real row', async () => {
    const r = await evaluateP1Admission({ workKey: 'SD-FAKE-001', lookupWorkKeyReal: async () => false });
    expect(r.status).toBe(RUNG_STATUS.FAIL);
  });

  it('fail: no workKey supplied', async () => {
    const r = await evaluateP1Admission({ workKey: null, lookupWorkKeyReal: async () => true });
    expect(r.status).toBe(RUNG_STATUS.FAIL);
  });

  it('not_evaluable: no lookup injected', async () => {
    const r = await evaluateP1Admission({ workKey: 'SD-XXX-001' });
    expect(r.status).toBe(RUNG_STATUS.NOT_EVALUABLE);
  });

  it('not_evaluable: lookup throws', async () => {
    const r = await evaluateP1Admission({ workKey: 'SD-XXX-001', lookupWorkKeyReal: async () => { throw new Error('db down'); } });
    expect(r.status).toBe(RUNG_STATUS.NOT_EVALUABLE);
  });
});

describe('evaluateP2Witness', () => {
  it('pass: verdict=pass row exists (standard tier — actor-separation flagged not_evaluable in reason, not folded into pass)', async () => {
    const r = await evaluateP2Witness({ prNumber: 123, tier: 'standard', fetchReviewFinding: async () => ({ verdict: 'pass' }) });
    expect(r.status).toBe(RUNG_STATUS.PASS);
    expect(r.reason).toMatch(/not_evaluable/);
  });

  it('fail: verdict=block', async () => {
    const r = await evaluateP2Witness({ prNumber: 123, tier: 'standard', fetchReviewFinding: async () => ({ verdict: 'block' }) });
    expect(r.status).toBe(RUNG_STATUS.FAIL);
  });

  it('fail: no row found', async () => {
    const r = await evaluateP2Witness({ prNumber: 123, tier: 'standard', fetchReviewFinding: async () => null });
    expect(r.status).toBe(RUNG_STATUS.FAIL);
  });

  it('not_evaluable: no fetch injected', async () => {
    const r = await evaluateP2Witness({ prNumber: 123, tier: 'standard' });
    expect(r.status).toBe(RUNG_STATUS.NOT_EVALUABLE);
  });
});

describe('evaluateP3CI', () => {
  it('pass: all checks succeeded', () => {
    const r = evaluateP3CI({ statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] });
    expect(r.status).toBe(RUNG_STATUS.PASS);
  });

  it('fail: a check failed', () => {
    const r = evaluateP3CI({ statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] });
    expect(r.status).toBe(RUNG_STATUS.FAIL);
  });

  it('not_evaluable: checks still pending', () => {
    const r = evaluateP3CI({ statusCheckRollup: [{ status: 'IN_PROGRESS' }] });
    expect(r.status).toBe(RUNG_STATUS.NOT_EVALUABLE);
  });

  it('not_evaluable: no checks reported', () => {
    const r = evaluateP3CI({ statusCheckRollup: [] });
    expect(r.status).toBe(RUNG_STATUS.NOT_EVALUABLE);
  });
});

describe('evaluateP4ProtectionIntegrity', () => {
  it('not_applicable when no repo/checker is supplied (backward-compat, pre-P0 stub)', () => {
    expect(evaluateP4ProtectionIntegrity().status).toBe(RUNG_STATUS.NOT_APPLICABLE);
  });

  // QF-20260703-744: regression fixture reproducing the exact false-negative —
  // protection genuinely live on the repo must report PASS, never a fail/stub.
  it('pass/enabled — marketlens-shaped fixture with protection confirmed live', () => {
    const r = evaluateP4ProtectionIntegrity({
      repoOwner: 'rickfelix', repoName: 'marketlens', checkProtection: () => true,
    });
    expect(r.status).toBe(RUNG_STATUS.PASS);
  });

  it('fail — checker authoritatively confirms protection is NOT enabled', () => {
    const r = evaluateP4ProtectionIntegrity({
      repoOwner: 'o', repoName: 'r', checkProtection: () => false,
    });
    expect(r.status).toBe(RUNG_STATUS.FAIL);
  });

  it('not_evaluable — checker returns null (403/scope/network), never reported as disabled', () => {
    const r = evaluateP4ProtectionIntegrity({
      repoOwner: 'o', repoName: 'r', checkProtection: () => null,
    });
    expect(r.status).toBe(RUNG_STATUS.NOT_EVALUABLE);
  });
});

describe('evaluateP5PostVerify', () => {
  it('not_applicable before a merge attempt completes', () => {
    const r = evaluateP5PostVerify({ merged: false, verifyResult: null });
    expect(r.status).toBe(RUNG_STATUS.NOT_APPLICABLE);
  });

  it('pass when verifyResult.ok is true', () => {
    const r = evaluateP5PostVerify({ merged: true, verifyResult: { ok: true } });
    expect(r.status).toBe(RUNG_STATUS.PASS);
  });

  it('fail when verifyResult.ok is false', () => {
    const r = evaluateP5PostVerify({ merged: true, verifyResult: { ok: false } });
    expect(r.status).toBe(RUNG_STATUS.FAIL);
  });
});

describe('evaluateMergeWorkLadder — full ladder (TS-1, TS-2, TS-3)', () => {
  it('TS-1: green CI, real workKey, passing review finding — all rungs evaluate cleanly, overall observe-only', async () => {
    const verdict = await evaluateMergeWorkLadder({
      prNumber: 42,
      workKey: 'SD-REAL-001',
      tier: 'standard',
      lookupWorkKeyReal: async () => true,
      fetchReviewFinding: async () => ({ verdict: 'pass' }),
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      merged: false,
    });
    expect(verdict.overall).toBe('observe-only');
    expect(rungFor(verdict, 'P1').status).toBe(RUNG_STATUS.PASS);
    expect(rungFor(verdict, 'P2').status).toBe(RUNG_STATUS.PASS);
    expect(rungFor(verdict, 'P3').status).toBe(RUNG_STATUS.PASS);
    expect(rungFor(verdict, 'P4').status).toBe(RUNG_STATUS.NOT_APPLICABLE);
    expect(rungFor(verdict, 'P5').status).toBe(RUNG_STATUS.NOT_APPLICABLE);
    expect(verdict.rungs).toHaveLength(5);
  });

  it('TS-2: failed CI check is recorded in the verdict without the ladder throwing or blocking anything itself', async () => {
    const verdict = await evaluateMergeWorkLadder({
      prNumber: 43,
      workKey: 'SD-REAL-001',
      lookupWorkKeyReal: async () => true,
      fetchReviewFinding: async () => ({ verdict: 'pass' }),
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }],
    });
    expect(rungFor(verdict, 'P3').status).toBe(RUNG_STATUS.FAIL);
    // the ladder itself never has an "enforce" concept — overall stays observe-only
    expect(verdict.overall).toBe('observe-only');
  });

  it('TS-3: workKey does not resolve to a real row — P1 fails, ladder still completes (observe-only)', async () => {
    const verdict = await evaluateMergeWorkLadder({
      prNumber: 44,
      workKey: 'SCRATCH-TEST-001',
      lookupWorkKeyReal: async () => false,
      fetchReviewFinding: async () => ({ verdict: 'pass' }),
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
    });
    expect(rungFor(verdict, 'P1').status).toBe(RUNG_STATUS.FAIL);
    expect(verdict.overall).toBe('observe-only');
    expect(verdict.rungs).toHaveLength(5);
  });
});
