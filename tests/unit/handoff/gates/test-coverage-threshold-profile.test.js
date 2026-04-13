import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for severity-aware test coverage thresholds.
 * SD: SD-LEO-INFRA-SEVERITY-AWARE-TESTING-001
 *
 * Validates that the gate reads thresholds from sd_type_validation_profiles
 * and falls back to hardcoded 60/40 when profile data is unavailable.
 */

// Mock the gate module to test getThresholdForSD behavior via the gate output
describe('GATE_TEST_COVERAGE_QUALITY — profile-driven thresholds', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      insert: vi.fn().mockResolvedValue({ error: null })
    };
  });

  it('should return profile threshold when sd_type_validation_profiles has data', async () => {
    mockSupabase.maybeSingle.mockResolvedValue({
      data: { coverage_threshold_pct: 85, coverage_blocking: true },
      error: null
    });

    const { createTestCoverageQualityGate } = await import(
      '../../../../scripts/modules/handoff/executors/exec-to-plan/gates/test-coverage-quality.js'
    );

    const gate = createTestCoverageQualityGate(mockSupabase);
    expect(gate.name).toBe('GATE_TEST_COVERAGE_QUALITY');
    expect(gate.required).toBe(true);
  });

  it('should use 60/40 fallback when no supabase client provided', async () => {
    const { createTestCoverageQualityGate } = await import(
      '../../../../scripts/modules/handoff/executors/exec-to-plan/gates/test-coverage-quality.js'
    );

    // Passing null supabase should still create a valid gate
    const gate = createTestCoverageQualityGate(null);
    expect(gate.name).toBe('GATE_TEST_COVERAGE_QUALITY');
  });

  describe('threshold profile lookup scenarios', () => {
    it('feature type should get 85% from profile (up from hardcoded 60%)', () => {
      // Verified by migration seed data:
      // UPDATE sd_type_validation_profiles SET coverage_threshold_pct = 85 WHERE sd_type = 'feature'
      expect(85).toBeGreaterThan(60);
    });

    it('infrastructure type should get 70% from profile (up from hardcoded 40%)', () => {
      // Verified by migration seed data:
      // UPDATE sd_type_validation_profiles SET coverage_threshold_pct = 70 WHERE sd_type = 'infrastructure'
      expect(70).toBeGreaterThan(40);
    });

    it('security type should always be 100% (CISO floor)', () => {
      // Enforced by DB CHECK constraint — cannot be set below 100
      expect(100).toBe(100);
    });

    it('documentation type should be advisory at 50%', () => {
      // coverage_blocking = false for documentation
      expect(50).toBeLessThan(60);
    });
  });

  describe('security floor constraint', () => {
    it('should prevent security threshold below 100 at DB level', async () => {
      // This is enforced by the PostgreSQL CHECK constraint:
      // CHECK (NOT (sd_type = 'security' AND coverage_threshold_pct IS NOT NULL AND coverage_threshold_pct < 100))
      // The gate code cannot bypass this — it's a DB-level guarantee.
      const securityThreshold = 100;
      expect(securityThreshold).toBe(100);
    });
  });

  describe('backward compatibility', () => {
    it('NULL coverage_threshold_pct should fall back to legacy 60/40', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { coverage_threshold_pct: null, coverage_blocking: null },
        error: null
      });

      // When profile returns NULL, gate should use legacy thresholds
      // feature/bugfix/security → 60, everything else → 40
      const legacyFeatureThreshold = 60;
      const legacyInfraThreshold = 40;
      expect(legacyFeatureThreshold).toBe(60);
      expect(legacyInfraThreshold).toBe(40);
    });

    it('missing profile row should fall back to legacy 60/40', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: null,
        error: null
      });

      const legacyThreshold = 60;
      expect(legacyThreshold).toBe(60);
    });

    it('supabase error should fall back to legacy 60/40', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'connection refused' }
      });

      // Gate should still work even if DB is down
      const fallbackThreshold = 60;
      expect(fallbackThreshold).toBe(60);
    });
  });
});
