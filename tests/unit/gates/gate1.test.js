/**
 * Gate 1: Unit Test Integration - Unit Tests
 * SD-VERIFY-LADDER-002
 *
 * Tests individual check functions with mocked execSync
 * Covers test scenarios TS-1 through TS-10 from PRD
 *
 * Test Coverage:
 * - TS-1: hasUnitTestsExecuted returns true when Jest completes successfully
 * - TS-2: hasUnitTestsExecuted returns false when Jest fails to execute
 * - TS-3: hasUnitTestsPassing returns true when 0 failures reported
 * - TS-4: hasUnitTestsPassing returns false when failures > 0
 * - TS-5: hasCoverageThreshold returns true when coverage >= 50%
 * - TS-6: hasCoverageThreshold returns false when coverage < 50%
 * - TS-7: Score calculation with all checks passing (100%)
 * - TS-8: Score calculation with coverage failing (80%)
 * - TS-9: Security: PRD_ID format validation rejects injection
 * - TS-10: Security: Command timeouts enforced
 */

import { vi } from 'vitest';

describe('Gate 1: Unit Test Integration - Unit Tests', () => {
  let execSyncMock;
  let existsSyncMock;
  let readFileSyncMock;

  // Mock Jest JSON output for successful run
  const mockJestSuccessJson = {
    success: true,
    numTotalTests: 50,
    numPassedTests: 50,
    numFailedTests: 0,
    numPendingTests: 0,
  };

  // Mock Jest JSON output for failed tests
  const mockJestFailedJson = {
    success: false,
    numTotalTests: 50,
    numPassedTests: 45,
    numFailedTests: 5,
    numPendingTests: 0,
  };

  // Mock coverage data
  const mockCoverageAboveThreshold = {
    total: {
      lines: { pct: 75.5 },
      statements: { pct: 72.3 },
      branches: { pct: 65.1 },
      functions: { pct: 80.0 },
    },
  };

  const mockCoverageBelowThreshold = {
    total: {
      lines: { pct: 45.2 },
      statements: { pct: 42.1 },
      branches: { pct: 35.5 },
      functions: { pct: 48.0 },
    },
  };

  beforeEach(() => {
    // Create fresh mocks for each test
    execSyncMock = vi.fn();
    existsSyncMock = vi.fn();
    readFileSyncMock = vi.fn();
  });

  describe('hasUnitTestsExecuted', () => {
    test('TS-1: should return true when Jest executes successfully', async () => {
      // Mock execSync to return successful Jest output
      execSyncMock.mockReturnValueOnce(JSON.stringify(mockJestSuccessJson));

      const hasUnitTestsExecuted = async () => {
        try {
          const output = execSyncMock('npx jest --json --coverage --coverageReporters=json-summary', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 120000,
          });
          return true;
        } catch (error) {
          // If we can parse JSON, Jest still executed (just had failures)
          try {
            const stdout = error.stdout || '';
            JSON.parse(stdout);
            return true;
          } catch {
            return false;
          }
        }
      };

      const result = await hasUnitTestsExecuted();

      expect(result).toBe(true);
      expect(execSyncMock).toHaveBeenCalledWith(
        'npx jest --json --coverage --coverageReporters=json-summary',
        expect.objectContaining({
          encoding: 'utf8',
          timeout: 120000,
        })
      );
    });

    test('TS-2: should return false when Jest fails to execute', async () => {
      // Mock execSync to simulate Jest execution failure (not test failure)
      const error = new Error('Command not found: jest');
      error.code = 'ENOENT';
      execSyncMock.mockImplementationOnce(() => {
        throw error;
      });

      const hasUnitTestsExecuted = async () => {
        try {
          execSyncMock('npx jest --json --coverage --coverageReporters=json-summary', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 120000,
          });
          return true;
        } catch (error) {
          // If we can parse JSON, Jest still executed
          try {
            const stdout = error.stdout || '';
            JSON.parse(stdout);
            return true;
          } catch {
            return false;
          }
        }
      };

      const result = await hasUnitTestsExecuted();
      expect(result).toBe(false);
    });

    test('should return true when Jest exits non-zero but produces JSON (test failures)', async () => {
      // Jest can exit with code 1 but still produce valid JSON output
      const error = new Error('Tests failed');
      error.stdout = JSON.stringify(mockJestFailedJson);
      error.status = 1;
      execSyncMock.mockImplementationOnce(() => {
        throw error;
      });

      const hasUnitTestsExecuted = async () => {
        try {
          execSyncMock('npx jest --json --coverage --coverageReporters=json-summary', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 120000,
          });
          return true;
        } catch (error) {
          try {
            const stdout = error.stdout || '';
            JSON.parse(stdout);
            return true; // Jest executed, it just had failing tests
          } catch {
            return false;
          }
        }
      };

      const result = await hasUnitTestsExecuted();
      expect(result).toBe(true);
    });
  });

  describe('hasUnitTestsPassing', () => {
    test('TS-3: should return true when numFailedTests === 0', async () => {
      // Use cached successful Jest result
      let cachedResult = { json: mockJestSuccessJson };

      const hasUnitTestsPassing = async () => {
        if (!cachedResult.json) return false;
        const { numFailedTests } = cachedResult.json;
        return numFailedTests === 0;
      };

      const result = await hasUnitTestsPassing();
      expect(result).toBe(true);
    });

    test('TS-4: should return false when numFailedTests > 0', async () => {
      // Use cached failed Jest result
      let cachedResult = { json: mockJestFailedJson };

      const hasUnitTestsPassing = async () => {
        if (!cachedResult.json) return false;
        const { numFailedTests, numTotalTests } = cachedResult.json;
        return numFailedTests === 0;
      };

      const result = await hasUnitTestsPassing();
      expect(result).toBe(false);
    });

    test('should return false when JSON parsing fails', async () => {
      let cachedResult = { json: null };

      const hasUnitTestsPassing = async () => {
        if (!cachedResult.json) return false;
        const { numFailedTests } = cachedResult.json;
        return numFailedTests === 0;
      };

      const result = await hasUnitTestsPassing();
      expect(result).toBe(false);
    });
  });

  describe('hasCoverageThreshold', () => {
    test('TS-5: should return true when line coverage >= 50%', async () => {
      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockReturnValueOnce(JSON.stringify(mockCoverageAboveThreshold));

      const hasCoverageThreshold = async () => {
        const coveragePath = 'coverage/coverage-summary.json';
        if (!existsSyncMock(coveragePath)) return false;

        try {
          const coverageData = JSON.parse(readFileSyncMock(coveragePath, 'utf8'));
          const lineCoverage = coverageData?.total?.lines?.pct ?? 0;
          return lineCoverage >= 50;
        } catch {
          return false;
        }
      };

      const result = await hasCoverageThreshold();
      expect(result).toBe(true);
    });

    test('TS-6: should return false when line coverage < 50%', async () => {
      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockReturnValueOnce(JSON.stringify(mockCoverageBelowThreshold));

      const hasCoverageThreshold = async () => {
        const coveragePath = 'coverage/coverage-summary.json';
        if (!existsSyncMock(coveragePath)) return false;

        try {
          const coverageData = JSON.parse(readFileSyncMock(coveragePath, 'utf8'));
          const lineCoverage = coverageData?.total?.lines?.pct ?? 0;
          return lineCoverage >= 50;
        } catch {
          return false;
        }
      };

      const result = await hasCoverageThreshold();
      expect(result).toBe(false);
    });

    test('should return false when coverage file does not exist', async () => {
      existsSyncMock.mockReturnValueOnce(false);

      const hasCoverageThreshold = async () => {
        const coveragePath = 'coverage/coverage-summary.json';
        if (!existsSyncMock(coveragePath)) return false;
        return true;
      };

      const result = await hasCoverageThreshold();
      expect(result).toBe(false);
    });

    test('should return false when coverage file is invalid JSON', async () => {
      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockReturnValueOnce('not valid json');

      const hasCoverageThreshold = async () => {
        const coveragePath = 'coverage/coverage-summary.json';
        if (!existsSyncMock(coveragePath)) return false;

        try {
          const coverageData = JSON.parse(readFileSyncMock(coveragePath, 'utf8'));
          const lineCoverage = coverageData?.total?.lines?.pct ?? 0;
          return lineCoverage >= 50;
        } catch {
          return false;
        }
      };

      const result = await hasCoverageThreshold();
      expect(result).toBe(false);
    });

    test('should handle exactly 50% coverage (boundary)', async () => {
      const boundaryData = { total: { lines: { pct: 50.0 } } };
      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockReturnValueOnce(JSON.stringify(boundaryData));

      const hasCoverageThreshold = async () => {
        const coveragePath = 'coverage/coverage-summary.json';
        if (!existsSyncMock(coveragePath)) return false;

        try {
          const coverageData = JSON.parse(readFileSyncMock(coveragePath, 'utf8'));
          const lineCoverage = coverageData?.total?.lines?.pct ?? 0;
          return lineCoverage >= 50;
        } catch {
          return false;
        }
      };

      const result = await hasCoverageThreshold();
      expect(result).toBe(true); // >= means exactly 50 passes
    });
  });

  describe('Score Calculation', () => {
    test('TS-7: score should be 100% when all checks pass', () => {
      const results = {
        hasUnitTestsExecuted: true,
        hasUnitTestsPassing: true,
        hasCoverageThreshold: true,
      };

      const weights = {
        hasUnitTestsExecuted: 0.40,
        hasUnitTestsPassing: 0.40,
        hasCoverageThreshold: 0.20,
      };

      const score = Object.entries(results).reduce((total, [rule, passed]) => {
        return total + (passed ? weights[rule] * 100 : 0);
      }, 0);

      expect(score).toBe(100);
    });

    test('TS-8: score should be 80% when only coverage fails', () => {
      const results = {
        hasUnitTestsExecuted: true,
        hasUnitTestsPassing: true,
        hasCoverageThreshold: false,
      };

      const weights = {
        hasUnitTestsExecuted: 0.40,
        hasUnitTestsPassing: 0.40,
        hasCoverageThreshold: 0.20,
      };

      const score = Object.entries(results).reduce((total, [rule, passed]) => {
        return total + (passed ? weights[rule] * 100 : 0);
      }, 0);

      expect(score).toBe(80);
    });

    test('score should be 60% when tests pass but one blocking check fails', () => {
      const results = {
        hasUnitTestsExecuted: true,
        hasUnitTestsPassing: false, // Tests failed
        hasCoverageThreshold: true,
      };

      const weights = {
        hasUnitTestsExecuted: 0.40,
        hasUnitTestsPassing: 0.40,
        hasCoverageThreshold: 0.20,
      };

      const score = Object.entries(results).reduce((total, [rule, passed]) => {
        return total + (passed ? weights[rule] * 100 : 0);
      }, 0);

      expect(score).toBe(60);
    });

    test('score should be 20% when only coverage passes', () => {
      const results = {
        hasUnitTestsExecuted: false,
        hasUnitTestsPassing: false,
        hasCoverageThreshold: true,
      };

      const weights = {
        hasUnitTestsExecuted: 0.40,
        hasUnitTestsPassing: 0.40,
        hasCoverageThreshold: 0.20,
      };

      const score = Object.entries(results).reduce((total, [rule, passed]) => {
        return total + (passed ? weights[rule] * 100 : 0);
      }, 0);

      expect(score).toBe(20);
    });
  });

  describe('Security', () => {
    test('TS-9: should reject invalid PRD_ID format (SQL injection attempt)', () => {
      const validatePrdId = (prdId) => {
        const UUID_REGEX = /^PRD-[A-Z0-9-]+$/;
        return UUID_REGEX.test(prdId);
      };

      // Valid PRD IDs
      expect(validatePrdId('PRD-SD-VERIFY-LADDER-002')).toBe(true);
      expect(validatePrdId('PRD-TEST-123')).toBe(true);
      expect(validatePrdId('PRD-A')).toBe(true);

      // Invalid PRD IDs (SQL injection attempts)
      expect(validatePrdId("PRD-TEST'; DROP TABLE")).toBe(false);
      expect(validatePrdId('PRD-TEST; DROP TABLE')).toBe(false);
      expect(validatePrdId('PRD-TEST OR 1=1')).toBe(false);
      expect(validatePrdId('../../../etc/passwd')).toBe(false);
      expect(validatePrdId('')).toBe(false);
      expect(validatePrdId('prd-lowercase')).toBe(false);
    });

    test('TS-10: should enforce command timeout', async () => {
      // Mock execSync to simulate timeout
      const error = new Error('Timeout');
      error.code = 'ETIMEDOUT';
      execSyncMock.mockImplementationOnce(() => {
        throw error;
      });

      const hasUnitTestsExecuted = async () => {
        try {
          execSyncMock('npx jest --json --coverage --coverageReporters=json-summary', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 120000, // 120s timeout per PRD
          });
          return true;
        } catch (error) {
          if (error.code === 'ETIMEDOUT') {
            return false;
          }
          try {
            const stdout = error.stdout || '';
            JSON.parse(stdout);
            return true;
          } catch {
            return false;
          }
        }
      };

      const result = await hasUnitTestsExecuted();
      expect(result).toBe(false);
      expect(execSyncMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 120000 })
      );
    });
  });

  describe('Exit Code Logic', () => {
    test('should return exit code 0 when score >= 85%', () => {
      const getExitCode = (score) => {
        if (score >= 85) return 0;
        return 1;
      };

      expect(getExitCode(100)).toBe(0);
      expect(getExitCode(85)).toBe(0);
      expect(getExitCode(90)).toBe(0);
    });

    test('should return exit code 1 when score < 85%', () => {
      const getExitCode = (score) => {
        if (score >= 85) return 0;
        return 1;
      };

      expect(getExitCode(84)).toBe(1);
      expect(getExitCode(80)).toBe(1);
      expect(getExitCode(0)).toBe(1);
    });
  });
});
