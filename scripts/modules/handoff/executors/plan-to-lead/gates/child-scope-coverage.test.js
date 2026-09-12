/**
 * Tests for CHILD_SCOPE_COVERAGE's parent/children/deliverables queries
 * (SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 FR-2).
 */
import { describe, it, expect } from 'vitest';
import { createChildScopeCoverageGate, COORDINATION_TEMPLATE_NAMES } from './child-scope-coverage.js';
import { COORDINATION_ONLY_FR_TITLES } from '../../../../parent-orchestrator-handler.js';
import { createQueuedSupabaseMock } from '../../../../../../tests/factories/queued-supabase-mock.js';

/**
 * QF-20260911-793 regression guard: createQueuedSupabaseMock's .select() ignores the
 * projection argument entirely and returns whatever the test queued regardless of what
 * columns were actually requested — so a test built on it alone cannot detect "the code
 * filters on a column it never selected" (exactly the defect this asserts against: the
 * parent-deliverables query must project 'metadata', since the coordination_only exclusion
 * reads pd.metadata and PostgREST returns undefined for an unrequested column).
 */
function spyOnParentDeliverablesSelect(resultsQueue) {
  const base = createQueuedSupabaseMock(resultsQueue);
  const selectCalls = [];
  return {
    selectCalls,
    from: (table) => {
      const chain = base.from(table);
      const originalSelect = chain.select;
      chain.select = (...args) => {
        selectCalls.push({ table, args });
        return originalSelect(...args);
      };
      return chain;
    },
  };
}

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

  it('QF-20260911-793: the parent-deliverables query projects metadata (the coordination_only exclusion silently no-ops without it)', async () => {
    const supabase = spyOnParentDeliverablesSelect([
      { data: [{ id: 'd1', deliverable_name: 'ship auth', deliverable_type: 'feature', metadata: {} }], error: null }, // parentDeliverables
      { data: [{ id: 'c1', title: 'child A', status: 'completed' }], error: null }, // children
      { data: [{ sd_id: 'c1', deliverable_name: 'ship auth flow', deliverable_type: 'feature', completion_status: 'completed' }], error: null }, // childDeliverables
    ]);
    const gate = createChildScopeCoverageGate(supabase);

    await gate.validator(ctx());

    const parentDeliverablesCall = supabase.selectCalls.find((c) => c.table === 'sd_scope_deliverables');
    expect(parentDeliverablesCall.args[0]).toMatch(/\bmetadata\b/);
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

  it('QF-20260911-793: a deliverable claiming coordination_only:true is NOT exempted unless its name also matches the known template set (flag alone is not trusted)', async () => {
    const supabase = createQueuedSupabaseMock([
      {
        data: [
          { id: 'd1', deliverable_name: 'Ship the real auth feature', deliverable_type: 'feature', metadata: { coordination_only: true } },
        ],
        error: null,
      }, // parentDeliverables — flag set, but NOT one of the 3 known template titles
      { data: [{ id: 'c1', title: 'child A', status: 'completed' }], error: null }, // children
      { data: [{ sd_id: 'c1', deliverable_name: 'unrelated child work', deliverable_type: 'feature', completion_status: 'completed' }], error: null }, // childDeliverables
    ]);
    const gate = createChildScopeCoverageGate(supabase);

    const result = await gate.validator(ctx());

    // The spoofed deliverable is still scored (not exempted) and fails to match any child work.
    expect(result.details.parentDeliverables).toBe(1);
    expect(result.details.templateExcluded).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('QF-20260911-793: COORDINATION_TEMPLATE_NAMES stays pinned to parent-orchestrator-handler.js\'s COORDINATION_ONLY_FR_TITLES (one source of truth, not two independently-typed literals)', () => {
    expect(COORDINATION_ONLY_FR_TITLES.length).toBe(3);
    for (const title of COORDINATION_ONLY_FR_TITLES) {
      expect(COORDINATION_TEMPLATE_NAMES.has(title)).toBe(true);
    }
    expect(COORDINATION_TEMPLATE_NAMES.size).toBe(COORDINATION_ONLY_FR_TITLES.length);
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
