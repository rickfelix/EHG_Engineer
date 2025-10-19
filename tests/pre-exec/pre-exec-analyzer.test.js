/**
 * Tier 1 Smoke Tests for Pre-EXEC Analyzer
 * SD-PRE-EXEC-ANALYSIS-001
 *
 * Purpose: MANDATORY smoke tests covering critical paths
 * Execution time: <60 seconds
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PathValidator } from '../../scripts/modules/pre-exec/path-validator.js';
import { FileDiscoveryEngine } from '../../scripts/modules/pre-exec/file-discovery.js';
import { DependencyAnalyzer } from '../../scripts/modules/pre-exec/dependency-analyzer.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

describe('Tier 1 Smoke Tests - Pre-EXEC Analyzer', () => {
  describe('Test 1: Path Validation Blocks Traversal', () => {
    it('should block path traversal attempts', () => {
      const validator = new PathValidator(projectRoot);

      // Test traversal attempt
      const result = validator.validate('../../etc/passwd');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Path traversal blocked');
      expect(validator.getAuditLog().length).toBeGreaterThan(0);
    });

    it('should allow valid paths within project', () => {
      const validator = new PathValidator(projectRoot);

      const result = validator.validate('scripts/pre-exec-analyzer.js');

      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBeDefined();
    });
  });

  describe('Test 2: Sensitive File Exclusion', () => {
    it('should exclude .env files', () => {
      const validator = new PathValidator(projectRoot);

      const result = validator.validate('.env');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Sensitive file excluded');
    });

    it('should exclude credentials files', () => {
      const validator = new PathValidator(projectRoot);

      const result = validator.validate('config/credentials.json');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Sensitive file excluded');
    });

    it('should exclude .ssh directory', () => {
      const validator = new PathValidator(projectRoot);

      const result = validator.validate('.ssh/id_rsa');

      expect(result.valid).toBe(false);
    });
  });

  describe('Test 3: File Discovery Basic', () => {
    it('should discover files based on PRD hints', async () => {
      const validator = new PathValidator(projectRoot);
      const discovery = new FileDiscoveryEngine(projectRoot, validator);

      const prdHints = {
        system_architecture: {
          components: [
            {
              name: 'PreExecAnalyzer',
              file_path: 'scripts/pre-exec-analyzer.js'
            }
          ]
        }
      };

      const result = await discovery.discover(prdHints);

      expect(result).toBeDefined();
      expect(result.primary).toBeInstanceOf(Array);
      expect(result.tests).toBeInstanceOf(Array);
      expect(result.configs).toBeInstanceOf(Array);
      expect(result.excluded).toBeInstanceOf(Array);
    });
  });

  describe('Test 4: Dependency Parser', () => {
    it('should parse ES6 imports from file content', async () => {
      const analyzer = new DependencyAnalyzer();

      // Create a test file path (doesn't need to exist for AST parsing test)
      const testFilePath = path.join(projectRoot, 'test-file.js');

      // Test content with ES6 imports
      const testContent = `
        import { foo } from 'bar';
        import React from 'react';
        import { something } from './local-module';

        export const myFunction = () => {};
        export default MyComponent;
      `;

      // Parse directly (bypassing file read for unit test)
      const ast = analyzer.parseFile(testContent, testFilePath);

      expect(ast).toBeDefined();
      expect(ast.type).toBe('File');
    });

    it('should handle parse errors gracefully', async () => {
      const analyzer = new DependencyAnalyzer();

      const invalidContent = 'this is not valid javascript {{{';
      const result = analyzer.parseFile(invalidContent, 'test.js');

      expect(result).toBeNull();
    });
  });

  describe('Test 5: Batch Path Validation', () => {
    it('should validate multiple paths and categorize results', () => {
      const validator = new PathValidator(projectRoot);

      const paths = [
        'scripts/pre-exec-analyzer.js',  // Valid
        '../../etc/passwd',  // Invalid - traversal
        '.env',  // Invalid - sensitive
        'lib/utils.js'  // Valid
      ];

      const result = validator.validateBatch(paths);

      expect(result.valid).toBeInstanceOf(Array);
      expect(result.invalid).toBeInstanceOf(Array);
      expect(result.valid.length).toBeGreaterThan(0);
      expect(result.invalid.length).toBeGreaterThan(0);
    });
  });
});
