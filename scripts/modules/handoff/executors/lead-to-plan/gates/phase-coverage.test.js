/**
 * Tests for ARCHITECTURE_PHASE_COVERAGE's orchestrator-children queries
 * (SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 FR-2).
 */
import { describe, it, expect } from 'vitest';
import { createPhaseCoverageGate } from './phase-coverage.js';
import { createQueuedSupabaseMock } from '../../../../../../tests/factories/queued-supabase-mock.js';

const ctx = () => ({
  sd: { id: 'sd-1', metadata: { arch_key: 'ARCH-1' } },
});

const plan = {
  sections: {
    implementation_phases: [{ title: 'Phase 1', covered_by_sd_key: 'SD-CHILD-1' }],
  },
};

describe('ARCHITECTURE_PHASE_COVERAGE orchestrator-children queries', () => {
  it('folds in orchestrator children when both lookups succeed', async () => {
    const supabase = createQueuedSupabaseMock([
      { data: plan, error: null }, // architecture plan
      { data: [{ sd_key: 'SD-CHILD-1', title: 'child', status: 'completed', parent_sd_id: 'orch-1' }], error: null }, // linked SDs
      { data: [{ id: 'orch-1', sd_key: 'ORCH-1' }], error: null }, // orchUuids
      { data: [{ sd_key: 'SD-CHILD-2', title: 'grandchild', status: 'completed', parent_sd_id: 'orch-1' }], error: null }, // children
    ]);
    const gate = createPhaseCoverageGate(supabase);

    const result = await gate.validator(ctx());

    expect(result.passed).toBe(true);
  });

  it('FR-2: fails closed (passed:false) when the orchestrator-children query is broken', async () => {
    const supabase = createQueuedSupabaseMock([
      { data: plan, error: null }, // architecture plan
      { data: [{ sd_key: 'SD-CHILD-1', title: 'child', status: 'completed', parent_sd_id: 'orch-1' }], error: null }, // linked SDs
      { data: [{ id: 'orch-1', sd_key: 'ORCH-1' }], error: null }, // orchUuids
      { data: null, error: { message: 'timeout', code: '57014' } }, // children query fails
    ]);
    const gate = createPhaseCoverageGate(supabase);

    const result = await gate.validator(ctx());

    expect(result.passed).toBe(false);
  });
});
