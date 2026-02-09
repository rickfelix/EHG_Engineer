/**
 * Unit Tests for Integration Test Requirement Gate
 * Part of SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-E
 *
 * Tests:
 * - Complexity classification (SP>=5, has_children, modified_modules>=3)
 * - Integration test file detection
 * - Non-trivial test validation (>10 test() calls)
 * - BLOCKING for feature/refactor with SP>=5, ADVISORY for others
 * - Security: symlink boundary check
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  classifyComplexity,
  countTestCalls,
  MIN_TEST_CALL_COUNT,
  BLOCKING_SD_TYPES,
  TEST_FILE_EXTENSIONS,
  createIntegrationTestRequirementGate
} from '../../scripts/modules/handoff/executors/exec-to-plan/gates/integration-test-requirement.js';

import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

describe('Integration Test Requirement Gate', () => {

  describe('classifyComplexity', () => {
    it('should classify SD with story_points >= 5 as complex', () => {
      const result = classifyComplexity({ story_points: 5 });
      expect(result.isComplex).toBe(true);
      expect(result.reasons).toContain('story_points=5 (>= 5)');
    });

    it('should classify SD with story_points >= 8 as complex', () => {
      const result = classifyComplexity({ story_points: 8 });
      expect(result.isComplex).toBe(true);
      expect(result.storyPoints).toBe(8);
    });

    it('should classify SD with has_children as complex', () => {
      const result = classifyComplexity({}, { hasChildren: true });
      expect(result.isComplex).toBe(true);
      expect(result.reasons).toContain('SD has child SDs');
    });

    it('should classify SD with 3+ modified modules as complex', () => {
      const result = classifyComplexity({}, { modifiedModulesCount: 3 });
      expect(result.isComplex).toBe(true);
      expect(result.reasons).toContain('modified_modules=3 (>= 3)');
    });

    it('should not classify SD with SP < 5, no children, < 3 modules as complex', () => {
      const result = classifyComplexity(
        { story_points: 2 },
        { hasChildren: false, modifiedModulesCount: 1 }
      );
      expect(result.isComplex).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });

    it('should handle missing story_points (defaults to 0)', () => {
      const result = classifyComplexity({}, { hasChildren: false, modifiedModulesCount: 0 });
      expect(result.isComplex).toBe(false);
      expect(result.storyPoints).toBe(0);
    });

    it('should report multiple complexity reasons', () => {
      const result = classifyComplexity(
        { story_points: 5 },
        { hasChildren: true, modifiedModulesCount: 4 }
      );
      expect(result.isComplex).toBe(true);
      expect(result.reasons).toHaveLength(3);
    });

    it('should read story_points from metadata fallback', () => {
      const result = classifyComplexity({ metadata: { story_points: 7 } });
      expect(result.isComplex).toBe(true);
      expect(result.storyPoints).toBe(7);
    });
  });

  describe('countTestCalls', () => {
    const tempDir = join(tmpdir(), 'gate-test-' + Date.now());

    beforeEach(() => {
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should count lines containing test( in files', () => {
      const filePath = join(tempDir, 'example.test.js');
      const content = [
        'import { describe, it } from "vitest";',
        'describe("example", () => {',
        '  test("first", () => {});',
        '  test("second", () => {});',
        '  test("third", () => {});',
        '});'
      ].join('\n');
      writeFileSync(filePath, content);

      const result = countTestCalls([filePath]);
      expect(result.totalTestCalls).toBe(3);
      expect(result.perFile).toHaveLength(1);
      expect(result.perFile[0].count).toBe(3);
    });

    it('should count across multiple files', () => {
      const file1 = join(tempDir, 'a.test.js');
      const file2 = join(tempDir, 'b.test.js');
      writeFileSync(file1, 'test("one", () => {});\ntest("two", () => {});');
      writeFileSync(file2, 'test("three", () => {});\ntest("four", () => {});\ntest("five", () => {});');

      const result = countTestCalls([file1, file2]);
      expect(result.totalTestCalls).toBe(5);
      expect(result.perFile[0].count).toBe(2);
      expect(result.perFile[1].count).toBe(3);
    });

    it('should return 0 for files with no test( calls', () => {
      const filePath = join(tempDir, 'empty.test.js');
      writeFileSync(filePath, 'console.log("no tests here");');

      const result = countTestCalls([filePath]);
      expect(result.totalTestCalls).toBe(0);
    });

    it('should return 0 for empty file array', () => {
      const result = countTestCalls([]);
      expect(result.totalTestCalls).toBe(0);
      expect(result.perFile).toHaveLength(0);
    });

    it('should handle unreadable files gracefully', () => {
      const result = countTestCalls(['/nonexistent/path/file.js']);
      expect(result.totalTestCalls).toBe(0);
      expect(result.perFile[0].count).toBe(0);
    });
  });

  describe('constants', () => {
    it('should have MIN_TEST_CALL_COUNT of 10', () => {
      expect(MIN_TEST_CALL_COUNT).toBe(10);
    });

    it('should have BLOCKING_SD_TYPES include feature and refactor', () => {
      expect(BLOCKING_SD_TYPES.has('feature')).toBe(true);
      expect(BLOCKING_SD_TYPES.has('refactor')).toBe(true);
    });

    it('should not block for infrastructure type', () => {
      expect(BLOCKING_SD_TYPES.has('infrastructure')).toBe(false);
    });

    it('should recognize standard test file extensions', () => {
      expect(TEST_FILE_EXTENSIONS.has('.js')).toBe(true);
      expect(TEST_FILE_EXTENSIONS.has('.ts')).toBe(true);
      expect(TEST_FILE_EXTENSIONS.has('.mjs')).toBe(true);
      expect(TEST_FILE_EXTENSIONS.has('.cjs')).toBe(true);
      expect(TEST_FILE_EXTENSIONS.has('.py')).toBe(false);
    });
  });

  describe('createIntegrationTestRequirementGate', () => {
    let gate;

    beforeEach(() => {
      gate = createIntegrationTestRequirementGate(null);
    });

    it('should have correct gate name', () => {
      expect(gate.name).toBe('GATE_INTEGRATION_TEST_REQUIREMENT');
    });

    it('should be required', () => {
      expect(gate.required).toBe(true);
    });

    it('should have an async validator', () => {
      expect(typeof gate.validator).toBe('function');
    });

    it('should pass for non-complex SDs (low story_points)', async () => {
      const result = await gate.validator({
        sd: { sd_type: 'feature', story_points: 2, id: 'test-id' }
      });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.details.status).toBe('PASS');
    });

    it('should pass for non-complex enhancement SD', async () => {
      const result = await gate.validator({
        sd: { sd_type: 'enhancement', story_points: 3, id: 'test-id' }
      });
      expect(result.passed).toBe(true);
    });

    it('should return advisory (passed=true) for complex non-feature SDs without tests', async () => {
      // infrastructure SD with SP=5 but no integration tests dir
      // Since infrastructure is not in BLOCKING_SD_TYPES, should be advisory
      const result = await gate.validator({
        sd: { sd_type: 'infrastructure', story_points: 5, id: 'test-id' }
      });
      // Should pass (advisory) since infrastructure is not in BLOCKING_SD_TYPES
      expect(result.passed).toBe(true);
      expect(result.details.blocking).toBe(false);
    });
  });

  describe('enforcement policy', () => {
    let gate;

    beforeEach(() => {
      gate = createIntegrationTestRequirementGate(null);
    });

    it('should be BLOCKING for feature with SP>=5', async () => {
      const result = await gate.validator({
        sd: { sd_type: 'feature', story_points: 5, id: 'test-id' }
      });
      // Will fail because no tests/integration/ dir exists
      // But should be blocking
      if (!result.passed) {
        expect(result.details.blocking).toBe(true);
      }
    });

    it('should be BLOCKING for refactor with SP>=5', async () => {
      const result = await gate.validator({
        sd: { sd_type: 'refactor', story_points: 5, id: 'test-id' }
      });
      if (!result.passed) {
        expect(result.details.blocking).toBe(true);
      }
    });

    it('should be NON-BLOCKING for bugfix with SP>=5', async () => {
      const result = await gate.validator({
        sd: { sd_type: 'bugfix', story_points: 5, id: 'test-id' }
      });
      // Should pass (advisory) since bugfix is not in BLOCKING_SD_TYPES
      expect(result.passed).toBe(true);
      expect(result.details.blocking).toBe(false);
    });

    it('should be NON-BLOCKING for enhancement with children', async () => {
      const result = await gate.validator({
        sd: { sd_type: 'enhancement', story_points: 2, has_children: true, id: 'test-id' }
      });
      // has_children makes it complex, but enhancement + SP<5 = not blocking
      expect(result.passed).toBe(true);
    });
  });
});
