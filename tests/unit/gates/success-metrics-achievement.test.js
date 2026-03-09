/**
 * Success Metrics Achievement Gate - Unit Tests
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-053
 *
 * Tests N/A detection and metric scoring logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the gate by importing the factory and providing a mock supabase
const MODULE_PATH = '../../../scripts/modules/handoff/executors/plan-to-lead/gates/success-metrics-achievement.js';

describe('Success Metrics Achievement Gate', () => {
  let createGate;
  let mockSupabase;
  let mockCtx;

  beforeEach(async () => {
    const mod = await import(MODULE_PATH);
    createGate = mod.createSuccessMetricsAchievementGate;

    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Default mock: no children (not orchestrator), feature type, has metrics
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    mockCtx = {
      sd: { id: 'SD-TEST-001', sd_type: 'feature' },
      sdId: 'SD-TEST-001',
    };
  });

  // Helper to set up the chain of mock calls
  function setupMockChain(childCount, profile, sdRecord) {
    let callIndex = 0;
    mockSupabase.from = vi.fn().mockImplementation((table) => {
      const chain = {
        select: vi.fn().mockReturnValue(chain),
        eq: vi.fn().mockReturnValue(chain),
        single: vi.fn(),
      };

      if (table === 'strategic_directives_v2' && callIndex === 0) {
        // First call: check for children
        callIndex++;
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue({
          then: (cb) => cb({ data: childCount > 0 ? new Array(childCount).fill({ id: 'child' }) : [] }),
          data: childCount > 0 ? new Array(childCount).fill({ id: 'child' }) : [],
        });
        // Make it resolving
        chain.eq = vi.fn().mockResolvedValue({
          data: childCount > 0 ? new Array(childCount).fill({ id: 'child' }) : [],
        });
        return chain;
      }

      if (table === 'sd_type_validation_profiles') {
        chain.single = vi.fn().mockResolvedValue({ data: profile });
        return chain;
      }

      if (table === 'strategic_directives_v2') {
        chain.single = vi.fn().mockResolvedValue({ data: sdRecord, error: null });
        return chain;
      }

      return chain;
    });
  }

  it('should score N/A actual values at 75 instead of 0', async () => {
    // Build a supabase mock that handles the three sequential queries
    const metrics = [
      { metric: 'Test coverage', target: '>=80%', actual: '95%' },
      { metric: 'Performance gain', target: '>=10%', actual: 'N/A' },
      { metric: 'User satisfaction', target: '>=4/5', actual: 'n/a' },
    ];

    let queryCount = 0;
    const fromMock = vi.fn().mockImplementation(() => {
      queryCount++;
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };

      if (queryCount === 1) {
        // Children check → no children
        chain.eq = vi.fn().mockResolvedValue({ data: [] });
        return chain;
      }
      if (queryCount === 2) {
        // sd_type_validation_profiles → requires user stories
        chain.single = vi.fn().mockResolvedValue({ data: { requires_user_stories: true } });
        return chain;
      }
      if (queryCount === 3) {
        // SD record with success_metrics
        chain.single = vi.fn().mockResolvedValue({ data: { success_metrics: metrics }, error: null });
        return chain;
      }
      return chain;
    });

    mockSupabase.from = fromMock;

    const gate = createGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    // With 100 + 75 + 75 = 250 / 3 = 83 → should pass (>= 70)
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
    // No issues should be reported for N/A values
    expect(result.issues).toHaveLength(0);
    expect(result.details.has_empty_actual).toBe(false);
  });

  it('should still fail metrics with truly empty actual values', async () => {
    const metrics = [
      { metric: 'Test coverage', target: '>=80%', actual: null },
      { metric: 'Performance', target: '>=10%', actual: '' },
    ];

    let queryCount = 0;
    mockSupabase.from = vi.fn().mockImplementation(() => {
      queryCount++;
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };

      if (queryCount === 1) {
        chain.eq = vi.fn().mockResolvedValue({ data: [] });
        return chain;
      }
      if (queryCount === 2) {
        chain.single = vi.fn().mockResolvedValue({ data: { requires_user_stories: true } });
        return chain;
      }
      if (queryCount === 3) {
        chain.single = vi.fn().mockResolvedValue({ data: { success_metrics: metrics }, error: null });
        return chain;
      }
      return chain;
    });

    const gate = createGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result.passed).toBe(false);
    expect(result.details.has_empty_actual).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('should recognize various N/A patterns', async () => {
    const naVariants = ['N/A', 'n/a', 'NA', 'Not applicable', 'not measured', 'Deferred', 'SKIPPED'];

    for (const variant of naVariants) {
      const metrics = [{ metric: 'Test metric', target: '>=80%', actual: variant }];

      let queryCount = 0;
      mockSupabase.from = vi.fn().mockImplementation(() => {
        queryCount++;
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(),
        };

        if (queryCount === 1) {
          chain.eq = vi.fn().mockResolvedValue({ data: [] });
          return chain;
        }
        if (queryCount === 2) {
          chain.single = vi.fn().mockResolvedValue({ data: { requires_user_stories: true } });
          return chain;
        }
        if (queryCount === 3) {
          chain.single = vi.fn().mockResolvedValue({ data: { success_metrics: metrics }, error: null });
          return chain;
        }
        return chain;
      });

      const gate = createGate(mockSupabase);
      const result = await gate.validator(mockCtx);

      expect(result.passed, `N/A variant "${variant}" should pass`).toBe(true);
      expect(result.score, `N/A variant "${variant}" should score 75`).toBe(75);
    }
  });

  it('should bypass for infrastructure SD types', async () => {
    let queryCount = 0;
    mockSupabase.from = vi.fn().mockImplementation(() => {
      queryCount++;
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };

      if (queryCount === 1) {
        chain.eq = vi.fn().mockResolvedValue({ data: [] });
        return chain;
      }
      if (queryCount === 2) {
        // infrastructure type → requires_user_stories = false → bypass
        chain.single = vi.fn().mockResolvedValue({ data: { requires_user_stories: false } });
        return chain;
      }
      return chain;
    });

    mockCtx.sd.sd_type = 'infrastructure';
    const gate = createGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });
});
