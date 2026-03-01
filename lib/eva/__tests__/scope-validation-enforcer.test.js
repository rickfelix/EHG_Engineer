/**
 * Tests for Scope Validation Enforcer
 * SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-007-02
 */
import { describe, test, expect } from 'vitest';
import {
  validateScope,
  getV08EnforcementMetrics,
  findRouteConfig,
  ROUTE_AUTH_REGISTRY
} from '../scope-validation-enforcer.js';

describe('Scope Validation Enforcer', () => {
  describe('validateScope', () => {
    test('blocks unauthenticated request to protected route', () => {
      const result = validateScope({
        route: 'PATCH /api/ventures/:id/stage',
        hasAuth: false
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('AUTH_REQUIRED');
      expect(result.errors[0].govRef).toBe('GOV-001');
    });

    test('allows authenticated request to protected route', () => {
      const result = validateScope({
        route: 'PATCH /api/ventures/:id/stage',
        hasAuth: true
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('blocks unauthenticated venture creation', () => {
      const result = validateScope({
        route: 'POST /api/ventures',
        hasAuth: false
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].govRef).toBe('GOV-002');
    });

    test('blocks unauthenticated chairman request', () => {
      const result = validateScope({
        route: 'POST /api/v2/chairman/decide',
        hasAuth: false
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].govRef).toBe('GOV-011');
    });

    test('blocks NEVER_AUTONOMOUS operations', () => {
      const result = validateScope({
        route: 'POST /api/internal/operation',
        hasAuth: true,
        operationType: 'schema_migration'
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('AUTONOMOUS_BLOCKED');
      expect(result.errors[0].govRef).toBe('GOV-003');
    });

    test('catches both auth and autonomous violations', () => {
      const result = validateScope({
        route: 'POST /api/ventures',
        hasAuth: false,
        operationType: 'schema_migration'
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    test('allows requests to unregistered routes', () => {
      const result = validateScope({
        route: 'GET /api/public/health',
        hasAuth: false
      });
      expect(result.valid).toBe(true);
    });

    test('rejects null context', () => {
      const result = validateScope(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_CONTEXT');
    });
  });

  describe('findRouteConfig', () => {
    test('finds exact match', () => {
      const config = findRouteConfig('POST /api/ventures');
      expect(config).not.toBeNull();
      expect(config.requiresAuth).toBe(true);
    });

    test('matches parameterized routes', () => {
      const config = findRouteConfig('PATCH /api/ventures/123/stage');
      expect(config).not.toBeNull();
      expect(config.govRef).toBe('GOV-001');
    });

    test('returns null for unknown routes', () => {
      const config = findRouteConfig('GET /api/unknown');
      expect(config).toBeNull();
    });
  });

  describe('getV08EnforcementMetrics', () => {
    test('returns enforcement metrics', () => {
      const metrics = getV08EnforcementMetrics();
      expect(metrics.routeAuthCoverage).toBe(100);
      expect(metrics.neverAutonomousEnforced).toBe(true);
      expect(metrics.scopeValidationMode).toBe('blocking');
    });

    test('includes GOV finding details', () => {
      const metrics = getV08EnforcementMetrics();
      expect(metrics.details.govFindings).toContain('GOV-001');
      expect(metrics.details.govFindings).toContain('GOV-003');
      expect(metrics.details.govResolved).toContain('GOV-001');
    });
  });
});
