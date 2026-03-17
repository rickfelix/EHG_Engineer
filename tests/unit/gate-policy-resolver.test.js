/**
 * Comprehensive unit tests for Gate Policy Resolver
 * scripts/modules/handoff/gate-policy-resolver.js (234 lines)
 *
 * Tests:
 * - applyGatePolicies() filtering based on DB policies
 * - fetchPolicies() caching (cached within TTL, refetched after TTL)
 * - resolveGatePolicy() precedence matching (4 levels)
 * - invalidatePolicyCache() clears cache
 * - DB timeout fallback (fail-open: all gates included when DB unavailable)
 * - getGatePolicyMetrics() and resetGatePolicyMetrics()
 * - Feature flag FF_GATE_POLICY_REGISTRY disabled = all gates pass through
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  applyGatePolicies,
  getGatePolicyMetrics,
  resetGatePolicyMetrics,
  invalidatePolicyCache
} from '../../scripts/modules/handoff/gate-policy-resolver.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockGates = [
  { name: 'GATE_PRD_EXISTS', validator: vi.fn(), required: true },
  { name: 'GATE1_DESIGN_DATABASE', validator: vi.fn(), required: true },
  { name: 'GATE_ARCHITECTURE_VERIFICATION', validator: vi.fn(), required: true },
  { name: 'GATE_EXPLORATION_AUDIT', validator: vi.fn(), required: true },
  { name: 'GATE6_BRANCH_ENFORCEMENT', validator: vi.fn(), required: true }
];

// ---------------------------------------------------------------------------
// Mock Supabase factories
// ---------------------------------------------------------------------------

/** Creates a mock Supabase client that returns given policies */
function createMockSupabase(policies = []) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        abortSignal: vi.fn().mockResolvedValue({ data: policies, error: null })
      })
    })
  };
}

/** Creates a mock Supabase client that returns a DB error */
function createErrorSupabase(message = 'DB connection failed') {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        abortSignal: vi.fn().mockResolvedValue({ data: null, error: { message } })
      })
    })
  };
}

