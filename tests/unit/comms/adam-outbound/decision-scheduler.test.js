/**
 * SD-LEO-INFRA-ADAM-DECISION-SCHEDULER-001 — wiring layer over the already-shipped
 * away-bridge. TS-1, TS-2, TS-3, TS-8 per the amended PRD.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/comms/adam-outbound/chairman-sms-gate/index.js', () => ({
  sendChairmanSMS: vi.fn(async () => ({ sent: true })),
}));
vi.mock('../../../../lib/chairman/record-pending-decision.mjs', () => ({
  escalateChairmanDecision: vi.fn(async () => ({ escalated: true })),
}));

import { sendChairmanSMS } from '../../../../lib/comms/adam-outbound/chairman-sms-gate/index.js';
import { escalateChairmanDecision } from '../../../../lib/chairman/record-pending-decision.mjs';
import {
  buildOwedStore,
  resolvePresenceContext,
  runDecisionSchedulerTick,
} from '../../../../lib/comms/adam-outbound/decision-scheduler/index.js';

/** Minimal fake supabase: supports select/eq/not/order/limit chains and an "absent table" mode. */
function makeFakeSupabase({ tables = {}, absentTables = [] } = {}) {
  const absent = new Set(absentTables);

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every(([col, op, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'not_is_null') return row[col] !== null && row[col] !== undefined;
        return true;
      })
    );
  }

  function from(table) {
    const ctx = { filters: [], order: null, limitN: null };
    const api = {
      select() { return api; },
      eq(col, val) { ctx.filters.push([col, 'eq', val]); return api; },
      not(col) { ctx.filters.push([col, 'not_is_null', null]); return api; },
      order(col, { ascending } = {}) { ctx.order = { col, ascending: !!ascending }; return api; },
      limit(n) { ctx.limitN = n; return api; },
      then(resolve) {
        if (absent.has(table)) {
          resolve({ data: null, error: { message: `relation "${table}" does not exist` } });
          return;
        }
        let rows = applyFilters(tables[table] || [], ctx.filters);
        if (ctx.order) {
          rows = [...rows].sort((a, b) => {
            const cmp = a[ctx.order.col] < b[ctx.order.col] ? -1 : a[ctx.order.col] > b[ctx.order.col] ? 1 : 0;
            return ctx.order.ascending ? cmp : -cmp;
          });
        }
        if (ctx.limitN != null) rows = rows.slice(0, ctx.limitN);
        resolve({ data: rows, error: null });
      },
    };
    return api;
  }

  return { from };
}

beforeEach(() => {
  sendChairmanSMS.mockClear();
  escalateChairmanDecision.mockClear();
});

describe('buildOwedStore', () => {
  it('TS-1: getOwedDecisions returns [] (never throws) while sms_outbound_obligations is absent', async () => {
    const sb = makeFakeSupabase({ absentTables: ['sms_outbound_obligations'] });
    const store = buildOwedStore(sb);
    await expect(store.getOwedDecisions()).resolves.toEqual([]);
  });

  it('TS-8: maps real columns, filters to decision rows, resolves unbacked fields to explicit deferred defaults', async () => {
    const sb = makeFakeSupabase({
      tables: {
        sms_outbound_obligations: [
          { id: 'row-1', kind: 'decision_question', decision_id: 'dec-1', body: 'Approve X?', status: 'owed' },
          { id: 'row-2', kind: 'morning_review', decision_id: null, body: 'Good morning', status: 'sent' },
          { id: 'row-3', kind: 'decision_question', decision_id: null, body: 'orphaned', status: 'owed' },
        ],
      },
    });
    const store = buildOwedStore(sb);
    const owed = await store.getOwedDecisions();
    expect(owed).toHaveLength(1);
    expect(owed[0]).toMatchObject({
      owedId: 'row-1',
      decisionId: 'dec-1',
      message: { body: 'Approve X?', decisionId: 'dec-1' },
      answered: false,
      resurfaceCount: 0,
      resurfacedThisWindow: false,
    });
  });

  it('markResurfaced is a documented no-op (no backing STAGED column)', async () => {
    const sb = makeFakeSupabase({ tables: { sms_outbound_obligations: [] } });
    const store = buildOwedStore(sb);
    await expect(store.markResurfaced('row-1')).resolves.toBeUndefined();
  });
});

