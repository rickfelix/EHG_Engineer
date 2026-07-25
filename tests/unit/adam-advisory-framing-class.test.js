/**
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-C — fail-closed pick-vs-instrument ROUTING in
 * drainInbox (supersedes sibling -B's interim PICK-CLASS warn, whose assertions this file
 * previously pinned: routing is now REAL, so the warn is replaced by routed behavior).
 * pick/unproven oracle framings are FLAGGED; instrument -> renders sourcing-eligible;
 * non-oracle advisories untouched. -B's framing:<value> rendering tag is retained.
 *
 * QF-20260725-450: DESTINATION CORRECTED. These assertions previously pinned a write into
 * chairman_decisions, which is what flooded the chairman decision queue (114 pending
 * non-actionable rows). Framing quality is an adherence/comms-quality signal, so the flag
 * now lands in feedback(category='comms_quality'). The ROUTING DECISION is unchanged and
 * still pinned below — only the destination table moved.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const m = require('../../scripts/adam-advisory.cjs');

/**
 * Table-aware supabase mock: session_coordination selects return `inboxRows`;
 * feedback selects return `flagProbeRows` (idempotency probe), inserts are
 * recorded (and fail when failFlagInsert). chairman_decisions writes are recorded
 * separately so the test can assert the chairman queue is NEVER touched.
 */
function makeTableMock({ inboxRows = [], flagProbeRows = [], failFlagInsert = false } = {}) {
  const flagInserts = [];
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
      if (table === 'feedback') {
        if (state.op === 'insert') {
          if (failFlagInsert) return { data: null, error: { message: 'boom' } };
          flagInserts.push(state.payload);
          return { data: [{ id: `fb-${flagInserts.length}` }], error: null };
        }
        return { data: flagProbeRows, error: null };
      }
      if (table === 'chairman_decisions') {
        if (state.op === 'insert') { decisionInserts.push(state.payload); return { data: [{ id: 'dec-x' }], error: null }; }
        if (state.op === 'update') { decisionUpdates.push(state.payload); return { data: [], error: null }; }
        return { data: [], error: null };
      }
      // SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B): drainInbox now also queries
      // role_drain_sets via the registry-reader — route it as PGRST205-style table-not-found
      // (STAGED/unapplied, the real state today), so the registry-reader fails open to
      // DRAIN_SETS.adam exactly as before this repoint.
      if (table === 'role_drain_sets') return { data: null, error: { code: 'PGRST205', message: 'not found' } };
      if (state.op === 'update' || state.op === 'insert') return { data: [], error: null };
      return { data: inboxRows, error: null };
    }
    return c;
  }
  return { supabase: { from: chain }, flagInserts, decisionInserts, decisionUpdates };
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
  it('TS-1: pick row -> one comms-quality flag + routing:chairman-escalation (framing tag retained)', async () => {
    const mock = makeTableMock({ inboxRows: [oracleRow('p1', 'pick')] });
    const { logs } = await drainWith(mock);
    expect(mock.flagInserts).toHaveLength(1);
    expect(logs).toMatch(/framing:pick/);
    expect(logs).toMatch(/routing:chairman-escalation/);
  });

  it('TS-2: instrument row -> zero flag writes + routing:adam-sourcing', async () => {
    const mock = makeTableMock({ inboxRows: [oracleRow('i1', 'instrument')] });
    const { logs } = await drainWith(mock);
    expect(mock.flagInserts).toHaveLength(0);
    expect(logs).toMatch(/framing:instrument/);
    expect(logs).toMatch(/routing:adam-sourcing/);
  });

  it('TS-3/TS-7: unproven (missing or garbage framing_class) oracle rows flag fail-closed', async () => {
    const mock = makeTableMock({ inboxRows: [oracleRow('u1', null), oracleRow('u2', 'garbage')] });
    const { logs } = await drainWith(mock);
    expect(mock.flagInserts).toHaveLength(2);
    expect(logs.match(/routing:chairman-escalation/g)).toHaveLength(2);
    expect(logs).not.toMatch(/routing:adam-sourcing/);
  });

  it('TS-4: non-oracle advisory rows render with no routing/framing tags and no flag', async () => {
    const mock = makeTableMock({
      inboxRows: [{ id: 'n1', created_at: new Date().toISOString(), payload: { kind: 'adam_advisory', body: 'plain advisory' } }],
    });
    const { logs } = await drainWith(mock);
    expect(mock.flagInserts).toHaveLength(0);
    expect(logs).not.toMatch(/framing:/);
    expect(logs).not.toMatch(/routing:/);
  });

  it('TS-5: re-drain of an already-flagged row is idempotent (probe hit -> no duplicate insert)', async () => {
    const mock = makeTableMock({
      inboxRows: [oracleRow('p2', 'pick')],
      flagProbeRows: [{ id: 'fb-existing' }],
    });
    const { logs } = await drainWith(mock);
    expect(mock.flagInserts).toHaveLength(0); // probe found existing -> skip
    expect(logs).toMatch(/routing:chairman-escalation/); // still rendered as routed
  });

  it('TS-6: flag-write failure is loud, drain continues, row not rendered as routed', async () => {
    const mock = makeTableMock({ inboxRows: [oracleRow('p3', 'pick'), oracleRow('i2', 'instrument')], failFlagInsert: true });
    const { logs, errs } = await drainWith(mock);
    expect(errs).toMatch(/FRAMING FLAG WRITE FAILED/);
    expect(logs).toMatch(/routing:escalation-write-failed/);
    expect(logs).toMatch(/routing:adam-sourcing/); // drain continued to the next row
  });

  it('QF-20260725-450: framing flags NEVER write to the chairman decision queue', async () => {
    const mock = makeTableMock({
      inboxRows: [oracleRow('b1', 'pick'), oracleRow('b2', null), oracleRow('b3', 'pick'), oracleRow('b4', null), oracleRow('b5', 'garbage')],
    });
    await drainWith(mock);
    expect(mock.flagInserts).toHaveLength(5); // all flagged...
    // ...and the chairman queue is untouched — this is the regression that flooded it
    // with 114 non-actionable pending rows at ~1 per 15-min sweep tick.
    expect(mock.decisionInserts).toHaveLength(0);
    expect(mock.decisionUpdates).toHaveLength(0);
    for (const row of mock.flagInserts) {
      expect(row.category).toBe('comms_quality');
      expect(row.severity).toBe('low');
    }
  });

  it('FR-3: the comms-quality flag carries the framing context', async () => {
    const mock = makeTableMock({ inboxRows: [oracleRow('c1', 'pick', 'portfolio kill/scale reversal')] });
    await drainWith(mock);
    const row = mock.flagInserts[0];
    expect(row.metadata.advisory_row_id).toBe('c1');
    expect(row.metadata.framing_class).toBe('pick');
    expect(row.metadata.lane_analog).toBe('chairman-gated');
    expect(row.description).toMatch(/portfolio kill\/scale reversal/);
  });
});
