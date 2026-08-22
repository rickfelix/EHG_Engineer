/**
 * SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 (FR-4) — the named reader for
 * dispatch_suggestion / dispatch_override session_coordination rows.
 *
 *   summarizeSuggestionActivity: ratio + top reasons over already-fetched rows   — TS-4
 *   recordOverride: refuses to log a suggestion_id that isn't a real suggestion  — TS-4
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

describe('recordOverride (FR-4 writer refuses malformed input)', () => {
  it('refuses a missing reason — an unreasoned override is not training signal', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'x', payload: { kind: 'dispatch_suggestion' } }, error: null }) }) }) }) };
    await expect(recordOverride(sb, 'x', '')).rejects.toThrow(/missing reason/);
  });

  it('refuses when the referenced row is not a dispatch_suggestion', async () => {
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: 'x', payload: { kind: 'dispatch_override' } }, error: null }) }),
        }),
      }),
    };
    await expect(recordOverride(sb, 'x', 'a reason')).rejects.toThrow(/not a dispatch_suggestion/);
  });

  it('records an override row referencing the original suggestion when valid', async () => {
    let inserted = null;
    const sb = {
      from: (table) => {
        if (table !== 'session_coordination') throw new Error('unexpected table');
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: 'sugg-1', payload: { kind: 'dispatch_suggestion', sd_key: 'SD-A' } }, error: null }) }),
          }),
          insert: (row) => {
            inserted = row;
            return { select: () => ({ maybeSingle: async () => ({ data: { id: 'override-1' }, error: null }) }) };
          },
        };
      },
    };
    const id = await recordOverride(sb, 'sugg-1', 'coordinator disagreed');
    expect(id).toBe('override-1');
    expect(inserted.payload.kind).toBe('dispatch_override');
    expect(inserted.payload.suggestion_id).toBe('sugg-1');
    expect(inserted.payload.sd_key).toBe('SD-A');
    expect(inserted.payload.reason).toBe('coordinator disagreed');
  });
});
