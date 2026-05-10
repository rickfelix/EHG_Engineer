/**
 * Integration test for scripts/modules/handoff/child-sd-selector.js
 * unlock_gate advisory branch.
 *
 * SD-FDBK-ENH-CADENCE-VOCAB-DISCRIMINATOR-001 TS-5
 *
 * Strategy: use the REAL computeGateState (not vi.mock) — the unit-under-test
 * is the consumer's discriminator branching, not the gate itself. Tests assert
 * the advisory child is RETAINED in cadenceCleared output and that the
 * canonical informational log substring is emitted.
 *
 * Per testing-agent R-3: real fn + full fixture metadata (vi.mock the gate
 * would bypass the real branching we want to verify).
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock side-effect modules NOT under test (urgency, DAG) so the test doesn't
// pull in their own DB / external surface
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
  // Mirror the production query chain shape: from -> select -> eq -> in [-> neq]
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            // both with-neq and without-neq paths return same fixture
            neq: () => Promise.resolve({ data: children, error: null }),
            then: (resolve) => resolve({ data: children, error: null }),
          }),
        }),
      }),
    }),
  };
}

describe('child-sd-selector cadenceCleared advisory branch (FR-3)', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('TS-5: child with metadata.unlock_gate.type=usage_signal is RETAINED (not filtered)', async () => {
    const advisoryChild = {
      id: 'child-advisory',
      sd_key: 'SD-EX-001-B',
      title: 'Advisory child',
      status: 'draft',
      priority: 50,
      sequence_rank: 2,
      created_at: '2026-04-01T00:00:00Z',
      metadata: { unlock_gate: { type: 'usage_signal', trigger: 'foo' } },
      governance_metadata: { next_workable_after: '2030-01-01T00:00:00Z' },
    };

    const supabase = makeSupabase([advisoryChild]);
    const result = await getNextReadyChild(supabase, 'parent-1', null);

    expect(result.sd).not.toBeNull();
    expect(result.sd.sd_key).toBe('SD-EX-001-B');
  });

  it('TS-5: advisory log contains canonical informational phrase', async () => {
    const advisoryChild = {
      id: 'child-advisory-2',
      sd_key: 'SD-EX-001-C',
      status: 'draft',
      created_at: '2026-04-01T00:00:00Z',
      metadata: { unlock_gate: { type: 'value_proof' } },
      governance_metadata: { next_workable_after: '2026-09-01T00:00:00Z' },
    };

    const supabase = makeSupabase([advisoryChild]);
    await getNextReadyChild(supabase, 'parent-1', null);

    const allLogs = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogs).toMatch(/SD-EX-001-C/);
    expect(allLogs).toMatch(/unlock_gate=value_proof/);
    expect(allLogs).toMatch(/\(informational\s+—\s+does not affect verdict\)/);
  });

  it('backward-compat: child WITHOUT unlock_gate + future next_workable_after IS filtered out (existing behavior)', async () => {
    const blockedChild = {
      id: 'child-blocked',
      sd_key: 'SD-EX-002',
      status: 'draft',
      created_at: '2026-04-01T00:00:00Z',
      metadata: {},
      governance_metadata: { next_workable_after: '2030-01-01T00:00:00Z' },
    };

    const supabase = makeSupabase([blockedChild]);
    const result = await getNextReadyChild(supabase, 'parent-1', null);

    expect(result.sd).toBeNull();

    const allLogs = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogs).toMatch(/Skipping SD-EX-002/);
    expect(allLogs).toMatch(/cadence gate active/);
  });

  it('mixed: advisory child retained + blocked child filtered out in same batch', async () => {
    const advisoryChild = {
      id: 'child-adv',
      sd_key: 'SD-EX-003-A',
      status: 'draft',
      created_at: '2026-04-01T00:00:00Z',
      metadata: { unlock_gate: { type: 'usage_signal' } },
      governance_metadata: { next_workable_after: '2030-01-01T00:00:00Z' },
    };
    const blockedChild = {
      id: 'child-blk',
      sd_key: 'SD-EX-003-B',
      status: 'draft',
      created_at: '2026-04-02T00:00:00Z',
      metadata: {},
      governance_metadata: { next_workable_after: '2030-01-01T00:00:00Z' },
    };

    const supabase = makeSupabase([advisoryChild, blockedChild]);
    const result = await getNextReadyChild(supabase, 'parent-1', null);

    // Either advisory child is selected (since blocked is filtered)
    expect(result.sd).not.toBeNull();
    expect(result.sd.sd_key).toBe('SD-EX-003-A');

    const allLogs = consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogs).toMatch(/SD-EX-003-A unlock_gate=usage_signal \(informational/);
    expect(allLogs).toMatch(/Skipping SD-EX-003-B/);
  });
});
