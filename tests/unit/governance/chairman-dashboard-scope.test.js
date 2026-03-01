/**
 * Tests for Chairman Dashboard Scope — V02/A07 enforcement
 * SD-MAN-ORCH-VISION-GOVERNANCE-ENFORCEMENT-001-D
 */

import { describe, it, expect, vi } from 'vitest';
import {
  auditDashboardRoutes,
  validateTableOperation,
  validateSDScopeBoundary,
  validateDecisionType,
  ALLOWED_ROUTE_PATTERNS,
  ALLOWED_DECISION_TYPES,
} from '../../../lib/eva/chairman-dashboard-scope.js';

describe('Chairman Dashboard Scope — auditDashboardRoutes', () => {
  it('passes governance-appropriate routes', () => {
    const routes = [
      '/chairman/decisions',
      '/chairman/preferences',
      '/chairman/portfolio',
      '/chairman/escalations',
      '/chairman/audit',
      '/chairman/stakeholder-response',
    ];
    const result = auditDashboardRoutes(routes);
    expect(result.passed).toBe(true);
    expect(result.prohibited).toHaveLength(0);
    expect(result.allowed).toHaveLength(6);
  });

  it('detects prohibited data-entry routes', () => {
    const routes = ['/chairman/decisions', '/chairman/sd/123/edit', '/chairman/ventures/new'];
    const result = auditDashboardRoutes(routes);
    expect(result.passed).toBe(false);
    expect(result.prohibited.length).toBeGreaterThan(0);
  });

  it('includes stakeholder-response in allowed patterns (V02)', () => {
    const result = auditDashboardRoutes(['/chairman/stakeholder-response/pending']);
    expect(result.passed).toBe(true);
    expect(result.allowed).toHaveLength(1);
  });

  it('classifies unknown routes separately', () => {
    const result = auditDashboardRoutes(['/chairman/unknown-route']);
    expect(result.unknown).toHaveLength(1);
    expect(result.passed).toBe(true); // Unknown is not prohibited
  });
});

describe('Chairman Dashboard Scope — validateTableOperation', () => {
  it('allows select on chairman_decisions', () => {
    const result = validateTableOperation('chairman_decisions', 'select');
    expect(result.allowed).toBe(true);
  });

  it('allows update on chairman_decisions', () => {
    const result = validateTableOperation('chairman_decisions', 'update');
    expect(result.allowed).toBe(true);
  });

  it('blocks delete on chairman_decisions', () => {
    const result = validateTableOperation('chairman_decisions', 'delete');
    expect(result.allowed).toBe(false);
  });

  it('blocks operations on unscoped tables', () => {
    const result = validateTableOperation('some_random_table', 'select');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in chairman scope');
  });

  it('allows full CRUD on chairman_preferences', () => {
    expect(validateTableOperation('chairman_preferences', 'select').allowed).toBe(true);
    expect(validateTableOperation('chairman_preferences', 'insert').allowed).toBe(true);
    expect(validateTableOperation('chairman_preferences', 'update').allowed).toBe(true);
    expect(validateTableOperation('chairman_preferences', 'delete').allowed).toBe(true);
  });

  it('allows only select on read-only tables', () => {
    expect(validateTableOperation('eva_vision_scores', 'select').allowed).toBe(true);
    expect(validateTableOperation('eva_vision_scores', 'update').allowed).toBe(false);
  });
});

describe('Chairman Dashboard Scope — validateSDScopeBoundary (V02/A07)', () => {
  it('returns allowed=false when missing parameters', async () => {
    const result = await validateSDScopeBoundary(null, null, null);
    expect(result.allowed).toBe(false);
  });

  it('allows SD within chairman venture scope', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { venture_id: 'v-001' }, error: null }),
      })),
    };

    const result = await validateSDScopeBoundary('sd-uuid', { ventureIds: ['v-001'] }, supabase);
    expect(result.allowed).toBe(true);
  });

  it('blocks SD outside chairman venture scope', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { venture_id: 'v-other' }, error: null }),
      })),
    };

    const result = await validateSDScopeBoundary('sd-uuid', { ventureIds: ['v-001'] }, supabase);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('outside chairman governance scope');
  });

  it('blocks when SD not found', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      })),
    };

    const result = await validateSDScopeBoundary('sd-uuid', { ventureIds: ['v-001'] }, supabase);
    expect(result.allowed).toBe(false);
  });

  it('fails closed on exception', async () => {
    const supabase = {
      from: vi.fn(() => { throw new Error('DB down'); }),
    };

    const result = await validateSDScopeBoundary('sd-uuid', { ventureIds: ['v-001'] }, supabase);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('fail-closed');
  });
});

describe('Chairman Dashboard Scope — validateDecisionType (A07)', () => {
  it('allows governance decision types', () => {
    expect(validateDecisionType('dfe_escalation').allowed).toBe(true);
    expect(validateDecisionType('stakeholder_response').allowed).toBe(true);
    expect(validateDecisionType('budget_override').allowed).toBe(true);
    expect(validateDecisionType('gate_review').allowed).toBe(true);
  });

  it('blocks unknown decision types', () => {
    const result = validateDecisionType('arbitrary_type');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in chairman governance scope');
  });

  it('blocks when no decision type provided', () => {
    const result = validateDecisionType(null);
    expect(result.allowed).toBe(false);
  });

  it('exports ALLOWED_DECISION_TYPES', () => {
    expect(ALLOWED_DECISION_TYPES).toContain('stakeholder_response');
    expect(ALLOWED_DECISION_TYPES.length).toBeGreaterThanOrEqual(5);
  });
});
