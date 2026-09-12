/**
 * QF-20260912-427 — recordPendingDecision snapshots purchase-relevant venture fields into
 * brief_data.venture_snapshot at decision-creation time, so a later STALE_CONTEXT refusal
 * (fn_chairman_decide's venture_updated_at > created_at check) can be diffed against what the
 * chairman actually saw, rather than blindly re-checked against "did anything at all move."
 */
import { describe, it, expect } from 'vitest';
import { recordPendingDecision } from '../../../lib/chairman/record-pending-decision.mjs';

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

describe('recordPendingDecision venture_snapshot', () => {
  it('captures name/status/current_lifecycle_stage/deployment_url into brief_data.venture_snapshot', async () => {
    const db = makeFakeDb({
      venture: { id: 'v1', name: 'AltifyAI', is_demo: false, status: 'active', current_lifecycle_stage: 5, deployment_url: 'https://altifyai.example' },
    });
    const r = await recordPendingDecision(db, { title: 'approve domain', ventureId: 'v1' });
    expect(r.recorded).toBe(true);
    expect(db.inserted[0].brief_data.venture_snapshot).toEqual({
      name: 'AltifyAI', status: 'active', current_lifecycle_stage: 5, deployment_url: 'https://altifyai.example',
    });
  });

  it('nulls missing fields rather than omitting them (a stable diff shape later)', async () => {
    const db = makeFakeDb({ venture: { id: 'v1', name: 'Solo', is_demo: false, status: null, current_lifecycle_stage: null, deployment_url: null } });
    const r = await recordPendingDecision(db, { title: 'q', ventureId: 'v1' });
    expect(r.recorded).toBe(true);
    expect(db.inserted[0].brief_data.venture_snapshot).toEqual({
      name: 'Solo', status: null, current_lifecycle_stage: null, deployment_url: null,
    });
  });

  it('omits venture_snapshot entirely for a ventureless decision (no lookup performed)', async () => {
    const db = makeFakeDb({});
    const r = await recordPendingDecision(db, { title: 'session question' });
    expect(r.recorded).toBe(true);
    expect(db.inserted[0].brief_data.venture_snapshot).toBeUndefined();
  });

  it('omits venture_snapshot when the venture lookup errors (fail-open, matches the fixture guard)', async () => {
    const db = makeFakeDb({ venture: null, ventureError: { message: 'boom' } });
    const r = await recordPendingDecision(db, { title: 'q', ventureId: 'v1' });
    expect(r.recorded).toBe(true);
    expect(db.inserted[0].brief_data.venture_snapshot).toBeUndefined();
  });

  it('omits venture_snapshot when allowFixture skips the lookup entirely', async () => {
    const db = makeFakeDb({ venture: { id: 'v1', name: 'HCGate-RealDB-x-noop-1', is_demo: false } });
    const r = await recordPendingDecision(db, { title: 'q', ventureId: 'v1', allowFixture: true });
    expect(r.recorded).toBe(true);
    expect(db.inserted[0].brief_data.venture_snapshot).toBeUndefined();
  });
});
