/**
 * QF-20260727-858 — requires_human_action must name a decider.
 *
 * The defect: an SD could be fenced out of dispatch with metadata.requires_human_action=true while
 * naming nobody to decide, producing a row that is unroutable by construction and ages silently.
 * Measured 2026-07-27: 12 live fenced SDs, 9 with no decider, two of them `critical`.
 *
 * These tests pin the WRITE-PATH rule. A read-time check would only report the bad row after it
 * exists — which is exactly how the single prior instance was caught, by hand, once.
 */

import { describe, it, expect } from 'vitest';
import {
  DECIDER_KEYS, isHumanActionRequested, namedDecider, checkDeciderPairing,
} from '../../../lib/governance/human-action-decider.mjs';

describe('isHumanActionRequested', () => {
  it('accepts boolean true and the string "true" (both occur live)', () => {
    expect(isHumanActionRequested(true)).toBe(true);
    expect(isHumanActionRequested('true')).toBe(true);
  });
  it('rejects everything else, including truthy non-flag values', () => {
    for (const v of [false, 'false', null, undefined, 0, 1, '', 'yes', {}]) {
      expect(isHumanActionRequested(v)).toBe(false);
    }
  });
});

describe('namedDecider — both live spellings', () => {
  it('reads human_decider and decider', () => {
    // Measured across the 3 correctly-fenced rows: 2 use human_decider, 1 uses decider.
    expect(namedDecider({ human_decider: 'chairman' })).toBe('chairman');
    expect(namedDecider({ decider: 'chairman' })).toBe('chairman');
    expect(DECIDER_KEYS).toEqual(['human_decider', 'decider']);
  });
  it('prefers human_decider when both are present', () => {
    expect(namedDecider({ human_decider: 'chairman', decider: 'adam' })).toBe('chairman');
  });
  it('does NOT accept an empty or whitespace-only name', () => {
    // A blank string would satisfy a naive truthiness check while naming nobody — the exact
    // shape of the bug, one level down.
    expect(namedDecider({ human_decider: '' })).toBeNull();
    expect(namedDecider({ human_decider: '   ' })).toBeNull();
    expect(namedDecider({ decider: '\t' })).toBeNull();
  });
  it('tolerates missing/!object metadata', () => {
    for (const v of [null, undefined, 'nope', 42, []]) expect(namedDecider(v)).toBeNull();
  });
});

describe('checkDeciderPairing — only constrains turning the flag ON', () => {
  it('BLOCKS setting the flag with no decider anywhere', () => {
    const r = checkDeciderPairing({ requires_human_action: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/human_decider/);
  });

  it('ALLOWS when the same patch names the decider', () => {
    expect(checkDeciderPairing({ requires_human_action: true, human_decider: 'chairman' }).ok).toBe(true);
    expect(checkDeciderPairing({ requires_human_action: true, decider: 'chairman' }).ok).toBe(true);
  });

  it('ALLOWS when the ROW already names one (re-stamping a routed row is not the defect)', () => {
    const r = checkDeciderPairing({ requires_human_action: true }, { human_decider: 'chairman' });
    expect(r.ok).toBe(true);
    expect(r.decider).toBe('chairman');
  });

  it('BLOCKS when the row has the flag but still no decider', () => {
    const existing = { requires_human_action: true, requires_human_action_reason: 'documented why' };
    // Reason text is NOT a decider — 7 of the 9 live offenders had a documented WHY and were
    // still unroutable. Explaining the fence is not the same as routing it.
    expect(checkDeciderPairing({ requires_human_action: true }, existing).ok).toBe(false);
  });

  it('does NOT constrain unrelated writes — the guard must not tax ordinary metadata', () => {
    // If the guard made normal writes harder, callers would route around it.
    for (const patch of [{ foo: 'bar' }, { model_recommendation: 'opus' }, {}]) {
      expect(checkDeciderPairing(patch).ok).toBe(true);
    }
  });

  it('does NOT constrain CLEARING the flag', () => {
    expect(checkDeciderPairing({ requires_human_action: false }).ok).toBe(true);
    expect(checkDeciderPairing({ requires_human_action: 'false' }).ok).toBe(true);
  });

  it('tolerates a malformed patch without throwing', () => {
    for (const v of [null, undefined, 'nope', 42]) expect(checkDeciderPairing(v).ok).toBe(true);
  });
});

describe('the two live write paths carry the pairing', () => {
  // BEHAVIOURAL, via the module's own createClientFn seam — NOT a source-text pin.
  // The first version of this test asserted the source contained "checkDeciderPairing" and
  // ran before the UPDATE. It passed with the enforcement GUTTED, because the identifier still
  // appeared in the import line. Matching a symbol is not observing a call.
  const fakeClient = (calls) => async () => ({
    query: async (sql, params) => {
      calls.push({ sql: String(sql).trim().split('\n')[0], params });
      return /^SELECT/i.test(String(sql).trim()) ? { rows: [{ metadata: {} }] } : { rowCount: 1 };
    },
    end: async () => {},
  });

  it('safe-metadata-merge REFUSES the write when no decider is named', async () => {
    const { mergeMetadataKeys } = await import('../../../lib/coordinator/safe-metadata-merge.mjs');
    const calls = [];
    const res = await mergeMetadataKeys('SD-TEST-PAIRING-001',
      { requires_human_action: true }, { createClientFn: fakeClient(calls) });
    expect(res.merged).toBe(false);
    expect(res.error).toMatch(/human_decider/);
    // and crucially: no UPDATE was issued — the unroutable row is never created.
    expect(calls.some((c) => /^UPDATE/i.test(c.sql))).toBe(false);
  });

  it('safe-metadata-merge ALLOWS the write when the patch names a decider', async () => {
    const { mergeMetadataKeys } = await import('../../../lib/coordinator/safe-metadata-merge.mjs');
    const calls = [];
    const res = await mergeMetadataKeys('SD-TEST-PAIRING-001',
      { requires_human_action: true, human_decider: 'chairman' }, { createClientFn: fakeClient(calls) });
    expect(res.merged).toBe(true);
    expect(calls.some((c) => /^UPDATE/i.test(c.sql))).toBe(true);
  });

  it('safe-metadata-merge leaves unrelated writes untouched (no extra SELECT round trip)', async () => {
    const { mergeMetadataKeys } = await import('../../../lib/coordinator/safe-metadata-merge.mjs');
    const calls = [];
    const res = await mergeMetadataKeys('SD-TEST-PAIRING-001',
      { model_recommendation: 'opus' }, { createClientFn: fakeClient(calls) });
    expect(res.merged).toBe(true);
    // The guard must not add a lookup to every metadata write — only to flag-setting ones.
    expect(calls.filter((c) => /^SELECT/i.test(c.sql))).toHaveLength(0);
  });

  it('lifecycle-sd-bridge names a decider at BOTH sites that set the flag', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('lib/eva/lifecycle-sd-bridge.js', 'utf8');
    const flagSites = (src.match(/requires_human_action: holdForReview,/g) || []).length;
    const deciderSites = (src.match(/human_decider: reviewHoldDecider,/g) || []).length;
    // A guard on one of two creation sites is not a guard on the invariant.
    expect(flagSites).toBeGreaterThan(0);
    expect(deciderSites).toBe(flagSites);
    expect(src).toMatch(/reviewHoldDecider = holdForReview \? 'chairman' : null/);
  });
});
