/**
 * Tests for CHILD_SCOPE_COVERAGE's parent/children/deliverables queries
 * (SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 FR-2).
 */
import { describe, it, expect } from 'vitest';
import { createChildScopeCoverageGate } from './child-scope-coverage.js';
import { createQueuedSupabaseMock } from '../../../../../../tests/factories/queued-supabase-mock.js';

const ctx = () => ({ sd: { id: 'sd-parent', sd_type: 'orchestrator' } });

describe('CHILD_SCOPE_COVERAGE queries', () => {
  it('scores coverage normally when all three queries succeed', async () => {
    const supabase = createQueuedSupabaseMock([
      { data: [{ id: 'd1', deliverable_name: 'ship auth', deliverable_type: 'feature' }], error: null }, // parentDeliverables
      { data: [{ id: 'c1', title: 'child A', status: 'completed' }], error: null }, // children
      { data: [{ sd_id: 'c1', deliverable_name: 'ship auth flow', deliverable_type: 'feature', completion_status: 'completed' }], error: null }, // childDeliverables
    ]);
    const gate = createChildScopeCoverageGate(supabase);

    const result = await gate.validator(ctx());

    expect(result.details.isOrchestrator).toBe(true);
    expect(result.details.covered).toBe(1);
  });

  it('QF-20260911-793: auto-passes when the ONLY parent deliverables are the coordination-only template (no substantive work to check)', async () => {
    const supabase = createQueuedSupabaseMock([
      {
        data: [
          { id: 'd1', deliverable_name: 'Child SD Orchestration', deliverable_type: 'coordination', metadata: { coordination_only: true } },
          { id: 'd2', deliverable_name: 'Work Decomposition Structure', deliverable_type: 'coordination', metadata: { coordination_only: true } },
          { id: 'd3', deliverable_name: 'Progress Tracking', deliverable_type: 'coordination', metadata: { coordination_only: true } },
        ],
        error: null,
      }, // parentDeliverables
      { data: [{ id: 'c1', title: 'child A', status: 'completed' }], error: null }, // children
    ]);
    const gate = createChildScopeCoverageGate(supabase);

    const result = await gate.validator(ctx());

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.templateOnly).toBe(3);
  });

  it('QF-20260911-793: coordination-only deliverables are excluded from the coverage denominator when substantive deliverables also exist', async () => {
    const supabase = createQueuedSupabaseMock([
      {
        data: [
          { id: 'd1', deliverable_name: 'ship auth', deliverable_type: 'feature', metadata: {} },
          { id: 'd2', deliverable_name: 'Child SD Orchestration', deliverable_type: 'coordination', metadata: { coordination_only: true } },
        ],
        error: null,
      }, // parentDeliverables
      { data: [{ id: 'c1', title: 'child A', status: 'completed' }], error: null }, // children
      { data: [{ sd_id: 'c1', deliverable_name: 'ship auth flow', deliverable_type: 'feature', completion_status: 'completed' }], error: null }, // childDeliverables
    ]);
    const gate = createChildScopeCoverageGate(supabase);

    const result = await gate.validator(ctx());

    // Only the substantive deliverable counts; the coordination-only one is neither scored
    // nor reported as uncovered, so 1/1 substantive covered = 100%, not 1/2 = 50%.
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.parentDeliverables).toBe(1);
    expect(result.details.templateExcluded).toBe(1);
  });

  it('FR-2: fails closed (passed:false) when the children query is broken', async () => {
    const supabase = createQueuedSupabaseMock([
      { data: [{ id: 'd1', deliverable_name: 'ship auth' }], error: null }, // parentDeliverables
      { data: null, error: { message: 'RLS denied', code: '42501' } }, // children fails
    ]);
    const gate = createChildScopeCoverageGate(supabase);

    const result = await gate.validator(ctx());

    expect(result.passed).toBe(false);
  });
});
