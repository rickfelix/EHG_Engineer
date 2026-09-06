import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  findDisagreements,
  logDisagreements,
  shadowCompareAndLog,
  isShadowComparatorEnabled,
  EVENT_TYPE,
} from './shadow-logger.cjs';
import { computePriorityScore, compareByPriorityScore } from './comparator.cjs';

function fakeClient(insertImpl) {
  const insert = vi.fn(insertImpl);
  const from = vi.fn(() => ({ insert }));
  return { client: { from }, insert, from };
}

describe('isShadowComparatorEnabled', () => {
  const original = process.env.PRIORITY_SHADOW_COMPARATOR;
  afterEach(() => { process.env.PRIORITY_SHADOW_COMPARATOR = original; });

  it('defaults to enabled when unset', () => {
    delete process.env.PRIORITY_SHADOW_COMPARATOR;
    expect(isShadowComparatorEnabled()).toBe(true);
  });

  it('is disabled only when explicitly set to "off" (case-insensitive)', () => {
    process.env.PRIORITY_SHADOW_COMPARATOR = 'off';
    expect(isShadowComparatorEnabled()).toBe(false);
    process.env.PRIORITY_SHADOW_COMPARATOR = 'OFF';
    expect(isShadowComparatorEnabled()).toBe(false);
    process.env.PRIORITY_SHADOW_COMPARATOR = 'on';
    expect(isShadowComparatorEnabled()).toBe(true);
  });
});

describe('findDisagreements', () => {
  it('returns nothing when live and shadow orders agree', () => {
    const liveOrder = ['a', 'b', 'c'];
    const shadowScored = [
      { key: 'a', score: { score: 9, components: {} } },
      { key: 'b', score: { score: 5, components: {} } },
      { key: 'c', score: { score: 1, components: {} } },
    ];
    expect(findDisagreements(liveOrder, shadowScored)).toEqual([]);
  });

  it('reports an entry with live/shadow rank and neighbor keys when orders differ', () => {
    const liveOrder = ['a', 'b', 'c'];
    const shadowScored = [
      { key: 'b', score: { score: 9, components: { criticality: 9 } } },
      { key: 'a', score: { score: 5, components: { criticality: 5 } } },
      { key: 'c', score: { score: 1, components: {} } },
    ];
    const disagreements = findDisagreements(liveOrder, shadowScored);
    const forA = disagreements.find((d) => d.key === 'a');
    expect(forA).toBeDefined();
    expect(forA.liveRank).toBe(0);
    expect(forA.shadowRank).toBe(1);
    expect(forA.liveNeighborKeys).toEqual(['b']); // liveOrder[-1] is undefined, filtered out
  });

  it('does not throw and returns [] on malformed input', () => {
    expect(findDisagreements(null, null)).toEqual([]);
    expect(findDisagreements(undefined, [])).toEqual([]);
  });
});

describe('logDisagreements', () => {
  it('writes zero rows and does not call the client when there are no disagreements', async () => {
    const { client, from } = fakeClient(() => ({ error: null }));
    const result = await logDisagreements([], { callSite: 'test:1', entityType: 'sd', client });
    expect(result).toEqual({ written: 0 });
    expect(from).not.toHaveBeenCalled();
  });

  it('inserts one row per disagreement with the documented audit_log shape', async () => {
    const { client, from, insert } = fakeClient(() => ({ error: null }));
    const disagreements = [{
      key: 'SD-TEST-001', liveRank: 0, liveNeighborKeys: ['SD-TEST-002'],
      shadowRank: 2, shadowScore: 3.5, components: { criticality: 3.5 },
    }];
    const result = await logDisagreements(disagreements, { callSite: 'coordinator-backlog-rank.mjs:363', entityType: 'sd', client });
    expect(from).toHaveBeenCalledWith('audit_log');
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_type: EVENT_TYPE,
      entity_type: 'sd',
      entity_id: 'SD-TEST-001',
      old_value: { live_rank: 0, live_neighbor_keys: ['SD-TEST-002'] },
      new_value: { shadow_rank: 2, shadow_score: 3.5, components: { criticality: 3.5 } },
      severity: 'info',
    });
    expect(['info', 'warning', 'error', 'critical']).toContain(rows[0].severity);
    expect(result).toEqual({ written: 1 });
  });

  it('never throws when the insert fails -- returns {written: 0, error}', async () => {
    const { client } = fakeClient(() => ({ error: { message: 'constraint violation' } }));
    const disagreements = [{ key: 'k', liveRank: 0, liveNeighborKeys: [], shadowRank: 1, shadowScore: 1, components: {} }];
    await expect(logDisagreements(disagreements, { callSite: 't', entityType: 'sd', client })).resolves.toEqual({
      written: 0, error: 'constraint violation',
    });
  });

  it('never throws when client creation itself fails', async () => {
    const throwingClient = { from: () => { throw new Error('no client'); } };
    const disagreements = [{ key: 'k', liveRank: 0, liveNeighborKeys: [], shadowRank: 1, shadowScore: 1, components: {} }];
    await expect(logDisagreements(disagreements, { callSite: 't', entityType: 'sd', client: throwingClient })).resolves.toMatchObject({ written: 0 });
  });
});

