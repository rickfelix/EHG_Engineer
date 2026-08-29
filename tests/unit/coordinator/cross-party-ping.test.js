/**
 * QF-20260829-311 -- lib/coordinator/cross-party-ping.cjs must dedupe at WRITE on
 * (kind, salient-key): one row per DISTINCT unacknowledged state delta, updated in place
 * rather than accumulated. Measured: the checkin wall re-rendered ~24-30 identical
 * cross_party_ping rows per Adam turn, differing only by sent_at.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const { emitCrossPartyPing } = require_('../../../lib/coordinator/cross-party-ping.cjs');

function makeDeps(overrides = {}) {
  return {
    getActiveCoordinatorId: vi.fn(async () => 'coord-1'),
    getActiveAdamId: vi.fn(async () => 'adam-1'),
    insertCoordinationRow: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
}

function makeSupabase({ existingRows = [] } = {}) {
  const updateCalls = [];
  return {
    updateCalls,
    from: (table) => {
      if (table !== 'session_coordination') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: async () => ({ data: existingRows, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: (payload) => {
          const call = { payload };
          updateCalls.push(call);
          return { eq: async (col, val) => { call.__matchedId = val; return { error: null }; } };
        },
      };
    },
  };
}

describe('emitCrossPartyPing — write-side dedupe on (kind, salient-key)', () => {
  it('inserts a fresh row when no matching unacknowledged ping exists', async () => {
    const deps = makeDeps();
    const sb = makeSupabase({ existingRows: [] });
    const ok = await emitCrossPartyPing(sb, { from: 'adam', fields: ['openSignalCount'] }, deps);
    expect(ok).toBe(true);
    expect(deps.insertCoordinationRow).toHaveBeenCalledTimes(1);
    expect(sb.updateCalls).toHaveLength(0);
  });

  it('updates the existing unacknowledged row in place for the SAME salient key (no accumulation)', async () => {
    const deps = makeDeps();
    const sb = makeSupabase({
      existingRows: [{ id: 'row-1', payload: { kind: 'cross_party_ping', reason: ['openSignalCount'], sent_at: 'old' } }],
    });
    const ok = await emitCrossPartyPing(sb, { from: 'adam', fields: ['openSignalCount'] }, deps);
    expect(ok).toBe(true);
    expect(deps.insertCoordinationRow).not.toHaveBeenCalled();
    expect(sb.updateCalls).toHaveLength(1);
    expect(sb.updateCalls[0].__matchedId).toBe('row-1');
  });

  it('matches the salient key regardless of field order (sorted comparison)', async () => {
    const deps = makeDeps();
    const sb = makeSupabase({
      existingRows: [{ id: 'row-2', payload: { kind: 'cross_party_ping', reason: ['venture1State', 'beltZero'] } }],
    });
    const ok = await emitCrossPartyPing(sb, { from: 'coordinator', fields: ['beltZero', 'venture1State'] }, deps);
    expect(ok).toBe(true);
    expect(sb.updateCalls).toHaveLength(1);
    expect(deps.insertCoordinationRow).not.toHaveBeenCalled();
  });

  // The deciding fixture: two DIFFERENT salient deltas must both surface, never merged.
  it('inserts a NEW row for a DIFFERENT salient key even when another unacknowledged ping exists', async () => {
    const deps = makeDeps();
    const sb = makeSupabase({
      existingRows: [{ id: 'row-3', payload: { kind: 'cross_party_ping', reason: ['beltZero'] } }],
    });
    const ok = await emitCrossPartyPing(sb, { from: 'adam', fields: ['openSignalCount'] }, deps);
    expect(ok).toBe(true);
    expect(deps.insertCoordinationRow).toHaveBeenCalledTimes(1);
    expect(sb.updateCalls).toHaveLength(0);
  });

  it('fails soft (returns false, never throws) when both parties cannot be resolved', async () => {
    const deps = makeDeps({ getActiveAdamId: vi.fn(async () => null) });
    const sb = makeSupabase({ existingRows: [] });
    const ok = await emitCrossPartyPing(sb, { from: 'adam', fields: ['openSignalCount'] }, deps);
    expect(ok).toBe(false);
    expect(deps.insertCoordinationRow).not.toHaveBeenCalled();
  });
});
