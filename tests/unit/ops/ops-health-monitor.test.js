import { describe, it, expect, vi } from 'vitest';
import {
  computeProductHealth,
  computeAgentHealth,
  getHealthSummary,
} from '../../../lib/eva/services/ops-health-monitor.js';

const VENTURE_ID = '00000000-0000-0000-0000-000000000001';
const AGENT_ID = '00000000-0000-0000-0000-000000000099';
const DATE = '2026-03-16';

/**
 * Build a mock Supabase client that returns configured data per table.
 */
function mockSupabase(tableData = {}) {
  const chainMethods = (resolvedValue) => {
    const chain = {};
    const methods = ['select', 'eq', 'gte', 'lte', 'in', 'order', 'limit', 'single'];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // Terminal: calling any method eventually resolves
    chain.single = vi.fn().mockResolvedValue(resolvedValue);
    // For non-single queries, make the chain itself thenable
    chain.then = (resolve) => resolve(resolvedValue);
    return chain;
  };

  return {
    from: vi.fn((table) => {
      const data = tableData[table];
      if (data !== undefined) {
        // If data is an array, return as list; if object, return as single
        const isArray = Array.isArray(data);
        const resolved = { data, error: null };
        return chainMethods(resolved);
      }
      return chainMethods({ data: null, error: null });
    }),
  };
}

