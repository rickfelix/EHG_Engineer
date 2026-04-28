/**
 * Unit tests for GATE_TEST_COVERAGE_QUALITY (Rewritten)
 * Tests advisory mode, sd_type routing, and scoring logic.
 *
 * Part of SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-B
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process to control git diff and prevent real subprocess execution
vi.mock('child_process', () => ({
  execSync: vi.fn(() => 'lib/some-file.js\nlib/other-file.js'),
  spawn: vi.fn(() => {
    // Return a mock proc that never resolves — live tests won't complete
    // This is fine because we only test advisory mode through the validator
    const noop = { on: vi.fn(), kill: vi.fn() };
    return { stdout: noop, stderr: noop, on: vi.fn(), kill: vi.fn() };
  })
}));

import { execSync } from 'child_process';
import { createTestCoverageQualityGate } from './test-coverage-quality.js';

describe('GATE_TEST_COVERAGE_QUALITY', () => {
  let gate;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    gate = createTestCoverageQualityGate(null);
    delete process.env.ENABLE_LIVE_TEST_EXECUTION;
    delete process.env.PLAYWRIGHT_GATE_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('has correct gate name', () => {
    expect(gate.name).toBe('GATE_TEST_COVERAGE_QUALITY');
  });

  it('is a required gate', () => {
    expect(gate.required).toBe(true);
  });

  describe('advisory mode (feature flag off — default)', () => {
    it('returns advisory result when ENABLE_LIVE_TEST_EXECUTION is not set', async () => {
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(70);
      expect(result.details.mode).toBe('advisory');
      expect(result.details.status).toBe('ADVISORY');
    });

    it('returns advisory result for infrastructure SD', async () => {
      const result = await gate.validator({ sd: { sd_type: 'infrastructure' } });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(70);
      expect(result.details.blocking).toBe(false);
    });

    it('warns about changed files not verified by live tests', async () => {
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('Live test execution disabled'))).toBe(true);
    });
  });

  describe('threshold routing by sd_type', () => {
    it('uses 60% threshold for feature SDs', async () => {
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      expect(result.details.threshold_used).toBe(60);
    });

    it('uses 60% threshold for bugfix SDs', async () => {
      const result = await gate.validator({ sd: { sd_type: 'bugfix' } });
      expect(result.details.threshold_used).toBe(60);
    });

    it('uses 60% threshold for security SDs', async () => {
      const result = await gate.validator({ sd: { sd_type: 'security' } });
      expect(result.details.threshold_used).toBe(60);
    });

    it('uses 40% threshold for infrastructure SDs', async () => {
      const result = await gate.validator({ sd: { sd_type: 'infrastructure' } });
      expect(result.details.threshold_used).toBe(40);
    });

    it('uses 40% threshold for refactor SDs', async () => {
      const result = await gate.validator({ sd: { sd_type: 'refactor' } });
      expect(result.details.threshold_used).toBe(40);
    });
  });

  describe('sd_type fallback behavior', () => {
    it('defaults to advisory mode when sd_type is null', async () => {
      const result = await gate.validator({ sd: { sd_type: null } });
      expect(result.passed).toBe(true);
      expect(result.details.blocking).toBe(false);
    });

    it('defaults to advisory mode when sd_type is undefined', async () => {
      const result = await gate.validator({ sd: {} });
      expect(result.passed).toBe(true);
      expect(result.details.blocking).toBe(false);
    });

    it('defaults to advisory mode when ctx.sd is undefined', async () => {
      const result = await gate.validator({});
      expect(result.passed).toBe(true);
      expect(result.details.blocking).toBe(false);
    });

    it('defaults to advisory mode for unknown sd_type values', async () => {
      const result = await gate.validator({ sd: { sd_type: 'exotic' } });
      expect(result.passed).toBe(true);
      expect(result.details.blocking).toBe(false);
      expect(result.details.sd_type).toBe('exotic');
    });
  });

  describe('no code changes', () => {
    it('returns score 100 when no code files changed', async () => {
      execSync.mockReturnValue('');
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.details.status).toBe('PASS');
      expect(result.details.changed_files_count).toBe(0);
    });

    it('returns score 100 for non-code files only', async () => {
      execSync.mockReturnValue('README.md\ndocs/guide.md');
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });
  });

  describe('live mode detection', () => {
    it('enters live mode when ENABLE_LIVE_TEST_EXECUTION=true', async () => {
      process.env.ENABLE_LIVE_TEST_EXECUTION = 'true';
      // Short timeout so test doesn't hang — spawn mock never resolves
      process.env.PLAYWRIGHT_GATE_TIMEOUT_MS = '50';
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      // With our noop spawn mock, this will timeout and return FAIL or fallback
      expect(result.details.mode).toMatch(/live/);
    });

    it('does not enter live mode when ENABLE_LIVE_TEST_EXECUTION=false', async () => {
      process.env.ENABLE_LIVE_TEST_EXECUTION = 'false';
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      expect(result.details.mode).toBe('advisory');
    });

    it('does not enter live mode when ENABLE_LIVE_TEST_EXECUTION is unset', async () => {
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      expect(result.details.mode).toBe('advisory');
    });
  });

  describe('gate output contract', () => {
    it('returns all required fields', async () => {
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('max_score');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('details');
      expect(result.max_score).toBe(100);
    });

    it('details contain required fields', async () => {
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      expect(result.details).toHaveProperty('status');
      expect(result.details).toHaveProperty('blocking');
      expect(result.details).toHaveProperty('threshold_used');
      expect(result.details).toHaveProperty('sd_type');
      expect(result.details).toHaveProperty('mode');
      expect(result.details).toHaveProperty('summary');
    });
  });

  // QF-20260428-PLAYWRIGHT-BACKEND
  describe('backend-only Playwright short-circuit', () => {
    beforeEach(() => {
      // Force live mode so we exercise the post-advisory path. Earlier `describe('no code changes')`
      // tests call `execSync.mockReturnValue('')` whose impl override survives `vi.clearAllMocks()`,
      // so we restore the factory-default diff (lib/* files, no UI) explicitly here.
      execSync.mockReturnValue('lib/some-file.js\nlib/other-file.js');
      process.env.ENABLE_LIVE_TEST_EXECUTION = 'true';
      process.env.PLAYWRIGHT_GATE_TIMEOUT_MS = '50';
      delete process.env.LEO_PLAYWRIGHT_BACKEND_SHORTCIRCUIT;
    });

    it('short-circuits for bugfix SD with no UI files in diff', async () => {
      const result = await gate.validator({ sd: { sd_type: 'bugfix' } });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.details.mode).toBe('short_circuit_backend_only');
      expect(result.details.skip_reason).toBe('backend_only_sd_no_ui_files');
      expect(result.details.ui_files_count).toBe(0);
    });

    it('short-circuits for infrastructure SD with no UI files in diff', async () => {
      const result = await gate.validator({ sd: { sd_type: 'infrastructure' } });
      expect(result.score).toBe(100);
      expect(result.details.mode).toBe('short_circuit_backend_only');
    });

    it('short-circuits for documentation SD with no UI files in diff', async () => {
      const result = await gate.validator({ sd: { sd_type: 'documentation' } });
      expect(result.score).toBe(100);
      expect(result.details.mode).toBe('short_circuit_backend_only');
    });

    it('does NOT short-circuit when diff touches UI files (.tsx)', async () => {
      execSync.mockReturnValue('src/components/Button.tsx\nlib/util.js');
      const result = await gate.validator({ sd: { sd_type: 'bugfix' } });
      expect(result.details.mode).not.toBe('short_circuit_backend_only');
    });

    it('does NOT short-circuit when diff touches src/components/', async () => {
      execSync.mockReturnValue('src/components/SomeFile.jsx\nlib/util.js');
      const result = await gate.validator({ sd: { sd_type: 'infrastructure' } });
      expect(result.details.mode).not.toBe('short_circuit_backend_only');
    });

    it('does NOT short-circuit for feature SD even with no UI files', async () => {
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      expect(result.details.mode).not.toBe('short_circuit_backend_only');
    });

    it('does NOT short-circuit when LEO_PLAYWRIGHT_BACKEND_SHORTCIRCUIT=off', async () => {
      process.env.LEO_PLAYWRIGHT_BACKEND_SHORTCIRCUIT = 'off';
      const result = await gate.validator({ sd: { sd_type: 'bugfix' } });
      expect(result.details.mode).not.toBe('short_circuit_backend_only');
    });

    it('warnings explain why the gate was skipped (auditable)', async () => {
      const result = await gate.validator({ sd: { sd_type: 'bugfix' } });
      expect(result.warnings.some(w => w.includes('Backend-only SD'))).toBe(true);
      expect(result.warnings.some(w => w.includes('LEO_PLAYWRIGHT_BACKEND_SHORTCIRCUIT=off'))).toBe(true);
    });
  });
});
