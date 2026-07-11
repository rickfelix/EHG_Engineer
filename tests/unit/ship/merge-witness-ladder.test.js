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
  it('pass: verdict=pass row exists (standard tier, no actor metadata — actorSeparation reported as its own not_evaluable status, not folded into P2 pass — TR-3, TS-4)', async () => {
    const r = await evaluateP2Witness({ prNumber: 123, tier: 'standard', fetchReviewFinding: async () => ({ verdict: 'pass' }) });
    expect(r.status).toBe(RUNG_STATUS.PASS);
    expect(r.reason).not.toMatch(/not_evaluable/);
    expect(r.actorSeparation.status).toBe(RUNG_STATUS.NOT_EVALUABLE);
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

  // SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 (FR-2, TS-3): actor attribution present
  // vs absent changes only the actorSeparation sub-field, never P2's own status.
  it('actorSeparation: pass when finding.metadata.actor_type is present', async () => {
    const r = await evaluateP2Witness({
      prNumber: 123, tier: 'standard',
      fetchReviewFinding: async () => ({ verdict: 'pass', metadata: { actor_type: 'agent', actor_role: 'EXEC', agent_id: 'a1' } }),
    });
    expect(r.status).toBe(RUNG_STATUS.PASS);
    expect(r.actorSeparation.status).toBe(RUNG_STATUS.PASS);
  });

  it('actorSeparation: not_evaluable when metadata present but missing actor_type', async () => {
    const r = await evaluateP2Witness({
      prNumber: 123, tier: 'standard',
      fetchReviewFinding: async () => ({ verdict: 'pass', metadata: { actor_role: 'EXEC' } }),
    });
    expect(r.actorSeparation.status).toBe(RUNG_STATUS.NOT_EVALUABLE);
  });

  it('actorSeparation: not_applicable at tier=light regardless of metadata', async () => {
    const r = await evaluateP2Witness({
      prNumber: 123, tier: 'light',
      fetchReviewFinding: async () => ({ verdict: 'pass' }),
    });
    expect(r.actorSeparation.status).toBe(RUNG_STATUS.NOT_APPLICABLE);
  });

  it('actorSeparation is not_evaluable even on a FAIL verdict (sub-field independent of top-level status)', async () => {
    const r = await evaluateP2Witness({
      prNumber: 123, tier: 'standard',
      fetchReviewFinding: async () => ({ verdict: 'block', metadata: { actor_type: 'human' } }),
    });
    expect(r.status).toBe(RUNG_STATUS.FAIL);
    expect(r.actorSeparation.status).toBe(RUNG_STATUS.PASS);
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
  // SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 (FR-3): evaluateP4ProtectionIntegrity is
  // now async (it may await an escapeAuth lookup when adminOverride=true) —
  // these pre-existing tests are updated to await it; the assertions themselves
  // are unchanged, proving no behavior regression for the non-admin-override case.
  it('not_applicable when no repo/checker is supplied (backward-compat, pre-P0 stub)', async () => {
    expect((await evaluateP4ProtectionIntegrity()).status).toBe(RUNG_STATUS.NOT_APPLICABLE);
  });

  // QF-20260703-744: regression fixture reproducing the exact false-negative —
  // protection genuinely live on the repo must report PASS, never a fail/stub.
  it('pass/enabled — marketlens-shaped fixture with protection confirmed live', async () => {
    const r = await evaluateP4ProtectionIntegrity({
      repoOwner: 'rickfelix', repoName: 'marketlens', checkProtection: () => true,
    });
    expect(r.status).toBe(RUNG_STATUS.PASS);
  });

  it('fail — checker authoritatively confirms protection is NOT enabled', async () => {
    const r = await evaluateP4ProtectionIntegrity({
      repoOwner: 'o', repoName: 'r', checkProtection: () => false,
    });
    expect(r.status).toBe(RUNG_STATUS.FAIL);
  });

  it('not_evaluable — checker returns null (403/scope/network), never reported as disabled', async () => {
    const r = await evaluateP4ProtectionIntegrity({
      repoOwner: 'o', repoName: 'r', checkProtection: () => null,
    });
    expect(r.status).toBe(RUNG_STATUS.NOT_EVALUABLE);
  });

  // SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 (FR-3, TS-5): escapeAuth sub-field only
  // appears when adminOverride=true; absent otherwise (TR-3 backward-compat).
  it('escapeAuth sub-field is absent when adminOverride is not set (default behavior unchanged)', async () => {
    const r = await evaluateP4ProtectionIntegrity({
      repoOwner: 'o', repoName: 'r', checkProtection: () => true,
    });
    expect(r.escapeAuth).toBeUndefined();
  });

  it('escapeAuth: pass when checkEscapeAudit confirms an audit row exists for an admin-override merge', async () => {
    const r = await evaluateP4ProtectionIntegrity({
      repoOwner: 'o', repoName: 'r', checkProtection: () => true,
      adminOverride: true, prNumber: 42, checkEscapeAudit: async () => true,
    });
    expect(r.status).toBe(RUNG_STATUS.PASS);
    expect(r.escapeAuth.status).toBe(RUNG_STATUS.PASS);
  });

  it('escapeAuth: fail when checkEscapeAudit confirms NO audit row exists for an admin-override merge (unaudited bypass)', async () => {
    const r = await evaluateP4ProtectionIntegrity({
      repoOwner: 'o', repoName: 'r', checkProtection: () => true,
      adminOverride: true, prNumber: 42, checkEscapeAudit: async () => false,
    });
    expect(r.escapeAuth.status).toBe(RUNG_STATUS.FAIL);
  });

  it('escapeAuth: not_evaluable when adminOverride=true but no checkEscapeAudit injected', async () => {
    const r = await evaluateP4ProtectionIntegrity({
      repoOwner: 'o', repoName: 'r', checkProtection: () => true, adminOverride: true, prNumber: 42,
    });
    expect(r.escapeAuth.status).toBe(RUNG_STATUS.NOT_EVALUABLE);
  });

  it('escapeAuth: not_evaluable when checkEscapeAudit throws', async () => {
    const r = await evaluateP4ProtectionIntegrity({
      repoOwner: 'o', repoName: 'r', checkProtection: () => true,
      adminOverride: true, prNumber: 42, checkEscapeAudit: async () => { throw new Error('db down'); },
    });
    expect(r.escapeAuth.status).toBe(RUNG_STATUS.NOT_EVALUABLE);
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
