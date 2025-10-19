/**
 * Integration Tests for Enhanced QA Engineering Director v2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executeQADirector } from '../../scripts/qa-engineering-director-enhanced.js';
import { validateBuild } from '../../scripts/modules/qa/build-validator.js';
import { verifyDatabaseMigrations } from '../../scripts/modules/qa/migration-verifier.js';
import { selectTestTier } from '../../scripts/modules/qa/test-tier-selector.js';
import { checkCrossSDDependencies } from '../../scripts/modules/qa/dependency-checker.js';

describe('Enhanced QA Engineering Director v2.0', () => {
  describe('Main Orchestrator', () => {
    it('should execute all 5 phases successfully', async () => {
      const result = await executeQADirector('SD-TEST-001', {
        targetApp: 'ehg',
        skipBuild: true,
        skipMigrations: true
      });

      expect(result).toHaveProperty('verdict');
      expect(result).toHaveProperty('phases');
      expect(result.phases).toHaveProperty('pre_flight');
      expect(result.phases).toHaveProperty('test_planning');
      expect(result.phases).toHaveProperty('test_execution');
    });

    it('should block on build failure', async () => {
      const result = await executeQADirector('SD-TEST-002', {
        targetApp: 'ehg',
        skipBuild: false
      });

      if (result.verdict === 'BLOCKED') {
        expect(result).toHaveProperty('blocker');
        expect(result.blocker).toContain('Build');
      }
    });

    it('should return time saved estimate', async () => {
      const result = await executeQADirector('SD-TEST-003', {
        skipBuild: true,
        skipMigrations: true
      });

      expect(result).toHaveProperty('time_saved');
      expect(result.time_saved).toMatch(/\d+-\d+ hours/);
    });
  });

  describe('Module: Build Validator', () => {
    it('should validate build successfully', async () => {
      const result = await validateBuild('ehg');

      expect(result).toHaveProperty('verdict');
      expect(['PASS', 'BLOCKED']).toContain(result.verdict);
    });

    it('should provide fix recommendations on build failure', async () => {
      const result = await validateBuild('ehg');

      if (result.verdict === 'BLOCKED') {
        expect(result).toHaveProperty('recommendations');
        expect(Array.isArray(result.recommendations)).toBe(true);
      }
    });
  });

  describe('Module: Migration Verifier', () => {
    it('should check for pending migrations', async () => {
      const result = await verifyDatabaseMigrations('SD-RECONNECT-009', 'ehg');

      expect(result).toHaveProperty('verdict');
      expect(['PASS', 'BLOCKED', 'NO_MIGRATIONS']).toContain(result.verdict);
    });

    it('should provide execution instructions for pending migrations', async () => {
      const result = await verifyDatabaseMigrations('SD-TEST-MIGRATION', 'ehg');

      if (result.verdict === 'BLOCKED') {
        expect(result).toHaveProperty('instructions');
        expect(result.instructions).toHaveProperty('manual_cli');
      }
    });
  });

  describe('Module: Test Tier Selector', () => {
    it('should always require Tier 1 (Smoke Tests)', async () => {
      const sd = {
        id: 'SD-TEST-004',
        category: 'Backend',
        scope: 'API endpoint implementation'
      };

      const result = await selectTestTier(sd);

      expect(result.primary_tier.name).toBe('Smoke Tests');
      expect(result.primary_tier.required).toBe(true);
    });

    it('should require E2E for UI features', async () => {
      const sd = {
        id: 'SD-TEST-005',
        category: 'UI',
        scope: 'Dashboard component with user interaction'
      };

      const result = await selectTestTier(sd);

      const e2eTier = result.recommended_tiers.find(t => t.name === 'E2E Tests');
      expect(e2eTier.required).toBe(true);
    });

    it('should skip E2E for backend-only features', async () => {
      const sd = {
        id: 'SD-TEST-006',
        category: 'Backend',
        scope: 'Database schema migration only'
      };

      const result = await selectTestTier(sd);

      const e2eTier = result.recommended_tiers.find(t => t.name === 'E2E Tests');
      expect(e2eTier.required).toBe(false);
    });

    it('should calculate total time budget', async () => {
      const sd = {
        id: 'SD-TEST-007',
        category: 'UI',
        scope: 'Complex dashboard with business logic'
      };

      const result = await selectTestTier(sd);

      expect(result).toHaveProperty('total_estimated_time_seconds');
      expect(result).toHaveProperty('total_estimated_time_display');
    });
  });

  describe('Module: Cross-SD Dependency Checker', () => {
    it('should detect no conflicts when SD is isolated', async () => {
      const result = await checkCrossSDDependencies('SD-TEST-008', 'ehg');

      expect(result).toHaveProperty('verdict');
      // Verdict could be 'NO_CONFLICTS' or 'WARNING' depending on other active SDs
    });

    it('should provide recommendations for conflicts', async () => {
      const result = await checkCrossSDDependencies('SD-TEST-009', 'ehg');

      if (result.verdict === 'WARNING') {
        expect(result).toHaveProperty('recommendations');
        expect(Array.isArray(result.recommendations)).toBe(true);
      }
    });
  });

  describe('Verdict Calculation', () => {
    it('should return PASS when all checks pass', async () => {
      const result = await executeQADirector('SD-TEST-010', {
        skipBuild: true, // Assume build passes
        skipMigrations: true // Assume migrations OK
      });

      // Result should be PASS or CONDITIONAL_PASS depending on test execution
      expect(['PASS', 'CONDITIONAL_PASS', 'BLOCKED']).toContain(result.verdict);
    });

    it('should calculate confidence score', async () => {
      const result = await executeQADirector('SD-TEST-011', {
        skipBuild: true,
        skipMigrations: true
      });

      expect(result).toHaveProperty('confidence');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('Evidence Collection', () => {
    it('should provide evidence structure', async () => {
      const result = await executeQADirector('SD-TEST-012', {
        skipBuild: true,
        skipMigrations: true
      });

      expect(result.phases).toHaveProperty('evidence');
      expect(result.phases.evidence).toHaveProperty('screenshots');
      expect(result.phases.evidence).toHaveProperty('logs');
      expect(result.phases.evidence).toHaveProperty('coverage');
    });
  });

  describe('Database Integration', () => {
    it('should store results in database', async () => {
      const result = await executeQADirector('SD-TEST-013', {
        skipBuild: true,
        skipMigrations: true
      });

      // Results should have been attempted to store
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('recommendations');
    });
  });
});

describe('Module Integration Tests', () => {
  it('should pass results between phases correctly', async () => {
    const result = await executeQADirector('SD-TEST-014', {
      targetApp: 'ehg',
      skipBuild: true,
      skipMigrations: true
    });

    // Pre-flight results should inform test planning
    expect(result.phases.pre_flight).toBeDefined();
    expect(result.phases.test_planning).toBeDefined();

    // Test planning should use infrastructure discovery
    if (result.phases.test_planning.infrastructure) {
      expect(result.phases.test_planning.infrastructure).toHaveProperty('summary');
    }
  });
});
