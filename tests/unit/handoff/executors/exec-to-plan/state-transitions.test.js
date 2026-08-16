/**
 * Tests for exec-to-plan/state-transitions.js transitionUserStoriesToValidated()
 *
 * SD-LEO-INFRA-STORY-CASCADE-ADDITIVE-ONLY-001: this function previously had zero
 * precondition -- every story for an SD was unconditionally overwritten. It now
 * (a) skips an already-complete story entirely (idempotency guard, mirroring its
 * plan-to-lead sibling), and (b) stamps completed_by/completed_at only on a
 * genuine first-time completion, never overwriting an existing marker.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transitionUserStoriesToValidated } from '../../../../../scripts/modules/handoff/executors/exec-to-plan/state-transitions.js';

function makeStoriesMock(stories) {
  const updateCalls = [];
  const updateFn = vi.fn((updates) => {
    updateCalls.push(updates);
    return { eq: vi.fn().mockResolvedValue({ error: null }) };
  });
  const db = {
    from: vi.fn((table) => {
      if (table === 'user_stories') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: stories, error: null }),
          }),
          update: updateFn,
        };
      }
      return {};
    }),
  };
  return { db, updateCalls, updateFn };
}

describe('transitionUserStoriesToValidated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TS-4: is a true no-op on an already-complete story (idempotency guard)', async () => {
    const story = {
      id: 's1',
      title: 'Already done',
      e2e_test_path: null,
      status: 'completed',
      validation_status: 'validated',
      completed_by: null,
    };
    const { db, updateFn } = makeStoriesMock([story]);

    await transitionUserStoriesToValidated(db, 'sd-1');

    expect(updateFn).not.toHaveBeenCalled();
  });

  it('TS-5: stamps a fresh in_progress story on first completion', async () => {
    const story = {
      id: 's2',
      title: 'In progress',
      e2e_test_path: null,
      status: 'in_progress',
      validation_status: 'pending',
      completed_by: null,
    };
    const { db, updateCalls } = makeStoriesMock([story]);

    await transitionUserStoriesToValidated(db, 'sd-1');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe('completed');
    expect(updateCalls[0].validation_status).toBe('validated');
    expect(updateCalls[0].completed_by).toBe('system:transitionUserStoriesToValidated');
    expect(updateCalls[0].completed_at).toBeTruthy();
  });

  it('FR-2 AC-5: an existing non-null completed_by on an in_progress story survives the call', async () => {
    const story = {
      id: 's3',
      title: 'Manually completed once, needs validation repair',
      e2e_test_path: null,
      status: 'in_progress',
      validation_status: 'pending',
      completed_by: 'EXEC (manual)',
    };
    const { db, updateCalls } = makeStoriesMock([story]);

    await transitionUserStoriesToValidated(db, 'sd-1');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].completed_by).toBeUndefined();
    expect(updateCalls[0].completed_at).toBeUndefined();
  });

  it('handles an empty story set without error', async () => {
    const { db, updateFn } = makeStoriesMock([]);

    await expect(transitionUserStoriesToValidated(db, 'sd-1')).resolves.toBeUndefined();
    expect(updateFn).not.toHaveBeenCalled();
  });
});