describe('computeProductHealth', () => {
  it('returns null metrics when no telemetry data exists', async () => {
    const sb = mockSupabase({ service_telemetry: [] });
    const result = await computeProductHealth({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result.venture_id).toBe(VENTURE_ID);
    expect(result.metric_date).toBe(DATE);
    expect(result.uptime_pct).toBeNull();
    expect(result.p95_latency_ms).toBeNull();
    expect(result.error_rate).toBeNull();
    expect(result.total_requests).toBe(0);
  });

  it('computes uptime from successful/total outcomes', async () => {
    const rows = [
      { outcome: 'success', processing_time_ms: 100 },
      { outcome: 'success', processing_time_ms: 200 },
      { outcome: 'success', processing_time_ms: 150 },
      { outcome: 'error', processing_time_ms: 50 },
      { outcome: 'success', processing_time_ms: 300 },
    ];
    const sb = mockSupabase({ service_telemetry: rows });
    const result = await computeProductHealth({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result.uptime_pct).toBe(80.00); // 4/5 = 80%
    expect(result.error_rate).toBe(0.2000); // 1/5 = 0.20
    expect(result.total_requests).toBe(5);
    expect(result.successful_requests).toBe(4);
    expect(result.error_requests).toBe(1);
  });

  it('computes P95 latency correctly', async () => {
    // 20 rows: latencies 10, 20, 30, ..., 200
    const rows = Array.from({ length: 20 }, (_, i) => ({
      outcome: 'success',
      processing_time_ms: (i + 1) * 10,
    }));
    const sb = mockSupabase({ service_telemetry: rows });
    const result = await computeProductHealth({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    // P95 of [10..200]: index = ceil(20 * 0.95) - 1 = 19 - 1 = 18, value = 190
    expect(result.p95_latency_ms).toBe(190);
    expect(result.uptime_pct).toBe(100.00);
  });

  it('handles null processing_time_ms gracefully', async () => {
    const rows = [
      { outcome: 'success', processing_time_ms: null },
      { outcome: 'success', processing_time_ms: 100 },
    ];
    const sb = mockSupabase({ service_telemetry: rows });
    const result = await computeProductHealth({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result.p95_latency_ms).toBe(100);
    expect(result.uptime_pct).toBe(100.00);
  });

  it('counts failure outcomes as errors', async () => {
    const rows = [
      { outcome: 'success', processing_time_ms: 100 },
      { outcome: 'failure', processing_time_ms: 50 },
    ];
    const sb = mockSupabase({ service_telemetry: rows });
    const result = await computeProductHealth({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result.error_requests).toBe(1);
    expect(result.error_rate).toBe(0.5000);
  });
});

describe('computeAgentHealth', () => {
  it('returns empty array when no tool quotas exist', async () => {
    const sb = mockSupabase({
      venture_tool_quotas: [],
      venture_token_budgets: [],
    });
    const result = await computeAgentHealth({ ventureId: VENTURE_ID, date: DATE, supabase: sb });
    expect(result).toEqual([]);
  });

  it('computes cost per action and quota utilization', async () => {
    const quotas = [{
      tool_id: AGENT_ID,
      daily_limit: 100,
      monthly_limit: 1000,
      cost_limit_usd: 50,
      usage_today: 20,
      usage_this_month: 500,
      cost_this_month_usd: 25.00,
    }];
    const budgets = [{
      budget_allocated: 10000,
      budget_remaining: 7500,
    }];

    const sb = mockSupabase({
      venture_tool_quotas: quotas,
      venture_token_budgets: budgets,
    });
    const result = await computeAgentHealth({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result).toHaveLength(1);
    expect(result[0].agent_id).toBe(AGENT_ID);
    expect(result[0].cost_per_action_usd).toBe(0.05); // 25/500
    expect(result[0].quota_utilization_pct).toBe(50.00); // 500/1000 * 100
    expect(result[0].budget_remaining_pct).toBe(75.00); // 7500/10000 * 100
  });

  it('handles zero usage without division error', async () => {
    const quotas = [{
      tool_id: AGENT_ID,
      monthly_limit: 1000,
      usage_this_month: 0,
      cost_this_month_usd: 0,
    }];

    const sb = mockSupabase({
      venture_tool_quotas: quotas,
      venture_token_budgets: [],
    });
    const result = await computeAgentHealth({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result[0].cost_per_action_usd).toBe(0);
    expect(result[0].quota_utilization_pct).toBe(0);
  });

  it('handles zero monthly limit without division error', async () => {
    const quotas = [{
      tool_id: AGENT_ID,
      monthly_limit: 0,
      usage_this_month: 100,
      cost_this_month_usd: 5,
    }];

    const sb = mockSupabase({
      venture_tool_quotas: quotas,
      venture_token_budgets: [],
    });
    const result = await computeAgentHealth({ ventureId: VENTURE_ID, date: DATE, supabase: sb });

    expect(result[0].quota_utilization_pct).toBe(0);
    expect(result[0].cost_per_action_usd).toBe(0.05);
  });
});

describe('getHealthSummary', () => {
  it('returns green status when no open alerts exist', async () => {
    const sb = mockSupabase({ ops_health_alerts: [] });
    const result = await getHealthSummary({ ventureId: VENTURE_ID, supabase: sb });

    expect(result.product_status).toBe('green');
    expect(result.agent_status).toBe('green');
    expect(result.alert_count).toBe(0);
  });

  it('returns yellow when warning alerts exist', async () => {
    const alerts = [
      { venture_id: VENTURE_ID, layer: 'product', severity: 'warning' },
    ];
    const sb = mockSupabase({ ops_health_alerts: alerts });
    const result = await getHealthSummary({ ventureId: VENTURE_ID, supabase: sb });

    expect(result.product_status).toBe('yellow');
    expect(result.agent_status).toBe('green');
    expect(result.alert_count).toBe(1);
  });

  it('returns red when critical alerts exist', async () => {
    const alerts = [
      { venture_id: VENTURE_ID, layer: 'agent', severity: 'critical' },
    ];
    const sb = mockSupabase({ ops_health_alerts: alerts });
    const result = await getHealthSummary({ ventureId: VENTURE_ID, supabase: sb });

    expect(result.product_status).toBe('green');
    expect(result.agent_status).toBe('red');
    expect(result.alert_count).toBe(1);
  });

  it('returns red for emergency alerts', async () => {
    const alerts = [
      { venture_id: VENTURE_ID, layer: 'product', severity: 'emergency' },
      { venture_id: VENTURE_ID, layer: 'product', severity: 'critical' },
    ];
    const sb = mockSupabase({ ops_health_alerts: alerts });
    const result = await getHealthSummary({ ventureId: VENTURE_ID, supabase: sb });

    expect(result.product_status).toBe('red');
    expect(result.alert_count).toBe(2);
  });
});
