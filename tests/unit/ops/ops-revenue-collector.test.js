import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeRevenueMetrics } from '../../../lib/eva/services/ops-revenue-collector.js';

describe('Operations Revenue Collector', () => {
  const VENTURE_ID = '00000000-0000-0000-0000-000000000001';
  const DATE = '2026-03-15';

  function mockSupabase(ventureData, transactionData) {
    return {
      from: vi.fn((table) => {
        if (table === 'ventures') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: ventureData, error: null }),
              }),
            }),
          };
        }
        if (table === 'capital_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: transactionData, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };
  }

  it('computes zero metrics when no transactions exist', async () => {
    const sb = mockSupabase({ metadata: {} }, []);
    const result = await computeRevenueMetrics({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result.venture_id).toBe(VENTURE_ID);
    expect(result.metric_date).toBe(DATE);
    expect(result.mrr).toBe(0);
    expect(result.churn_rate).toBe(0);
    expect(result.expansion_revenue).toBe(0);
    expect(result.contraction_revenue).toBe(0);
    expect(result.failed_payments).toBe(0);
  });

  it('computes MRR from revenue transactions', async () => {
    const txns = [
      { amount: 500, transaction_type: 'revenue', status: 'completed', created_at: DATE },
      { amount: 300, transaction_type: 'revenue', status: 'completed', created_at: DATE },
    ];
    const sb = mockSupabase({ metadata: {} }, txns);
    const result = await computeRevenueMetrics({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result.mrr).toBe(800);
  });

  it('accounts for expansion and contraction', async () => {
    const txns = [
      { amount: 1000, transaction_type: 'revenue', status: 'completed', created_at: DATE },
      { amount: 200, transaction_type: 'expansion', status: 'completed', created_at: DATE },
      { amount: 100, transaction_type: 'contraction', status: 'completed', created_at: DATE },
    ];
    const sb = mockSupabase({ metadata: {} }, txns);
    const result = await computeRevenueMetrics({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result.mrr).toBe(1100); // 1000 + 200 - 100
    expect(result.expansion_revenue).toBe(200);
    expect(result.contraction_revenue).toBe(100);
  });

  it('counts failed payments', async () => {
    const txns = [
      { amount: 100, transaction_type: 'revenue', status: 'failed', created_at: DATE },
      { amount: 200, transaction_type: 'revenue', status: 'failed', created_at: DATE },
      { amount: 500, transaction_type: 'revenue', status: 'completed', created_at: DATE },
    ];
    const sb = mockSupabase({ metadata: {} }, txns);
    const result = await computeRevenueMetrics({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result.failed_payments).toBe(2);
    expect(result.mrr).toBe(500);
  });

  it('computes churn rate as contraction / total revenue', async () => {
    const txns = [
      { amount: 800, transaction_type: 'revenue', status: 'completed', created_at: DATE },
      { amount: 200, transaction_type: 'expansion', status: 'completed', created_at: DATE },
      { amount: 100, transaction_type: 'contraction', status: 'completed', created_at: DATE },
    ];
    const sb = mockSupabase({ metadata: {} }, txns);
    const result = await computeRevenueMetrics({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    // churn = 100 / (800 + 200) = 0.1
    expect(result.churn_rate).toBe(0.1);
  });

  it('includes targets from venture metadata', async () => {
    const venture = { metadata: { financial_targets: { target_mrr: 5000, target_churn_rate: 0.05, ltv_cac: 3.5 } } };
    const sb = mockSupabase(venture, []);
    const result = await computeRevenueMetrics({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result.target_mrr).toBe(5000);
    expect(result.target_churn_rate).toBe(0.05);
    expect(result.ltv_cac).toBe(3.5);
  });

  it('handles null venture metadata gracefully', async () => {
    const sb = mockSupabase(null, []);
    const result = await computeRevenueMetrics({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result.mrr).toBe(0);
    expect(result.target_mrr).toBeNull();
  });
});
