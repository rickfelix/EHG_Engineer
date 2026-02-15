/**
 * Unit tests for GATE_TEST_COVERAGE_QUALITY
 * Validates sd_type-aware scoring behavior.
 *
 * Part of SD-LEARN-FIX-ADDRESS-PAT-AUTO-016
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestCoverageQualityGate } from './test-coverage-quality.js';

// Mock child_process to control git diff output
vi.mock('child_process', () => ({
  execSync: vi.fn(() => 'lib/some-file.js\nlib/other-file.js')
}));

// Mock fs to control coverage file existence and content
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}')
}));

import { existsSync, readFileSync } from 'fs';

describe('GATE_TEST_COVERAGE_QUALITY', () => {
  let gate;

  beforeEach(() => {
    vi.clearAllMocks();
    gate = createTestCoverageQualityGate(null);
  });

  it('has correct gate name', () => {
    expect(gate.name).toBe('GATE_TEST_COVERAGE_QUALITY');
  });

  describe('sd_type fallback behavior', () => {
    it('defaults to advisory mode when sd_type is null', async () => {
      existsSync.mockReturnValue(false);
      const result = await gate.validator({ sd: { sd_type: null } });
      // Missing coverage file for non-blocking type → score 70, not 0
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.details.blocking).toBe(false);
    });

    it('defaults to advisory mode when sd_type is undefined', async () => {
      existsSync.mockReturnValue(false);
      const result = await gate.validator({ sd: {} });
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.details.blocking).toBe(false);
    });

    it('defaults to advisory mode when ctx.sd is undefined', async () => {
      existsSync.mockReturnValue(false);
      const result = await gate.validator({});
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.details.blocking).toBe(false);
    });

    it('defaults to advisory mode for unknown sd_type values', async () => {
      existsSync.mockReturnValue(false);
      const result = await gate.validator({ sd: { sd_type: 'exotic' } });
      expect(result.passed).toBe(true);
      expect(result.details.blocking).toBe(false);
      expect(result.details.sd_type).toBe('exotic');
    });
  });

  describe('infrastructure SD (advisory mode)', () => {
    it('scores >= 70 when coverage file is missing', async () => {
      existsSync.mockReturnValue(false);
      const result = await gate.validator({ sd: { sd_type: 'infrastructure' } });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(70);
      expect(result.details.blocking).toBe(false);
      expect(result.details.status).toBe('WARN');
    });

    it('uses 40% threshold', async () => {
      existsSync.mockReturnValue(false);
      const result = await gate.validator({ sd: { sd_type: 'infrastructure' } });
      expect(result.details.threshold_used).toBe(40);
    });
  });

  describe('feature SD (blocking mode)', () => {
    it('uses blocking mode', async () => {
      existsSync.mockReturnValue(false);
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      // Missing coverage for blocking type → still passes with warning (score 70)
      // because no coverage file is a WARN, not a FAIL
      expect(result.passed).toBe(true);
      expect(result.details.threshold_used).toBe(60);
    });

    it('scores 0 when coverage fails for blocking type', async () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        total: { lines: { total: 100, covered: 0, pct: 0 } },
        'lib/some-file.js': { lines: { total: 50, covered: 0, pct: 0 } }
      }));
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.details.blocking).toBe(true);
    });
  });

  describe('security SD (blocking mode)', () => {
    it('uses blocking mode with 60% threshold', async () => {
      existsSync.mockReturnValue(false);
      const result = await gate.validator({ sd: { sd_type: 'security' } });
      expect(result.details.threshold_used).toBe(60);
    });
  });

  describe('refactor SD (advisory mode)', () => {
    it('uses advisory mode with 40% threshold', async () => {
      existsSync.mockReturnValue(false);
      const result = await gate.validator({ sd: { sd_type: 'refactor' } });
      expect(result.details.threshold_used).toBe(40);
      expect(result.details.blocking).toBe(false);
    });
  });

  describe('no code changes', () => {
    it('returns score 100 when no code files changed', async () => {
      const { execSync } = await import('child_process');
      execSync.mockReturnValue('');
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.details.status).toBe('PASS');
    });
  });
});
