import { describe, it, expect } from 'vitest';
import { evaluateRealBuildData, PASS_RATE_THRESHOLD, COVERAGE_THRESHOLD } from '../stage-templates/analysis-steps/stage-20-build-execution.js';

describe('evaluateRealBuildData', () => {
  it('PASS: all thresholds met', () => {
    const result = evaluateRealBuildData({
      unit_tests: { numPassed: 100, numFailed: 0, numTotal: 100 },
      e2e_tests: { numPassed: 20, numFailed: 0, numTotal: 20 },
      coverage: { lines: 85 },
    });
    expect(result.gateResult).toBe('PASS');
    expect(result.passRate).toBe(100);
    expect(result.coveragePct).toBe(85);
    expect(result.totalTests).toBe(120);
    expect(result.gateReasons).toHaveLength(0);
    expect(result.dataSource).toBe('build_feedback');
  });

  it('PASS: exactly at thresholds', () => {
    // 95% pass rate = threshold, 60% coverage = threshold
    const result = evaluateRealBuildData({
      unit_tests: { numPassed: 95, numFailed: 5, numTotal: 100 },
      coverage: { lines: 60 },
    });
    expect(result.gateResult).toBe('PASS');
    expect(result.passRate).toBe(95);
    expect(result.coveragePct).toBe(60);
  });

  it('FAIL: low pass rate', () => {
    const result = evaluateRealBuildData({
      unit_tests: { numPassed: 90, numFailed: 10, numTotal: 100 },
      coverage: { lines: 80 },
    });
    expect(result.gateResult).toBe('FAIL');
    expect(result.passRate).toBe(90);
    expect(result.gateReasons).toHaveLength(1);
    expect(result.gateReasons[0]).toContain('Pass rate');
    expect(result.gateReasons[0]).toContain('90.0%');
  });

  it('FAIL: low coverage', () => {
    const result = evaluateRealBuildData({
      unit_tests: { numPassed: 100, numFailed: 0, numTotal: 100 },
      coverage: { lines: 50 },
    });
    expect(result.gateResult).toBe('FAIL');
    expect(result.coveragePct).toBe(50);
    expect(result.gateReasons).toHaveLength(1);
    expect(result.gateReasons[0]).toContain('Coverage');
  });

  it('FAIL: both thresholds missed', () => {
    const result = evaluateRealBuildData({
      unit_tests: { numPassed: 80, numFailed: 20, numTotal: 100 },
      coverage: { lines: 30 },
    });
    expect(result.gateResult).toBe('FAIL');
    expect(result.gateReasons).toHaveLength(2);
  });

  it('PASS: only unit tests (no e2e, no coverage)', () => {
    const result = evaluateRealBuildData({
      unit_tests: { numPassed: 50, numFailed: 0, numTotal: 50 },
      e2e_tests: null,
      coverage: null,
    });
    expect(result.gateResult).toBe('PASS');
    expect(result.passRate).toBe(100);
    expect(result.coveragePct).toBeNull();
    expect(result.gateReasons).toHaveLength(0);
  });

  it('SKIP: no test or coverage data at all', () => {
    const result = evaluateRealBuildData({
      unit_tests: null,
      e2e_tests: null,
      coverage: null,
    });
    expect(result.gateResult).toBe('SKIP');
    expect(result.passRate).toBeNull();
    expect(result.coveragePct).toBeNull();
    expect(result.gateReasons).toHaveLength(1);
    expect(result.gateReasons[0]).toContain('No test or coverage data');
  });

  it('combines unit + e2e test counts', () => {
    const result = evaluateRealBuildData({
      unit_tests: { numPassed: 80, numFailed: 0, numTotal: 80 },
      e2e_tests: { numPassed: 18, numFailed: 2, numTotal: 20 },
      coverage: { lines: 70 },
    });
    expect(result.totalTests).toBe(100);
    expect(result.totalPassed).toBe(98);
    expect(result.passRate).toBe(98);
  });

  it('exports threshold constants', () => {
    expect(PASS_RATE_THRESHOLD).toBe(0.95);
    expect(COVERAGE_THRESHOLD).toBe(60);
  });
});
