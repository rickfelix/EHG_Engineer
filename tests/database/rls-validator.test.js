/**
 * RLS Validator Unit Tests
 * SD-DATABASE-VALIDATION-001: Phase 4 - Automation
 *
 * Tests the RLSValidator class for verifying Row Level Security policies.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RLSValidator,
  EXPECTED_POLICY_PATTERNS,
  RLS_EXEMPT_TABLES,
  CRITICAL_TABLES,
  getRLSSummary,
  checkCriticalTablesRLS
} from '../../scripts/db-validate/rls-validator.js';

// Mock policy data for testing
const MOCK_POLICIES = {
  complete: [
    { name: 'service_role_all_users', permissive: 'PERMISSIVE', roles: ['service_role'], command: 'ALL' },
    { name: 'authenticated_read_users', permissive: 'PERMISSIVE', roles: ['authenticated'], command: 'SELECT' }
  ],
  missingServiceRole: [
    { name: 'authenticated_read_data', permissive: 'PERMISSIVE', roles: ['authenticated'], command: 'SELECT' }
  ],
  missingAuthRead: [
    { name: 'service_role_all_data', permissive: 'PERMISSIVE', roles: ['service_role'], command: 'ALL' }
  ],
  empty: []
};

describe('RLSValidator', () => {
  describe('constructor', () => {
    it('should create instance with default options', () => {
      const validator = new RLSValidator();
      expect(validator.project).toBe('engineer');
      expect(validator.verbose).toBe(false);
    });

    it('should accept custom options', () => {
      const validator = new RLSValidator('ehg', { verbose: true });
      expect(validator.project).toBe('ehg');
      expect(validator.verbose).toBe(true);
    });
  });

  describe('hasServiceRolePolicy', () => {
    let validator;

    beforeEach(() => {
      validator = new RLSValidator();
    });

    it('should detect service_role policy by name pattern', () => {
      const policies = [{ name: 'service_role_all_users', roles: [] }];
      expect(validator.hasServiceRolePolicy(policies)).toBe(true);
    });

    it('should detect service_role policy by role', () => {
      const policies = [{ name: 'custom_policy', roles: ['service_role'] }];
      expect(validator.hasServiceRolePolicy(policies)).toBe(true);
    });

    it('should detect "Service role has full access" naming', () => {
      const policies = [{ name: 'Service role has full access to table', roles: [] }];
      expect(validator.hasServiceRolePolicy(policies)).toBe(true);
    });

    it('should return false for no service_role policy', () => {
      const policies = [{ name: 'authenticated_read', roles: ['authenticated'] }];
      expect(validator.hasServiceRolePolicy(policies)).toBe(false);
    });

    it('should return false for empty policies', () => {
      expect(validator.hasServiceRolePolicy([])).toBe(false);
    });
  });

  describe('hasAuthenticatedReadPolicy', () => {
    let validator;

    beforeEach(() => {
      validator = new RLSValidator();
    });

    it('should detect authenticated read policy by name pattern', () => {
      const policies = [{ name: 'authenticated_read_users', roles: [], command: 'SELECT' }];
      expect(validator.hasAuthenticatedReadPolicy(policies)).toBe(true);
    });

    it('should detect authenticated read by role and command', () => {
      const policies = [{ name: 'custom_policy', roles: ['authenticated'], command: 'SELECT' }];
      expect(validator.hasAuthenticatedReadPolicy(policies)).toBe(true);
    });

    it('should detect "Authenticated users can read" naming', () => {
      const policies = [{ name: 'Authenticated users can read data', roles: [], command: 'SELECT' }];
      expect(validator.hasAuthenticatedReadPolicy(policies)).toBe(true);
    });

    it('should return false for non-SELECT authenticated policy', () => {
      const policies = [{ name: 'authenticated_write', roles: ['authenticated'], command: 'INSERT' }];
      expect(validator.hasAuthenticatedReadPolicy(policies)).toBe(false);
    });

    it('should return false for empty policies', () => {
      expect(validator.hasAuthenticatedReadPolicy([])).toBe(false);
    });
  });

  describe('validateTable', () => {
    let validator;

    beforeEach(() => {
      validator = new RLSValidator();
    });

    it('should pass validation for table with RLS and complete policies', () => {
      const result = validator.validateTable('users', true, MOCK_POLICIES.complete);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for table without RLS', () => {
      const result = validator.validateTable('data', false, []);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('does not have RLS enabled'))).toBe(true);
    });

    it('should mark critical tables specially when RLS is disabled', () => {
      const result = validator.validateTable('strategic_directives_v2', false, []);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('CRITICAL'))).toBe(true);
    });

    it('should warn about missing service_role policy', () => {
      const result = validator.validateTable('data', true, MOCK_POLICIES.missingServiceRole);
      expect(result.warnings.some(w => w.includes('service_role'))).toBe(true);
    });

    it('should warn about missing authenticated read policy', () => {
      const result = validator.validateTable('data', true, MOCK_POLICIES.missingAuthRead);
      expect(result.warnings.some(w => w.includes('authenticated read'))).toBe(true);
    });

    it('should error when RLS enabled but no policies defined', () => {
      const result = validator.validateTable('empty_table', true, []);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('no policies defined'))).toBe(true);
    });

    it('should pass validation for exempt tables without RLS', () => {
      // Temporarily add a table to exempt list
      RLS_EXEMPT_TABLES.push('test_exempt_table');
      const result = validator.validateTable('test_exempt_table', false, []);
      expect(result.exempt).toBe(true);
      expect(result.valid).toBe(true);
      // Clean up
      RLS_EXEMPT_TABLES.pop();
    });
  });

  describe('EXPECTED_POLICY_PATTERNS', () => {
    it('should have serviceRoleRequired flag', () => {
      expect(EXPECTED_POLICY_PATTERNS.serviceRoleRequired).toBe(true);
    });

    it('should have authenticatedReadRequired flag', () => {
      expect(EXPECTED_POLICY_PATTERNS.authenticatedReadRequired).toBe(true);
    });

    it('should have naming patterns for policy detection', () => {
      expect(EXPECTED_POLICY_PATTERNS.namingPatterns).toBeDefined();
      expect(EXPECTED_POLICY_PATTERNS.namingPatterns.serviceRole).toBeInstanceOf(RegExp);
      expect(EXPECTED_POLICY_PATTERNS.namingPatterns.authenticatedRead).toBeInstanceOf(RegExp);
      expect(EXPECTED_POLICY_PATTERNS.namingPatterns.anonRead).toBeInstanceOf(RegExp);
    });
  });

  describe('CRITICAL_TABLES', () => {
    it('should include strategic_directives_v2', () => {
      expect(CRITICAL_TABLES).toContain('strategic_directives_v2');
    });

    it('should include product_requirements_v2', () => {
      expect(CRITICAL_TABLES).toContain('product_requirements_v2');
    });

    it('should include leo_protocols', () => {
      expect(CRITICAL_TABLES).toContain('leo_protocols');
    });

    it('should have at least 5 critical tables', () => {
      expect(CRITICAL_TABLES.length).toBeGreaterThanOrEqual(5);
    });
  });
});

describe('RLSValidator Integration', () => {
  // These tests require database connection
  // Run only in CI or with database available

  describe('validateAll (integration)', () => {
    it('should validate all tables in database', async () => {
      const validator = new RLSValidator('engineer');

      try {
        await validator.connect();
        const result = await validator.validateAll();

        // Result should have expected structure
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
        expect(result).toHaveProperty('metadata');
        expect(result).toHaveProperty('details');

        // Should have validated tables
        expect(result.metadata.totalTables).toBeGreaterThan(0);
        expect(result.metadata.tablesWithRLS).toBeGreaterThan(0);

        // Details should be an array
        expect(Array.isArray(result.details)).toBe(true);
      } finally {
        await validator.disconnect();
      }
    });

    it('should detect tables without RLS', async () => {
      const validator = new RLSValidator('engineer');

      try {
        await validator.connect();
        const result = await validator.validateAll();

        // If there are tables without RLS, they should be reported
        if (result.metadata.tablesWithoutRLS > 0) {
          expect(result.errors.length).toBeGreaterThan(0);
        }
      } finally {
        await validator.disconnect();
      }
    });
  });

  describe('validateCritical (integration)', () => {
    it('should validate critical tables', async () => {
      const validator = new RLSValidator('engineer');

      try {
        await validator.connect();
        const result = await validator.validateCritical();

        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
        expect(result.metadata.criticalTablesChecked).toBe(CRITICAL_TABLES.length);
      } finally {
        await validator.disconnect();
      }
    });

    it('should verify strategic_directives_v2 has RLS', async () => {
      const validator = new RLSValidator('engineer');

      try {
        await validator.connect();
        const tables = await validator.getTablesWithRLSStatus();
        const sdTable = tables.find(t => t.tableName === 'strategic_directives_v2');

        expect(sdTable).toBeDefined();
        expect(sdTable.rlsEnabled).toBe(true);
      } finally {
        await validator.disconnect();
      }
    });
  });

  describe('getTablesWithoutRLS (integration)', () => {
    it('should return list of tables without RLS', async () => {
      const validator = new RLSValidator('engineer');

      try {
        await validator.connect();
        const tablesWithoutRLS = await validator.getTablesWithoutRLS();

        // Should return an array
        expect(Array.isArray(tablesWithoutRLS)).toBe(true);

        // If there are any, they should be strings
        if (tablesWithoutRLS.length > 0) {
          expect(typeof tablesWithoutRLS[0]).toBe('string');
        }
      } finally {
        await validator.disconnect();
      }
    });
  });

  describe('getSummary (integration)', () => {
    it('should return RLS summary', async () => {
      const validator = new RLSValidator('engineer');

      try {
        await validator.connect();
        const summary = await validator.getSummary();

        expect(summary).toHaveProperty('totalTables');
        expect(summary).toHaveProperty('tablesWithRLS');
        expect(summary).toHaveProperty('tablesWithoutRLS');
        expect(summary).toHaveProperty('rlsCoverage');
        expect(summary).toHaveProperty('totalPolicies');
        expect(summary).toHaveProperty('averagePoliciesPerTable');
        expect(summary).toHaveProperty('tablesWithoutRLSList');

        // Coverage should be a percentage string
        expect(summary.rlsCoverage).toMatch(/^\d+(\.\d+)?%$/);
      } finally {
        await validator.disconnect();
      }
    });
  });

  describe('getAllPolicies (integration)', () => {
    it('should return policies grouped by table', async () => {
      const validator = new RLSValidator('engineer');

      try {
        await validator.connect();
        const policiesByTable = await validator.getAllPolicies();

        // Should be a Map
        expect(policiesByTable instanceof Map).toBe(true);

        // Should have policies for strategic_directives_v2
        const sdPolicies = policiesByTable.get('strategic_directives_v2');
        expect(sdPolicies).toBeDefined();
        expect(sdPolicies.length).toBeGreaterThan(0);

        // Each policy should have expected structure
        const firstPolicy = sdPolicies[0];
        expect(firstPolicy).toHaveProperty('name');
        expect(firstPolicy).toHaveProperty('permissive');
        expect(firstPolicy).toHaveProperty('roles');
        expect(firstPolicy).toHaveProperty('command');
      } finally {
        await validator.disconnect();
      }
    });
  });

  describe('generateFixSQL (integration)', () => {
    it('should generate SQL for tables without RLS', async () => {
      const validator = new RLSValidator('engineer');

      try {
        await validator.connect();
        const sql = await validator.generateFixSQL();

        // Should be a string
        expect(typeof sql).toBe('string');

        // If there are tables without RLS, SQL should include ALTER and CREATE POLICY
        const tablesWithoutRLS = await validator.getTablesWithoutRLS();
        if (tablesWithoutRLS.length > 0) {
          expect(sql).toContain('ALTER TABLE');
          expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
          expect(sql).toContain('CREATE POLICY');
        }
      } finally {
        await validator.disconnect();
      }
    });
  });
});

describe('Exported helper functions', () => {
  describe('getRLSSummary', () => {
    it('should return summary without manually managing connection', async () => {
      const summary = await getRLSSummary('engineer');

      expect(summary).toHaveProperty('totalTables');
      expect(summary).toHaveProperty('rlsCoverage');
    });
  });

  describe('checkCriticalTablesRLS', () => {
    it('should return boolean indicating critical tables have RLS', async () => {
      const result = await checkCriticalTablesRLS('engineer');

      expect(typeof result).toBe('boolean');
    });
  });
});
