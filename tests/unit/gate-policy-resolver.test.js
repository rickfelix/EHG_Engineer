/**
 * Tests for Gate Policy Resolver
 * SD-LEO-INFRA-VALIDATION-GATE-REGISTRY-001
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyGatePolicies,
  getGatePolicyMetrics,
  resetGatePolicyMetrics,
  invalidatePolicyCache
} from '../../scripts/modules/handoff/gate-policy-resolver.js';

// Mock gates for testing
const mockGates = [
  { name: 'GATE_PRD_EXISTS', validator: vi.fn(), required: true },
  { name: 'GATE1_DESIGN_DATABASE', validator: vi.fn(), required: true },
  { name: 'GATE_ARCHITECTURE_VERIFICATION', validator: vi.fn(), required: true },
  { name: 'GATE_EXPLORATION_AUDIT', validator: vi.fn(), required: true },
  { name: 'GATE6_BRANCH_ENFORCEMENT', validator: vi.fn(), required: true }
];

// Mock Supabase that returns policy data
function createMockSupabase(policies = []) {
  const chainable = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockResolvedValue({ data: policies, error: null })
  };
  return chainable;
}

// Mock Supabase that simulates DB error
function createErrorSupabase() {
  const chainable = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB connection failed' } })
  };
  return chainable;
}

describe('Gate Policy Resolver', () => {
  beforeEach(() => {
    resetGatePolicyMetrics();
    invalidatePolicyCache();
  });

  describe('applyGatePolicies', () => {
    it('should return all gates when feature flag is disabled', async () => {
      const originalEnv = process.env.FF_GATE_POLICY_REGISTRY;
      process.env.FF_GATE_POLICY_REGISTRY = 'false';

      const supabase = createMockSupabase([]);
      const result = await applyGatePolicies(supabase, mockGates, { sdType: 'uat' });

      expect(result.filteredGates).toHaveLength(mockGates.length);
      expect(result.fallbackUsed).toBe(false);

      process.env.FF_GATE_POLICY_REGISTRY = originalEnv;
    });

    it('should disable gates for UAT SD type based on policy', async () => {
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

      // 3 gates disabled, 2 remain
      expect(result.filteredGates).toHaveLength(2);
      expect(result.filteredGates.map(g => g.name)).toEqual([
        'GATE_ARCHITECTURE_VERIFICATION',
        'GATE6_BRANCH_ENFORCEMENT'
      ]);
      expect(result.fallbackUsed).toBe(false);

      // Metrics updated
      const metrics = getGatePolicyMetrics();
      expect(metrics.disabledGateTotal).toBe(3);
    });

    it('should use most specific policy (sd_type+profile > sd_type)', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'infrastructure', validation_profile: null, applicability: 'DISABLED', reason: 'Infra exempt' },
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'infrastructure', validation_profile: 'strict', applicability: 'REQUIRED', reason: 'Strict profile requires PRD' }
      ];

      const supabase = createMockSupabase(policies);

      // With strict profile → REQUIRED (most specific wins)
      const resultStrict = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'infrastructure',
        validationProfile: 'strict'
      });
      expect(resultStrict.filteredGates).toHaveLength(1); // REQUIRED → included
      expect(resultStrict.resolutions[0].matched_scope).toBe('sd_type+profile');

      invalidatePolicyCache();

      // Without profile → DISABLED
      const resultDefault = await applyGatePolicies(supabase, [mockGates[0]], {
        sdType: 'infrastructure'
      });
      expect(resultDefault.filteredGates).toHaveLength(0); // DISABLED → excluded
      expect(resultDefault.resolutions[0].matched_scope).toBe('sd_type');
    });

    it('should fail open when DB is unavailable', async () => {
      const supabase = createErrorSupabase();

      const result = await applyGatePolicies(supabase, mockGates, {
        sdType: 'uat',
        sdId: 'SD-TEST-001'
      });

      // All gates returned (fail-open)
      expect(result.filteredGates).toHaveLength(mockGates.length);
      expect(result.fallbackUsed).toBe(true);

      // Fallback metric incremented
      const metrics = getGatePolicyMetrics();
      expect(metrics.dbFallbackTotal).toBe(1);
    });

    it('should include gates with no matching policy (fail-open)', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'UAT exempt' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, mockGates, {
        sdType: 'feature',
        sdId: 'SD-FEATURE-001'
      });

      // No policies match 'feature' type → all gates included
      expect(result.filteredGates).toHaveLength(mockGates.length);
    });

    it('should support zero-code SD type addition via registry rows', async () => {
      // Simulate adding 'spike' SD type policies - no code changes needed
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'spike', validation_profile: null, applicability: 'DISABLED', reason: 'Spike SDs skip PRD requirement' },
        { gate_key: 'GATE1_DESIGN_DATABASE', sd_type: 'spike', validation_profile: null, applicability: 'DISABLED', reason: 'Spike SDs skip design/db' },
        { gate_key: 'GATE_ARCHITECTURE_VERIFICATION', sd_type: 'spike', validation_profile: null, applicability: 'DISABLED', reason: 'Spike SDs skip architecture' },
        { gate_key: 'GATE_EXPLORATION_AUDIT', sd_type: 'spike', validation_profile: null, applicability: 'DISABLED', reason: 'Spike SDs skip exploration' }
      ];

      const supabase = createMockSupabase(policies);
      const result = await applyGatePolicies(supabase, mockGates, {
        sdType: 'spike',
        sdId: 'SD-SPIKE-001'
      });

      // 4 gates disabled, only branch enforcement remains
      expect(result.filteredGates).toHaveLength(1);
      expect(result.filteredGates[0].name).toBe('GATE6_BRANCH_ENFORCEMENT');
    });

    it('should handle policy change from REQUIRED to DISABLED without code changes', async () => {
      const supabaseRequired = createMockSupabase([
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'spike', validation_profile: null, applicability: 'REQUIRED', reason: 'Initially required' }
      ]);

      const resultBefore = await applyGatePolicies(supabaseRequired, [mockGates[0]], {
        sdType: 'spike'
      });
      expect(resultBefore.filteredGates).toHaveLength(1); // REQUIRED → included

      invalidatePolicyCache();

      // Simulate policy change to DISABLED
      const supabaseDisabled = createMockSupabase([
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'spike', validation_profile: null, applicability: 'DISABLED', reason: 'Changed to disabled' }
      ]);

      const resultAfter = await applyGatePolicies(supabaseDisabled, [mockGates[0]], {
        sdType: 'spike'
      });
      expect(resultAfter.filteredGates).toHaveLength(0); // DISABLED → excluded
    });
  });

  describe('getGatePolicyMetrics', () => {
    it('should track metrics across calls', async () => {
      const policies = [
        { gate_key: 'GATE_PRD_EXISTS', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'test' }
      ];

      const supabase = createMockSupabase(policies);

      await applyGatePolicies(supabase, [mockGates[0]], { sdType: 'uat' });
      invalidatePolicyCache();
      await applyGatePolicies(supabase, [mockGates[0]], { sdType: 'uat' });

      const metrics = getGatePolicyMetrics();
      expect(metrics.disabledGateTotal).toBe(2);
      expect(metrics.resolutionCount).toBe(2);
    });

    it('should reset metrics correctly', () => {
      resetGatePolicyMetrics();
      const metrics = getGatePolicyMetrics();
      expect(metrics.dbFallbackTotal).toBe(0);
      expect(metrics.disabledGateTotal).toBe(0);
      expect(metrics.resolutionCount).toBe(0);
    });
  });
});
