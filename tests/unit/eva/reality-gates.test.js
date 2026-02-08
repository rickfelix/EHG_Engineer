/**
 * Tests for Reality Gates
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-B
 */

import { describe, it, expect, vi } from 'vitest';
import {
  evaluateRealityGate,
  getBoundaryConfig,
  isGatedBoundary,
  BOUNDARY_CONFIG,
  REASON_CODES,
  MODULE_VERSION,
  _internal,
} from '../../../lib/eva/reality-gates.js';

function createMockDb(artifacts = []) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: artifacts, error: null }),
    })),
  };
}

function createErrorDb(message = 'DB connection failed') {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: null, error: { message } }),
    })),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('RealityGates', () => {
  describe('isGatedBoundary', () => {
    it('should return true for configured boundaries', () => {
      expect(isGatedBoundary(5, 6)).toBe(true);
      expect(isGatedBoundary(9, 10)).toBe(true);
      expect(isGatedBoundary(12, 13)).toBe(true);
      expect(isGatedBoundary(16, 17)).toBe(true);
      expect(isGatedBoundary(20, 21)).toBe(true);
    });

    it('should return false for non-gated transitions', () => {
      expect(isGatedBoundary(1, 2)).toBe(false);
      expect(isGatedBoundary(7, 8)).toBe(false);
      expect(isGatedBoundary(24, 25)).toBe(false);
    });
  });

  describe('getBoundaryConfig', () => {
    it('should return config for valid boundary', () => {
      const config = getBoundaryConfig(5, 6);
      expect(config).toBeDefined();
      expect(config.description).toBe('Ideation → Validation');
      expect(config.required_artifacts).toHaveLength(3);
    });

    it('should return null for non-gated boundary', () => {
      expect(getBoundaryConfig(1, 2)).toBeNull();
    });
  });

  describe('evaluateRealityGate - NOT_APPLICABLE', () => {
    it('should return NOT_APPLICABLE for non-gated transitions', async () => {
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 1,
        toStage: 2,
        db: createMockDb(),
        logger: silentLogger,
      });
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.reasons).toHaveLength(0);
    });
  });

  describe('evaluateRealityGate - validation', () => {
    it('should FAIL when ventureId is missing', async () => {
      const result = await evaluateRealityGate({
        ventureId: null,
        fromStage: 5,
        toStage: 6,
        db: createMockDb(),
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons[0].code).toBe(REASON_CODES.CONFIG_ERROR);
    });

    it('should FAIL when db is missing', async () => {
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        db: null,
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons[0].code).toBe(REASON_CODES.CONFIG_ERROR);
    });
  });

  describe('evaluateRealityGate - artifact checks', () => {
    it('should PASS when all required artifacts exist with sufficient quality', async () => {
      const artifacts = [
        { artifact_type: 'problem_statement', quality_score: 0.8, is_current: true },
        { artifact_type: 'target_market_analysis', quality_score: 0.7, is_current: true },
        { artifact_type: 'value_proposition', quality_score: 0.9, is_current: true },
      ];
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        db: createMockDb(artifacts),
        logger: silentLogger,
      });
      expect(result.status).toBe('PASS');
      expect(result.reasons).toHaveLength(0);
    });

    it('should FAIL when required artifact is missing', async () => {
      const artifacts = [
        { artifact_type: 'problem_statement', quality_score: 0.8, is_current: true },
      ];
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        db: createMockDb(artifacts),
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      const missingReasons = result.reasons.filter(r => r.code === REASON_CODES.ARTIFACT_MISSING);
      expect(missingReasons.length).toBe(2);
    });

    it('should FAIL when quality score is below threshold', async () => {
      const artifacts = [
        { artifact_type: 'problem_statement', quality_score: 0.3, is_current: true },
        { artifact_type: 'target_market_analysis', quality_score: 0.5, is_current: true },
        { artifact_type: 'value_proposition', quality_score: 0.6, is_current: true },
      ];
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        db: createMockDb(artifacts),
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      const qualityReasons = result.reasons.filter(r => r.code === REASON_CODES.QUALITY_SCORE_BELOW_THRESHOLD);
      expect(qualityReasons.length).toBe(1);
    });

    it('should FAIL when quality score is null', async () => {
      const artifacts = [
        { artifact_type: 'problem_statement', quality_score: null, is_current: true },
        { artifact_type: 'target_market_analysis', quality_score: 0.5, is_current: true },
        { artifact_type: 'value_proposition', quality_score: 0.6, is_current: true },
      ];
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        db: createMockDb(artifacts),
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      const missingScore = result.reasons.find(r => r.code === REASON_CODES.QUALITY_SCORE_MISSING);
      expect(missingScore).toBeDefined();
    });
  });

  describe('evaluateRealityGate - DB errors (fail-closed)', () => {
    it('should FAIL on database error', async () => {
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 5,
        toStage: 6,
        db: createErrorDb('Connection timeout'),
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons[0].code).toBe(REASON_CODES.DB_ERROR);
    });
  });

  describe('evaluateRealityGate - URL verification', () => {
    it('should PASS when URL is reachable', async () => {
      const artifacts = [
        { artifact_type: 'mvp_build', quality_score: 0.8, file_url: 'https://app.example.com', is_current: true },
        { artifact_type: 'test_coverage_report', quality_score: 0.7, is_current: true },
        { artifact_type: 'deployment_runbook', quality_score: 0.6, is_current: true },
      ];
      const httpClient = vi.fn().mockResolvedValue({ status: 200 });
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 16,
        toStage: 17,
        db: createMockDb(artifacts),
        httpClient,
        logger: silentLogger,
      });
      expect(result.status).toBe('PASS');
      expect(httpClient).toHaveBeenCalled();
    });

    it('should FAIL when URL is unreachable', async () => {
      const artifacts = [
        { artifact_type: 'mvp_build', quality_score: 0.8, file_url: 'https://app.example.com', is_current: true },
        { artifact_type: 'test_coverage_report', quality_score: 0.7, is_current: true },
        { artifact_type: 'deployment_runbook', quality_score: 0.6, is_current: true },
      ];
      const httpClient = vi.fn().mockResolvedValue({ status: 500 });
      const result = await evaluateRealityGate({
        ventureId: 'v1',
        fromStage: 16,
        toStage: 17,
        db: createMockDb(artifacts),
        httpClient,
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      const urlReason = result.reasons.find(r => r.code === REASON_CODES.URL_UNREACHABLE);
      expect(urlReason).toBeDefined();
    });
  });

  describe('verifyUrl (internal)', () => {
    it('should retry on timeout', async () => {
      const httpClient = vi.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT', message: 'timeout' })
        .mockResolvedValueOnce({ status: 200 });
      const result = await _internal.verifyUrl('https://example.com', httpClient, silentLogger);
      expect(result.reachable).toBe(true);
      expect(httpClient).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-timeout errors', async () => {
      const httpClient = vi.fn().mockRejectedValue({ code: 'ECONNREFUSED', message: 'refused' });
      const result = await _internal.verifyUrl('https://example.com', httpClient, silentLogger);
      expect(result.reachable).toBe(false);
      expect(httpClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('BOUNDARY_CONFIG', () => {
    it('should have exactly 5 configured boundaries', () => {
      expect(Object.keys(BOUNDARY_CONFIG)).toHaveLength(5);
    });

    it('should require 3 artifacts per boundary', () => {
      for (const [_key, config] of Object.entries(BOUNDARY_CONFIG)) {
        expect(config.required_artifacts).toHaveLength(3);
      }
    });
  });

  describe('exports', () => {
    it('should export MODULE_VERSION', () => {
      expect(MODULE_VERSION).toBe('1.0.0');
    });

    it('should export all REASON_CODES', () => {
      expect(Object.keys(REASON_CODES)).toHaveLength(6);
    });
  });
});