describe('shadowCompareAndLog', () => {
  const original = process.env.PRIORITY_SHADOW_COMPARATOR;
  afterEach(() => { process.env.PRIORITY_SHADOW_COMPARATOR = original; });

  it('is a no-op when the kill switch is off, and never calls the client', async () => {
    process.env.PRIORITY_SHADOW_COMPARATOR = 'off';
    const { client, from } = fakeClient(() => ({ error: null }));
    const result = await shadowCompareAndLog({
      items: [{ key: 'a' }], keyOf: (i) => i.key, scoreInputsOf: () => ({ criticality: 5 }),
      liveOrder: ['a'], callSite: 't', entityType: 'sd', client,
    });
    expect(result).toEqual({ skipped: true, reason: 'disabled' });
    expect(from).not.toHaveBeenCalled();
  });

  it('skips gracefully on invalid arguments without throwing', async () => {
    const result = await shadowCompareAndLog({ items: 'not-an-array' });
    expect(result).toMatchObject({ skipped: true, reason: 'invalid_arguments' });
  });

  it('never throws when keyOf/scoreInputsOf themselves throw -- degrades to a no-op', async () => {
    const result = await shadowCompareAndLog({
      items: [{ key: 'a' }],
      keyOf: () => { throw new Error('boom'); },
      scoreInputsOf: () => ({}),
      liveOrder: ['a'],
      callSite: 't',
      entityType: 'sd',
    });
    expect(result.skipped).toBe(true);
    expect(result.error).toContain('boom');
  });

  it('never mutates the items array or liveOrder array it is given', async () => {
    const items = [{ key: 'a' }, { key: 'b' }];
    const liveOrder = ['a', 'b'];
    const itemsSnapshot = JSON.parse(JSON.stringify(items));
    const liveOrderSnapshot = [...liveOrder];
    const { client } = fakeClient(() => ({ error: null }));
    await shadowCompareAndLog({
      items, keyOf: (i) => i.key, scoreInputsOf: (i) => (i.key === 'a' ? { criticality: 1 } : { criticality: 9 }),
      liveOrder, callSite: 't', entityType: 'sd', client,
    });
    expect(items).toEqual(itemsSnapshot);
    expect(liveOrder).toEqual(liveOrderSnapshot);
  });

  it('logs a disagreement row for every item whose rank differs from the live order', async () => {
    const items = [{ key: 'a' }, { key: 'b' }];
    const liveOrder = ['a', 'b']; // live puts 'a' first
    const { client, insert } = fakeClient(() => ({ error: null }));
    await shadowCompareAndLog({
      items,
      keyOf: (i) => i.key,
      // shadow scores 'b' higher than 'a', so shadow order is ['b', 'a'] -- disagrees with live
      scoreInputsOf: (i) => (i.key === 'a' ? { criticality: 1 } : { criticality: 9 }),
      liveOrder,
      callSite: 'test-site',
      entityType: 'sd',
      client,
    });
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0];
    // both 'a' and 'b' disagree (each moved one rank)
    expect(rows.length).toBe(2);
  });
});
