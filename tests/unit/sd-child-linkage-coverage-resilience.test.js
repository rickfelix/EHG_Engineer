/**
 * SD-LEO-INFRA-PARENT-SCOPE-COVERAGE-001 (FR-2, AC-3).
 *
 * linkChild()'s scope-coverage computation must be non-fatal: a thrown error inside
 * computeScopeCoverage() must not prevent the child's parent_sd_id/relationship_type
 * write from succeeding. Mocks computeScopeCoverage to throw (the real function is
 * defensively coded and won't throw on realistic input — this proves the resilience
 * path itself, which the real-DB integration test can't trigger without a fault-inject).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/sd/scope-coverage.js', () => ({
  computeScopeCoverage: vi.fn(() => {
    throw new Error('simulated scope-coverage failure');
  }),
}));

const { linkChild } = await import('../../lib/sd/child-linkage.js');

function buildFakeSupabase({ parentRow, childrenRows = [] }) {
  const updates = [];
  return {
    from(table) {
      expect(table).toBe('strategic_directives_v2');
      return {
        select() {
          return {
            eq(_col, value) {
              // Re-fetch of the parent (linkChild's first query) vs the children-fetch
              // (the new coverage-resilience query) are distinguished by chain shape below.
              return {
                single: async () => ({ data: { ...parentRow }, error: null }),
                // children fetch has no .single() call in child-linkage.js
                then: undefined,
              };
            },
          };
        },
        update(fields) {
          return {
            eq: async (col, value) => {
              updates.push({ table, fields, col, value });
              return { error: null };
            },
          };
        },
      };
    },
    __updates: updates,
  };
}

describe('linkChild — scope-coverage resilience', () => {
  it('still writes child parent_sd_id/relationship_type when computeScopeCoverage throws', async () => {
    const parentRow = { id: 'PARENT-1', uuid_id: 'uuid-parent-1', sd_key: 'SD-PARENT-001', metadata: {}, scope: '1. Something', success_criteria: [] };
    const supabase = buildFakeSupabase({ parentRow });

    const result = await linkChild(supabase, parentRow, 'SD-PARENT-001-A', { registryOptional: true });

    expect(result.childKey).toBe('SD-PARENT-001-A');
    expect(result.relationship_type).toBe('child');

    const childWrite = supabase.__updates.find((u) => u.value === 'SD-PARENT-001-A');
    expect(childWrite).toBeTruthy();
    expect(childWrite.fields).toEqual({ parent_sd_id: 'PARENT-1', relationship_type: 'child' });
  });
});
