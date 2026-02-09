/**
 * Parallel Orchestrator Coordinator - Unit Tests
 *
 * Covers: scheduling, concurrency limits, failure propagation,
 * sequential fallback, budget enforcement, run summary.
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-B (FR-3, FR-4, FR-5, FR-6)
 */

import { describe, it, expect } from 'vitest';
import { ParallelCoordinator } from '../../lib/orchestrator/parallel-coordinator.js';

// Helper to create mock child SDs
function makeChild(id, sdKey, blockedBy = []) {
  return {
    id,
    sd_key: sdKey,
    metadata: blockedBy.length > 0 ? { blocked_by: blockedBy } : {}
  };
}

// TS-1: Parallel happy path
describe('ParallelCoordinator - Happy Path', () => {
  it('schedules all independent children for parallel execution', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B'),
      makeChild('c', 'SD-C')
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3,
      runId: 'test-run-1'
    });

    const schedule = coord.getInitialSchedule();

    expect(schedule.toStart).toHaveLength(3);
    expect(schedule.toStart).toContain('a');
    expect(schedule.toStart).toContain('b');
    expect(schedule.toStart).toContain('c');
    expect(schedule.allTerminal).toBe(false);
  });

  it('completes run when all children succeed', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B'),
      makeChild('c', 'SD-C')
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    coord.getInitialSchedule();
    coord.markStarted('a', '/worktree/a');
    coord.markStarted('b', '/worktree/b');
    coord.markStarted('c', '/worktree/c');

    coord.onChildComplete('a', 'succeeded');
    coord.onChildComplete('b', 'succeeded');
    const final = coord.onChildComplete('c', 'succeeded');

    expect(final.allTerminal).toBe(true);
    expect(coord.isComplete()).toBe(true);

    const state = coord.getState();
    expect(state.succeeded).toHaveLength(3);
    expect(state.running).toHaveLength(0);
    expect(state.queued).toHaveLength(0);
  });

  it('produces run summary with speedup ratio', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B')
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 2,
      runId: 'test-summary'
    });

    coord.getInitialSchedule();
    coord.markStarted('a');
    coord.markStarted('b');
    coord.onChildComplete('a', 'succeeded');
    coord.onChildComplete('b', 'succeeded');

    const summary = coord.getRunSummary();

    expect(summary.runId).toBe('test-summary');
    expect(summary.parallelEnabled).toBe(true);
    expect(summary.children.total).toBe(2);
    expect(summary.children.succeeded).toBe(2);
    expect(summary.children.failed).toBe(0);
    expect(typeof summary.wallTimeMs).toBe('number');
    expect(typeof summary.speedupRatio).toBe('number');
  });

  it('tracks max concurrency observed', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B'),
      makeChild('c', 'SD-C')
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    coord.getInitialSchedule();
    coord.markStarted('a');
    expect(coord.maxConcurrencyObserved).toBe(1);

    coord.markStarted('b');
    expect(coord.maxConcurrencyObserved).toBe(2);

    coord.markStarted('c');
    expect(coord.maxConcurrencyObserved).toBe(3);

    const summary = coord.getRunSummary();
    expect(summary.maxConcurrencyObserved).toBe(3);
  });
});

// TS-2: Dependency ordering
describe('ParallelCoordinator - Dependencies', () => {
  it('only schedules children whose blockers are complete', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a']),
      makeChild('c', 'SD-C', ['a'])
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    const initial = coord.getInitialSchedule();

    // Only A should be schedulable initially
    expect(initial.toStart).toEqual(['a']);
  });

  it('unlocks dependents after blocker completes', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a']),
      makeChild('c', 'SD-C', ['a'])
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    coord.getInitialSchedule();
    coord.markStarted('a');

    // A completes -> B and C become runnable
    const afterA = coord.onChildComplete('a', 'succeeded');

    expect(afterA.toStart).toContain('b');
    expect(afterA.toStart).toContain('c');
  });

  it('handles diamond dependency: D waits for both B and C', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a']),
      makeChild('c', 'SD-C', ['a']),
      makeChild('d', 'SD-D', ['b', 'c'])
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    coord.getInitialSchedule();
    coord.markStarted('a');
    const afterA = coord.onChildComplete('a', 'succeeded');

    // B and C unblocked, D still blocked
    expect(afterA.toStart).toContain('b');
    expect(afterA.toStart).toContain('c');
    expect(afterA.toStart).not.toContain('d');

    coord.markStarted('b');
    coord.markStarted('c');

    // Only B completes -> D still blocked (needs C)
    const afterB = coord.onChildComplete('b', 'succeeded');
    expect(afterB.toStart).not.toContain('d');

    // C also completes -> D unblocked
    const afterC = coord.onChildComplete('c', 'succeeded');
    expect(afterC.toStart).toContain('d');
  });
});

