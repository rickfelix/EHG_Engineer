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
