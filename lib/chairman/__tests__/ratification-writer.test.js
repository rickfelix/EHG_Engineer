/**
 * SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-2 (TS-4, TS-10, US-002 acceptance criteria).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildRatificationPayload,
  recordChairmanRatification,
  recordHistoricalRatification,
  markRatificationEncoded,
  validateEncodedRefShape,
  VALID_TARGET_CONTRACTS,
  ENCODED_REF_SHAPES,
} from '../ratification-writer.mjs';

function makeSupabaseMock({ insertResult, updateResult } = {}) {
  const insertChain = {
    select: vi.fn(() => insertChain),
    single: vi.fn(() => Promise.resolve(insertResult ?? { data: { id: 'row-1' }, error: null })),
  };
  const updateSelectChain = {
    limit: vi.fn(() => Promise.resolve(updateResult ?? { data: [], error: null })),
  };
  const updateChain = {
    eq: vi.fn(() => updateChain),
    is: vi.fn(() => updateChain),
    select: vi.fn(() => updateSelectChain),
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

  // SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B FR-1: the live bug this SD fixes — a numeric
  // sectionId slipping past the old truthiness-only guard (0 and '' are falsy, but a NUMBER like
  // 601 is truthy and used to pass silently).
  it('FR-1/TS-1: rejects a numeric sectionId — must be a string, not merely truthy', async () => {
    const sb = makeSupabaseMock();
    await expect(markRatificationEncoded(sb, 'row-1', { sectionId: 601, manifestHash: 'abc', markerText: 'x' }))
      .rejects.toThrow(/sectionId must be a non-empty string/);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('FR-1: writes encoded_ref with type:"section_id" for the legacy call shape', async () => {
    const sb = makeSupabaseMock({ updateResult: { data: [{ id: 'row-1' }], error: null } });
    await markRatificationEncoded(sb, 'row-1', { sectionId: '94', manifestHash: 'abc', markerText: 'x' });
    const updatedPayload = sb._update.mock.calls[0][0];
    expect(updatedPayload.encoded_ref).toEqual({ type: 'section_id', section_id: '94', manifest_hash: 'abc' });
  });

  // FR-3: the 3 pinned object-class shapes beyond section_id.
  describe('FR-3: encoded_ref widened to pinned object-class shapes', () => {
    it('accepts a pre-built encodedRef for type:"sd_row"', async () => {
      const sb = makeSupabaseMock({ updateResult: { data: [{ id: 'row-1' }], error: null } });
      const encodedRef = { type: 'sd_row', sd_key: 'SD-XXX-001' };
      await markRatificationEncoded(sb, 'row-1', { encodedRef, markerText: 'x' });
      expect(sb._update.mock.calls[0][0].encoded_ref).toEqual(encodedRef);
    });

    it('accepts a pre-built encodedRef for type:"venture_metadata"', async () => {
      const sb = makeSupabaseMock({ updateResult: { data: [{ id: 'row-1' }], error: null } });
      const encodedRef = { type: 'venture_metadata', venture_id: 'v-1', path: 'chairman.ruling' };
      await markRatificationEncoded(sb, 'row-1', { encodedRef, markerText: 'x' });
      expect(sb._update.mock.calls[0][0].encoded_ref).toEqual(encodedRef);
    });

    it('accepts a pre-built encodedRef for type:"memory_marker"', async () => {
      const sb = makeSupabaseMock({ updateResult: { data: [{ id: 'row-1' }], error: null } });
      const encodedRef = { type: 'memory_marker', memory_id: 'mem-1', anchor: 'the ratified clause' };
      await markRatificationEncoded(sb, 'row-1', { encodedRef, markerText: 'x' });
      expect(sb._update.mock.calls[0][0].encoded_ref).toEqual(encodedRef);
    });

    it('rejects an unknown encoded_ref.type', async () => {
      const sb = makeSupabaseMock();
      await expect(markRatificationEncoded(sb, 'row-1', { encodedRef: { type: 'bogus' }, markerText: 'x' }))
        .rejects.toThrow(/unknown encoded_ref\.type/);
      expect(sb.from).not.toHaveBeenCalled();
    });

    it('rejects a wrong-typed field within a pinned shape (e.g. numeric venture_id)', async () => {
      const sb = makeSupabaseMock();
      await expect(markRatificationEncoded(sb, 'row-1', { encodedRef: { type: 'venture_metadata', venture_id: 42, path: 'x' }, markerText: 'x' }))
        .rejects.toThrow(/missing or wrong-typed/);
      expect(sb.from).not.toHaveBeenCalled();
    });
  });
});

describe('validateEncodedRefShape', () => {
  it('accepts every pinned shape with correctly-typed fields', () => {
    expect(validateEncodedRefShape({ type: 'section_id', section_id: '1', manifest_hash: 'h' }).valid).toBe(true);
    expect(validateEncodedRefShape({ type: 'sd_row', sd_key: 'SD-1' }).valid).toBe(true);
    expect(validateEncodedRefShape({ type: 'venture_metadata', venture_id: 'v', path: 'p' }).valid).toBe(true);
    expect(validateEncodedRefShape({ type: 'memory_marker', memory_id: 'm', anchor: 'a' }).valid).toBe(true);
  });

  it('exposes exactly the 4 pinned shapes, no more, no fewer', () => {
    expect(Object.keys(ENCODED_REF_SHAPES).sort()).toEqual(['memory_marker', 'sd_row', 'section_id', 'venture_metadata'].sort());
  });

  it('rejects a non-object ref', () => {
    expect(validateEncodedRefShape(null).valid).toBe(false);
    expect(validateEncodedRefShape('x').valid).toBe(false);
  });

  // TESTING finding (evidence 21dc1450): every LIVE encoded chairman_ratifications row predates
  // FR-3 and stores a bare {section_id, manifest_hash} with no `type` key.
  it('accepts a legacy (typeless) {section_id, manifest_hash} ref as the implicit section_id shape', () => {
    expect(validateEncodedRefShape({ section_id: '94', manifest_hash: 'abc' }).valid).toBe(true);
  });

  it('never overrides an explicitly-declared type', () => {
    expect(validateEncodedRefShape({ type: 'bogus', section_id: '94' }).valid).toBe(false);
  });

  // SECURITY finding (evidence 9d1bacee, SEC-1): {type:'toString'} etc. resolved to
  // Object.prototype members on a plain-literal shapes map, silently validating a forged ref.
  for (const evilType of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
    it(`SEC-1: rejects encoded_ref.type=${JSON.stringify(evilType)} rather than resolving Object.prototype`, () => {
      const result = validateEncodedRefShape({ type: evilType, section_id: '94', manifest_hash: 'abc' });
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/unknown encoded_ref\.type/);
    });
  }
});
