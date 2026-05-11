/**
 * Tests for scripts/modules/handoff/child-sd-selector.js lead_decision.verdict
 * filter. Closes feedback 40dd5477 (orchestrator-preflight) + 7aed1203
 * (child-sd-selector) — both call sites previously routed AUTO-PROCEED to a
 * LEAD-strategically-deferred child.
 *
 * QF-20260511-164 — sibling fix to QF-20260511-565 (queue engine).
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../../../scripts/modules/handoff/auto-proceed/urgency-scorer.js', () => ({
  sortByUrgency: vi.fn((items) => items),
  scoreToBand: vi.fn(() => 'normal'),
}));

vi.mock('../../../lib/orchestrator/dependency-dag.js', () => ({
  buildDependencyDAG: vi.fn(),
  detectCycles: vi.fn(),
  computeRunnableSet: vi.fn(),
}));

import { getNextReadyChild } from '../../../scripts/modules/handoff/child-sd-selector.js';

function makeSupabase(children) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            neq: () => Promise.resolve({ data: children, error: null }),
            then: (resolve) => resolve({ data: children, error: null }),
          }),
        }),
      }),
    }),
  };
}

const baseChild = (over = {}) => ({
  id: 'child-1',
  sd_key: 'SD-EX-001-A',
  title: 'Test child',
  status: 'draft',
  priority: 50,
  sequence_rank: 1,
  created_at: '2026-04-01T00:00:00Z',
  metadata: {},
  governance_metadata: {},
  ...over,
});

describe('child-sd-selector lead_decision.verdict filter (QF-20260511-164)', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('filters out child with metadata.lead_decision.verdict=deferred', async () => {
    const deferred = baseChild({
      sd_key: 'SD-EX-001-C',
      metadata: { lead_decision: { verdict: 'deferred' } },
    });
    const supabase = makeSupabase([deferred]);
    const result = await getNextReadyChild(supabase, 'parent-1', null);
    expect(result.sd).toBeNull();
    expect(result.allComplete).toBe(true);
  });

  it('filters out verdict=paused_pending variant', async () => {
    const paused = baseChild({
      sd_key: 'SD-EX-001-D',
      metadata: { lead_decision: { verdict: 'paused_pending_phase_3_unlock' } },
    });
    const supabase = makeSupabase([paused]);
    const result = await getNextReadyChild(supabase, 'parent-1', null);
    expect(result.sd).toBeNull();
  });

  it('selects non-deferred child when deferred sibling precedes it', async () => {
    const deferred = baseChild({
      sd_key: 'SD-EX-001-C',
      metadata: { lead_decision: { verdict: 'deferred' } },
    });
    const ready = baseChild({
      id: 'child-2',
      sd_key: 'SD-EX-001-B',
      metadata: {},
    });
    const supabase = makeSupabase([deferred, ready]);
    const result = await getNextReadyChild(supabase, 'parent-1', null);
    expect(result.sd).not.toBeNull();
    expect(result.sd.sd_key).toBe('SD-EX-001-B');
  });

  it('tolerates missing metadata / missing lead_decision', async () => {
    const child = baseChild({ metadata: null });
    const supabase = makeSupabase([child]);
    const result = await getNextReadyChild(supabase, 'parent-1', null);
    expect(result.sd).not.toBeNull();
    expect(result.sd.sd_key).toBe('SD-EX-001-A');
  });

  it('emits skip log naming the verdict for operator visibility', async () => {
    const deferred = baseChild({
      sd_key: 'SD-EX-001-C',
      metadata: { lead_decision: { verdict: 'deferred' } },
    });
    const supabase = makeSupabase([deferred]);
    await getNextReadyChild(supabase, 'parent-1', null);
    const skipLog = consoleLogSpy.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('LEAD decision verdict=deferred')
    );
    expect(skipLog).toBeDefined();
  });
});
