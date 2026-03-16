/**
 * Operations Cost Governance Auto-Throttle Tests
 * SD: SD-LEO-INFRA-OPERATIONS-COST-GOVERNANCE-001
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

describe('Cost Governance Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('exports COST_CATEGORIES with 3 categories', async () => {
    const { COST_CATEGORIES } = await import('../../../lib/eva/services/ops-cost-governance.js');
    expect(COST_CATEGORIES).toEqual(['ai_api', 'infrastructure', 'marketing']);
  });

  it('exports THRESHOLDS with 3 tiers', async () => {
    const { THRESHOLDS } = await import('../../../lib/eva/services/ops-cost-governance.js');
    expect(THRESHOLDS.WARNING).toBe(0.80);
    expect(THRESHOLDS.THROTTLE).toBe(0.90);
    expect(THRESHOLDS.HALT).toBe(1.00);
  });

  it('exports upsertBudget function', async () => {
    const { upsertBudget } = await import('../../../lib/eva/services/ops-cost-governance.js');
    expect(typeof upsertBudget).toBe('function');
  });

  it('exports getBudget function', async () => {
    const { getBudget } = await import('../../../lib/eva/services/ops-cost-governance.js');
    expect(typeof getBudget).toBe('function');
  });

  it('exports recordCostEvent function', async () => {
    const { recordCostEvent } = await import('../../../lib/eva/services/ops-cost-governance.js');
    expect(typeof recordCostEvent).toBe('function');
  });

  it('exports getCurrentSpend function', async () => {
    const { getCurrentSpend } = await import('../../../lib/eva/services/ops-cost-governance.js');
    expect(typeof getCurrentSpend).toBe('function');
  });

  it('exports checkThreshold function', async () => {
    const { checkThreshold } = await import('../../../lib/eva/services/ops-cost-governance.js');
    expect(typeof checkThreshold).toBe('function');
  });

  it('exports checkAllThresholds function', async () => {
    const { checkAllThresholds } = await import('../../../lib/eva/services/ops-cost-governance.js');
    expect(typeof checkAllThresholds).toBe('function');
  });

  it('exports recordOverride function', async () => {
    const { recordOverride } = await import('../../../lib/eva/services/ops-cost-governance.js');
    expect(typeof recordOverride).toBe('function');
  });

  it('exports calculateMargin function', async () => {
    const { calculateMargin } = await import('../../../lib/eva/services/ops-cost-governance.js');
    expect(typeof calculateMargin).toBe('function');
  });
});

describe('Barrel Export includes cost governance', () => {
  it('re-exports cost governance from index', async () => {
    const s = await import('../../../lib/eva/services/index.js');
    expect(typeof s.upsertBudget).toBe('function');
    expect(typeof s.checkThreshold).toBe('function');
    expect(typeof s.checkAllThresholds).toBe('function');
    expect(typeof s.recordOverride).toBe('function');
    expect(typeof s.calculateMargin).toBe('function');
    expect(s.COST_CATEGORIES).toHaveLength(3);
    expect(s.THRESHOLDS.WARNING).toBe(0.80);
  });
});
