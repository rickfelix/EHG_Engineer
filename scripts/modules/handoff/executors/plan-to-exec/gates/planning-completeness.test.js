/**
 * Unit tests for GATE_PLANNING_COMPLETENESS
 * Validates 3-ring planning completeness for PLAN-TO-EXEC handoff.
 *
 * Part of SD-LEO-INFRA-HANDOFF-VALIDATOR-REGISTRY-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPlanningCompletenessGate, validatePlanningCompleteness } from './planning-completeness.js';
import { createMockSD } from '../../../../../../tests/factories/validator-context-factory.js';

// Helper: build a chainable Supabase mock that routes responses by table name
function buildMockSupabase({ profile = {}, prd = null, deliverables = [], children = [], handoffs = [] } = {}) {
  const tableResponses = {
    sd_type_validation_profiles: { data: { requires_prd: true, requires_deliverables: true, ...profile }, error: null },
    product_requirements_v2: {
      data: prd,
      error: null,
    },
    sd_scope_deliverables: { data: deliverables, error: null },
    strategic_directives_v2: { data: children, error: null },
    eva_vision_documents: { data: [], error: null },
    eva_architecture_plans: { data: [], error: null },
  };

  return {
    from: vi.fn((table) => {
      const resp = tableResponses[table] || { data: null, error: null };
      const chainable = {
        select: () => chainable,
        eq: () => chainable,
        neq: () => chainable,
        in: () => chainable,
        is: () => chainable,
        order: () => chainable,
        limit: () => chainable,
        single: () => Promise.resolve(resp),
        update: () => ({ in: () => Promise.resolve({ error: null }) }),
        then: (fn) => Promise.resolve(resp).then(fn),
      };
      Object.defineProperty(chainable, 'then', {
        value: (fn) => Promise.resolve(resp).then(fn),
        writable: true,
      });
      return { select: () => chainable, update: () => chainable };
    }),
  };
}

describe('GATE_PLANNING_COMPLETENESS', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('createPlanningCompletenessGate', () => {
    it('has correct gate name', () => {
      const gate = createPlanningCompletenessGate({}, createMockSD());
      expect(gate.name).toBe('GATE_PLANNING_COMPLETENESS');
    });

    it('is required for blocking SD types', () => {
      const gate = createPlanningCompletenessGate({}, createMockSD({ sd_type: 'feature' }));
      expect(gate.required).toBe(true);
    });

    it('is advisory for non-blocking SD types', () => {
      const gate = createPlanningCompletenessGate({}, createMockSD({ sd_type: 'fix' }));
      expect(gate.required).toBe(false);
    });
  });

  describe('validatePlanningCompleteness', () => {
    it('passes with complete PRD and deliverables', async () => {
      const sd = createMockSD({ sd_type: 'feature' });
      const supabase = buildMockSupabase({
        prd: {
          id: 'prd-1',
          title: 'Test PRD',
          status: 'approved',
          executive_summary: 'A sufficiently long executive summary that exceeds the minimum fifty-character threshold for anti-dummy validation.',
          functional_requirements: [{ id: 'FR-1', title: 'Requirement' }],
        },
        deliverables: [{ id: 'd-1', deliverable_name: 'Test deliverable' }],
      });

      const result = await validatePlanningCompleteness(supabase, sd);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.issues).toHaveLength(0);
    });

    it('fails with missing PRD for blocking SD type', async () => {
      const sd = createMockSD({ sd_type: 'feature' });
      const supabase = buildMockSupabase({ prd: null });

      const result = await validatePlanningCompleteness(supabase, sd);

      expect(result.passed).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain('PRD required');
    });

    it('still passes for advisory SD type even with missing PRD', async () => {
      const sd = createMockSD({ sd_type: 'fix' });
      const supabase = buildMockSupabase({ prd: null });

      const result = await validatePlanningCompleteness(supabase, sd);

      // Advisory types always pass regardless of issues
      expect(result.passed).toBe(true);
    });

    it('flags short executive summary as issue', async () => {
      const sd = createMockSD({ sd_type: 'feature' });
      const supabase = buildMockSupabase({
        prd: {
          id: 'prd-1',
          title: 'Test',
          status: 'approved',
          executive_summary: 'Too short',
          functional_requirements: [{ id: 'FR-1' }],
        },
        deliverables: [{ id: 'd-1', deliverable_name: 'Test' }],
      });

      const result = await validatePlanningCompleteness(supabase, sd);

      expect(result.passed).toBe(false);
      expect(result.issues.some(i => i.includes('too short'))).toBe(true);
    });

    it('warns when no deliverables defined', async () => {
      const sd = createMockSD({ sd_type: 'feature' });
      const supabase = buildMockSupabase({
        prd: {
          id: 'prd-1',
          title: 'Test PRD',
          status: 'approved',
          executive_summary: 'A sufficiently long executive summary that exceeds the minimum fifty-character threshold for validation checks.',
          functional_requirements: [{ id: 'FR-1' }],
        },
        deliverables: [],
      });

      const result = await validatePlanningCompleteness(supabase, sd);

      expect(result.warnings.some(w => w.includes('deliverables'))).toBe(true);
    });
  });
});
