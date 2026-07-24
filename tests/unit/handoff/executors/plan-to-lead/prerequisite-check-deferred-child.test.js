/**
 * Regression test for QF-20260724-703: PREREQUISITE_HANDOFF_CHECK (PLAN-TO-LEAD)
 * terminalStatuses was missing 'deferred', so a deferred child was excluded from
 * completedChildren but ALSO landed in incompleteChildren, causing the parent
 * orchestrator's PLAN-TO-LEAD gate to WAIT forever on a child whose scope was
 * deliberately not delivered (matches SD-LEO-INFRA-DRAIN-SET-REGISTRY-001).
 */
import { describe, it, expect } from 'vitest';
import { createPrerequisiteCheckGate } from '../../../../../scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js';

function makeParentSupabase({ parentId, children }) {
  const emptyTail = {
    eq: () => emptyTail,
    order: () => ({ limit: async () => ({ data: [], error: null }) }),
  };
  return {
    from(table) {
      return {
        select() {
          return {
            eq(column, value) {
              if (table === 'strategic_directives_v2' && column === 'parent_sd_id' && value === parentId) {
                return { async then(resolve) { resolve({ data: children, error: null }); return Promise.resolve(); } };
              }
              return { async maybeSingle() { return { data: null, error: null }; }, ...emptyTail };
            },
          };
        },
      };
    },
  };
}

describe('QF-20260724-703: PREREQUISITE_HANDOFF_CHECK deferred-child rollup', () => {
  it('does not WAIT when the only non-completed child is deferred', async () => {
    const parentId = 'parent-uuid';
    const children = [
      { id: 'child-a', sd_key: 'SD-CHILD-A', status: 'completed' },
      { id: 'child-b', sd_key: 'SD-CHILD-B', status: 'completed' },
      { id: 'child-c', sd_key: 'SD-CHILD-C', status: 'completed' },
      { id: 'child-e', sd_key: 'SD-CHILD-E', status: 'deferred' },
    ];

    const supabase = makeParentSupabase({ parentId, children });
    const gate = createPrerequisiteCheckGate(supabase);
    const ctx = { sd: { id: parentId, sd_key: 'SD-PARENT', metadata: {} }, sdId: parentId };

    const result = await gate.validator(ctx);

    expect(result.wait).not.toBe(true);
    expect(result.passed).toBe(true);
    expect(result.details.total_children).toBe(4);
  });

  it('still WAITs on a genuinely incomplete (non-terminal) child alongside a deferred one', async () => {
    const parentId = 'parent-uuid-2';
    const children = [
      { id: 'child-a', sd_key: 'SD-CHILD-A', status: 'completed' },
      { id: 'child-e', sd_key: 'SD-CHILD-E', status: 'deferred' },
      { id: 'child-f', sd_key: 'SD-CHILD-F', status: 'in_progress' },
    ];

    const supabase = makeParentSupabase({ parentId, children });
    const gate = createPrerequisiteCheckGate(supabase);
    const ctx = { sd: { id: parentId, sd_key: 'SD-PARENT-2', metadata: {} }, sdId: parentId };

    const result = await gate.validator(ctx);

    expect(result.wait).toBe(true);
    expect(result.wait_reason).toContain('SD-CHILD-F');
    expect(result.wait_reason).not.toContain('SD-CHILD-E');
  });
});
