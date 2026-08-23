/**
 * SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-2 (TS-4, TS-10, US-002 acceptance criteria).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildRatificationPayload,
  recordChairmanRatification,
  recordHistoricalRatification,
  markRatificationEncoded,
  VALID_TARGET_CONTRACTS,
} from '../ratification-writer.mjs';

function makeSupabaseMock({ insertResult, updateResult } = {}) {
  const insertChain = {
    select: vi.fn(() => insertChain),
    single: vi.fn(() => Promise.resolve(insertResult ?? { data: { id: 'row-1' }, error: null })),
  };
  const updateChain = {
    eq: vi.fn(() => updateChain),
    is: vi.fn(() => updateChain),
    select: vi.fn(() => Promise.resolve(updateResult ?? { data: [], error: null })),
  };
  const insert = vi.fn(() => insertChain);
  const update = vi.fn(() => updateChain);
  const from = vi.fn(() => ({ insert, update }));
  return { from, _insert: insert, _update: update, _insertChain: insertChain, _updateChain: updateChain };
}

describe('buildRatificationPayload', () => {
  it('rejects an invalid target_contracts value', () => {
    expect(() => buildRatificationPayload({ quote: 'q', source: 'terminal:x', targetContracts: ['foo'], scribeSeat: 'adam' }))
      .toThrow(/invalid target_contracts/);
  });

  it('rejects an empty quote', () => {
    expect(() => buildRatificationPayload({ quote: '  ', source: 'terminal:x', targetContracts: ['adam'], scribeSeat: 'adam' }))
      .toThrow(/quote is required/);
  });

  it('rejects a missing scribeSeat', () => {
    expect(() => buildRatificationPayload({ quote: 'q', source: 'terminal:x', targetContracts: ['adam'], scribeSeat: '' }))
      .toThrow(/scribeSeat is required/);
  });

  it('accepts every value in VALID_TARGET_CONTRACTS', () => {
    for (const c of VALID_TARGET_CONTRACTS) {
      expect(() => buildRatificationPayload({ quote: 'q', source: 'terminal:x', targetContracts: [c], scribeSeat: 'adam' })).not.toThrow();
    }
  });
});

describe('recordChairmanRatification', () => {
  it('never includes ratified_at in the insert payload (DB-clock-only for live captures)', async () => {
    const sb = makeSupabaseMock();
    await recordChairmanRatification(sb, { quote: 'q', source: 'terminal:x', targetContracts: ['adam'], scribeSeat: 'adam', ratified_at: '2020-01-01' });
    const insertedPayload = sb._insert.mock.calls[0][0];
    expect(insertedPayload).not.toHaveProperty('ratified_at');
  });

  it('rejects invalid input before ever calling supabase', async () => {
    const sb = makeSupabaseMock();
    await expect(recordChairmanRatification(sb, { quote: '', source: 'terminal:x', targetContracts: ['adam'], scribeSeat: 'adam' })).rejects.toThrow();
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('throws with the DB error message on insert failure', async () => {
    const sb = makeSupabaseMock({ insertResult: { data: null, error: { message: 'boom' } } });
    await expect(recordChairmanRatification(sb, { quote: 'q', source: 'terminal:x', targetContracts: ['adam'], scribeSeat: 'adam' })).rejects.toThrow(/boom/);
  });
});

describe('recordHistoricalRatification', () => {
  it('requires an explicit ratifiedAt — no implicit now() fallback', async () => {
    const sb = makeSupabaseMock();
    await expect(recordHistoricalRatification(sb, { quote: 'q', source: 'terminal:x', targetContracts: ['adam'], scribeSeat: 'adam' }, null))
      .rejects.toThrow(/ratifiedAt is required/);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('includes the supplied historical ratified_at in the insert payload', async () => {
    const sb = makeSupabaseMock();
    await recordHistoricalRatification(sb, { quote: 'q', source: 'terminal:x', targetContracts: ['adam'], scribeSeat: 'adam' }, '2026-08-15T00:00:00.000Z');
    const insertedPayload = sb._insert.mock.calls[0][0];
    expect(insertedPayload.ratified_at).toBe('2026-08-15T00:00:00.000Z');
  });
});

describe('markRatificationEncoded', () => {
  it('is a no-op (affected:0) when the row already has encoded_at set — the query itself filters on encoded_at IS NULL', async () => {
    const sb = makeSupabaseMock({ updateResult: { data: [], error: null } });
    const result = await markRatificationEncoded(sb, 'row-1', { sectionId: '94', manifestHash: 'abc', markerText: 'the clause' });
    expect(result).toEqual({ affected: 0, row: null });
    expect(sb._updateChain.is).toHaveBeenCalledWith('encoded_at', null);
  });

  it('returns affected:1 and the updated row on a successful encode', async () => {
    const encodedRow = { id: 'row-1', encoded_at: '2026-08-23T00:00:00Z' };
    const sb = makeSupabaseMock({ updateResult: { data: [encodedRow], error: null } });
    const result = await markRatificationEncoded(sb, 'row-1', { sectionId: '94', manifestHash: 'abc', markerText: 'the clause' });
    expect(result).toEqual({ affected: 1, row: encodedRow });
  });

  it('requires sectionId, manifestHash, and non-empty markerText', async () => {
    const sb = makeSupabaseMock();
    await expect(markRatificationEncoded(sb, 'row-1', { sectionId: '94', manifestHash: 'abc', markerText: '  ' })).rejects.toThrow(/required/);
    expect(sb.from).not.toHaveBeenCalled();
  });
});
