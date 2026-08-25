/**
 * SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-3/FR-7 group 5(c) — drainSmsStatusStaging orchestration:
 * claim-first, outcome branching, and schema-not-ready handling. The writer's own correctness
 * (delivered_at/source patch shape, table/column-absent distinction) is covered separately in
 * tests/unit/chairman/owed-delivery-truth.test.js — this file mocks the writer and tests only
 * what the drain itself is responsible for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { applyOwedDeliveryTruth } = vi.hoisted(() => ({ applyOwedDeliveryTruth: vi.fn() }));
vi.mock('../../../lib/chairman/owed-delivery-truth.js', () => ({ applyOwedDeliveryTruth }));

import { drainSmsStatusStaging } from '../../../lib/chairman/sms-bridge.js';

/** A minimal, real (mutating) in-memory fake for sms_status_staging only. */
function makeFakeSupabase(rows) {
  const table = rows.map((r) => ({ ...r }));
  return {
    _table: table,
    from(name) {
      if (name !== 'sms_status_staging') throw new Error(`unexpected table: ${name}`);
      const ctx = { filters: [], order: null, limitN: null, mode: 'select', vals: null, returnSelect: false };
      const api = {
        select(_cols) { if (ctx.mode !== 'update') ctx.mode = 'select'; else ctx.returnSelect = true; return api; },
        update(vals) { ctx.mode = 'update'; ctx.vals = vals; return api; },
        eq(col, val) { ctx.filters.push((r) => r[col] === val); return api; },
        is(col, val) { ctx.filters.push((r) => (r[col] ?? null) === val); return api; },
        order(col, { ascending } = {}) { ctx.order = { col, ascending: !!ascending }; return api; },
        limit(n) { ctx.limitN = n; return api; },
        then(resolve) {
          let matched = table.filter((r) => ctx.filters.every((f) => f(r)));
          if (ctx.mode === 'update') {
            matched.forEach((r) => Object.assign(r, ctx.vals));
            resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
            return;
          }
          if (ctx.order) matched = [...matched].sort((a, b) => (a[ctx.order.col] < b[ctx.order.col] ? -1 : 1));
          if (ctx.limitN != null) matched = matched.slice(0, ctx.limitN);
          resolve({ data: matched, error: null });
        },
      };
      return api;
    },
  };
}

