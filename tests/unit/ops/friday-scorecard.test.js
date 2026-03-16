import { describe, it, expect, vi } from 'vitest';
import {
  generateScorecard,
  scheduleAssessments,
  getAgendaItems,
} from '../../../lib/eva/services/friday-scorecard.js';

const VENTURE_ID = '00000000-0000-0000-0000-000000000001';
const WEEK = '2026-03-16';

function mockSupabase(tableData = {}) {
  const chainMethods = (resolvedValue) => {
    const chain = {};
    const methods = ['select', 'eq', 'gte', 'lte', 'in', 'order', 'limit', 'single', 'upsert'];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.single = vi.fn().mockResolvedValue(resolvedValue);
    chain.then = (resolve) => resolve(resolvedValue);
    return chain;
  };

  return {
    from: vi.fn((table) => {
      const data = tableData[table];
      if (data !== undefined) {
        return chainMethods({ data, error: null });
      }
      return chainMethods({ data: null, error: null });
    }),
  };
}

describe('generateScorecard', () => {
  it('returns all-green scorecard when no alerts exist', async () => {
    const sb = mockSupabase({
      ops_health_alerts: [],
      ops_revenue_alerts: [],
      ops_customer_health_scores: [],
      ops_friday_scorecards: null,
    });
    const result = await generateScorecard({ ventureId: VENTURE_ID, weekDate: WEEK, supabase: sb });

    expect(result.revenue_status).toBe('green');
    expect(result.product_status).toBe('green');
    expect(result.agent_status).toBe('green');
    expect(result.customer_status).toBe('grey'); // No data
    expect(result.cost_status).toBe('grey'); // Not implemented
    expect(result.overall_status).toBe('green'); // green is worst active status; grey = unavailable
    expect(result.alert_count).toBe(0);
  });

  it('returns red overall when critical health alert exists', async () => {
    const sb = mockSupabase({
      ops_health_alerts: [{ layer: 'product', severity: 'critical' }],
      ops_revenue_alerts: [],
      ops_customer_health_scores: [],
      ops_friday_scorecards: null,
    });
    const result = await generateScorecard({ ventureId: VENTURE_ID, weekDate: WEEK, supabase: sb });

    expect(result.product_status).toBe('red');
    expect(result.overall_status).toBe('red');
  });

  it('returns yellow when only warning alerts exist', async () => {
    const sb = mockSupabase({
      ops_health_alerts: [{ layer: 'agent', severity: 'warning' }],
      ops_revenue_alerts: [{ severity: 'warning' }],
      ops_customer_health_scores: [{ health_score: 80 }],
      ops_friday_scorecards: null,
    });
    const result = await generateScorecard({ ventureId: VENTURE_ID, weekDate: WEEK, supabase: sb });

    expect(result.agent_status).toBe('yellow');
    expect(result.revenue_status).toBe('yellow');
    expect(result.customer_status).toBe('green'); // 80 > 70
  });

  it('counts alerts from both health and revenue domains', async () => {
    const sb = mockSupabase({
      ops_health_alerts: [
        { layer: 'product', severity: 'warning' },
        { layer: 'agent', severity: 'critical' },
      ],
      ops_revenue_alerts: [{ severity: 'warning' }],
      ops_customer_health_scores: [],
      ops_friday_scorecards: null,
    });
    const result = await generateScorecard({ ventureId: VENTURE_ID, weekDate: WEEK, supabase: sb });

    expect(result.alert_count).toBe(3);
  });

  it('shows red customer status when health scores are low', async () => {
    const sb = mockSupabase({
      ops_health_alerts: [],
      ops_revenue_alerts: [],
      ops_customer_health_scores: [
        { health_score: 30 },
        { health_score: 35 },
      ],
      ops_friday_scorecards: null,
    });
    const result = await generateScorecard({ ventureId: VENTURE_ID, weekDate: WEEK, supabase: sb });

    expect(result.customer_status).toBe('red'); // avg 32.5 < 40
  });
});

describe('scheduleAssessments', () => {
  it('creates 4 assessment types for a quarter', async () => {
    const inserted = [];
    const sb = {
      from: vi.fn(() => ({
        upsert: vi.fn((data) => {
          inserted.push(...data);
          return {
            select: vi.fn().mockResolvedValue({ data, error: null }),
          };
        }),
      })),
    };

    const result = await scheduleAssessments({ ventureId: VENTURE_ID, quarter: '2026-Q2', supabase: sb });

    expect(inserted).toHaveLength(4);
    const types = inserted.map(a => a.assessment_type).sort();
    expect(types).toEqual([
      'competitive_landscape',
      'exit_readiness',
      'financial_health',
      'risk_recalibration',
    ]);
    expect(inserted[0].status).toBe('scheduled');
    expect(inserted[0].quarter).toBe('2026-Q2');
  });
});

describe('getAgendaItems', () => {
  it('returns empty array when no alerts or overdue assessments', async () => {
    const sb = mockSupabase({
      ops_health_alerts: [],
      ops_quarterly_assessments: [],
    });
    const result = await getAgendaItems({ ventureId: VENTURE_ID, supabase: sb });
    expect(result).toEqual([]);
  });

  it('prioritizes emergency alerts over critical', async () => {
    const sb = mockSupabase({
      ops_health_alerts: [
        { id: '1', venture_id: VENTURE_ID, layer: 'product', metric_type: 'uptime', severity: 'critical', actual_value: 98.5, threshold_value: 99.0, created_at: '2026-03-16' },
        { id: '2', venture_id: VENTURE_ID, layer: 'product', metric_type: 'uptime', severity: 'emergency', actual_value: 95.0, threshold_value: 99.0, created_at: '2026-03-16' },
      ],
      ops_quarterly_assessments: [],
    });
    const result = await getAgendaItems({ ventureId: VENTURE_ID, supabase: sb });

    expect(result).toHaveLength(2);
    expect(result[0].priority).toBe(0); // emergency first
    expect(result[1].priority).toBe(1); // critical second
  });

  it('includes overdue assessments after alerts', async () => {
    const sb = mockSupabase({
      ops_health_alerts: [
        { id: '1', venture_id: VENTURE_ID, layer: 'agent', metric_type: 'quota', severity: 'critical', actual_value: 96, threshold_value: 95, created_at: '2026-03-16' },
      ],
      ops_quarterly_assessments: [
        { id: '2', venture_id: VENTURE_ID, assessment_type: 'risk_recalibration', quarter: '2026-Q1', scheduled_date: '2026-03-01' },
      ],
    });
    const result = await getAgendaItems({ ventureId: VENTURE_ID, supabase: sb });

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('alert');
    expect(result[1].type).toBe('overdue_assessment');
  });
});
