/**
 * SD-LEO-INFRA-CHAIRMAN-DECIDE-MIGRATION-001 (FR-2) — mint-time diagnostic probe against
 * fn_chairman_decision_value, DIAGNOSTIC-ONLY (never blocks a record). A confirmed NULL stamps
 * brief_data.decision_type_unmapped=true; any other outcome (mapped value, missing .rpc, RPC
 * error) leaves the row exactly as it was pre-change.
 */
import { describe, it, expect, vi } from 'vitest';
import { recordPendingDecision } from '../../../lib/chairman/record-pending-decision.mjs';

/** Minimal supabase fake; `rpcImpl` is undefined by default (matches the 19 pre-existing doubles
 *  that never stub .rpc), or can be supplied to simulate a real client. */
function makeFakeDb({ rpcImpl } = {}) {
  const inserted = [];
  const rpcCalls = [];
  const db = {
    inserted,
    rpcCalls,
    from(table) {
      if (table === 'ventures') {
        return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } };
      }
      return {
        insert(row) {
          inserted.push(row);
          return { select: async () => ({ data: [{ id: 'dec-1' }], error: null }) };
        },
      };
    },
  };
  if (rpcImpl) {
    db.rpc = async (fn, args) => {
      rpcCalls.push({ fn, args });
      return rpcImpl(fn, args);
    };
  }
  return db;
}

describe('recordPendingDecision mint-time diagnostic (FR-2)', () => {
  it('TS-1: stamps decision_type_unmapped=true and STILL inserts when fn_chairman_decision_value returns NULL', async () => {
    const db = makeFakeDb({ rpcImpl: () => ({ data: null, error: null }) });
    const r = await recordPendingDecision(db, { title: 'q', decisionType: 'migration_apply', skipEscalation: true });
    expect(r.recorded).toBe(true);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0].brief_data.decision_type_unmapped).toBe(true);
  });

  it('TS-2a: does not throw and inserts normally when the client has NO .rpc property at all', async () => {
    const db = makeFakeDb(); // no rpcImpl -> no .rpc method, matches pre-existing test doubles
    const r = await recordPendingDecision(db, { title: 'q', decisionType: 'venture_health_alert', skipEscalation: true });
    expect(r.recorded).toBe(true);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0].brief_data.decision_type_unmapped).toBeUndefined();
  });

  it('TS-2b: does not throw and inserts normally when supabase.rpc rejects', async () => {
    const db = makeFakeDb({ rpcImpl: () => { throw new Error('network down'); } });
    const r = await recordPendingDecision(db, { title: 'q', decisionType: 'migration_apply', skipEscalation: true });
    expect(r.recorded).toBe(true);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0].brief_data.decision_type_unmapped).toBeUndefined();
  });

  it('TS-3: inserts normally with no stamp for a mapped decision_type', async () => {
    const db = makeFakeDb({ rpcImpl: () => ({ data: 'approve', error: null }) });
    const r = await recordPendingDecision(db, { title: 'q', decisionType: 'ddl_approval', skipEscalation: true });
    expect(r.recorded).toBe(true);
    expect(db.inserted[0].brief_data.decision_type_unmapped).toBeUndefined();
  });

  it('TS-4: probes with p_action="approved" exactly once, after the fixture-venture guard', async () => {
    const db = makeFakeDb({ rpcImpl: () => ({ data: 'approve', error: null }) });
    await recordPendingDecision(db, { title: 'q', decisionType: 'ddl_approval', skipEscalation: true });
    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0]).toEqual({
      fn: 'fn_chairman_decision_value',
      args: { p_decision_type: 'ddl_approval', p_action: 'approved' },
    });
  });

  it('TS-4b: no probe call when the fixture-venture guard short-circuits first', async () => {
    const inserted = [];
    const rpcCalls = [];
    const db = {
      from(table) {
        if (table === 'ventures') {
          return {
            select() { return this; },
            eq() { return this; },
            async maybeSingle() { return { data: { id: 'v1', name: 'HCGate-RealDB-x-noop-1', is_demo: false }, error: null }; },
          };
        }
        return { insert(row) { inserted.push(row); return { select: async () => ({ data: [{ id: 'dec-1' }], error: null }) }; } };
      },
      rpc: async (fn, args) => { rpcCalls.push({ fn, args }); return { data: null, error: null }; },
    };
    const r = await recordPendingDecision(db, { title: 'q', decisionType: 'migration_apply', ventureId: 'v1' });
    expect(r.skipped_fixture).toBe(true);
    expect(rpcCalls).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });
});
