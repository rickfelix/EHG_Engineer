/**
 * SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (FR-2): completeSession()'s optional control-pack
 * evidence parameter. Covers TS-1 (canary), TS-2 (deployment binding), TS-6 (negative control
 * -- a clean run must NOT be forced RED), TS-7 (manifest coverage), and backward compatibility
 * (omitting the param behaves identically to before this SD).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { row: null };

function makeChain(methodName, resolvedValue) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => resolvedValue()),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
  };
  chain[methodName] = vi.fn((...args) => {
    chain.__lastArgs = args;
    return chain;
  });
  return chain;
}

const updateChain = makeChain('update', () => ({ data: state.row, error: null }));
const selectChain = {
  select: vi.fn(() => selectChain),
  eq: vi.fn(() => selectChain),
  single: vi.fn(async () => ({ data: state.row, error: null })),
};

const fromMock = vi.fn((table) => {
  if (table !== 'uat_test_runs') throw new Error(`unexpected table: ${table}`);
  return { update: updateChain.update, select: selectChain.select };
});

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({ from: fromMock })),
}));

const { completeSession } = await import('../../../lib/uat/result-recorder.js');

describe('completeSession() control-pack evidence', () => {
  beforeEach(() => {
    updateChain.update.mockClear();
  });

  it('backward compatible: omitting controlPackEvidence behaves identically to before this SD', async () => {
    state.row = { id: 'run-1', total_tests: 10, passed_tests: 10, failed_tests: 0, skipped_tests: 0, metadata: {} };
    const result = await completeSession('run-1');
    const payload = updateChain.update.mock.calls[0][0];
    expect(payload.metadata.quality_gate).toBe('GREEN');
    expect(payload.metadata.control_pack_failures).toBeNull();
    expect(result.summary.controlPackFailures).toEqual([]);
  });

  it('TS-6 negative control: a clean run with passing control-pack evidence stays GREEN, not forced RED', async () => {
    state.row = { id: 'run-1', total_tests: 10, passed_tests: 10, failed_tests: 0, skipped_tests: 0, metadata: {} };
    const result = await completeSession('run-1', {
      manifest: [{ journeyId: 'j1', minimumAssertions: 2 }],
      executedJourneys: [{ journeyId: 'j1', executedAssertions: 5 }],
      canaryJourneyId: 'canary-1',
      journeyResults: [{ journeyId: 'canary-1', status: 'FAIL' }, { journeyId: 'j1', status: 'PASS' }],
    });
    const payload = updateChain.update.mock.calls[0][0];
    expect(payload.metadata.quality_gate).toBe('GREEN');
    expect(result.summary.controlPackFailures).toEqual([]);
  });

  it('TS-7 manifest coverage: a manifest entry for a journey that never executed forces RED even at 100% pass_rate', async () => {
    state.row = { id: 'run-1', total_tests: 10, passed_tests: 10, failed_tests: 0, skipped_tests: 0, metadata: {} };
    const result = await completeSession('run-1', {
      manifest: [{ journeyId: 'renamed-journey', minimumAssertions: 1 }],
      executedJourneys: [{ journeyId: 'j1', executedAssertions: 5 }],
    });
    const payload = updateChain.update.mock.calls[0][0];
    expect(payload.metadata.quality_gate).toBe('RED');
    expect(payload.metadata.control_pack_failures).toEqual([
      expect.objectContaining({ control: 'minimum_assertion_manifest' }),
    ]);
    expect(result.summary.controlPackFailures.length).toBe(1);
  });

  it('TS-1 canary: a run where the canary journey did not fail forces RED even at 100% pass_rate', async () => {
    state.row = { id: 'run-1', total_tests: 10, passed_tests: 10, failed_tests: 0, skipped_tests: 0, metadata: {} };
    await completeSession('run-1', {
      canaryJourneyId: 'canary-1',
      journeyResults: [{ journeyId: 'canary-1', status: 'PASS' }, { journeyId: 'j1', status: 'PASS' }],
    });
    const payload = updateChain.update.mock.calls[0][0];
    expect(payload.metadata.quality_gate).toBe('RED');
    expect(payload.metadata.control_pack_failures[0].control).toBe('canary_mutation_control');
  });

  it('TS-2 anti-mock guard: a stubbed nonce (mismatch) forces RED', async () => {
    state.row = { id: 'run-1', total_tests: 10, passed_tests: 10, failed_tests: 0, skipped_tests: 0, metadata: {} };
    await completeSession('run-1', {
      nonceWriteResult: { outcome: 'ok', echoedNonce: 'wrong-nonce' },
      expectedNonce: 'real-nonce',
      deploymentSha: 'abc1234',
    });
    const payload = updateChain.update.mock.calls[0][0];
    expect(payload.metadata.quality_gate).toBe('RED');
    expect(payload.metadata.control_pack_failures[0].control).toBe('live_deployment_binding');
  });

  it('S5 wiring: the FIRST run for a venture/stage (no priorRunEvidenceHash) establishes a baseline evidence_hash without failing', async () => {
    state.row = { id: 'run-1', total_tests: 10, passed_tests: 10, failed_tests: 0, skipped_tests: 0, metadata: {} };
    const result = await completeSession('run-1', {
      evidenceManifest: { integrity: { artifact_hashes: ['h1'] }, test_run: { total: 10, passed: 10 } },
      deploymentSha: 'sha-abc',
    });
    const payload = updateChain.update.mock.calls[0][0];
    expect(payload.metadata.quality_gate).toBe('GREEN');
    expect(payload.metadata.evidence_hash).toBeTruthy();
    expect(result.summary.controlPackFailures).toEqual([]);
  });

  it('S5 wiring: a SECOND run whose evidence hash matches the prior run\'s is forced RED (run-uniqueness failure)', async () => {
    state.row = { id: 'run-2', total_tests: 10, passed_tests: 10, failed_tests: 0, skipped_tests: 0, metadata: {} };
    const manifest = { integrity: { artifact_hashes: ['h1'] }, test_run: { total: 10, passed: 10 } };
    const { computeSubstantiveEvidenceHash } = await import('../../../lib/eva/uat-control-pack.js');
    const priorHash = computeSubstantiveEvidenceHash(manifest, 'sha-abc');
    await completeSession('run-2', { evidenceManifest: manifest, deploymentSha: 'sha-abc', priorRunEvidenceHash: priorHash });
    const payload = updateChain.update.mock.calls[0][0];
    expect(payload.metadata.quality_gate).toBe('RED');
    expect(payload.metadata.control_pack_failures[0].control).toBe('run_unique_evidence_hash');
  });

  it('control-pack failures never UPGRADE a gate the pass-rate math already downgraded to RED', async () => {
    state.row = { id: 'run-1', total_tests: 10, passed_tests: 5, failed_tests: 5, skipped_tests: 0, metadata: {} };
    await completeSession('run-1', {
      canaryJourneyId: 'canary-1',
      journeyResults: [{ journeyId: 'canary-1', status: 'FAIL' }, { journeyId: 'j1', status: 'PASS' }],
    });
    const payload = updateChain.update.mock.calls[0][0];
    expect(payload.metadata.quality_gate).toBe('RED');
  });
});
