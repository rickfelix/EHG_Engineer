/**
 * Regression test for QF-20260703-906: PREREQUISITE_HANDOFF_CHECK (PLAN-TO-LEAD)
 * silently downgraded a parent-orchestrator WAIT into a hard FAIL when ctx.sd.id
 * carried a stale/mismatched value instead of the SD's canonical id -- every
 * .eq(sdUuid) query then came back clean-empty (valid UUID, zero matches) rather
 * than erroring, so checkParentOrchestrator treated it as "not a parent."
 */
import { describe, it, expect } from 'vitest';
import { createPrerequisiteCheckGate } from '../../../../../scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js';

// Simulates a real Supabase client: the sd_key->id lookup returns the CANONICAL
// id, while any query keyed on the (wrong) ctx.sd.id comes back empty -- exactly
// the "clean-empty, not an error" shape a valid-but-unmatched UUID produces.
function makeMismatchedSupabase({ canonicalId, children }) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq(column, value) {
              const chain = {
                async maybeSingle() {
                  if (table === 'strategic_directives_v2' && column === 'sd_key') {
                    return { data: { id: canonicalId }, error: null };
                  }
                  return { data: null, error: null };
                },
                eq(column2, value2) {
                  return {
                    eq() { return { order() { return { limit: async () => ({ data: [], error: null }) }; } }; },
                    order() { return { limit: async () => ({ data: [], error: null }) }; },
                  };
                },
                async then(resolve) {
                  // parent_sd_id lookup: only matches on the CANONICAL id
                  if (table === 'strategic_directives_v2' && column === 'parent_sd_id' && value === canonicalId) {
                    resolve({ data: children, error: null });
                  } else {
                    resolve({ data: [], error: null });
                  }
                  return Promise.resolve();
                },
              };
              return chain;
            },
          };
        },
      };
    },
  };
}

describe('QF-20260703-906: PREREQUISITE_HANDOFF_CHECK id-mismatch resilience', () => {
  it('re-resolves via sd_key and returns WAIT (not a hard FAIL) when ctx.sd.id is stale', async () => {
    const canonicalId = 'real-canonical-uuid';
    const staleId = 'stale-uuid-id-value';
    const children = [{ id: 'child-1', sd_key: 'SD-CHILD-J1', status: 'pending_approval' }];

    const supabase = makeMismatchedSupabase({ canonicalId, children });
    const gate = createPrerequisiteCheckGate(supabase);

    const ctx = { sd: { id: staleId, sd_key: 'SD-PARENT-J' }, sdId: staleId };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(false);
    expect(result.wait).toBe(true);
    expect(result.wait_reason).toContain('1 child SD');
    expect(result.issues).toEqual([]);
  });
});
