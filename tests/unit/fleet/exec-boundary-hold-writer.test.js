/**
 * Unit tests for lib/fleet/exec-boundary-hold-writer.js.
 * SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 (FR-3) — covers TS-2, TS-6 (exec_boundary_hold surface).
 *
 * SD-LEO-FIX-STRATEGIC-DIRECTIVES-UPDATED-001: the writer now merges via the atomic
 * mergeMetadataKeys() partial-key merge (injected here) instead of a full-blob
 * .update({metadata:...}). `writes` below records the PATCH each call sent (not the whole
 * metadata object) — the "unrelated keys survive" property is verified via getMetadata()
 * reflecting the merged state, which is a stronger check: it proves unrelated_key was never
 * even present in the patch, not merely that it round-tripped through a spread.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { setExecBoundaryHold, clearExecBoundaryHold } from '../../../lib/fleet/exec-boundary-hold-writer.js';
import { execBoundaryHoldReason } from '../../../lib/fleet/claim-eligibility.cjs';

function makeSupabaseStub({ existingMetadata = {}, sdKey = 'SD-TEST-001' } = {}) {
  const writes = [];
  const inserts = [];
  let currentMetadata = existingMetadata;

  const client = {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { sd_key: sdKey, metadata: currentMetadata }, error: null }),
            }),
          }),
        };
      }
      if (table === 'hold_state_contract_violations') {
        return { insert: async (row) => { inserts.push(row); return { error: null }; } };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  const mergeMetadataKeysFn = async (key, patch) => {
    writes.push(patch);
    currentMetadata = { ...currentMetadata, ...patch };
    return { merged: true, sdKey: key };
  };
  return { client, writes, inserts, mergeMetadataKeysFn, getMetadata: () => currentMetadata };
}

describe('setExecBoundaryHold', () => {
  const ORIGINAL = process.env.HOLD_STATE_CONTRACT_MODE;
  afterEach(() => { process.env.HOLD_STATE_CONTRACT_MODE = ORIGINAL; });

  it('TS-2: enforce mode rejects a hold missing release_condition before any write', async () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    const stub = makeSupabaseStub();
    await expect(setExecBoundaryHold(stub.client, 'sd-1', { reason: 'r', owner: 'o', reviewAt: '2026-08-01T00:00:00Z' }, stub.mergeMetadataKeysFn))
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
    }, stub.mergeMetadataKeysFn);
    expect(stub.writes).toHaveLength(1);
    const patch = stub.writes[0];
    expect('unrelated_key' in patch).toBe(false); // the patch touches ONLY the hold keys
    expect(patch.exec_boundary_hold).toBe(true);
    expect(patch.exec_boundary_hold_reason).toBe('waiting on sibling child B');
    expect(patch.exec_boundary_hold_owner).toBe('coordinator');
    expect(patch.exec_boundary_hold_review_at).toBe('2026-08-01T00:00:00Z');
    expect(patch.exec_boundary_hold_release_condition).toBe('sibling child B reaches EXEC');
    expect(patch.exec_boundary_hold_stamped_by_session).toBe('sess-1');
    expect(typeof patch.exec_boundary_hold_set_at).toBe('string');
    // ...and the row's OTHER key still survives the merge, unclobbered.
    expect(stub.getMetadata().unrelated_key).toBe('kept');
  });

  it('the written shape is readable by the EXISTING execBoundaryHoldReason() reader (contract compatibility)', async () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    const stub = makeSupabaseStub();
    await setExecBoundaryHold(stub.client, 'sd-1', {
      reason: 'coordinator sequencing park', owner: 'coordinator',
      reviewAt: '2026-08-01T00:00:00Z', releaseCondition: 'x',
    }, stub.mergeMetadataKeysFn);
    const sdRow = { metadata: stub.getMetadata() };
    const hold = execBoundaryHoldReason(sdRow);
    expect(hold).not.toBeNull();
    expect(hold.reason).toBe('coordinator sequencing park');
    expect(typeof hold.setAt).toBe('string');
  });

  it('TS-6: observe mode (default) never throws on a missing stamp and logs a violation', async () => {
    delete process.env.HOLD_STATE_CONTRACT_MODE;
    const stub = makeSupabaseStub();
    const result = await setExecBoundaryHold(stub.client, 'sd-1', {}, stub.mergeMetadataKeysFn);
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
    await expect(setExecBoundaryHold(stub.client, 'missing-sd', {}, stub.mergeMetadataKeysFn)).rejects.toThrow(/SD not found/);
  });
});

describe('clearExecBoundaryHold', () => {
  it('sets exec_boundary_hold=false and stamps cleared_at/cleared_by', async () => {
    const stub = makeSupabaseStub({ existingMetadata: { exec_boundary_hold: true, exec_boundary_hold_reason: 'r', unrelated_key: 'kept' } });
    await clearExecBoundaryHold(stub.client, 'sd-1', { clearedBy: 'coordinator' }, stub.mergeMetadataKeysFn);
    const patch = stub.writes[0];
    expect(patch.exec_boundary_hold).toBe(false);
    expect(patch.exec_boundary_hold_cleared_by).toBe('coordinator');
    expect(typeof patch.exec_boundary_hold_cleared_at).toBe('string');
    expect(stub.getMetadata().unrelated_key).toBe('kept');
    // The reader must now see the hold as cleared.
    expect(execBoundaryHoldReason({ metadata: stub.getMetadata() })).toBeNull();
  });

  it('throws when clearedBy is missing', async () => {
    const stub = makeSupabaseStub();
    await expect(clearExecBoundaryHold(stub.client, 'sd-1', {}, stub.mergeMetadataKeysFn)).rejects.toThrow(/clearedBy/);
  });
});
