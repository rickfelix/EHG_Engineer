/**
 * Unit tests for Stage 20 - Quality Assurance template
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Test Scenario: Stage 20 validation enforces test suite data and
 * evaluates quality gate (100% pass rate, >= 60% coverage).
 *
 * @module tests/unit/eva/stage-templates/stage-20.test
 */

import { describe, it, expect } from 'vitest';
import stage20, { MIN_TEST_SUITES, MIN_COVERAGE_PCT } from '../../../../lib/eva/stage-templates/stage-20.js';

describe('stage-20.js - Quality Assurance template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage20.id).toBe('stage-20');
      expect(stage20.slug).toBe('quality-assurance');
      expect(stage20.title).toBe('Quality Assurance');
      expect(stage20.version).toBe('1.0.0');
    });

    it('should have schema definition', () => {
      expect(stage20.schema).toBeDefined();
      expect(stage20.schema.test_suites).toBeDefined();
      expect(stage20.schema.known_defects).toBeDefined();
      expect(stage20.schema.overall_pass_rate).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage20.defaultData).toEqual({
        test_suites: [],
        known_defects: [],
        overall_pass_rate: 0,
        coverage_pct: 0,
        critical_failures: 0,
        total_tests: 0,
        total_passing: 0,
        quality_gate_passed: false,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage20.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage20.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(MIN_TEST_SUITES).toBe(1);
      expect(MIN_COVERAGE_PCT).toBe(60);
    });
  });

  describe('validate() - Test suites', () => {
    it('should pass for valid test suites', () => {
      const validData = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 100, coverage_pct: 80 },
        ],
      };
      const result = stage20.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing test_suites array', () => {
      const invalidData = {};
      const result = stage20.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('test_suites'))).toBe(true);
    });

    it('should fail for empty test_suites array', () => {
      const invalidData = { test_suites: [] };
      const result = stage20.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('test_suites') && e.includes('at least 1'))).toBe(true);
    });

    it('should fail for test suite missing name', () => {
      const invalidData = {
        test_suites: [{ total_tests: 100, passing_tests: 100 }],
      };
      const result = stage20.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('test_suites[0].name'))).toBe(true);
    });

    it('should fail for test suite missing total_tests', () => {
      const invalidData = {
        test_suites: [{ name: 'Unit Tests', passing_tests: 100 }],
      };
      const result = stage20.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('test_suites[0].total_tests'))).toBe(true);
    });

    it('should fail for test suite missing passing_tests', () => {
      const invalidData = {
        test_suites: [{ name: 'Unit Tests', total_tests: 100 }],
      };
      const result = stage20.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('test_suites[0].passing_tests'))).toBe(true);
    });

    it('should fail for negative total_tests', () => {
      const invalidData = {
        test_suites: [{ name: 'Unit Tests', total_tests: -1, passing_tests: 0 }],
      };
      const result = stage20.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('test_suites[0].total_tests'))).toBe(true);
    });

    it('should fail for negative passing_tests', () => {
      const invalidData = {
        test_suites: [{ name: 'Unit Tests', total_tests: 100, passing_tests: -1 }],
      };
      const result = stage20.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('test_suites[0].passing_tests'))).toBe(true);
    });

    it('should fail for passing_tests > total_tests', () => {
      const invalidData = {
        test_suites: [{ name: 'Unit Tests', total_tests: 100, passing_tests: 101 }],
      };
      const result = stage20.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('passing_tests') && e.includes('cannot exceed'))).toBe(true);
    });

    it('should pass with optional coverage_pct', () => {
      const validData = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 100, coverage_pct: 80 },
        ],
      };
      const result = stage20.validate(validData);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Known defects (optional)', () => {
    it('should pass when known_defects are omitted', () => {
      const validData = {
        test_suites: [{ name: 'Unit Tests', total_tests: 100, passing_tests: 100 }],
      };
      const result = stage20.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when known_defects are empty array', () => {
      const validData = {
        test_suites: [{ name: 'Unit Tests', total_tests: 100, passing_tests: 100 }],
        known_defects: [],
      };
      const result = stage20.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when known_defects have valid items', () => {
      const validData = {
        test_suites: [{ name: 'Unit Tests', total_tests: 100, passing_tests: 100 }],
        known_defects: [
          { description: 'Defect 1', severity: 'low', status: 'open' },
        ],
      };
      const result = stage20.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should fail for defect missing description', () => {
      const invalidData = {
        test_suites: [{ name: 'Unit Tests', total_tests: 100, passing_tests: 100 }],
        known_defects: [{ severity: 'low', status: 'open' }],
      };
      const result = stage20.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('known_defects[0].description'))).toBe(true);
    });

    it('should fail for defect missing severity', () => {
      const invalidData = {
        test_suites: [{ name: 'Unit Tests', total_tests: 100, passing_tests: 100 }],
        known_defects: [{ description: 'Defect 1', status: 'open' }],
      };
      const result = stage20.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('known_defects[0].severity'))).toBe(true);
    });

    it('should fail for defect missing status', () => {
      const invalidData = {
        test_suites: [{ name: 'Unit Tests', total_tests: 100, passing_tests: 100 }],
        known_defects: [{ description: 'Defect 1', severity: 'low' }],
      };
      const result = stage20.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('known_defects[0].status'))).toBe(true);
    });
  });

  describe('computeDerived() - Test metrics', () => {
    it('should calculate total_tests correctly', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 95 },
          { name: 'E2E Tests', total_tests: 50, passing_tests: 48 },
        ],
      };
      const result = stage20.computeDerived(data);
      expect(result.total_tests).toBe(150);
    });

    it('should calculate total_passing correctly', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 95 },
          { name: 'E2E Tests', total_tests: 50, passing_tests: 48 },
        ],
      };
      const result = stage20.computeDerived(data);
      expect(result.total_passing).toBe(143);
    });

    it('should calculate overall_pass_rate correctly', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 100 },
          { name: 'E2E Tests', total_tests: 50, passing_tests: 48 },
        ],
      };
      const result = stage20.computeDerived(data);
      // 148 / 150 = 98.67%
      expect(result.overall_pass_rate).toBe(98.67);
    });

    it('should return 0 overall_pass_rate for zero tests', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 0, passing_tests: 0 },
        ],
      };
      const result = stage20.computeDerived(data);
      expect(result.overall_pass_rate).toBe(0);
    });
  });

  describe('computeDerived() - Coverage', () => {
    it('should calculate average coverage_pct correctly', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 100, coverage_pct: 80 },
          { name: 'E2E Tests', total_tests: 50, passing_tests: 50, coverage_pct: 60 },
        ],
      };
      const result = stage20.computeDerived(data);
      // (80 + 60) / 2 = 70%
      expect(result.coverage_pct).toBe(70);
    });

    it('should ignore suites without coverage_pct', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 100, coverage_pct: 80 },
          { name: 'E2E Tests', total_tests: 50, passing_tests: 50 },
        ],
      };
      const result = stage20.computeDerived(data);
      expect(result.coverage_pct).toBe(80);
    });

    it('should return 0 coverage_pct when no suites have coverage', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 100 },
        ],
      };
      const result = stage20.computeDerived(data);
      expect(result.coverage_pct).toBe(0);
    });
  });

  describe('computeDerived() - Quality gate', () => {
    it('should pass quality gate for 100% pass rate and >= 60% coverage', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 100, coverage_pct: 80 },
        ],
      };
      const result = stage20.computeDerived(data);
      expect(result.quality_gate_passed).toBe(true);
    });

    it('should fail quality gate for < 100% pass rate', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 99, coverage_pct: 80 },
        ],
      };
      const result = stage20.computeDerived(data);
      expect(result.quality_gate_passed).toBe(false);
    });

    it('should fail quality gate for < 60% coverage', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 100, coverage_pct: 59 },
        ],
      };
      const result = stage20.computeDerived(data);
      expect(result.quality_gate_passed).toBe(false);
    });

    it('should pass quality gate at exactly 60% coverage', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 100, coverage_pct: 60 },
        ],
      };
      const result = stage20.computeDerived(data);
      expect(result.quality_gate_passed).toBe(true);
    });
  });

  describe('computeDerived() - Critical failures', () => {
    it('should calculate critical_failures correctly', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 95 },
          { name: 'E2E Tests', total_tests: 50, passing_tests: 48 },
        ],
      };
      const result = stage20.computeDerived(data);
      // 150 - 143 = 7 failures
      expect(result.critical_failures).toBe(7);
    });

    it('should return 0 critical_failures for 100% pass rate', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 100 },
        ],
      };
      const result = stage20.computeDerived(data);
      expect(result.critical_failures).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty test_suites array in computeDerived', () => {
      const data = { test_suites: [] };
      const result = stage20.computeDerived(data);
      expect(result.total_tests).toBe(0);
      expect(result.total_passing).toBe(0);
      expect(result.overall_pass_rate).toBe(0);
      expect(result.coverage_pct).toBe(0);
      expect(result.critical_failures).toBe(0);
      expect(result.quality_gate_passed).toBe(false);
    });

    it('should handle null data in validate', () => {
      const result = stage20.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data in validate', () => {
      const result = stage20.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 100, coverage_pct: 80 },
          { name: 'E2E Tests', total_tests: 50, passing_tests: 50, coverage_pct: 70 },
        ],
        known_defects: [
          { description: 'Minor UI bug', severity: 'low', status: 'open' },
        ],
      };
      const validation = stage20.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage20.computeDerived(data);
      expect(computed.total_tests).toBe(150);
      expect(computed.total_passing).toBe(150);
      expect(computed.overall_pass_rate).toBe(100);
      expect(computed.coverage_pct).toBe(75);
      expect(computed.quality_gate_passed).toBe(true);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 101 }, // Invalid
        ],
      };
      const computed = stage20.computeDerived(data);
      expect(computed.total_tests).toBe(100);
      expect(computed.total_passing).toBe(101);
    });
  });
});
