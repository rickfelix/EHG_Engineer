/**
 * SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 (FR-4) — the named reader for
 * dispatch_suggestion / dispatch_override session_coordination rows.
 *
 *   summarizeSuggestionActivity: ratio + top reasons over already-fetched rows   — TS-4
 *   recordOverride: refuses to log a suggestion_id that isn't a real suggestion  — TS-4
 *
 * NOTE on mocked-vs-live coverage: a first version of writeSuggestionRow/recordOverride used a
 * raw `.from('session_coordination').insert()`, which passed every mocked test here but violated
 * the table's `subject` NOT NULL + `valid_target` CHECK constraints live (caught by testing-agent
 * evidence db80264a-2655-4f19-9e89-cd3ad8f225d9 — mocked Supabase cannot see a DB constraint).
 * Both writers now route through insertCoordinationRow (lib/coordinator/dispatch.cjs), the
 * repo's canonical session_coordination choke point, and a manual live round trip was run during
 * EXEC (write suggestion -> record override -> read back via fetchSuggestionActivity -> verified
 * -> cleaned up) confirming the real insert/read path works end to end.
 */
import { describe, it, expect } from 'vitest';
import { summarizeSuggestionActivity } from '../../../scripts/dispatch-suggestion-report.mjs';
import { recordOverride } from '../../../scripts/dispatch-suggestion-override.mjs';

describe('summarizeSuggestionActivity (FR-4 reader)', () => {
  it('computes suggestion/override counts and an override ratio', () => {
    const rows = [
      { payload: { kind: 'dispatch_suggestion', sd_key: 'SD-A' } },
      { payload: { kind: 'dispatch_suggestion', sd_key: 'SD-B' } },
      { payload: { kind: 'dispatch_override', sd_key: 'SD-A', reason: 'quota mismatch' } },
    ];
    const s = summarizeSuggestionActivity(rows);
    expect(s.suggestions).toBe(2);
    expect(s.overrides).toBe(1);
    expect(s.overrideRatio).toBeCloseTo(0.5);
    expect(s.topReasons[0]).toEqual({ reason: 'quota mismatch', count: 1 });
  });

  it('returns null ratio (not NaN/0) when there are zero suggestions in the window', () => {
    expect(summarizeSuggestionActivity([]).overrideRatio).toBeNull();
  });

  it('groups override reasons and ranks by count', () => {
    const rows = [
      { payload: { kind: 'dispatch_suggestion' } },
      { payload: { kind: 'dispatch_override', reason: 'bad fit' } },
      { payload: { kind: 'dispatch_override', reason: 'bad fit' } },
      { payload: { kind: 'dispatch_override', reason: 'urgent override' } },
    ];
    const s = summarizeSuggestionActivity(rows);
    expect(s.topReasons[0]).toEqual({ reason: 'bad fit', count: 2 });
  });

  it('is total on malformed rows', () => {
    expect(summarizeSuggestionActivity(null).suggestions).toBe(0);
    expect(summarizeSuggestionActivity([{ payload: null }, {}]).overrides).toBe(0);
  });
});

const FAKE_UUID = '11111111-1111-1111-1111-111111111111';

describe('recordOverride (FR-4 writer refuses malformed input)', () => {
  it('refuses a non-UUID suggestionId before ever querying the DB', async () => {
    const sb = { from: () => { throw new Error('should not be reached'); } };
    await expect(recordOverride(sb, 'not-a-uuid', 'a reason')).rejects.toThrow(/not a full UUID/);
  });

  it('refuses a missing reason — an unreasoned override is not training signal', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: FAKE_UUID, payload: { kind: 'dispatch_suggestion' } }, error: null }) }) }) }) };
    await expect(recordOverride(sb, FAKE_UUID, '')).rejects.toThrow(/missing reason/);
  });

  it('strips control characters and caps length on the reason field', async () => {
    let inserted = null;
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: FAKE_UUID, payload: { kind: 'dispatch_suggestion', sd_key: 'SD-A' } }, error: null }) }),
        }),
        insert: (row) => {
          inserted = row;
          return { select: () => ({ single: async () => ({ data: { id: 'override-1' }, error: null }) }) };
        },
      }),
    };
    const dirty = `bad${String.fromCharCode(27)}[31mreason${'x'.repeat(600)}`;
    await recordOverride(sb, FAKE_UUID, dirty);
    expect(inserted.payload.reason).not.toMatch(/\x1B/);
    expect(inserted.payload.reason.length).toBeLessThanOrEqual(500);
  });

  it('refuses when the referenced row is not a dispatch_suggestion', async () => {
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: FAKE_UUID, payload: { kind: 'dispatch_override' } }, error: null }) }),
        }),
      }),
    };
    await expect(recordOverride(sb, FAKE_UUID, 'a reason')).rejects.toThrow(/not a dispatch_suggestion/);
  });

  it('records an override row referencing the original suggestion when valid', async () => {
    let inserted = null;
    const sb = {
      from: (table) => {
        if (table !== 'session_coordination') throw new Error('unexpected table');
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: FAKE_UUID, payload: { kind: 'dispatch_suggestion', sd_key: 'SD-A' } }, error: null }) }),
          }),
          insert: (row) => {
            inserted = row;
            return { select: () => ({ single: async () => ({ data: { id: 'override-1' }, error: null }) }) };
          },
        };
      },
    };
    const id = await recordOverride(sb, FAKE_UUID, 'coordinator disagreed');
    expect(id).toBe('override-1');
    expect(inserted.payload.kind).toBe('dispatch_override');
    expect(inserted.payload.suggestion_id).toBe(FAKE_UUID);
    expect(inserted.payload.sd_key).toBe('SD-A');
    expect(inserted.payload.reason).toBe('coordinator disagreed');
  });
});