describe('resolvePresenceContext', () => {
  it('TS-3: empty claude_sessions -> lastInputAt null, which away-bridge isAway() treats as present', async () => {
    const sb = makeFakeSupabase({ tables: { claude_sessions: [] } });
    const ctx = await resolvePresenceContext(sb);
    expect(ctx.lastInputAt).toBeNull();
    expect(typeof ctx.now).toBe('number');
  });

  it('TS-3: errored session query -> lastInputAt null, never throws', async () => {
    const sb = makeFakeSupabase({ absentTables: ['claude_sessions'] });
    const ctx = await resolvePresenceContext(sb);
    expect(ctx.lastInputAt).toBeNull();
  });

  it('resolves the most recent heartbeat_at when present', async () => {
    const sb = makeFakeSupabase({
      tables: {
        claude_sessions: [
          { heartbeat_at: '2026-07-18T00:00:00.000Z' },
          { heartbeat_at: '2026-07-18T00:05:00.000Z' },
        ],
      },
    });
    const ctx = await resolvePresenceContext(sb);
    expect(ctx.lastInputAt).toBe(Date.parse('2026-07-18T00:05:00.000Z'));
  });
});

describe('runDecisionSchedulerTick', () => {
  it('fail-soft: never throws when the tick errors internally', async () => {
    const sb = makeFakeSupabase();
    const result = await runDecisionSchedulerTick(sb, {
      owedStore: { getOwedDecisions: async () => { throw new Error('boom'); }, markResurfaced: async () => {} },
      presence: { now: 1000, lastInputAt: 0, awayThresholdMs: 900_000 },
    });
    expect(result.ran).toBe(false);
    expect(result.error).toMatch(/boom/);
  });

  it('TS-2: wires owedStore/sender/escalateEmail into processOwedDecisions — away + owed -> resurfaced via sendChairmanSMS', async () => {
    const sb = makeFakeSupabase();
    const owedStore = {
      getOwedDecisions: async () => [{
        owedId: 'row-1', decisionId: 'dec-1', message: { body: 'Approve X?', decisionId: 'dec-1' },
        answered: false, resurfaceCount: 0, resurfacedThisWindow: false,
      }],
      markResurfaced: vi.fn(async () => {}),
    };
    const AWAY = { now: 1_000_000, lastInputAt: 0, awayThresholdMs: 900_000 };
    const result = await runDecisionSchedulerTick(sb, { owedStore, presence: AWAY });
    expect(result.ran).toBe(true);
    expect(result.results[0].action).toBe('resurfaced');
    expect(sendChairmanSMS).toHaveBeenCalledTimes(1);
    expect(sendChairmanSMS.mock.calls[0][0]).toMatchObject({ decisionId: 'dec-1' });
    expect(owedStore.markResurfaced).toHaveBeenCalledWith('row-1');
  });

  it('TS-2: K-reached owed decision escalates via escalateChairmanDecision, decisionId threaded through, no SMS sent', async () => {
    const sb = makeFakeSupabase();
    const owedStore = {
      getOwedDecisions: async () => [{
        owedId: 'row-2', decisionId: 'dec-2', message: { body: 'Approve Y?', decisionId: 'dec-2' },
        answered: false, resurfaceCount: 3, resurfacedThisWindow: false,
      }],
      markResurfaced: vi.fn(async () => {}),
    };
    const AWAY = { now: 1_000_000, lastInputAt: 0, awayThresholdMs: 900_000 };
    const result = await runDecisionSchedulerTick(sb, { owedStore, presence: AWAY });
    expect(result.results[0].action).toBe('escalated_email');
    expect(escalateChairmanDecision).toHaveBeenCalledWith(sb, 'dec-2');
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('TS-2/TS-3: present (recent fleet input) -> no re-surface, sender not called', async () => {
    const sb = makeFakeSupabase();
    const owedStore = {
      getOwedDecisions: async () => [{
        owedId: 'row-3', decisionId: 'dec-3', message: { body: 'Approve Z?', decisionId: 'dec-3' },
        answered: false, resurfaceCount: 0, resurfacedThisWindow: false,
      }],
      markResurfaced: vi.fn(async () => {}),
    };
    const PRESENT = { now: 1_000_000, lastInputAt: 999_000, awayThresholdMs: 900_000 };
    const result = await runDecisionSchedulerTick(sb, { owedStore, presence: PRESENT });
    expect(result.results[0].action).toBe('skipped_present');
    expect(sendChairmanSMS).not.toHaveBeenCalled();
  });

  it('uses resolvePresenceContext + buildOwedStore by default when opts are not injected — no throw, empty result', async () => {
    const sb = makeFakeSupabase({ tables: { claude_sessions: [], sms_outbound_obligations: [] } });
    const result = await runDecisionSchedulerTick(sb, {});
    expect(result.ran).toBe(true);
    expect(result.results).toEqual([]);
  });
});