/** Creates a mock Supabase client that throws (simulates timeout/abort) */
function createThrowingSupabase(errorName = 'AbortError') {
  const err = new Error('Aborted');
  err.name = errorName;
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        abortSignal: vi.fn().mockRejectedValue(err)
      })
    })
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Gate Policy Resolver', () => {
  let savedEnv;

  beforeEach(() => {
    resetGatePolicyMetrics();
    invalidatePolicyCache();
    // Save env vars we might modify
    savedEnv = {
      FF_GATE_POLICY_REGISTRY: process.env.FF_GATE_POLICY_REGISTRY
    };
  });

  afterEach(() => {
    // Restore env
    if (savedEnv.FF_GATE_POLICY_REGISTRY === undefined) {
      delete process.env.FF_GATE_POLICY_REGISTRY;
    } else {
      process.env.FF_GATE_POLICY_REGISTRY = savedEnv.FF_GATE_POLICY_REGISTRY;
    }
  });

  // =========================================================================
  // Feature flag FF_GATE_POLICY_REGISTRY
  // =========================================================================
  describe('feature flag FF_GATE_POLICY_REGISTRY', () => {
    it('should return all gates unfiltered when feature flag is "false"', async () => {
      process.env.FF_GATE_POLICY_REGISTRY = 'false';
      const supabase = createMockSupabase([]);

      const result = await applyGatePolicies(supabase, mockGates, { sdType: 'uat' });

      expect(result.filteredGates).toHaveLength(mockGates.length);
      expect(result.filteredGates).toEqual(mockGates);
      expect(result.resolutions).toEqual([]);
      expect(result.fallbackUsed).toBe(false);
      // Should NOT hit the database at all
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('should enable gate policy resolution when flag is unset (default: enabled)', async () => {
      delete process.env.FF_GATE_POLICY_REGISTRY;
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'UAT exempt' }
      ];
      const supabase = createMockSupabase(policies);

      const result = await applyGatePolicies(supabase, mockGates, { sdType: 'uat' });

      // One gate disabled
      expect(result.filteredGates).toHaveLength(4);
    });

    it('should enable gate policy resolution when flag is "true"', async () => {
      process.env.FF_GATE_POLICY_REGISTRY = 'true';
      const supabase = createMockSupabase([]);

      const result = await applyGatePolicies(supabase, mockGates, { sdType: 'feature' });

      // No policies → all gates included, but DB was queried
      expect(result.filteredGates).toHaveLength(mockGates.length);
      expect(supabase.from).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // applyGatePolicies — filtering
  // =========================================================================
  describe('applyGatePolicies filtering', () => {
    it('should disable gates matching sd_type policy', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'UAT exempt' },
        { gate_key: 'GATE1_DESIGN_DATABASE', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'UAT exempt' },
        { gate_key: 'GATE_EXPLORATION_AUDIT', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'UAT exempt' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, mockGates, {
        sdType: 'uat',
        sdId: 'SD-TEST-001'
      });

      expect(result.filteredGates).toHaveLength(2);
      expect(result.filteredGates.map(g => g.name)).toEqual([
        'GATE_ARCHITECTURE_VERIFICATION',
        'GATE6_BRANCH_ENFORCEMENT'
      ]);
      expect(result.fallbackUsed).toBe(false);
    });

    it('should include gates with REQUIRED applicability', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'feature', validation_profile: null, applicability: 'REQUIRED', reason: 'Always required for features' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'feature'
      });

      expect(result.filteredGates).toHaveLength(1);
      expect(result.filteredGates[0].name).toBe('GATE_PRD_EXISTS');
    });

    it('should include gates with OPTIONAL applicability', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'spike', validation_profile: null, applicability: 'OPTIONAL', reason: 'Optional for spikes' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'spike'
      });

      expect(result.filteredGates).toHaveLength(1);
    });

    it('should include gates with no matching policy (fail-open default)', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'UAT only' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, mockGates, {
        sdType: 'feature',
        sdId: 'SD-FEATURE-001'
      });

      // No policies match 'feature' → all gates included
      expect(result.filteredGates).toHaveLength(mockGates.length);
    });

    it('should handle empty gates array', async () => {
      const supabase = createMockSupabase([]);
      const result = await applyGatePolicies(supabase, [], { sdType: 'feature' });

      expect(result.filteredGates).toHaveLength(0);
      expect(result.resolutions).toEqual([]);
    });

    it('should handle empty policies from DB', async () => {
      const supabase = createMockSupabase([]);
      const result = await applyGatePolicies(supabase, mockGates, { sdType: 'feature' });

      expect(result.filteredGates).toHaveLength(mockGates.length);
    });

    it('should normalize sdType to lowercase', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'infrastructure', validation_profile: null, applicability: 'DISABLED', reason: 'Infra exempt' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'Infrastructure'  // Mixed case
      });

      // Should match because applyGatePolicies lowercases sdType
      expect(result.filteredGates).toHaveLength(0);
    });

    it('should handle missing context gracefully', async () => {
      const supabase = createMockSupabase([]);
      const result = await applyGatePolicies(supabase, mockGates); // no context

      expect(result.filteredGates).toHaveLength(mockGates.length);
    });

    it('should use gate.key as fallback when gate.name is absent', async () => {
      const gatesWithKey = [{ key: 'GATE_PRD_EXISTS', validator: vi.fn() }];
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'test' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, gatesWithKey, { sdType: 'uat' });

      expect(result.filteredGates).toHaveLength(0);
    });

    it('should track resolutions in the output array', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'UAT exempt' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'uat',
        sdId: 'SD-UAT-001'
      });

      expect(result.resolutions).toHaveLength(1);
      expect(result.resolutions[0]).toMatchObject({
        event: 'gate_policy_resolution',
        sd_id: 'SD-UAT-001',
        sd_type: 'uat',
        gate_key: 'GATE_PRD_EXISTS',
        matched_scope: 'sd_type',
        applicability: 'DISABLED',
        fallback_used: false
      });
    });
  });

  // =========================================================================
  // resolveGatePolicy — precedence matching
  // =========================================================================
  describe('resolveGatePolicy precedence', () => {
    it('should match sd_type + validation_profile first (highest precedence)', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'infrastructure', validation_profile: null, applicability: 'DISABLED', reason: 'Infra exempt' },
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'infrastructure', validation_profile: 'strict', applicability: 'REQUIRED', reason: 'Strict requires PRD' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'infrastructure',
        validationProfile: 'strict'
      });

      // Most specific wins: sd_type+profile → REQUIRED → gate included
      expect(result.filteredGates).toHaveLength(1);
      expect(result.resolutions[0].matched_scope).toBe('sd_type+profile');
    });

    it('should fall back to sd_type-only when no profile match exists', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'infrastructure', validation_profile: null, applicability: 'DISABLED', reason: 'Infra exempt' },
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'infrastructure', validation_profile: 'strict', applicability: 'REQUIRED', reason: 'Strict override' }
      ];

      const supabase = createMockSupabase(policies);

      // No profile provided → falls to sd_type only match
      const result = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'infrastructure'
      });

      expect(result.filteredGates).toHaveLength(0); // DISABLED
      expect(result.resolutions[0].matched_scope).toBe('sd_type');
    });

    it('should fall back to profile-only when sd_type does not match', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: null, validation_profile: 'lenient', applicability: 'DISABLED', reason: 'Lenient profile skips PRD' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'feature',
        validationProfile: 'lenient'
      });

      expect(result.filteredGates).toHaveLength(0); // DISABLED via profile-only
      expect(result.resolutions[0].matched_scope).toBe('profile');
    });

    it('should include gate when no policies match at any level (fail-open)', async () => {
      const policies = [
        { gate_key: 'GATE_OTHER', sd_type: 'feature', validation_profile: null, applicability: 'DISABLED', reason: 'irrelevant' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'feature'
      });

      // GATE_PRD_EXISTS has no matching policy → included by default
      expect(result.filteredGates).toHaveLength(1);
      expect(result.resolutions).toHaveLength(0); // no resolution recorded
    });

    it('should prefer sd_type+profile over profile-only', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: null, validation_profile: 'strict', applicability: 'DISABLED', reason: 'Profile-only rule' },
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'feature', validation_profile: 'strict', applicability: 'REQUIRED', reason: 'Feature+strict override' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'feature',
        validationProfile: 'strict'
      });

      // sd_type+profile wins → REQUIRED → included
      expect(result.filteredGates).toHaveLength(1);
      expect(result.resolutions[0].matched_scope).toBe('sd_type+profile');
    });

    it('should prefer sd_type-only over profile-only', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'feature', validation_profile: null, applicability: 'DISABLED', reason: 'Type-only' },
        { gate_key: 'GATE_PRD_EXISTS', sd_type: null, validation_profile: 'strict', applicability: 'REQUIRED', reason: 'Profile-only' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'feature',
        validationProfile: 'strict'
      });

      // sd_type+profile doesn't match (no exact combo), sd_type-only matches → DISABLED
      expect(result.filteredGates).toHaveLength(0);
      expect(result.resolutions[0].matched_scope).toBe('sd_type');
    });
  });

  // =========================================================================
  // DB failure fallback (fail-open)
  // =========================================================================
  describe('DB failure fallback', () => {
    it('should return all gates when DB returns an error (fail-open)', async () => {
      const supabase = createErrorSupabase();

      const result = await applyGatePolicies(supabase, mockGates, {
        sdType: 'uat',
        sdId: 'SD-TEST-001'
      });

      expect(result.filteredGates).toHaveLength(mockGates.length);
      expect(result.fallbackUsed).toBe(true);
      expect(result.resolutions).toEqual([]);
    });

    it('should return all gates when DB query times out (AbortError)', async () => {
      const supabase = createThrowingSupabase('AbortError');

      const result = await applyGatePolicies(supabase, mockGates, {
        sdType: 'feature'
      });

      expect(result.filteredGates).toHaveLength(mockGates.length);
      expect(result.fallbackUsed).toBe(true);
    });

    it('should return all gates when DB throws a generic error', async () => {
      const supabase = createThrowingSupabase('TypeError');

      const result = await applyGatePolicies(supabase, mockGates, {
        sdType: 'feature'
      });

      expect(result.filteredGates).toHaveLength(mockGates.length);
      expect(result.fallbackUsed).toBe(true);
    });

    it('should increment dbFallbackTotal metric on DB failure', async () => {
      const supabase = createErrorSupabase();

      await applyGatePolicies(supabase, mockGates, { sdType: 'uat' });
      invalidatePolicyCache();
      await applyGatePolicies(supabase, mockGates, { sdType: 'uat' });

      const metrics = getGatePolicyMetrics();
      expect(metrics.dbFallbackTotal).toBe(2);
    });
  });

  // =========================================================================
  // fetchPolicies caching
  // =========================================================================
  describe('fetchPolicies caching', () => {
    it('should cache policies and not re-query DB on second call within TTL', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'cached' }
      ];
      const supabase = createMockSupabase(policies);

      // First call — hits DB
      await applyGatePolicies(supabase, [mockGates[0]], { sdType: 'uat' });
      expect(supabase.from).toHaveBeenCalledTimes(1);

      // Second call — should use cache, no additional DB call
      await applyGatePolicies(supabase, [mockGates[0]], { sdType: 'uat' });
      expect(supabase.from).toHaveBeenCalledTimes(1); // still 1
    });

    it('should re-query DB after cache invalidation', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'first' }
      ];
      const supabase = createMockSupabase(policies);

      await applyGatePolicies(supabase, [mockGates[0]], { sdType: 'uat' });
      expect(supabase.from).toHaveBeenCalledTimes(1);

      invalidatePolicyCache();

      await applyGatePolicies(supabase, [mockGates[0]], { sdType: 'uat' });
      expect(supabase.from).toHaveBeenCalledTimes(2);
    });

    it('should use fresh data from new supabase client after invalidation', async () => {
      // First call with DISABLED policy
      const supabase1 = createMockSupabase([
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'v1' }
      ]);
      const result1 = await applyGatePolicies(supabase1, [mockGates[0]], { sdType: 'uat' });
      expect(result1.filteredGates).toHaveLength(0);

      invalidatePolicyCache();

      // Second call with REQUIRED policy (simulates DB update)
      const supabase2 = createMockSupabase([
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'REQUIRED', reason: 'v2' }
      ]);
      const result2 = await applyGatePolicies(supabase2, [mockGates[0]], { sdType: 'uat' });
      expect(result2.filteredGates).toHaveLength(1);
    });

    it('should not cache null (DB error) responses', async () => {
      const supabaseError = createErrorSupabase();
      await applyGatePolicies(supabaseError, mockGates, { sdType: 'uat' });

      // After error, cache should not be set — next call with working DB should succeed
      const supabaseOk = createMockSupabase([
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'now cached' }
      ]);
      const result = await applyGatePolicies(supabaseOk, [mockGates[0]], { sdType: 'uat' });

      expect(result.filteredGates).toHaveLength(0); // Policy applied
      expect(result.fallbackUsed).toBe(false);
    });
  });

  // =========================================================================
  // invalidatePolicyCache
  // =========================================================================
  describe('invalidatePolicyCache', () => {
    it('should force a fresh DB query on next call', async () => {
      const supabase = createMockSupabase([]);

      await applyGatePolicies(supabase, mockGates, { sdType: 'feature' });
      expect(supabase.from).toHaveBeenCalledTimes(1);

      invalidatePolicyCache();

      await applyGatePolicies(supabase, mockGates, { sdType: 'feature' });
      expect(supabase.from).toHaveBeenCalledTimes(2);
    });

    it('should be safe to call multiple times', () => {
      expect(() => {
        invalidatePolicyCache();
        invalidatePolicyCache();
        invalidatePolicyCache();
      }).not.toThrow();
    });
  });

  // =========================================================================
  // getGatePolicyMetrics
  // =========================================================================
  describe('getGatePolicyMetrics', () => {
    it('should return zeroed metrics after reset', () => {
      const metrics = getGatePolicyMetrics();
      expect(metrics).toEqual({
        dbFallbackTotal: 0,
        disabledGateTotal: 0,
        resolutionCount: 0
      });
    });

    it('should track disabledGateTotal across calls', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'test' },
        { gate_key: 'GATE1_DESIGN_DATABASE', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'test' }
      ];
      const supabase = createMockSupabase(policies);

      await applyGatePolicies(supabase, mockGates, { sdType: 'uat' });

      const metrics = getGatePolicyMetrics();
      expect(metrics.disabledGateTotal).toBe(2);
      expect(metrics.resolutionCount).toBe(2);
    });

    it('should accumulate metrics across multiple invocations', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'test' }
      ];
      const supabase = createMockSupabase(policies);

      await applyGatePolicies(supabase, [mockGates[0]], { sdType: 'uat' });
      invalidatePolicyCache();
      await applyGatePolicies(supabase, [mockGates[0]], { sdType: 'uat' });
      invalidatePolicyCache();
      await applyGatePolicies(supabase, [mockGates[0]], { sdType: 'uat' });

      const metrics = getGatePolicyMetrics();
      expect(metrics.disabledGateTotal).toBe(3);
      expect(metrics.resolutionCount).toBe(3);
    });

    it('should return a copy (not a reference to internal state)', () => {
      const metrics1 = getGatePolicyMetrics();
      metrics1.dbFallbackTotal = 999;

      const metrics2 = getGatePolicyMetrics();
      expect(metrics2.dbFallbackTotal).toBe(0); // unchanged
    });
  });

  // =========================================================================
  // resetGatePolicyMetrics
  // =========================================================================
  describe('resetGatePolicyMetrics', () => {
    it('should zero out all counters', async () => {
      const supabase = createErrorSupabase();
      await applyGatePolicies(supabase, mockGates, { sdType: 'uat' });

      const before = getGatePolicyMetrics();
      expect(before.dbFallbackTotal).toBeGreaterThan(0);

      resetGatePolicyMetrics();

      const after = getGatePolicyMetrics();
      expect(after.dbFallbackTotal).toBe(0);
      expect(after.disabledGateTotal).toBe(0);
      expect(after.resolutionCount).toBe(0);
    });
  });

  // =========================================================================
  // Zero-code SD type addition via registry rows
  // =========================================================================
  describe('zero-code SD type addition', () => {
    it('should support adding a new SD type via registry rows only', async () => {
      // Simulate a 'spike' SD type with most gates disabled
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'spike', validation_profile: null, applicability: 'DISABLED', reason: 'Spike exempt' },
        { gate_key: 'GATE1_DESIGN_DATABASE', sd_type: 'spike', validation_profile: null, applicability: 'DISABLED', reason: 'Spike exempt' },
        { gate_key: 'GATE_ARCHITECTURE_VERIFICATION', sd_type: 'spike', validation_profile: null, applicability: 'DISABLED', reason: 'Spike exempt' },
        { gate_key: 'GATE_EXPLORATION_AUDIT', sd_type: 'spike', validation_profile: null, applicability: 'DISABLED', reason: 'Spike exempt' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, mockGates, {
        sdType: 'spike',
        sdId: 'SD-SPIKE-001'
      });

      expect(result.filteredGates).toHaveLength(1);
      expect(result.filteredGates[0].name).toBe('GATE6_BRANCH_ENFORCEMENT');
    });

    it('should allow policy changes (REQUIRED → DISABLED) without code changes', async () => {
      const supabaseRequired = createMockSupabase([
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'spike', validation_profile: null, applicability: 'REQUIRED', reason: 'Initially required' }
      ]);

      const resultBefore = await applyGatePolicies(supabaseRequired, [mockGates[0]], { sdType: 'spike' });
      expect(resultBefore.filteredGates).toHaveLength(1);

      invalidatePolicyCache();

      const supabaseDisabled = createMockSupabase([
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'spike', validation_profile: null, applicability: 'DISABLED', reason: 'Now disabled' }
      ]);

      const resultAfter = await applyGatePolicies(supabaseDisabled, [mockGates[0]], { sdType: 'spike' });
      expect(resultAfter.filteredGates).toHaveLength(0);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('should handle gates with neither .name nor .key gracefully', async () => {
      const gatesNoName = [{ validator: vi.fn() }];
      const policies = [
        { gate_key: 'unknown', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'test' }
      ];
      const supabase = createMockSupabase(policies);

      const result = await applyGatePolicies(supabase, gatesNoName, { sdType: 'uat' });

      // Falls back to 'unknown' key, which matches the policy → DISABLED
      expect(result.filteredGates).toHaveLength(0);
    });

    it('should handle multiple gates with mixed policies', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'feature', validation_profile: null, applicability: 'REQUIRED', reason: 'Required' },
        { gate_key: 'GATE1_DESIGN_DATABASE', sd_type: 'feature', validation_profile: null, applicability: 'DISABLED', reason: 'Exempt' },
        { gate_key: 'GATE_ARCHITECTURE_VERIFICATION', sd_type: 'feature', validation_profile: null, applicability: 'OPTIONAL', reason: 'Optional' }
        // GATE_EXPLORATION_AUDIT and GATE6_BRANCH_ENFORCEMENT have no policies
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, mockGates, { sdType: 'feature' });

      // REQUIRED(1) + OPTIONAL(1) + no-policy(2) = 4 included, DISABLED(1) = 1 excluded
      expect(result.filteredGates).toHaveLength(4);
      expect(result.filteredGates.map(g => g.name)).toEqual([
        'GATE_PRD_EXISTS',
        'GATE_ARCHITECTURE_VERIFICATION',
        'GATE_EXPLORATION_AUDIT',
        'GATE6_BRANCH_ENFORCEMENT'
      ]);
    });

    it('should treat empty sdType as falsy (no sd_type matching)', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: '', validation_profile: null, applicability: 'DISABLED', reason: 'empty type' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: ''
      });

      // Empty string sdType is falsy, so resolveGatePolicy skips sd_type matching.
      // No match found → gate included (fail-open behavior).
      expect(result.filteredGates).toHaveLength(1);
    });

    it('should handle null validationProfile correctly', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'test' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'uat',
        validationProfile: null
      });

      expect(result.filteredGates).toHaveLength(0);
    });

    it('should handle all gates being disabled', async () => {
      const policies = mockGates.map(g => ({
        gate_key: g.name,
        sd_type: 'deprecated',
        validation_profile: null,
        applicability: 'DISABLED',
        reason: 'All disabled'
      }));

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, mockGates, { sdType: 'deprecated' });

      expect(result.filteredGates).toHaveLength(0);

      const metrics = getGatePolicyMetrics();
      expect(metrics.disabledGateTotal).toBe(5);
    });
  });
});
