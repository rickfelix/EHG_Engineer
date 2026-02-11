/**
 * Unit Tests: Unified Work-Item Router
 * SD-LEO-ENH-IMPLEMENT-TIERED-QUICK-001
 *
 * Test Coverage:
 * - Tier 1/2/3 boundary routing (TS-1, TS-2, TS-3)
 * - Boundary conditions (TS-4)
 * - Risk keyword escalation
 * - DB misconfiguration fail-closed (TS-5)
 * - DB unavailability fallback (TS-6)
 * - Threshold caching
 * - Routing decision contract
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock Supabase before importing router
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

// Mock dotenv
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

// Shared mock Supabase client
const mockSupabase = {
  from: vi.fn(),
};

// Helper to set up mock response
function mockThresholds(data, error = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data, error }),
  };
  mockSupabase.from.mockReturnValue(chain);
  return chain;
}

// Import after mocks are set up
let routeWorkItem, getActiveThresholds, clearThresholdCache;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../../lib/utils/work-item-router.js');
  routeWorkItem = mod.routeWorkItem;
  getActiveThresholds = mod.getActiveThresholds;
  clearThresholdCache = mod.clearThresholdCache;
  clearThresholdCache();
  mockSupabase.from.mockReset();
});

describe('Unified Work-Item Router', () => {

  describe('Tier 1: Auto-approve QF (<=tier1_max_loc)', () => {
    test('routes 10 LOC bug to Tier 1', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({
        estimatedLoc: 10,
        type: 'bug',
        entryPoint: 'create-quick-fix',
      }, mockSupabase);

      expect(decision.tier).toBe(1);
      expect(decision.tierLabel).toBe('TIER_1');
      expect(decision.workItemType).toBe('QUICK_FIX');
      expect(decision.requiresComplianceRubric).toBe(false);
      expect(decision.complianceMinScore).toBeNull();
      expect(decision.requiresLeadReview).toBe(false);
      expect(decision.sdType).toBeNull();
      expect(decision.escalationReason).toBeNull();
      expect(decision.thresholdId).toBe('thresh-1');
    });

    test('routes 0 LOC to Tier 1', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({ estimatedLoc: 0 }, mockSupabase);
      expect(decision.tier).toBe(1);
    });

    test('routes exactly tier1_max_loc to Tier 1 (boundary)', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({ estimatedLoc: 30 }, mockSupabase);
      expect(decision.tier).toBe(1);
      expect(decision.tierLabel).toBe('TIER_1');
    });
  });

  describe('Tier 2: Standard QF with compliance (<=tier2_max_loc)', () => {
    test('routes 50 LOC to Tier 2', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({
        estimatedLoc: 50,
        type: 'polish',
      }, mockSupabase);

      expect(decision.tier).toBe(2);
      expect(decision.tierLabel).toBe('TIER_2');
      expect(decision.workItemType).toBe('QUICK_FIX');
      expect(decision.requiresComplianceRubric).toBe(true);
      expect(decision.complianceMinScore).toBe(70);
      expect(decision.requiresLeadReview).toBe(false);
      expect(decision.sdType).toBeNull();
      expect(decision.escalationReason).toBeNull();
    });

    test('routes tier1_max_loc + 1 to Tier 2 (boundary)', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({ estimatedLoc: 31 }, mockSupabase);
      expect(decision.tier).toBe(2);
    });

    test('routes exactly tier2_max_loc to Tier 2 (boundary)', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({ estimatedLoc: 75 }, mockSupabase);
      expect(decision.tier).toBe(2);
      expect(decision.tierLabel).toBe('TIER_2');
    });
  });

  describe('Tier 3: Full SD workflow (>tier2_max_loc)', () => {
    test('routes 100 LOC to Tier 3', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({
        estimatedLoc: 100,
        type: 'enhancement',
      }, mockSupabase);

      expect(decision.tier).toBe(3);
      expect(decision.tierLabel).toBe('TIER_3');
      expect(decision.workItemType).toBe('STRATEGIC_DIRECTIVE');
      expect(decision.requiresComplianceRubric).toBe(false);
      expect(decision.requiresLeadReview).toBe(true);
      expect(decision.sdType).toBe('enhancement');
      expect(decision.escalationReason).toContain('exceeds Tier 2 max');
    });

    test('routes tier2_max_loc + 1 to Tier 3 (boundary)', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({ estimatedLoc: 76 }, mockSupabase);
      expect(decision.tier).toBe(3);
      expect(decision.tierLabel).toBe('TIER_3');
    });
  });

  describe('Risk keyword escalation', () => {
    test('feature type always escalates to Tier 3', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({
        estimatedLoc: 5,
        type: 'feature',
      }, mockSupabase);

      expect(decision.tier).toBe(3);
      expect(decision.escalationReason).toContain('feature');
    });

    test('security risk tag escalates to Tier 3', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({
        estimatedLoc: 5,
        type: 'bug',
        riskTags: ['security'],
      }, mockSupabase);

      expect(decision.tier).toBe(3);
      expect(decision.escalationReason).toContain('security');
    });

    test('schema keyword in description escalates to Tier 3', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({
        estimatedLoc: 10,
        type: 'bug',
        description: 'Need to alter table to add column',
      }, mockSupabase);

      expect(decision.tier).toBe(3);
      expect(decision.escalationReason).toContain('alter table');
    });

    test('auth keyword in description escalates to Tier 3', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({
        estimatedLoc: 10,
        description: 'Fix authentication bypass in login flow',
      }, mockSupabase);

      expect(decision.tier).toBe(3);
      expect(decision.escalationReason).toContain('auth');
    });

    test('non-risk description does not escalate', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({
        estimatedLoc: 10,
        type: 'bug',
        description: 'Fix button color on dashboard page',
      }, mockSupabase);

      expect(decision.tier).toBe(1);
      expect(decision.escalationReason).toBeNull();
    });
  });

  describe('Database misconfiguration (fail-closed)', () => {
    test('multiple active rows fail-closed to Tier 3', async () => {
      mockThresholds([
        { id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 },
        { id: 'thresh-2', tier1_max_loc: 40, tier2_max_loc: 100 },
      ]);

      const decision = await routeWorkItem({
        estimatedLoc: 10,
        type: 'bug',
      }, mockSupabase);

      // With tier1_max_loc=0 and tier2_max_loc=0, any LOC > 0 → Tier 3
      expect(decision.tier).toBe(3);
    });
  });

  describe('Database unavailability (fallback)', () => {
    test('DB error falls back to default thresholds', async () => {
      mockThresholds(null, { message: 'connection refused' });

      const decision = await routeWorkItem({
        estimatedLoc: 10,
        type: 'bug',
      }, mockSupabase);

      // Default: tier1=30, tier2=75 → 10 LOC is Tier 1
      expect(decision.tier).toBe(1);
      expect(decision.thresholdId).toBe('fallback');
    });

    test('empty result falls back to default thresholds', async () => {
      mockThresholds([]);

      const decision = await routeWorkItem({
        estimatedLoc: 50,
      }, mockSupabase);

      // Default: tier1=30, tier2=75 → 50 LOC is Tier 2
      expect(decision.tier).toBe(2);
      expect(decision.thresholdId).toBe('fallback');
    });
  });

  describe('Threshold caching', () => {
    test('second call uses cached thresholds', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      await routeWorkItem({ estimatedLoc: 10 }, mockSupabase);
      await routeWorkItem({ estimatedLoc: 10 }, mockSupabase);

      // from() should only be called once (second call uses cache)
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    });

    test('clearThresholdCache forces re-fetch', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      await routeWorkItem({ estimatedLoc: 10 }, mockSupabase);
      clearThresholdCache();

      mockThresholds([{ id: 'thresh-2', tier1_max_loc: 20, tier2_max_loc: 60 }]);
      const decision = await routeWorkItem({ estimatedLoc: 10 }, mockSupabase);

      expect(mockSupabase.from).toHaveBeenCalledTimes(2);
      expect(decision.thresholdId).toBe('thresh-2');
    });
  });

  describe('Routing decision contract', () => {
    test('decision includes all required fields', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({
        estimatedLoc: 10,
        type: 'bug',
        entryPoint: 'test',
      }, mockSupabase);

      expect(decision).toHaveProperty('tier');
      expect(decision).toHaveProperty('tierLabel');
      expect(decision).toHaveProperty('workItemType');
      expect(decision).toHaveProperty('requiresComplianceRubric');
      expect(decision).toHaveProperty('complianceMinScore');
      expect(decision).toHaveProperty('requiresLeadReview');
      expect(decision).toHaveProperty('sdType');
      expect(decision).toHaveProperty('thresholdId');
      expect(decision).toHaveProperty('tier1MaxLoc');
      expect(decision).toHaveProperty('tier2MaxLoc');
      expect(decision).toHaveProperty('escalationReason');
      expect(decision).toHaveProperty('decisionLatencyMs');
      expect(typeof decision.decisionLatencyMs).toBe('number');
    });

    test('defaults to 0 estimatedLoc when missing', async () => {
      mockThresholds([{ id: 'thresh-1', tier1_max_loc: 30, tier2_max_loc: 75 }]);

      const decision = await routeWorkItem({}, mockSupabase);
      expect(decision.tier).toBe(1); // 0 LOC → Tier 1
    });
  });

  describe('Custom thresholds', () => {
    test('respects custom tier boundaries from database', async () => {
      mockThresholds([{ id: 'custom-1', tier1_max_loc: 10, tier2_max_loc: 50 }]);

      const d1 = await routeWorkItem({ estimatedLoc: 10 }, mockSupabase);
      expect(d1.tier).toBe(1);

      clearThresholdCache();
      mockThresholds([{ id: 'custom-1', tier1_max_loc: 10, tier2_max_loc: 50 }]);

      const d2 = await routeWorkItem({ estimatedLoc: 11 }, mockSupabase);
      expect(d2.tier).toBe(2);

      clearThresholdCache();
      mockThresholds([{ id: 'custom-1', tier1_max_loc: 10, tier2_max_loc: 50 }]);

      const d3 = await routeWorkItem({ estimatedLoc: 51 }, mockSupabase);
      expect(d3.tier).toBe(3);
    });
  });
});
