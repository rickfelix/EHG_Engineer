/**
 * SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-2 (TS-4, TS-10, US-002 acceptance criteria).
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildRatificationPayload,
  recordChairmanRatification,
  recordHistoricalRatification,
  markRatificationEncoded,
  validateEncodedRefShape,
  VALID_TARGET_CONTRACTS,
  ENCODED_REF_SHAPES,
} from '../ratification-writer.mjs';

// QF-20260901-107: markRatificationEncoded now fail-closed-validates a section_id marker against
// the LIVE target_file content, so any test that reaches that path needs a fixture repoRoot with a
// manifest + target file the marker text actually appears in — never the real repo tree.
const FIXTURE_ROOT = mkdtempSync(join(tmpdir(), 'ratification-writer-fixture-'));
writeFileSync(join(FIXTURE_ROOT, 'claude-generation-manifest.json'), JSON.stringify({
  section_digests: { meta: { 94: { target_file: 'target.md' } } },
}));
writeFileSync(join(FIXTURE_ROOT, 'target.md'), 'the clause\nx\n');

// SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B (W2 child B), PR2 prerequisite.
// `from()` previously returned only { insert, update }. markRatificationEncoded performs NO read
// of the row today -- it goes straight to a blind conditional .update() -- but target_contracts
// lives ON that row, so multi-target marker verification needs a row read. Adding that read to the
// writer without this member first makes every DB-reaching block throw TypeError ("select is not a
// function") rather than fail an assertion, which reads as a broken suite instead of a behaviour
// change. Measured: twelve such blocks (nine update-path at :106,:113,:136,:153,:160,:168,:179,
// :186,:193 and three insert-path at :70,:83,:97); the five at :120,:129,:145,:200,:207 assert
// `expect(sb.from).not.toHaveBeenCalled()` and so never reach the DB at all.
// This change is PURELY ADDITIVE: `select` is a new member alongside the existing insert/update,
// so no current test path behaves differently. Verified by the suite staying green before any
// writer change lands.
function makeSupabaseMock({ insertResult, updateResult, selectResult } = {}) {
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
  // Row-read chain: .from(t).select(cols).eq('id', id).maybeSingle()
  // Defaults to a not-found shape so a test that has not opted in cannot silently receive a
  // fabricated row -- an absent row must look absent.
  const selectChain = {
    eq: vi.fn(() => selectChain),
    is: vi.fn(() => selectChain),
    limit: vi.fn(() => Promise.resolve(selectResult ?? { data: [], error: null })),
    maybeSingle: vi.fn(() => Promise.resolve(selectResult ?? { data: null, error: null })),
    single: vi.fn(() => Promise.resolve(selectResult ?? { data: null, error: null })),
  };
  const insert = vi.fn(() => insertChain);
  const update = vi.fn(() => updateChain);
  const select = vi.fn(() => selectChain);
  const from = vi.fn(() => ({ insert, update, select }));
  return {
    from,
    _insert: insert,
    _update: update,
    _select: select,
    _insertChain: insertChain,
    _updateChain: updateChain,
    _selectChain: selectChain,
  };
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
    const result = await markRatificationEncoded(sb, 'row-1', { sectionId: '94', manifestHash: 'abc', markerText: 'the clause', repoRoot: FIXTURE_ROOT });
    expect(result).toEqual({ affected: 0, row: null });
    expect(sb._updateChain.is).toHaveBeenCalledWith('encoded_at', null);
  });

  it('returns affected:1 and the updated row on a successful encode', async () => {
    const encodedRow = { id: 'row-1', encoded_at: '2026-08-23T00:00:00Z' };
    const sb = makeSupabaseMock({ updateResult: { data: [encodedRow], error: null } });
    const result = await markRatificationEncoded(sb, 'row-1', { sectionId: '94', manifestHash: 'abc', markerText: 'the clause', repoRoot: FIXTURE_ROOT });
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
    await markRatificationEncoded(sb, 'row-1', { sectionId: '94', manifestHash: 'abc', markerText: 'x', repoRoot: FIXTURE_ROOT });
    const updatedPayload = sb._update.mock.calls[0][0];
    expect(updatedPayload.encoded_ref).toEqual({ type: 'section_id', section_id: '94', manifest_hash: 'abc' });
  });

  // QF-20260901-107: fail-closed marker validation, section_id shape only.
  describe('QF-20260901-107: fail-closed marker validation against the live section content', () => {
    it('refuses a markerText that is not a literal substring of the live target_file content', async () => {
      const sb = makeSupabaseMock();
      await expect(markRatificationEncoded(sb, 'row-1', {
        sectionId: '94', manifestHash: 'abc', markerText: 'ceremony prose never in the file', repoRoot: FIXTURE_ROOT,
      })).rejects.toThrow(/markerText is not present in the live content/);
      expect(sb.from).not.toHaveBeenCalled();
    });

    it('accepts a markerText that IS a literal substring of the live target_file content', async () => {
      const sb = makeSupabaseMock({ updateResult: { data: [{ id: 'row-1' }], error: null } });
      await expect(markRatificationEncoded(sb, 'row-1', {
        sectionId: '94', manifestHash: 'abc', markerText: 'the clause', repoRoot: FIXTURE_ROOT,
      })).resolves.toBeTruthy();
    });

    it('does not run the live-content check for non-section_id encoded_ref types (nothing to read a marker against)', async () => {
      const sb = makeSupabaseMock({ updateResult: { data: [{ id: 'row-1' }], error: null } });
      const encodedRef = { type: 'sd_row', sd_key: 'SD-XXX-001' };
      await expect(markRatificationEncoded(sb, 'row-1', {
        encodedRef, markerText: 'ceremony prose that matches nothing on disk', repoRoot: FIXTURE_ROOT,
      })).resolves.toBeTruthy();
    });

    it('fails open (does not throw) when no manifest exists at repoRoot — infra trouble, not a caller error', async () => {
      const sb = makeSupabaseMock({ updateResult: { data: [{ id: 'row-1' }], error: null } });
      const emptyRoot = mkdtempSync(join(tmpdir(), 'ratification-writer-empty-'));
      await expect(markRatificationEncoded(sb, 'row-1', {
        sectionId: '94', manifestHash: 'abc', markerText: 'anything', repoRoot: emptyRoot,
      })).resolves.toBeTruthy();
    });
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

// SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B (W2 child B), PR2 prerequisite.
// These assert the TEST HARNESS, not production behaviour: the row-read capability must exist and
// be correct BEFORE the writer starts reading, so that when markRatificationEncoded gains its
// `SELECT target_contracts` the suite reports a behaviour change rather than a TypeError.
describe('makeSupabaseMock — row-read support (multi-target prerequisite)', () => {
  it('from() exposes select alongside insert and update', () => {
    const sb = makeSupabaseMock();
    const handle = sb.from('chairman_ratifications');
    expect(typeof handle.select).toBe('function');
    expect(typeof handle.insert).toBe('function');
    expect(typeof handle.update).toBe('function');
  });

  it('serves the .select(cols).eq(...).maybeSingle() shape a row read uses', async () => {
    const row = { id: 'row-1', target_contracts: ['adam', 'coordinator'] };
    const sb = makeSupabaseMock({ selectResult: { data: row, error: null } });
    const result = await sb
      .from('chairman_ratifications')
      .select('target_contracts')
      .eq('id', 'row-1')
      .maybeSingle();
    expect(result.error).toBeNull();
    expect(result.data.target_contracts).toEqual(['adam', 'coordinator']);
  });

  it('defaults to a NOT-FOUND row rather than fabricating one', async () => {
    // A test that has not opted in must not silently receive a usable row: an absent row has to
    // look absent, or a caller's not-found branch can never be exercised.
    const sb = makeSupabaseMock();
    const result = await sb.from('chairman_ratifications').select('target_contracts').eq('id', 'x').maybeSingle();
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  it('surfaces a read error when one is configured', async () => {
    const sb = makeSupabaseMock({ selectResult: { data: null, error: { message: 'boom', code: 'PGRST500' } } });
    const result = await sb.from('chairman_ratifications').select('target_contracts').eq('id', 'x').maybeSingle();
    expect(result.data).toBeNull();
    expect(result.error.code).toBe('PGRST500');
  });

  it('leaves the insert and update chains behaving exactly as before (purely additive)', async () => {
    const sb = makeSupabaseMock();
    const inserted = await sb.from('t').insert({ a: 1 }).select().single();
    expect(inserted.data).toEqual({ id: 'row-1' });
    const updated = await sb.from('t').update({ b: 2 }).eq('id', 'row-1').is('encoded_at', null).select().limit(1);
    expect(updated.data).toEqual([]);
    expect(updated.error).toBeNull();
  });
});