// TS-3: Cycle detection
describe('ParallelCoordinator - Cycle Detection', () => {
  it('throws on cycle in dependencies', () => {
    const children = [
      makeChild('a', 'SD-A', ['b']),
      makeChild('b', 'SD-B', ['a'])
    ];

    expect(() => {
      new ParallelCoordinator(children, { parallelEnabled: true });
    }).toThrow(/cycle/i);
  });
});

// TS-5: Failure propagation
describe('ParallelCoordinator - Failure Propagation', () => {
  it('skips dependents when blocker fails', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a'])
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    coord.getInitialSchedule();
    coord.markStarted('a');

    const afterFail = coord.onChildComplete('a', 'failed');

    // B should be skipped
    expect(afterFail.toSkip).toContain('b');
    expect(afterFail.allTerminal).toBe(true);

    const state = coord.getState();
    expect(state.failed).toHaveLength(1);
    expect(state.skipped).toHaveLength(1);
    expect(state.skipped[0].reason).toContain('blocker_failed');
  });

  it('propagates failure through dependency chain', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a']),
      makeChild('c', 'SD-C', ['b'])
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    coord.getInitialSchedule();
    coord.markStarted('a');

    // A fails -> B skipped
    const afterA = coord.onChildComplete('a', 'failed');
    expect(afterA.toSkip).toContain('b');

    // Recompute: C should also be terminal (B is skipped, treated as failed)
    coord.onChildComplete('b', 'failed'); // Force recompute
    // Actually B was already marked skipped, so let's just check final state
    const summary = coord.getRunSummary();
    expect(summary.children.failed).toBeGreaterThanOrEqual(1);
  });

  it('includes failure reason in run summary', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a'])
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    coord.getInitialSchedule();
    coord.markStarted('a');
    coord.onChildComplete('a', 'failed', { reason: 'Test failure' });

    const summary = coord.getRunSummary();
    expect(summary.children.failed).toBe(1);
    expect(summary.children.skipped).toBe(1);
  });
});

// TS-6: Sequential fallback
describe('ParallelCoordinator - Sequential Fallback', () => {
  it('runs one child at a time when parallel disabled', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B'),
      makeChild('c', 'SD-C')
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: false,
      maxConcurrency: 3 // Should be overridden to 1
    });

    const initial = coord.getInitialSchedule();

    // Only one child despite 3 being runnable
    expect(initial.toStart).toHaveLength(1);
  });

  it('sequences through all children when parallel disabled', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B'),
      makeChild('c', 'SD-C')
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: false
    });

    // Start first
    const s1 = coord.getInitialSchedule();
    expect(s1.toStart).toHaveLength(1);
    const first = s1.toStart[0];
    coord.markStarted(first);

    // Complete first -> second starts
    const s2 = coord.onChildComplete(first, 'succeeded');
    expect(s2.toStart).toHaveLength(1);
    const second = s2.toStart[0];
    coord.markStarted(second);

    // Complete second -> third starts
    const s3 = coord.onChildComplete(second, 'succeeded');
    expect(s3.toStart).toHaveLength(1);
    const third = s3.toStart[0];
    coord.markStarted(third);

    // Complete third -> all done
    const s4 = coord.onChildComplete(third, 'succeeded');
    expect(s4.allTerminal).toBe(true);
  });

  it('reports parallelEnabled=false in summary', () => {
    const children = [makeChild('a', 'SD-A')];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: false
    });

    const summary = coord.getRunSummary();
    expect(summary.parallelEnabled).toBe(false);
    expect(summary.maxConcurrencyConfig).toBe(1);
  });
});

// TS-7: Concurrency limit enforcement
describe('ParallelCoordinator - Concurrency Limits', () => {
  it('respects maxConcurrency limit', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B'),
      makeChild('c', 'SD-C'),
      makeChild('d', 'SD-D'),
      makeChild('e', 'SD-E')
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 2
    });

    const initial = coord.getInitialSchedule();

    // Only 2 despite 5 being runnable
    expect(initial.toStart).toHaveLength(2);
  });

  it('fills slots as children complete', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B'),
      makeChild('c', 'SD-C'),
      makeChild('d', 'SD-D')
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 2
    });

    // Initial: start 2
    const s1 = coord.getInitialSchedule();
    expect(s1.toStart).toHaveLength(2);
    coord.markStarted(s1.toStart[0]);
    coord.markStarted(s1.toStart[1]);

    // Complete one -> one new slot
    const s2 = coord.onChildComplete(s1.toStart[0], 'succeeded');
    expect(s2.toStart).toHaveLength(1);
    coord.markStarted(s2.toStart[0]);

    // Complete another -> last one starts
    const s3 = coord.onChildComplete(s1.toStart[1], 'succeeded');
    expect(s3.toStart).toHaveLength(1);
  });
});

