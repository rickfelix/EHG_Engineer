// QF-20260727-454: a chairman directive was acknowledged before it was ever read. The reporter's
// own diagnosis: the ack target was resolved by fetching "the newest unacked row" as a PROXY for
// "the row I am reading" — with two rows unacked, they diverged and the wrong one was resolved.
//
// scripts/adam-advisory.cjs's ackRows and scripts/solomon-advisory.cjs's ackRows already take an
// EXPLICIT ids array (never an internal newest-unacked query) — this file pins that invariant with
// the QF's own reproduction shape, plus the part-(b) hardening: the UPDATE...RETURNING now also
// reads back payload/body in the SAME call that stamps acknowledged_at, and surfaces (or WARNs on
// the absence of) that content instead of confirming a bare id.
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { ackRows: adamAckRows } = require('../../../scripts/adam-advisory.cjs');
const { ackRows: solomonAckRows } = require('../../../scripts/solomon-advisory.cjs');

const TARGET = 'role-session-uuid';

/**
 * Stateful mock: a tiny in-memory `session_coordination` store keyed by id. Applies filters
 * (eq/is/in) to select the matching rows and, for an update chain, writes updatePayload onto the
 * matched rows before returning them — enough to prove id-exact scoping (row B is never touched
 * when only row A's id is acked) without a real DB.
 */
function makeStatefulMock(rows) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]));
  function chain() {
    let op = null;
    let updatePayload = null;
    const filters = [];
    const c = {
      update(payload) { op = 'update'; updatePayload = payload; return c; },
      eq(col, v) { filters.push({ col, v, type: 'eq' }); return c; },
      is(col, v) { filters.push({ col, v, type: 'is' }); return c; },
      in(col, v) { filters.push({ col, v, type: 'in' }); return c; },
      async select() {
        const matches = [...store.values()].filter((r) => filters.every((f) => {
          if (f.type === 'eq') return r[f.col] === f.v;
          if (f.type === 'is') return (r[f.col] ?? null) === f.v;
          if (f.type === 'in') return f.v.includes(r[f.col]);
          return true;
        }));
        if (op === 'update') {
          for (const r of matches) Object.assign(r, updatePayload);
        }
        return { data: matches.map((r) => ({ id: r.id, read_at: r.read_at, payload: r.payload, body: r.body })), error: null };
      },
    };
    return c;
  }
  return { supabase: { from: () => chain() }, store };
}

for (const [label, ackRows] of [['adam-advisory', adamAckRows], ['solomon-advisory', solomonAckRows]]) {
  describe(`QF-20260727-454 (${label}): ackRows exact-id scoping + read/ack coupling`, () => {
    it('(a)+(b) exact reproduction: with two unacked rows present, acking row A stamps A and leaves B untouched', async () => {
      const rowA = { id: 'row-A', target_session: TARGET, acknowledged_at: null, read_at: '2026-07-27T09:00:00Z', payload: { body: 'the directive actually read' }, body: null };
      const rowB = { id: 'row-B', target_session: TARGET, acknowledged_at: null, read_at: '2026-07-27T09:05:00Z', payload: { body: 'unrelated row' }, body: null };
      const { supabase, store } = makeStatefulMock([rowA, rowB]);

      await ackRows(supabase, ['row-A'], { expectedTarget: TARGET });

      expect(store.get('row-A').acknowledged_at).not.toBeNull();
      expect(store.get('row-B').acknowledged_at).toBeNull(); // never touched — no newest-unacked substitution
    });

    it('acking an explicit id never falls back to any other unacked row when the id is wrong/missing', async () => {
      const rowB = { id: 'row-B', target_session: TARGET, acknowledged_at: null, read_at: null, payload: {}, body: null };
      const { supabase, store } = makeStatefulMock([rowB]);

      await ackRows(supabase, ['row-does-not-exist'], { expectedTarget: TARGET });

      expect(store.get('row-B').acknowledged_at).toBeNull(); // no silent "closest match" ack
    });
  });
}

describe('QF-20260727-454 (b): ackRows surfaces the body it just read (or WARNs on an empty one)', () => {
  const origLog = console.log;
  const origWarn = console.warn;
  afterEach(() => { console.log = origLog; console.warn = origWarn; });

  function captureConsole() {
    const logs = [];
    const warns = [];
    console.log = (...a) => logs.push(a.join(' '));
    console.warn = (...a) => warns.push(a.join(' '));
    return { logs, warns };
  }

  it('adam-advisory: prints the fetched body text for a row that carries one, warns for a row that carries none', async () => {
    const { logs, warns } = captureConsole();
    const rowWithBody = { id: 'row-C', target_session: TARGET, acknowledged_at: null, read_at: null, payload: { body: 'directive content to surface' }, body: null };
    const rowEmpty = { id: 'row-D', target_session: TARGET, acknowledged_at: null, read_at: null, payload: {}, body: null };
    const { supabase } = makeStatefulMock([rowWithBody, rowEmpty]);

    await adamAckRows(supabase, ['row-C', 'row-D'], { expectedTarget: TARGET });

    expect(logs.some((l) => l.includes('row-C') && l.includes('directive content to surface'))).toBe(true);
    expect(warns.some((w) => w.includes('row-D'))).toBe(true);
  });

  it('solomon-advisory: same body-read coupling', async () => {
    const { logs, warns } = captureConsole();
    const rowWithBody = { id: 'row-E', target_session: TARGET, acknowledged_at: null, read_at: null, payload: { body: 'oracle answer content' }, body: null };
    const rowEmpty = { id: 'row-F', target_session: TARGET, acknowledged_at: null, read_at: null, payload: {}, body: null };
    const { supabase } = makeStatefulMock([rowWithBody, rowEmpty]);

    await solomonAckRows(supabase, ['row-E', 'row-F'], { expectedTarget: TARGET });

    expect(logs.some((l) => l.includes('row-E') && l.includes('oracle answer content'))).toBe(true);
    expect(warns.some((w) => w.includes('row-F'))).toBe(true);
  });
});
