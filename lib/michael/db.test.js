// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B / FR-2, TR-1 — the inert-until-applied seam.
import { describe, it, expect } from 'vitest';
import { isMissingRelation, readRows, writeRows, canonicalJson, sha256Hex, parseArgs, refusal, TABLES_ABSENT } from './db.mjs';

/** A supabase stub whose terminal await resolves through answer(table, ops). */
export function stubClient(answer) {
  return {
    from: (table) => {
      const ops = [];
      const q = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (res, rej) => Promise.resolve(answer(table, ops)).then(res, rej);
          return (...args) => { ops.push({ op: prop, args }); return q; };
        },
      });
      return q;
    },
  };
}
const MISSING = { data: null, error: { code: '42P01', message: 'relation "public.michael_rules" does not exist' } };

describe('isMissingRelation', () => {
  it('recognises 42P01, PGRST205 and the COUNT_UNMEASURABLE throw, and the PostgREST message', () => {
    expect(isMissingRelation({ code: '42P01' })).toBe(true);
    expect(isMissingRelation({ code: 'PGRST205' })).toBe(true);
    expect(isMissingRelation({ code: 'COUNT_UNMEASURABLE' })).toBe(true);
    expect(isMissingRelation({ message: 'Could not find the table public.michael_rules in the schema cache' })).toBe(true);
    expect(isMissingRelation({ code: '57014', message: 'statement timeout' })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
  });
});

describe('readRows', () => {
  it('returns rows with a bounded select', async () => {
    let seen;
    const sb = stubClient((t, ops) => { seen = ops; return { data: [{ id: 1 }], error: null }; });
    const r = await readRows(sb, 'michael_rules', (q) => q.eq('status', 'active'));
    expect(r).toEqual({ rows: [{ id: 1 }], tables_absent: false });
    expect(seen.map((o) => o.op)).toEqual(['select', 'limit', 'eq']);
    expect(seen[1].args[0]).toBeLessThan(1000);
  });
  it('missing relation => empty rows, tables_absent=true, NO error field', async () => {
    const r = await readRows(stubClient(() => MISSING), 'michael_rules');
    expect(r).toEqual({ rows: [], tables_absent: true });
  });
  it('a thrown COUNT_UNMEASURABLE is a missing relation too', async () => {
    const sb = { from: () => ({ select: () => ({ limit: () => ({ then: (_r, rej) => rej(Object.assign(new Error('schema drift detected (count unmeasurable)'), { code: 'COUNT_UNMEASURABLE' })) }) }) }) };
    expect(await readRows(sb, 'michael_rules')).toEqual({ rows: [], tables_absent: true });
  });
  it('a genuine error is surfaced distinctly', async () => {
    const r = await readRows(stubClient(() => ({ data: null, error: { code: '57014', message: 'statement timeout' } })), 'michael_rules');
    expect(r.rows).toEqual([]);
    expect(r.tables_absent).toBe(false);
    expect(r.error).toMatch(/statement timeout/);
  });
});

describe('writeRows', () => {
  it('missing relation => ok:false with the TABLES_ABSENT refusal, never a throw', async () => {
    const r = await writeRows(stubClient(() => MISSING), 'michael_rules', (t) => t.insert({ a: 1 }));
    expect(r.ok).toBe(false);
    expect(r.tables_absent).toBe(true);
    expect(r.refusal).toBe(TABLES_ABSENT);
  });
  it('success returns the data', async () => {
    const r = await writeRows(stubClient(() => ({ data: [{ id: 'x' }], error: null })), 'michael_rules', (t) => t.insert({ a: 1 }).select());
    expect(r).toEqual({ ok: true, data: [{ id: 'x' }], tables_absent: false });
  });
  it('another failure is WRITE_FAILED with the message', async () => {
    const r = await writeRows(stubClient(() => ({ data: null, error: { code: '23514', message: 'check violation' } })), 'michael_rules', (t) => t.insert({}));
    expect(r.refusal).toBe('WRITE_FAILED');
    expect(r.error).toMatch(/check violation/);
  });
});

describe('canonicalJson / sha256Hex', () => {
  it('is key-order independent at every level (the hash subject must be canonical)', () => {
    const a = canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } });
    const b = canonicalJson({ a: { c: null, d: [3, { y: 2, z: 1 }] }, b: 1 });
    expect(a).toBe(b);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
    expect(sha256Hex('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('parseArgs / refusal', () => {
  it('parses --flag, --key value and --key=value, positionals in _', () => {
    expect(parseArgs(['reschedule', '--task', '42', '--json', '--date=2026-09-07'])).toEqual({ _: ['reschedule'], task: '42', json: true, date: '2026-09-07' });
  });
  it('refusal envelopes carry ok:false and the code', () => {
    expect(refusal('X', 'why', { n: 1 })).toEqual({ ok: false, refusal: 'X', message: 'why', n: 1 });
  });
});
