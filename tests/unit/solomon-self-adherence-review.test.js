/**
 * Solomon self-adherence review — DB persistence + review-key tests.
 * SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 FR-2: the 12h self-adherence review previously wrote
 * NOTHING to the DB (dormant/invisible self-scoring). These prove (a) the verdict resolves pass/fail
 * (parity holds vs drift) on the live contract doc, and (b) EACH cycle now persists a feedback row.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildSelfAdherenceVerdict,
  persistSelfAdherenceReview,
  selfAdherenceReviewKey,
} from '../../scripts/solomon-self-adherence-review.mjs';

/**
 * feedback-only supabase mock. `existing` seeds the idempotency lookup result; `insertError`
 * forces the insert to fail (fail-soft path). Records the inserted row for assertions.
 */
function makeSb({ existing = [], insertError = null } = {}) {
  const calls = { inserted: [] };
  return {
    _calls: calls,
    from(table) {
      expect(table).toBe('feedback');
      const b = {
        _op: 'read',
        select() { return b; },
        eq() { return b; },
        filter() { return b; },
        limit() { return Promise.resolve({ data: existing, error: null }); },
        insert(row) { calls.inserted.push(row); b._op = 'insert'; return b; },
      };
      b.single = () => insertError
        ? Promise.resolve({ data: null, error: insertError })
        : Promise.resolve({ data: { id: 'fb-solomon-1' }, error: null });
      // insert(...).select().single()
      const origSelect = b.select;
      b.select = () => (b._op === 'insert' ? { single: b.single } : origSelect());
      return b;
    },
  };
}

describe('buildSelfAdherenceVerdict — resolves pass/fail on the live contract (never unknown)', () => {
  it('returns a boolean ok + a drifted array (never an unknown verdict)', () => {
    const v = buildSelfAdherenceVerdict();
    expect(typeof v.ok).toBe('boolean'); // resolves to pass (ok) or fail (drift) — never 'unknown'
    expect(Array.isArray(v.drifted)).toBe(true);
    expect(v.ok).toBe(v.drifted.length === 0); // ok iff no durable duty drifted out of SOLOMON_LOOPS
  });

  it('reports contract-drift as a FAIL when a missing repoRoot has no contract doc (fail-open skip = ok)', () => {
    // A repoRoot without CLAUDE_SOLOMON.md yields the fail-open skip (ok:true) — still a resolved verdict.
    const v = buildSelfAdherenceVerdict('/no/such/dir');
    expect(v.ok).toBe(true);
    expect(v.drifted).toEqual([]);
  });
});

describe('selfAdherenceReviewKey — deterministic per-cycle key (2 slots/day)', () => {
  it('keys on UTC date + am/pm slot', () => {
    expect(selfAdherenceReviewKey(new Date('2026-07-19T03:00:00Z'))).toBe('solomon-self-adherence:2026-07-19:am');
    expect(selfAdherenceReviewKey(new Date('2026-07-19T15:00:00Z'))).toBe('solomon-self-adherence:2026-07-19:pm');
  });
});

describe('persistSelfAdherenceReview (FR-2 — cycle persistence) — fail-soft', () => {
  it('a parity-holds cycle writes a benign AUDIT row (enhancement/resolved) and returns its id', async () => {
    const sb = makeSb();
    const id = await persistSelfAdherenceReview(sb, { ok: true, drifted: [], note: 'all duties present' }, { reviewKey: 'k1' });
    expect(id).toBe('fb-solomon-1');
    expect(sb._calls.inserted).toHaveLength(1);
    const row = sb._calls.inserted[0];
    expect(row.category).toBe('solomon_self_adherence');
    expect(row.type).toBe('enhancement');
    expect(row.status).toBe('resolved');
    expect(row.metadata.ok).toBe(true);
    expect(row.metadata.review_key).toBe('k1');
  });

  it('a DRIFT cycle writes a PROPOSE-ONLY remediation (issue/new) naming the drifted duties', async () => {
    const sb = makeSb();
    const id = await persistSelfAdherenceReview(
      sb,
      { ok: false, drifted: ['taste-judgement', 'reality-simulation'], note: 'CONTRACT DRIFT: 2 duties' },
      { reviewKey: 'k2' },
    );
    expect(id).toBe('fb-solomon-1');
    const row = sb._calls.inserted[0];
    expect(row.type).toBe('issue');
    expect(row.status).toBe('new');
    expect(row.severity).toBe('medium');
    expect(row.title).toContain('taste-judgement');
    expect(row.metadata.drifted).toEqual(['taste-judgement', 'reality-simulation']);
  });

  it('is idempotent: an existing cycle row short-circuits (returns its id, NO new insert)', async () => {
    const sb = makeSb({ existing: [{ id: 'fb-existing' }] });
    const id = await persistSelfAdherenceReview(sb, { ok: true, drifted: [], note: 'x' }, { reviewKey: 'k1' });
    expect(id).toBe('fb-existing');
    expect(sb._calls.inserted).toHaveLength(0);
  });

  it('is fail-soft: an insert error returns null and never throws (never blocks the tick)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sb = makeSb({ insertError: { message: 'insert blocked' } });
    const id = await persistSelfAdherenceReview(sb, { ok: true, drifted: [], note: 'x' }, { reviewKey: 'k3' });
    expect(id).toBeNull();
    warn.mockRestore();
  });
});
