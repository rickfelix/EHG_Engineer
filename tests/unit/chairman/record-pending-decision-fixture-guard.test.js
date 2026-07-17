/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002 (FR-4) — fixture guard at the decision-creation
 * source: recordPendingDecision refuses to mint chairman_decisions rows for fixture ventures
 * (positive identification only; lookup failures fail-open so a REAL decision is never lost).
 */
import { describe, it, expect } from 'vitest';
import { recordPendingDecision } from '../../../lib/chairman/record-pending-decision.mjs';

/** Minimal supabase fake: routes from('ventures') lookups and from('chairman_decisions') inserts. */
function makeFakeDb({ venture, ventureError = null } = {}) {
  const inserted = [];
  return {
    inserted,
    from(table) {
      if (table === 'ventures') {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: venture ?? null, error: ventureError }; },
        };
      }
      return {
        insert(row) {
          inserted.push(row);
          return { select: async () => ({ data: [{ id: 'dec-1' }], error: null }) };
        },
      };
    },
  };
}

describe('recordPendingDecision fixture guard', () => {
  it('refuses to record a decision for a fixture venture (name pattern)', async () => {
    const db = makeFakeDb({ venture: { id: 'v1', name: 'HCGate-RealDB-unclassified-noop-1', is_demo: false } });
    const r = await recordPendingDecision(db, { title: 'q', ventureId: 'v1' });
    expect(r).toEqual({ recorded: false, skipped_fixture: true });
    expect(db.inserted).toHaveLength(0);
  });

  it('refuses to record a decision for an is_demo venture', async () => {
    const db = makeFakeDb({ venture: { id: 'v1', name: 'Anything', is_demo: true } });
    const r = await recordPendingDecision(db, { title: 'q', ventureId: 'v1' });
    expect(r.skipped_fixture).toBe(true);
    expect(db.inserted).toHaveLength(0);
  });

  it('allowFixture: true overrides the guard (deliberate test minting)', async () => {
    const db = makeFakeDb({ venture: { id: 'v1', name: 'HCGate-RealDB-x-noop-1', is_demo: false } });
    const r = await recordPendingDecision(db, { title: 'q', ventureId: 'v1', allowFixture: true });
    expect(r.recorded).toBe(true);
    expect(db.inserted).toHaveLength(1);
  });

  it('records normally for a real venture', async () => {
    const db = makeFakeDb({ venture: { id: 'v1', name: 'ApexNiche AI', is_demo: false } });
    const r = await recordPendingDecision(db, { title: 'q', ventureId: 'v1' });
    expect(r.recorded).toBe(true);
    expect(db.inserted).toHaveLength(1);
  });

  it('fail-open: venture lookup error never blocks a real decision', async () => {
    const db = makeFakeDb({ venture: null, ventureError: { message: 'boom' } });
    const r = await recordPendingDecision(db, { title: 'q', ventureId: 'v1' });
    expect(r.recorded).toBe(true);
    expect(db.inserted).toHaveLength(1);
  });

  it('fail-open: missing venture row (dangling reference) records the decision', async () => {
    const db = makeFakeDb({ venture: null });
    const r = await recordPendingDecision(db, { title: 'q', ventureId: 'v1' });
    expect(r.recorded).toBe(true);
  });

  it('ventureless decisions skip the guard entirely', async () => {
    const db = makeFakeDb({ ventureError: { message: 'should never be queried' } });
    const r = await recordPendingDecision(db, { title: 'q' });
    expect(r.recorded).toBe(true);
  });
});