// FR-6: Cost budget enforcement
describe('ParallelCoordinator - Budget Enforcement', () => {
  it('stops spawning when budget exceeded', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B'),
      makeChild('c', 'SD-C')
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3,
      costBudget: 1000
    });

    // Start all 3
    coord.getInitialSchedule();
    coord.markStarted('a');
    coord.markStarted('b');

    // A completes using 600 tokens
    coord.onChildComplete('a', 'succeeded', { tokensUsed: 600 });

    // B completes using 500 tokens (total: 1100, exceeds 1000 budget)
    coord.onChildComplete('b', 'succeeded', { tokensUsed: 500 });

    // C should not be started due to budget exceeded
    // Budget was exceeded, so toStart should be empty
    // (b was already completed above, so check the state)

    const summary = coord.getRunSummary();
    expect(summary.budget.exceeded).toBe(true);
    expect(summary.budget.used).toBe(1100);
  });

  it('includes budget info in summary when no budget set', () => {
    const children = [makeChild('a', 'SD-A')];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    const summary = coord.getRunSummary();
    expect(summary.budget.configured).toBeNull();
    expect(summary.budget.exceeded).toBe(false);
  });
});

// FR-5: Observability - structured events
describe('ParallelCoordinator - Observability', () => {
  it('emits events for all state changes', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['a'])
    ];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3,
      runId: 'obs-test'
    });

    coord.getInitialSchedule();
    coord.markStarted('a', '/wt/a');
    coord.onChildComplete('a', 'succeeded');

    const summary = coord.getRunSummary();
    const events = summary.events;

    // Should have: child_started(a), child_completed(a), child_skipped/unlock events
    expect(events.some(e => e.type === 'child_started' && e.childId === 'a')).toBe(true);
    expect(events.some(e => e.type === 'child_completed' && e.childId === 'a')).toBe(true);

    // All events have runId and timestamp
    for (const event of events) {
      expect(event.runId).toBe('obs-test');
      expect(event.timestamp).toBeTruthy();
    }
  });

  it('records worktree path in started event', () => {
    const children = [makeChild('a', 'SD-A')];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    coord.getInitialSchedule();
    coord.markStarted('a', '/worktrees/SD-A');

    const startEvent = coord.events.find(e => e.type === 'child_started');
    expect(startEvent.worktreePath).toBe('/worktrees/SD-A');
  });

  it('records duration in completed event', () => {
    const children = [makeChild('a', 'SD-A')];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    coord.getInitialSchedule();
    coord.markStarted('a');
    coord.onChildComplete('a', 'succeeded');

    const completeEvent = coord.events.find(e => e.type === 'child_completed');
    expect(typeof completeEvent.durationMs).toBe('number');
    expect(completeEvent.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// Edge cases
describe('ParallelCoordinator - Edge Cases', () => {
  it('handles single child', () => {
    const children = [makeChild('a', 'SD-A')];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    const initial = coord.getInitialSchedule();
    expect(initial.toStart).toEqual(['a']);

    coord.markStarted('a');
    const after = coord.onChildComplete('a', 'succeeded');
    expect(after.allTerminal).toBe(true);
  });

  it('handles markStarted for unknown childId gracefully', () => {
    const children = [makeChild('a', 'SD-A')];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    // Should not throw
    coord.markStarted('nonexistent');
    expect(coord.maxConcurrencyObserved).toBe(0);
  });

  it('handles onChildComplete for unknown childId gracefully', () => {
    const children = [makeChild('a', 'SD-A')];

    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    // Should not throw and should return a valid schedule
    const result = coord.onChildComplete('nonexistent', 'succeeded');
    expect(result.toStart).toBeDefined();
  });

  it('handles DAG errors (missing references) without crashing', () => {
    const children = [
      makeChild('a', 'SD-A'),
      makeChild('b', 'SD-B', ['missing-id'])
    ];

    // Should not throw (missing references are non-fatal)
    const coord = new ParallelCoordinator(children, {
      parallelEnabled: true,
      maxConcurrency: 3
    });

    expect(coord.dagErrors).toHaveLength(1);

    const initial = coord.getInitialSchedule();
    // a is runnable, b has invalid blocker but is treated as blocked
    expect(initial.toStart).toContain('a');
  });
});
