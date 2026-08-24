/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-4, TESTING correction 37018288) — the PRE-EXISTING
 * promotion-path SIGNAL_RESOLVED block (payload.routed_to_sd_key + SD status='completed') was
 * extracted from runCoordinatorHousekeeping into notifySignalResolvedByPromotion() specifically
 * so its own null-safety fix (the same .neq()-on-a-possibly-absent-key defect TESTING found live
 * in bfb24a47, at the same line-pattern) is directly unit-testable, mirroring the sibling
 * disposition-path test file's fixture discipline.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { notifySignalResolvedByPromotion } = require_('../../../scripts/stale-session-sweep.cjs');

/** See signal-resolved-disposition-path.test.js for the rationale behind this coercion. */
function readPath(row, col) {
  const m = /^payload->>(\w+)$/.exec(col);
  if (m) {
    const v = row.payload ? row.payload[m[1]] : undefined;
    return v === undefined || v === null ? v : String(v);
  }
  return row[col];
}

/** NULL-safe clause evaluator — see signal-resolved-disposition-path.test.js. */
function evalClause(row, col, op, val) {
  const actual = readPath(row, col);
  if (op === 'is') return val === null ? actual == null : actual === val;
  if (op === 'neq') return actual == null ? false : actual !== val; // NULL <> x -> NULL (falsy)
  if (op === 'eq') return actual == null ? false : actual === val;
  throw new Error(`evalClause: unsupported op ${op}`);
}

function parseOrString(orString) {
  const clauses = orString.split(',').map((part) => {
    const [col, op, ...rest] = part.split('.');
    return { col, op, val: rest.join('.') === 'null' ? null : rest.join('.') };
  });
  return (row) => clauses.some((c) => evalClause(row, c.col, c.op, c.val));
}

function fakeClient({ signalRows = [], sdRows = [], liveSessions = [] } = {}) {
  const store = new Map(signalRows.map((r) => [r.id, { ...r }]));
  const sds = new Map(sdRows.map((r) => [r.sd_key, r]));
  const inserts = [];
  return {
    inserts,
    getRow: (id) => store.get(id),
    from(table) {
      if (table === 'session_coordination') {
        const filters = [];
        const builder = {
          select() { return builder; },
          not(col, op, val) {
            filters.push(val === null && op === 'is'
              ? (row) => readPath(row, col) != null
              : (row) => !evalClause(row, col, op, val));
            return builder;
          },
          or(orString) { filters.push(parseOrString(orString)); return builder; },
          order() { return builder; },
          async limit() {
            const rows = [...store.values()].filter((r) => filters.every((f) => f(r)));
            return { data: rows, error: null };
          },
          update(patch) {
            return { eq: async (col, val) => { Object.assign(store.get(val), patch); return { error: null }; } };
          },
          async insert(row) { inserts.push(row); return { error: null }; },
        };
        return builder;
      }
      if (table === 'strategic_directives_v2') {
        let key;
        return {
          select() { return this; },
          eq(col, val) { key = val; return this; },
          async maybeSingle() { return { data: sds.get(key) || null, error: null }; },
        };
      }
      if (table === 'claude_sessions') {
        // resolveLiveSessionForCallsign uses fapPaginate, which settles at .range(), not .order().
        return {
          select() { return this; },
          gte() { return this; },
          filter() { return this; },
          order() { return this; },
          async range() { return { data: liveSessions, error: null }; },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const promotedSignal = (id, overrides = {}) => ({
  id,
  payload: { signal_type: 'harness-bug', sender_callsign: 'Golf-4', routed_to_sd_key: 'SD-EXAMPLE-001' },
  body: 'a signal that contributed to a promoted SD',
  created_at: '2026-08-01T00:00:00Z',
  ...overrides,
});

const COMPLETED_SD = { sd_key: 'SD-EXAMPLE-001', status: 'completed' };
const LIVE_GOLF4 = { session_id: 'sess-new-1', metadata: { fleet_identity: { callsign: 'Golf-4' } } };

describe("SD-LEO-INFRA-SIGNAL-LANE-PER-001 FR-4: notifySignalResolvedByPromotion — TESTING's null-safety fix", () => {
  it('THE PRIMARY REGRESSION TEST: a genuine never-notified row (notification_sent absent) on a completed SD IS found and notified', async () => {
    const sig = promotedSignal('sig-1');
    expect(sig.payload.notification_sent).toBeUndefined();
    const c = fakeClient({ signalRows: [sig], sdRows: [COMPLETED_SD], liveSessions: [LIVE_GOLF4] });
    const result = await notifySignalResolvedByPromotion(c);
    expect(result).toBeUndefined(); // void return (console.log only) -- assert via side effects below
    expect(c.inserts).toHaveLength(1);
    expect(c.inserts[0].target_session).toBe('sess-new-1');
    expect(c.inserts[0].payload.resulting_sd_key).toBe('SD-EXAMPLE-001');
    expect(c.getRow('sig-1').payload.notification_sent).toBe(true);
  });

  it('does not notify when the SD is not yet completed', async () => {
    const sig = promotedSignal('sig-1');
    const c = fakeClient({ signalRows: [sig], sdRows: [{ sd_key: 'SD-EXAMPLE-001', status: 'in_progress' }], liveSessions: [LIVE_GOLF4] });
    await notifySignalResolvedByPromotion(c);
    expect(c.inserts).toHaveLength(0);
  });

  it('drops (marks notification_sent, no insert) when the callsign has no live session', async () => {
    const sig = promotedSignal('sig-1');
    const c = fakeClient({ signalRows: [sig], sdRows: [COMPLETED_SD], liveSessions: [] });
    await notifySignalResolvedByPromotion(c);
    expect(c.inserts).toHaveLength(0);
    expect(c.getRow('sig-1').payload.signal_resolved_dropped).toBe(true);
    expect(c.getRow('sig-1').payload.notification_sent).toBe(true);
  });

  it('does not notify a signal that already has notification_sent=true (the exact defect .neq() alone would have hidden)', async () => {
    const sig = promotedSignal('sig-1', {
      payload: { signal_type: 'harness-bug', sender_callsign: 'Golf-4', routed_to_sd_key: 'SD-EXAMPLE-001', notification_sent: true },
    });
    const c = fakeClient({ signalRows: [sig], sdRows: [COMPLETED_SD], liveSessions: [LIVE_GOLF4] });
    await notifySignalResolvedByPromotion(c);
    expect(c.inserts).toHaveLength(0);
  });

  it('excludes rows with no routed_to_sd_key at all (not a promotion candidate)', async () => {
    const sig = { id: 'sig-1', payload: { signal_type: 'harness-bug', sender_callsign: 'Golf-4' }, body: 'x', created_at: '2026-08-01T00:00:00Z' };
    const c = fakeClient({ signalRows: [sig], sdRows: [COMPLETED_SD], liveSessions: [LIVE_GOLF4] });
    await notifySignalResolvedByPromotion(c);
    expect(c.inserts).toHaveLength(0);
  });
});
