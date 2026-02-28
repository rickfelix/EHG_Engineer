/**
 * Portfolio Risk Aggregation Tests
 * Part of SD-MAN-GEN-CORRECTIVE-VISION-GAP-003
 *
 * Tests the aggregatePortfolioRisk() method added to PortfolioCalibrator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dotenv and supabase before importing the module
vi.mock('dotenv/config', () => ({}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

let mockSupabase;

function setupMockSupabase(ventures = [], events = [], multipliers = []) {
  const ventureResponse = { data: ventures, error: null };
  const eventResponse = { data: events[0] || null, error: null };
  const multiplierResponse = { data: multipliers, error: null };

  mockSupabase = {
    from: vi.fn((table) => {
      if (table === 'ventures') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(ventureResponse),
          }),
        };
      }
      if (table === 'system_events') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue(eventResponse),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'vertical_complexity_multipliers') {
        return {
          select: vi.fn().mockResolvedValue(multiplierResponse),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) };
    }),
  };

  return mockSupabase;
}

describe('PortfolioCalibrator.aggregatePortfolioRisk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns low risk when all ventures are healthy', async () => {
    setupMockSupabase(
      [{ id: 'v1', name: 'TestVenture', vertical_category: 'logistics', current_lifecycle_stage: 'growth', metadata: {} }],
      [{ calibration_delta: 0.05 }]
    );

    const { PortfolioCalibrator } = await import('../../../lib/governance/portfolio-calibrator.js');
    const calibrator = new PortfolioCalibrator();
    const result = await calibrator.aggregatePortfolioRisk();

    expect(result.success).toBe(true);
    expect(result.riskLevel).toBe('low');
    expect(result.riskScore).toBeLessThanOrEqual(15);
    expect(result.ventureRisks).toHaveLength(1);
    expect(result.breakdown.total_ventures).toBe(1);
  });

  it('returns correct structure with breakdown', async () => {
    setupMockSupabase(
      [{ id: 'v1', name: 'TestVenture', vertical_category: 'other', current_lifecycle_stage: 'mvp', metadata: {} }],
      [{ calibration_delta: 0.3 }]
    );

    const { PortfolioCalibrator } = await import('../../../lib/governance/portfolio-calibrator.js');
    const calibrator = new PortfolioCalibrator();
    const result = await calibrator.aggregatePortfolioRisk();

    expect(result).toHaveProperty('riskScore');
    expect(result).toHaveProperty('riskLevel');
    expect(result).toHaveProperty('ventureRisks');
    expect(result).toHaveProperty('breakdown');
    expect(result.breakdown).toHaveProperty('red_ventures');
    expect(result.breakdown).toHaveProperty('yellow_ventures');
    expect(result.breakdown).toHaveProperty('green_ventures');
    expect(result.breakdown).toHaveProperty('avg_risk_adjusted_delta');
  });
});
