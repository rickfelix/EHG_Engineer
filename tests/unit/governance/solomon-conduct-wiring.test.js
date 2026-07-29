/**
 * FR-3 WIRING: the conduct probes must actually reach Solomon's persisted review.
 * SD-LEO-INFRA-ROLE-SESSION-SELF-001.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM conduct-probes.test.js. The probes were fully tested and had
 * ZERO production callers — Solomon's review still emitted duty-presence-only greens, which is the
 * exact condition FR-3 was written to end. A tested module nobody calls is decoration, and it is a
 * particularly seductive kind: every test is green and the defect is untouched. That is the same
 * "pure guard with an unwired caller" class the SD's own CLASS NOTE describes.
 */
import { describe, it, expect, vi } from 'vitest';
import { persistSelfAdherenceReview, runConductVerdicts, runAndPersistCycle } from '../../../scripts/solomon-self-adherence-review.mjs';

/** Captures the row that would be inserted; the dedup lookup finds nothing. */
function captureDb() {
  const inserted = [];
  return {
    inserted,
    from: () => ({
      select: () => ({ eq: () => ({ filter: () => ({ limit: async () => ({ data: [] }) }) }) }),
      insert: (row) => { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: 'fb-1' }, error: null }) }) }; },
    }),
  };
}

describe('the persisted review declares WHICH kind of green its ok is', () => {
  it('carries check_class=duty — the ok has never meant "Solomon behaved"', async () => {
    const db = captureDb();
    await persistSelfAdherenceReview(db, { ok: true, drifted: [], note: 'parity holds' }, { reviewKey: 'k1' });
    expect(db.inserted[0].metadata.check_class).toBe('duty');
  });

  it('carries the conduct verdicts alongside, as a SEPARATE answer', async () => {
    const db = captureDb();
    const conduct = [{ probe: 'advice_closure', verdict: 'fail', detail: 'x', check_class: 'conduct' }];
    await persistSelfAdherenceReview(db, { ok: true, drifted: [], note: 'parity holds' }, { reviewKey: 'k2', conductVerdicts: conduct });
    const md = db.inserted[0].metadata;
    // The load-bearing combination: duty-green and conduct-FAIL in the same row. Before this, the
    // row said only ok:true and a reader had no way to learn that behaviour had failed.
    expect(md.ok).toBe(true);
    expect(md.check_class).toBe('duty');
    expect(md.conduct_verdicts[0].verdict).toBe('fail');
    expect(md.conduct_verdicts[0].check_class).toBe('conduct');
  });

  it('an unasked conduct question is an EMPTY list, not an implied pass', async () => {
    const db = captureDb();
    await persistSelfAdherenceReview(db, { ok: true, drifted: [], note: 'parity holds' }, { reviewKey: 'k3' });
    expect(db.inserted[0].metadata.conduct_verdicts).toEqual([]);
  });
});

describe('THE JOIN — the call site that connects the two halves', () => {
  it('runAndPersistCycle carries the conduct verdicts into the persisted row', async () => {
    // Testing the two functions separately proved each half worked while leaving the hand-off
    // unguarded: deleting it left every test green. This asserts the connection, not the parts.
    // FR-3: probe now uses select(id, {count:'exact', head:true}) — the server returns a count and
    // NO rows, so an unpaginated 1000-row clamp cannot under-report. Intent unchanged: 2 stale rows.
    const q = { select: () => q, eq: () => q, lt: async () => ({ data: null, count: 2, error: null }) };
    const inserted = [];
    const db = {
      from: (t) => (t === 'solomon_advice_outcome_ledger' ? { select: () => q } : {
        select: () => ({ eq: () => ({ filter: () => ({ limit: async () => ({ data: [] }) }) }) }),
        insert: (row) => { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: 'fb-9' }, error: null }) }) }; },
      }),
    };
    const id = await runAndPersistCycle(db, { ok: true, drifted: [], note: 'parity holds' }, { log: () => {} });
    expect(id).toBe('fb-9');
    // Two stale advisories were seeded, so the conduct answer must be a FAIL sitting beside a
    // duty-green — the exact combination the old row could not express.
    expect(inserted[0].metadata.check_class).toBe('duty');
    expect(inserted[0].metadata.ok).toBe(true);
    expect(inserted[0].metadata.conduct_verdicts[0].verdict).toBe('fail');
  });
});

describe('runConductVerdicts is fail-soft but not fail-silent', () => {
  it('a broken client yields an UNKNOWN verdict, never a pass', async () => {
    const broken = { from: () => { throw new Error('connection reset'); } };
    const out = await runConductVerdicts(broken);
    expect(out).toHaveLength(1);
    expect(out[0].verdict).toBe('unknown');
    expect(out[0].verdict).not.toBe('pass');
  });

  it('NEGATIVE CONTROL — a working client produces a real verdict', async () => {
    // Without this, "always unknown" would satisfy the test above while the probe saw nothing.
    // FR-3: same shape change. Intent unchanged: zero stale rows.
    const q = { select: () => q, eq: () => q, lt: async () => ({ data: null, count: 0, error: null }) };
    const out = await runConductVerdicts({ from: () => q });
    expect(out[0].verdict).toBe('pass');
  });
});
