/**
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-C — fail-closed pick-vs-instrument ROUTING in
 * drainInbox (supersedes sibling -B's interim PICK-CLASS warn, whose assertions this file
 * previously pinned: routing is now REAL, so the warn is replaced by routed behavior).
 * pick/unproven oracle framings -> chairman-escalation queue via recordPendingDecision with
 * provably non-auto-escalating params; instrument -> renders sourcing-eligible; non-oracle
 * advisories untouched. -B's framing:<value> rendering tag is retained.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const m = require('../../scripts/adam-advisory.cjs');
import { shouldAutoEscalate } from '../../lib/chairman/record-pending-decision.mjs';

/**
 * Table-aware supabase mock: session_coordination selects return `inboxRows`;
 * chairman_decisions selects return `decisionProbeRows` (idempotency probe), inserts are
 * recorded (and fail when failDecisionInsert), updates recorded per-table.
 */
function makeTableMock({ inboxRows = [], decisionProbeRows = [], failDecisionInsert = false } = {}) {
  const decisionInserts = [];
  const decisionUpdates = [];
  function chain(table) {
    const state = { op: 'select', payload: null };
    const c = {
      select: () => c,
      update: (payload) => { state.op = 'update'; state.payload = payload; return c; },
      insert: (payload) => { state.op = 'insert'; state.payload = payload; return c; },
      eq: () => c, in: () => c, is: () => c, gte: () => c, order: () => c, limit: () => c,
      maybeSingle: () => finish().then((r) => ({ ...r, data: (r.data && r.data[0]) || null })),
      single: () => finish().then((r) => ({ ...r, data: (r.data && r.data[0]) || null })),
      then: (res, rej) => finish().then(res, rej),
    };
    async function finish() {
      if (table === 'chairman_decisions') {
        if (state.op === 'insert') {
          if (failDecisionInsert) return { data: null, error: { message: 'boom' } };
          decisionInserts.push(state.payload);
          return { data: [{ id: `dec-${decisionInserts.length}` }], error: null };
        }
        if (state.op === 'update') { decisionUpdates.push(state.payload); return { data: [], error: null }; }
        return { data: decisionProbeRows, error: null };
      }
      if (state.op === 'update' || state.op === 'insert') return { data: [], error: null };
      return { data: inboxRows, error: null };
    }
    return c;
  }
  return { supabase: { from: chain }, decisionInserts, decisionUpdates };
}

const oracleRow = (id, framing, body = 'systemic finding') => ({
  id, sender_session: 'solomon-1', created_at: new Date().toISOString(),
  payload: { kind: 'adam_advisory', oracle: true, ...(framing ? { framing_class: framing } : {}), body },
});

async function drainWith(mock) {
  const logs = []; const errs = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
  const err = vi.spyOn(console, 'error').mockImplementation((...a) => errs.push(a.join(' ')));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await m.drainInbox(mock.supabase, 'adam-sess', { quiet: false });
  log.mockRestore(); err.mockRestore(); warn.mockRestore();
  return { logs: logs.join(' '), errs: errs.join(' ') };
}

describe('SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-C: fail-closed routing in drainInbox', () => {
  it('TS-1: pick row -> one pending decision + routing:chairman-escalation (framing tag retained)', async () => {
    const mock = makeTableMock({ inboxRows: [oracleRow('p1', 'pick')] });
    const { logs } = await drainWith(mock);
    expect(mock.decisionInserts).toHaveLength(1);
    expect(logs).toMatch(/framing:pick/);
    expect(logs).toMatch(/routing:chairman-escalation/);
  });

  it('TS-2: instrument row -> zero decision writes + routing:adam-sourcing', async () => {
    const mock = makeTableMock({ inboxRows: [oracleRow('i1', 'instrument')] });
    const { logs } = await drainWith(mock);
    expect(mock.decisionInserts).toHaveLength(0);
    expect(logs).toMatch(/framing:instrument/);
    expect(logs).toMatch(/routing:adam-sourcing/);
  });

  it('TS-3/TS-7: unproven (missing or garbage framing_class) oracle rows escalate fail-closed', async () => {
    const mock = makeTableMock({ inboxRows: [oracleRow('u1', null), oracleRow('u2', 'garbage')] });
    const { logs } = await drainWith(mock);
    expect(mock.decisionInserts).toHaveLength(2);
    expect(logs.match(/routing:chairman-escalation/g)).toHaveLength(2);
    expect(logs).not.toMatch(/routing:adam-sourcing/);
  });

  it('TS-4: non-oracle advisory rows render with no routing/framing tags and no escalation', async () => {
    const mock = makeTableMock({
      inboxRows: [{ id: 'n1', created_at: new Date().toISOString(), payload: { kind: 'adam_advisory', body: 'plain advisory' } }],
    });
    const { logs } = await drainWith(mock);
    expect(mock.decisionInserts).toHaveLength(0);
    expect(logs).not.toMatch(/framing:/);
    expect(logs).not.toMatch(/routing:/);
  });

  it('TS-5: re-drain of an already-queued row is idempotent (probe hit -> no duplicate insert)', async () => {
    const mock = makeTableMock({
      inboxRows: [oracleRow('p2', 'pick')],
      decisionProbeRows: [{ id: 'dec-existing' }],
    });
    const { logs } = await drainWith(mock);
    expect(mock.decisionInserts).toHaveLength(0); // probe found existing -> skip
    expect(logs).toMatch(/routing:chairman-escalation/); // still rendered as routed
  });

  it('TS-6: decision-write failure is loud, drain continues, row not rendered as routed', async () => {
    const mock = makeTableMock({ inboxRows: [oracleRow('p3', 'pick'), oracleRow('i2', 'instrument')], failDecisionInsert: true });
    const { logs, errs } = await drainWith(mock);
    expect(errs).toMatch(/ESCALATION WRITE FAILED/);
    expect(logs).toMatch(/routing:escalation-write-failed/);
    expect(logs).toMatch(/routing:adam-sourcing/); // drain continued to the next row
  });

  it('TS-8: legacy-backlog drain (5 pick/unproven rows) fires ZERO standout escalations', async () => {
    const mock = makeTableMock({
      inboxRows: [oracleRow('b1', 'pick'), oracleRow('b2', null), oracleRow('b3', 'pick'), oracleRow('b4', null), oracleRow('b5', 'garbage')],
    });
    await drainWith(mock);
    expect(mock.decisionInserts).toHaveLength(5); // all queued...
    for (const row of mock.decisionInserts) {
      // ...with provably non-auto-escalating params (RISK conditions a+b):
      expect(row.blocking).toBe(false);
      expect(row.decision_type).toBe('framing_escalation');
      expect(shouldAutoEscalate({ decisionType: row.decision_type, blocking: row.blocking, raisedBy: row.brief_data && row.brief_data.raised_by })).toBe(false);
    }
    // and zero escalation-path updates on chairman_decisions (no CAS/email-marker write):
    expect(mock.decisionUpdates).toHaveLength(0);
  });

  it('FR-3: pending-decision brief_data carries the framing context', async () => {
    const mock = makeTableMock({ inboxRows: [oracleRow('c1', 'pick', 'portfolio kill/scale reversal')] });
    await drainWith(mock);
    const ctx = mock.decisionInserts[0].brief_data.context;
    expect(ctx.advisory_row_id).toBe('c1');
    expect(ctx.framing_class).toBe('pick');
    expect(ctx.lane_analog).toBe('chairman-gated');
    expect(ctx.excerpt).toMatch(/portfolio kill\/scale reversal/);
    expect(mock.decisionInserts[0].status).toBe('pending'); // records, never decides
  });
});
