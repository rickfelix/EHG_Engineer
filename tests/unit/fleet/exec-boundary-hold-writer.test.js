/**
 * Unit tests for lib/fleet/exec-boundary-hold-writer.js.
 * SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 (FR-3) — covers TS-2, TS-6 (exec_boundary_hold surface).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setExecBoundaryHold, clearExecBoundaryHold } from '../../../lib/fleet/exec-boundary-hold-writer.js';
import { execBoundaryHoldReason } from '../../../lib/fleet/claim-eligibility.cjs';

function makeSupabaseStub({ existingMetadata = {} } = {}) {
  const writes = [];
  const inserts = [];
  let currentMetadata = existingMetadata;

  const client = {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { metadata: currentMetadata }, error: null }),
            }),
          }),
          update: (patch) => ({
            eq: async () => {
              writes.push(patch);
              currentMetadata = patch.metadata;
              return { error: null };
            },
          }),
        };
      }
      if (table === 'hold_state_contract_violations') {
        return { insert: async (row) => { inserts.push(row); return { error: null }; } };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { client, writes, inserts, getMetadata: () => currentMetadata };
}

describe('setExecBoundaryHold', () => {
  const ORIGINAL = process.env.HOLD_STATE_CONTRACT_MODE;
  afterEach(() => { process.env.HOLD_STATE_CONTRACT_MODE = ORIGINAL; });

  it('TS-2: enforce mode rejects a hold missing release_condition before any write', async () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    const stub = makeSupabaseStub();
    await expect(setExecBoundaryHold(stub.client, 'sd-1', { reason: 'r', owner: 'o', reviewAt: '2026-08-01T00:00:00Z' }))
      .rejects.toThrow(/Hold-state contract violation/);
    expect(stub.writes).toHaveLength(0);
  });

  it('enforce mode accepts a fully-stamped hold and writes the exact reader-compatible shape', async () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    const stub = makeSupabaseStub({ existingMetadata: { unrelated_key: 'kept' } });
    await setExecBoundaryHold(stub.client, 'sd-1', {
      reason: 'waiting on sibling child B', owner: 'coordinator',
      reviewAt: '2026-08-01T00:00:00Z', releaseCondition: 'sibling child B reaches EXEC',
      writingSessionId: 'sess-1',
    });
    expect(stub.writes).toHaveLength(1);
    const meta = stub.writes[0].metadata;
    expect(meta.unrelated_key).toBe('kept'); // fresh-read-then-merge preserves unrelated keys
    expect(meta.exec_boundary_hold).toBe(true);
    expect(meta.exec_boundary_hold_reason).toBe('waiting on sibling child B');
    expect(meta.exec_boundary_hold_owner).toBe('coordinator');
    expect(meta.exec_boundary_hold_review_at).toBe('2026-08-01T00:00:00Z');
    expect(meta.exec_boundary_hold_release_condition).toBe('sibling child B reaches EXEC');
    expect(meta.exec_boundary_hold_stamped_by_session).toBe('sess-1');
    expect(typeof meta.exec_boundary_hold_set_at).toBe('string');
  });

  it('the written shape is readable by the EXISTING execBoundaryHoldReason() reader (contract compatibility)', async () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    const stub = makeSupabaseStub();
    await setExecBoundaryHold(stub.client, 'sd-1', {
      reason: 'coordinator sequencing park', owner: 'coordinator',
      reviewAt: '2026-08-01T00:00:00Z', releaseCondition: 'x',
    });
    const sdRow = { metadata: stub.getMetadata() };
    const hold = execBoundaryHoldReason(sdRow);
    expect(hold).not.toBeNull();
    expect(hold.reason).toBe('coordinator sequencing park');
    expect(typeof hold.setAt).toBe('string');
  });

  it('TS-6: observe mode (default) never throws on a missing stamp and logs a violation', async () => {
    delete process.env.HOLD_STATE_CONTRACT_MODE;
    const stub = makeSupabaseStub();
    const result = await setExecBoundaryHold(stub.client, 'sd-1', {});
    expect(result.ok).toBe(false);
    expect(result.mode).toBe('observe');
    expect(stub.inserts).toHaveLength(1);
    expect(stub.inserts[0].surface).toBe('exec_boundary_hold');
  });

  it('throws when the SD is not found', async () => {
    const stub = makeSupabaseStub();
    stub.client.from = (table) => {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      return { insert: async () => ({ error: null }) };
    };
    await expect(setExecBoundaryHold(stub.client, 'missing-sd', {})).rejects.toThrow(/SD not found/);
  });
});

describe('clearExecBoundaryHold', () => {
  it('sets exec_boundary_hold=false and stamps cleared_at/cleared_by', async () => {
    const stub = makeSupabaseStub({ existingMetadata: { exec_boundary_hold: true, exec_boundary_hold_reason: 'r', unrelated_key: 'kept' } });
    await clearExecBoundaryHold(stub.client, 'sd-1', { clearedBy: 'coordinator' });
    const meta = stub.writes[0].metadata;
    expect(meta.exec_boundary_hold).toBe(false);
    expect(meta.exec_boundary_hold_cleared_by).toBe('coordinator');
    expect(typeof meta.exec_boundary_hold_cleared_at).toBe('string');
    expect(meta.unrelated_key).toBe('kept');
    // The reader must now see the hold as cleared.
    expect(execBoundaryHoldReason({ metadata: meta })).toBeNull();
  });

  it('throws when clearedBy is missing', async () => {
    const stub = makeSupabaseStub();
    await expect(clearExecBoundaryHold(stub.client, 'sd-1', {})).rejects.toThrow(/clearedBy/);
  });
});
