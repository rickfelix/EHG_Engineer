import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateConformance, buildConformanceMetadata } from '../../../lib/eva/bridge/conformance-integration.js';

// Mock the conformance check to avoid filesystem dependency
vi.mock('../../../scripts/venture-conformance-check.js', () => ({
  runConformanceCheck: vi.fn((path) => {
    // Simulate 28 checks, configurable pass rate based on path
    if (path.includes('perfect')) {
      return Array.from({ length: 28 }, (_, i) => ({ name: `check-${i}`, pass: true, details: 'OK' }));
    }
    if (path.includes('failing')) {
      // 15 pass, 13 fail = score ~54
      return Array.from({ length: 28 }, (_, i) => ({
        name: `check-${i}`,
        pass: i < 15,
        details: i < 15 ? 'OK' : 'FAIL'
      }));
    }
    // Default: 24 pass, 4 fail = score ~86
    return Array.from({ length: 28 }, (_, i) => ({
      name: `check-${i}`,
      pass: i < 24,
      details: i < 24 ? 'OK' : 'FAIL'
    }));
  }),
}));

const silentLogger = { log: vi.fn(), warn: vi.fn() };

describe('conformance-integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VENTURE_CONFORMANCE_THRESHOLD;
  });

  describe('evaluateConformance', () => {
    it('passes when score >= default threshold (80)', () => {
      const result = evaluateConformance('/test/venture', { logger: silentLogger });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(86); // 24/28
      expect(result.threshold).toBe(80);
      expect(result.failing).toBe(4);
    });

    it('fails when score < default threshold', () => {
      const result = evaluateConformance('/test/failing-venture', { logger: silentLogger });
      expect(result.passed).toBe(false);
      expect(result.score).toBe(54); // 15/28
      expect(result.failedChecks).toHaveLength(13);
    });

    it('respects custom threshold via option', () => {
      const result = evaluateConformance('/test/failing-venture', { threshold: 50, logger: silentLogger });
      expect(result.passed).toBe(true); // 54 >= 50
      expect(result.threshold).toBe(50);
    });

    it('respects VENTURE_CONFORMANCE_THRESHOLD env var', () => {
      process.env.VENTURE_CONFORMANCE_THRESHOLD = '50';
      const result = evaluateConformance('/test/failing-venture', { logger: silentLogger });
      expect(result.passed).toBe(true); // 54 >= 50
      expect(result.threshold).toBe(50);
    });

    it('option threshold takes precedence over env var', () => {
      process.env.VENTURE_CONFORMANCE_THRESHOLD = '50';
      const result = evaluateConformance('/test/failing-venture', { threshold: 60, logger: silentLogger });
      expect(result.threshold).toBe(60);
    });

    it('handles perfect score', () => {
      const result = evaluateConformance('/test/perfect-venture', { logger: silentLogger });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.failing).toBe(0);
      expect(result.failedChecks).toHaveLength(0);
    });

    it('returns failed check names and details', () => {
      const result = evaluateConformance('/test/venture', { logger: silentLogger });
      expect(result.failedChecks[0]).toEqual({ name: 'check-24', details: 'FAIL' });
    });

    it('logs warning on failure', () => {
      evaluateConformance('/test/failing-venture', { logger: silentLogger });
      expect(silentLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('FAIL')
      );
    });
  });

  describe('buildConformanceMetadata', () => {
    it('builds metadata object from conformance result', () => {
      const result = evaluateConformance('/test/venture', { logger: silentLogger });
      const metadata = buildConformanceMetadata(result);

      expect(metadata.conformance_score).toBe(86);
      expect(metadata.conformance_threshold).toBe(80);
      expect(metadata.conformance_passed).toBe(true);
      expect(metadata.conformance_checks_total).toBe(28);
      expect(metadata.conformance_checks_passing).toBe(24);
      expect(metadata.conformance_failed_checks).toHaveLength(4);
      expect(metadata.conformance_checked_at).toBeTruthy();
    });
  });
});
