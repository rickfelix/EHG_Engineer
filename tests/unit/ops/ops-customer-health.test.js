/**
 * Operations Customer Health Service Tests
 * SD: SD-LEO-INFRA-OPERATIONS-CUSTOMER-HEALTH-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

describe('Operations Customer Health Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('exports HEALTH_DIMENSIONS with 4 dimensions', async () => {
    const { HEALTH_DIMENSIONS } = await import('../../../lib/eva/services/ops-customer-health.js');
    expect(HEALTH_DIMENSIONS).toHaveLength(4);
    expect(HEALTH_DIMENSIONS).toContain('login_frequency');
    expect(HEALTH_DIMENSIONS).toContain('feature_adoption');
    expect(HEALTH_DIMENSIONS).toContain('sentiment');
    expect(HEALTH_DIMENSIONS).toContain('payment');
  });

  it('exports DEFAULT_AT_RISK_THRESHOLD as 40', async () => {
    const { DEFAULT_AT_RISK_THRESHOLD } = await import('../../../lib/eva/services/ops-customer-health.js');
    expect(DEFAULT_AT_RISK_THRESHOLD).toBe(40);
  });

  it('exports createHealthScore function', async () => {
    const { createHealthScore } = await import('../../../lib/eva/services/ops-customer-health.js');
    expect(typeof createHealthScore).toBe('function');
  });

  it('exports getLatestHealthScore function', async () => {
    const { getLatestHealthScore } = await import('../../../lib/eva/services/ops-customer-health.js');
    expect(typeof getLatestHealthScore).toBe('function');
  });

  it('exports listHealthScores function', async () => {
    const { listHealthScores } = await import('../../../lib/eva/services/ops-customer-health.js');
    expect(typeof listHealthScores).toBe('function');
  });

  it('exports getHealthScoreHistory function', async () => {
    const { getHealthScoreHistory } = await import('../../../lib/eva/services/ops-customer-health.js');
    expect(typeof getHealthScoreHistory).toBe('function');
  });

  it('exports detectAtRiskCustomers function', async () => {
    const { detectAtRiskCustomers } = await import('../../../lib/eva/services/ops-customer-health.js');
    expect(typeof detectAtRiskCustomers).toBe('function');
  });

  it('exports createBehavioralFeedEntry function', async () => {
    const { createBehavioralFeedEntry } = await import('../../../lib/eva/services/ops-customer-health.js');
    expect(typeof createBehavioralFeedEntry).toBe('function');
  });

  it('exports listBehavioralFeed function', async () => {
    const { listBehavioralFeed } = await import('../../../lib/eva/services/ops-customer-health.js');
    expect(typeof listBehavioralFeed).toBe('function');
  });
});

describe('Barrel Export includes customer health', () => {
  it('re-exports customer health functions from index', async () => {
    const services = await import('../../../lib/eva/services/index.js');
    expect(typeof services.createHealthScore).toBe('function');
    expect(typeof services.getLatestHealthScore).toBe('function');
    expect(typeof services.listHealthScores).toBe('function');
    expect(typeof services.getHealthScoreHistory).toBe('function');
    expect(typeof services.detectAtRiskCustomers).toBe('function');
    expect(typeof services.createBehavioralFeedEntry).toBe('function');
    expect(typeof services.listBehavioralFeed).toBe('function');
    expect(services.HEALTH_DIMENSIONS).toHaveLength(4);
    expect(services.DEFAULT_AT_RISK_THRESHOLD).toBe(40);
  });
});
