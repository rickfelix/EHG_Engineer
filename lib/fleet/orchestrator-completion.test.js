import { describe, it, expect } from 'vitest';
import {
  isOrchestratorChildTerminal,
  getIncompleteChildren,
  checkParentCompletable,
} from './orchestrator-completion.cjs';

describe('isOrchestratorChildTerminal', () => {
  it('treats completed and cancelled as terminal', () => {
    expect(isOrchestratorChildTerminal('completed')).toBe(true);
    expect(isOrchestratorChildTerminal('cancelled')).toBe(true);
  });

  it('treats deferred as NOT terminal (guard 4 diverges from the PLAN-TO-LEAD gate on purpose)', () => {
    expect(isOrchestratorChildTerminal('deferred')).toBe(false);
  });

  it('treats in-progress/pending_approval/null/undefined as not terminal', () => {
    expect(isOrchestratorChildTerminal('in_progress')).toBe(false);
    expect(isOrchestratorChildTerminal('pending_approval')).toBe(false);
    expect(isOrchestratorChildTerminal(null)).toBe(false);
    expect(isOrchestratorChildTerminal(undefined)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isOrchestratorChildTerminal('COMPLETED')).toBe(true);
  });
});

describe('getIncompleteChildren', () => {
  it('filters to only non-terminal children', () => {
    const children = [
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'in_progress' },
      { id: 'c', status: 'cancelled' },
      { id: 'd', status: 'pending_approval' },
    ];
    expect(getIncompleteChildren(children).map((c) => c.id)).toEqual(['b', 'd']);
  });

  it('handles an empty/undefined list', () => {
    expect(getIncompleteChildren([])).toEqual([]);
    expect(getIncompleteChildren(undefined)).toEqual([]);
  });
});

// Minimal chainable-query stub matching the subset of the Supabase client this module calls.
function stubSupabase({ childrenResult, handoffsResult }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => Promise.resolve(childrenResult) }) };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select: () => ({
            or: () => ({
              eq: () => ({
                order: () => Promise.resolve(handoffsResult),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in stub: ${table}`);
    },
  };
}

describe('checkParentCompletable', () => {
  it('reports couldNotCheck (not "not completable") when the parent row itself is missing', async () => {
    const result = await checkParentCompletable({}, null);
    expect(result.couldNotCheck).toBe(true);
    expect(result.completable).toBe(false);
  });

  it('reports not completable (not couldNotCheck) when the parent is already terminal', async () => {
    const result = await checkParentCompletable({}, { id: 'p1', status: 'completed' });
    expect(result.couldNotCheck).toBe(false);
    expect(result.completable).toBe(false);
    expect(result.reason).toContain('PARENT_ALREADY_TERMINAL');
  });

  it('surfaces a fixture parent with all children terminal (mix of completed/cancelled) and no accepted LFA as completable', async () => {
    const supabase = stubSupabase({
      childrenResult: { data: [{ id: 'c1', status: 'completed' }, { id: 'c2', status: 'cancelled' }], error: null },
      handoffsResult: { data: [], error: null },
    });
    const result = await checkParentCompletable(supabase, { id: 'p1', sd_key: 'SD-P-1', status: 'pending_approval' });
    expect(result.couldNotCheck).toBe(false);
    expect(result.completable).toBe(true);
  });

  it('does NOT surface a fixture parent with one non-terminal child', async () => {
    const supabase = stubSupabase({
      childrenResult: { data: [{ id: 'c1', status: 'completed' }, { id: 'c2', status: 'in_progress' }], error: null },
      handoffsResult: { data: [], error: null },
    });
    const result = await checkParentCompletable(supabase, { id: 'p1', sd_key: 'SD-P-1', status: 'pending_approval' });
    expect(result.couldNotCheck).toBe(false);
    expect(result.completable).toBe(false);
    expect(result.reason).toContain('INCOMPLETE_CHILDREN');
  });

  it('does NOT surface a parent that already has an accepted LEAD-FINAL-APPROVAL handoff', async () => {
    const supabase = stubSupabase({
      childrenResult: { data: [{ id: 'c1', status: 'completed' }], error: null },
      handoffsResult: { data: [{ id: 'h1', status: 'accepted', created_at: '2026-08-01T00:00:00Z' }], error: null },
    });
    const result = await checkParentCompletable(supabase, { id: 'p1', sd_key: 'SD-P-1', status: 'pending_approval' });
    expect(result.couldNotCheck).toBe(false);
    expect(result.completable).toBe(false);
    expect(result.hasAcceptedLeadFinal).toBe(true);
  });

  it('reports couldNotCheck (never "not completable" and never silently omitted) when the children query fails', async () => {
    const supabase = {
      from(table) {
        if (table === 'strategic_directives_v2') {
          return { select: () => ({ eq: () => Promise.resolve({ data: null, error: new Error('boom') }) }) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const result = await checkParentCompletable(supabase, { id: 'p1', sd_key: 'SD-P-1', status: 'pending_approval' });
    expect(result.couldNotCheck).toBe(true);
    expect(result.completable).toBe(false);
  });

  it('reports couldNotCheck when the handoffs query fails, after children already resolved as all-terminal', async () => {
    const supabase = {
      from(table) {
        if (table === 'strategic_directives_v2') {
          return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'c1', status: 'completed' }], error: null }) }) };
        }
        if (table === 'sd_phase_handoffs') {
          return {
            select: () => ({
              or: () => ({
                eq: () => ({
                  order: () => Promise.resolve({ data: null, error: new Error('boom') }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const result = await checkParentCompletable(supabase, { id: 'p1', sd_key: 'SD-P-1', status: 'pending_approval' });
    expect(result.couldNotCheck).toBe(true);
    expect(result.completable).toBe(false);
  });
});