describe('drainSmsStatusStaging', () => {
  beforeEach(() => { applyOwedDeliveryTruth.mockReset(); });

  // TESTING mutation finding M3: a naive process-then-mark implementation still passes every
  // other test in this file (they only assert final outcomes, not ordering). This test observes
  // the row's OWN drained_at state at the moment the writer is invoked, so it can only pass if
  // the claim genuinely happened before processing.
  it('claim-first: the staging row is already marked claimed at the moment the writer is called', async () => {
    const sb = makeFakeSupabase([{ id: 'stg-order', provider_message_id: 'SM1', message_status: 'delivered', received_at: 'x', drained_at: null }]);
    let drainedAtWhenWriterCalled;
    applyOwedDeliveryTruth.mockImplementation(async () => {
      drainedAtWhenWriterCalled = sb._table[0].drained_at;
      return { matched: true, updated: true, error: null, tableAbsent: false, columnAbsent: false };
    });

    await drainSmsStatusStaging(sb);

    expect(drainedAtWhenWriterCalled, 'writer was called before the claim landed -- process-then-mark, not claim-first').not.toBeNull();
  });

  it('claim-first: passes deliveredAt=row.received_at (never a freshly-computed timestamp) and source=carrier_push', async () => {
    const receivedAt = '2020-01-01T00:00:00.000Z';
    const sb = makeFakeSupabase([{ id: 'stg-1', provider_message_id: 'SM1', message_status: 'delivered', received_at: receivedAt, drained_at: null }]);
    applyOwedDeliveryTruth.mockResolvedValue({ matched: true, updated: true, error: null, tableAbsent: false, columnAbsent: false });

    await drainSmsStatusStaging(sb);

    expect(applyOwedDeliveryTruth).toHaveBeenCalledWith(sb, {
      messageSid: 'SM1', status: 'delivered', deliveredAt: receivedAt, source: 'carrier_push',
    });
  });

  it('a matched write is marked drained with outcome=updated', async () => {
    const sb = makeFakeSupabase([{ id: 'stg-1', provider_message_id: 'SM1', message_status: 'delivered', received_at: 'x', drained_at: null }]);
    applyOwedDeliveryTruth.mockResolvedValue({ matched: true, updated: true, error: null, tableAbsent: false, columnAbsent: false });

    const result = await drainSmsStatusStaging(sb);

    expect(result.results[0].outcome).toBe('updated');
    expect(sb._table[0].drained_at).not.toBeNull();
  });

  it('an unmatched/unknown MessageSid is parked (drained, not dropped or crashed) with outcome=parked_no_match', async () => {
    const sb = makeFakeSupabase([{ id: 'stg-2', provider_message_id: 'SM-unknown', message_status: 'sent', received_at: 'x', drained_at: null }]);
    applyOwedDeliveryTruth.mockResolvedValue({ matched: false, updated: false, error: null, tableAbsent: false, columnAbsent: false });

    const result = await drainSmsStatusStaging(sb);

    expect(result.results[0].outcome).toBe('parked_no_match');
    expect(sb._table[0].drained_at).not.toBeNull();
  });

  // FR-3 AC-6 / W3: the drain must NOT mark drained_at if the schema isn't ready yet.
  it('a schema-not-ready (columnAbsent) result releases the claim so the row is retried, not discarded', async () => {
    const sb = makeFakeSupabase([{ id: 'stg-3', provider_message_id: 'SM1', message_status: 'delivered', received_at: 'x', drained_at: null }]);
    applyOwedDeliveryTruth.mockResolvedValue({ matched: false, updated: false, error: null, tableAbsent: false, columnAbsent: true });

    const result = await drainSmsStatusStaging(sb);

    expect(result.results[0].outcome).toBe('schema_not_ready');
    expect(sb._table[0].drained_at).toBeNull();
  });

  it('a row already drained is not reprocessed', async () => {
    const sb = makeFakeSupabase([{ id: 'stg-old', provider_message_id: 'SM-old', message_status: 'delivered', received_at: 'x', drained_at: new Date().toISOString() }]);
    const result = await drainSmsStatusStaging(sb);
    expect(result.drained).toBe(0);
    expect(applyOwedDeliveryTruth).not.toHaveBeenCalled();
  });

  it('a genuine processing error releases the claim so the next tick retries', async () => {
    const sb = makeFakeSupabase([{ id: 'stg-err', provider_message_id: 'SM1', message_status: 'delivered', received_at: 'x', drained_at: null }]);
    applyOwedDeliveryTruth.mockRejectedValue(new Error('transient DB error'));

    await expect(drainSmsStatusStaging(sb)).rejects.toThrow(/transient DB error/);
    expect(sb._table[0].drained_at).toBeNull();
  });

  it('multiple undrained rows are processed oldest-first and all claimed', async () => {
    const sb = makeFakeSupabase([
      { id: 'stg-b', provider_message_id: 'SM-b', message_status: 'sent', received_at: '2020-01-02T00:00:00.000Z', drained_at: null },
      { id: 'stg-a', provider_message_id: 'SM-a', message_status: 'delivered', received_at: '2020-01-01T00:00:00.000Z', drained_at: null },
    ]);
    applyOwedDeliveryTruth.mockResolvedValue({ matched: true, updated: true, error: null, tableAbsent: false, columnAbsent: false });

    const result = await drainSmsStatusStaging(sb);

    expect(result.drained).toBe(2);
    // First call should be for the older row (stg-a), proving order-by-received_at ascending.
    expect(applyOwedDeliveryTruth.mock.calls[0][1].messageSid).toBe('SM-a');
  });
});
