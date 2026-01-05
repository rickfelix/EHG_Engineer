/**
 * Tests for Mock Mode Injector
 * SD-GENESIS-V31-MASON-P2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hasMockModeAssertion,
  injectMockMode,
  MOCK_MODE_ASSERTION,
  MOCK_MODE_ASSERTION_COMPACT,
  MOCK_MODE_IMPORT,
} from '../../../lib/genesis/mock-mode-injector.js';

describe('Mock Mode Injector', () => {
  describe('hasMockModeAssertion', () => {
    it('should detect assertMockMode() call', () => {
      const content = 'const x = 1;\nassertMockMode();\nconst y = 2;';
      expect(hasMockModeAssertion(content)).toBe(true);
    });

    it('should detect EHG_MOCK_MODE reference', () => {
      const content = 'if (process.env.EHG_MOCK_MODE) {}';
      expect(hasMockModeAssertion(content)).toBe(true);
    });

    it('should detect GENESIS SAFETY comment', () => {
      const content = '// [GENESIS SAFETY] check';
      expect(hasMockModeAssertion(content)).toBe(true);
    });

    it('should return false for clean code', () => {
      const content = 'const x = 1;\nfunction test() {}';
      expect(hasMockModeAssertion(content)).toBe(false);
    });
  });

  describe('injectMockMode', () => {
    it('should inject assertion at start of file', () => {
      const content = 'const x = 1;';
      const result = injectMockMode(content);
      expect(result).toContain('assertMockMode()');
      expect(result).toContain('EHG_MOCK_MODE');
    });

    it('should skip if already has assertion', () => {
      const content = 'assertMockMode();\nconst x = 1;';
      const result = injectMockMode(content, { skipIfExists: true });
      // Should not duplicate
      const matches = result.match(/assertMockMode/g);
      expect(matches.length).toBe(1);
    });

    it('should inject compact version', () => {
      const content = 'const x = 1;';
      const result = injectMockMode(content, { compact: true });
      expect(result).toContain("EHG_MOCK_MODE!=='true'");
    });

    it('should inject import version', () => {
      const content = 'const x = 1;';
      const result = injectMockMode(content, { useImport: true });
      expect(result).toContain('import { assertMockMode }');
    });

    it('should preserve shebang', () => {
      const content = '#!/usr/bin/env node\nconst x = 1;';
      const result = injectMockMode(content);
      expect(result.startsWith('#!/usr/bin/env node')).toBe(true);
    });

    it('should preserve use strict', () => {
      const content = "'use strict';\nconst x = 1;";
      const result = injectMockMode(content);
      expect(result.indexOf("'use strict'")).toBeLessThan(result.indexOf('assertMockMode'));
    });

    it('should place after imports', () => {
      const content = "import fs from 'fs';\nimport path from 'path';\n\nfunction main() {}";
      const result = injectMockMode(content);
      // assertMockMode should appear after imports
      const importIndex = result.lastIndexOf('import');
      const assertIndex = result.indexOf('assertMockMode');
      expect(assertIndex).toBeGreaterThan(importIndex);
    });
  });

  describe('assertion constants', () => {
    it('should contain EHG_MOCK_MODE check', () => {
      expect(MOCK_MODE_ASSERTION).toContain('EHG_MOCK_MODE');
      expect(MOCK_MODE_ASSERTION).toContain("!== 'true'");
    });

    it('should contain GENESIS SAFETY message', () => {
      expect(MOCK_MODE_ASSERTION).toContain('[GENESIS SAFETY]');
    });

    it('compact version should be single line', () => {
      const lines = MOCK_MODE_ASSERTION_COMPACT.split('\n');
      expect(lines.length).toBe(1);
    });

    it('import version should have import statement', () => {
      expect(MOCK_MODE_IMPORT).toContain('import {');
      expect(MOCK_MODE_IMPORT).toContain('assertMockMode');
    });
  });
});
