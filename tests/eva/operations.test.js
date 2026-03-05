/**
 * Unit Tests for EVA Operations Module
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockSupabase(overrides = {}) {
  const defaultChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
  };

  return {
    from: vi.fn(() => ({ ...defaultChain, ...overrides })),
  };
}

describe('EVA Operations Module', () => {
  describe('getOperationsStatus', () => {
    it('returns aggregated status from all subsystems', async () => {
      const mockSupabase = createMockSupabase();
      const { getOperationsStatus } = await import('../../lib/eva/operations/index.js');

      const status = await getOperationsStatus({ supabase: mockSupabase, logger: { info: vi.fn(), warn: vi.fn() } });

      expect(status).toHaveProperty('timestamp');
      expect(status).toHaveProperty('subsystems');
      expect(status).toHaveProperty('overall');
      expect(status.subsystems).toHaveProperty('health');
      expect(status.subsystems).toHaveProperty('metrics');
      expect(status.subsystems).toHaveProperty('feedback');
      expect(status.subsystems).toHaveProperty('enhancements');
      expect(status.subsystems).toHaveProperty('financial');
      expect(status.subsystems).toHaveProperty('scheduler');
    });

    it('returns status even without supabase client', async () => {
      const { getOperationsStatus } = await import('../../lib/eva/operations/index.js');

      const status = await getOperationsStatus({ logger: { info: vi.fn(), warn: vi.fn() } });

      expect(status).toHaveProperty('timestamp');
      expect(status).toHaveProperty('subsystems');
      // Subsystems without supabase should return no-client status
      expect(status.subsystems.metrics.status).toBe('no-client');
      expect(status.subsystems.feedback.status).toBe('no-client');
    });

    it('handles subsystem errors gracefully', async () => {
      const mockSupabase = {
        from: vi.fn(() => {
          throw new Error('connection failed');
        }),
      };
      const { getOperationsStatus } = await import('../../lib/eva/operations/index.js');

      const status = await getOperationsStatus({ supabase: mockSupabase, logger: { info: vi.fn(), warn: vi.fn() } });

      expect(status).toHaveProperty('timestamp');
      expect(status).toHaveProperty('subsystems');
      // Should not throw, errors captured in results
    });
  });
});

describe('Operations Domain Handler', () => {
  it('registers all 6 operations workers', async () => {
    const { registerOperationsHandlers } = await import('../../lib/eva/operations/domain-handler.js');

    const registered = {};
    const mockRegistry = {
      register: vi.fn((name, handler) => {
        registered[name] = handler;
      }),
    };

    registerOperationsHandlers(mockRegistry);

    expect(mockRegistry.register).toHaveBeenCalledTimes(6);
    expect(registered).toHaveProperty('ops_financial_sync');
    expect(registered).toHaveProperty('ops_feedback_classify');
    expect(registered).toHaveProperty('ops_metrics_collect');
    expect(registered).toHaveProperty('ops_health_score');
    expect(registered).toHaveProperty('ops_enhancement_detect');
    expect(registered).toHaveProperty('ops_status_snapshot');
  });

  it('exports cadence configuration for all workers', async () => {
    const { OPERATIONS_CADENCES } = await import('../../lib/eva/operations/domain-handler.js');

    expect(OPERATIONS_CADENCES).toHaveProperty('ops_financial_sync', 'hourly');
    expect(OPERATIONS_CADENCES).toHaveProperty('ops_feedback_classify', 'frequent');
    expect(OPERATIONS_CADENCES).toHaveProperty('ops_metrics_collect', 'six_hourly');
    expect(OPERATIONS_CADENCES).toHaveProperty('ops_health_score', 'hourly');
    expect(OPERATIONS_CADENCES).toHaveProperty('ops_enhancement_detect', 'daily');
    expect(OPERATIONS_CADENCES).toHaveProperty('ops_status_snapshot', 'hourly');
  });
});
