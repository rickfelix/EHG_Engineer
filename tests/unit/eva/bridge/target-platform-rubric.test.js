/**
 * Tests for target platform decision rubric
 * SD-MOBILEFIRST-VENTURE-BUILD-STRATEGY-ORCH-001-D
 */
import { describe, it, expect } from 'vitest';
import { recommendPlatform, validatePlatformSet } from '../../../../lib/eva/bridge/target-platform-rubric.js';

describe('Target platform rubric', () => {
  describe('recommendPlatform', () => {
    it('recommends mobile for location-based consumer app', () => {
      const result = recommendPlatform({ description: 'A B2C app that helps consumers find nearby parking using GPS location tracking' });
      expect(result.recommendation).toBe('mobile');
      expect(result.signals.mobile.score).toBeGreaterThan(0);
    });

    it('recommends web for B2B dashboard', () => {
      const result = recommendPlatform({ description: 'An enterprise SaaS dashboard for analytics and reporting with data tables' });
      expect(result.recommendation).toBe('web');
      expect(result.signals.web.score).toBeGreaterThan(0);
    });

    it('recommends both when mixed signals', () => {
      const result = recommendPlatform({ description: 'A consumer marketplace app with admin dashboard for sellers' });
      expect(result.recommendation).toBe('both');
    });

    it('defaults to both with low confidence when no signals', () => {
      const result = recommendPlatform({ description: 'A simple utility tool' });
      expect(result.recommendation).toBe('both');
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('validatePlatformSet', () => {
    it('returns valid when platform is set', () => {
      const result = validatePlatformSet({ target_platform: 'mobile' });
      expect(result.valid).toBe(true);
    });

    it('returns invalid with recommendation when not set', () => {
      const result = validatePlatformSet({ description: 'A mobile fitness tracking app with push notifications' });
      expect(result.valid).toBe(false);
      expect(result.autoSet).toBe('mobile');
      expect(result.message).toContain('Auto-recommendation');
    });

    it('rejects invalid platform values', () => {
      const result = validatePlatformSet({ target_platform: 'desktop', description: 'Test' });
      expect(result.valid).toBe(false);
    });
  });
});
