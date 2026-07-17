import { describe, it, expect, vi } from 'vitest';
import { checkFinanceBillingIdle } from '../../lib/agents/finance-billing-idle-check.js';

function makeFakeSupabase(count, capture = {}) {
  return {
    from(table) {
      capture.table = table;
      return {
        select(cols, opts) {
          capture.select = { cols, opts };
          return {
            gte(col, val) {
              capture.gte = { col, val };
              return Promise.resolve({ count, error: null });
            },
            then(resolve) {
              // no gte() call path (sinceTimestamp omitted)
              resolve({ count, error: null });
            },
          };
        },
      };
    },
  };
}

describe('checkFinanceBillingIdle', () => {
  it('reports idle when the scoped count is zero', async () => {
    const supabase = makeFakeSupabase(0);
    const result = await checkFinanceBillingIdle({ sinceTimestamp: '2026-07-17T00:00:00.000Z' }, supabase);
    expect(result.status).toBe('idle');
    expect(result.event_count).toBe(0);
  });

  it('reports active when the scoped count is greater than zero', async () => {
    const supabase = makeFakeSupabase(3);
    const result = await checkFinanceBillingIdle({ sinceTimestamp: '2026-07-17T00:00:00.000Z' }, supabase);
    expect(result.status).toBe('active');
    expect(result.event_count).toBe(3);
  });

  it('scopes the query with gte(event_ts, sinceTimestamp) when provided', async () => {
    const capture = {};
    const supabase = makeFakeSupabase(0, capture);
    await checkFinanceBillingIdle({ sinceTimestamp: '2026-07-17T00:00:00.000Z' }, supabase);
    expect(capture.table).toBe('ops_payment_events');
    expect(capture.gte).toEqual({ col: 'event_ts', val: '2026-07-17T00:00:00.000Z' });
  });

  it('does not scope the query when sinceTimestamp is omitted (fleet-wide production default)', async () => {
    const capture = {};
    const supabase = makeFakeSupabase(0, capture);
    await checkFinanceBillingIdle({}, supabase);
    expect(capture.gte).toBeUndefined();
  });

  it('throws with a descriptive message on a query error', async () => {
    const supabase = {
      from: () => ({
        select: () => Promise.resolve({ count: null, error: { message: 'connection reset' } }),
      }),
    };
    await expect(checkFinanceBillingIdle({}, supabase)).rejects.toThrow(/connection reset/);
  });
});
