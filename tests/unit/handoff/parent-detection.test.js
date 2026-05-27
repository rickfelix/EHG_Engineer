/**
 * Tests for SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 FR-1.
 *
 * Validates unified parent-detection: OR-merge of metadata.is_parent flag
 * AND DB children query.
 */

import { describe, it, expect } from 'vitest';
import { isParentOrchestrator, isParentOrchestratorSync } from '../../../lib/handoff/parent-detection.js';

function makeFakeSupabase(children = []) {
  return {
    from(_table) {
      return {
        select(_cols) {
          return {
            eq(_col, _val) {
              return {
                async limit(_n) {
                  return { data: children, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 isParentOrchestrator', () => {
  it('TS-1: returns true when metadata.is_parent=true (metadata-flag-only path)', async () => {
    const sd = { id: 'sd-1', metadata: { is_parent: true } };
    const supabase = makeFakeSupabase([]);
    expect(await isParentOrchestrator(sd, supabase)).toBe(true);
  });

  it('TS-2: returns true when DB query returns children (DB-only path)', async () => {
    const sd = { id: 'sd-2', metadata: {} };
    const supabase = makeFakeSupabase([{ id: 'child-1' }, { id: 'child-2' }]);
    expect(await isParentOrchestrator(sd, supabase)).toBe(true);
  });

  it('TS-3: returns true when both metadata flag AND DB children agree', async () => {
    const sd = { id: 'sd-3', metadata: { is_parent: true } };
    const supabase = makeFakeSupabase([{ id: 'child-1' }]);
    expect(await isParentOrchestrator(sd, supabase)).toBe(true);
  });

  it('TS-4: returns false when neither metadata flag nor DB children', async () => {
    const sd = { id: 'sd-4', metadata: {} };
    const supabase = makeFakeSupabase([]);
    expect(await isParentOrchestrator(sd, supabase)).toBe(false);
  });

  it('caches result per-sd-object (DB query not repeated)', async () => {
    let queryCount = 0;
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  async limit() {
                    queryCount++;
                    return { data: [{ id: 'child-1' }], error: null };
                  },
                };
              },
            };
          },
        };
      },
    };
    const sd = { id: 'sd-cached', metadata: {} };
    expect(await isParentOrchestrator(sd, supabase)).toBe(true);
    expect(await isParentOrchestrator(sd, supabase)).toBe(true);
    expect(queryCount).toBe(1);
  });

  it('returns false when sd is null or undefined', async () => {
    expect(await isParentOrchestrator(null, makeFakeSupabase([]))).toBe(false);
    expect(await isParentOrchestrator(undefined, makeFakeSupabase([]))).toBe(false);
  });

  it('falls back to metadata-only check when supabase is null', async () => {
    const flagged = { id: 'sd-flagged', metadata: { is_parent: true } };
    const unflagged = { id: 'sd-unflagged', metadata: {} };
    expect(await isParentOrchestrator(flagged, null)).toBe(true);
    expect(await isParentOrchestrator(unflagged, null)).toBe(false);
  });

  it('isParentOrchestratorSync uses metadata flag only', () => {
    expect(isParentOrchestratorSync({ metadata: { is_parent: true } })).toBe(true);
    expect(isParentOrchestratorSync({ metadata: {} })).toBe(false);
    expect(isParentOrchestratorSync(null)).toBe(false);
  });
});
