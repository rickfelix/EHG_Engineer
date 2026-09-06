/**
 * Tests for ARCHITECTURE_PHASE_COVERAGE_EXIT's any-SD-exists lookup
 * (SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 FR-2). createPhaseCoverageExitGate lives in the shared
 * lead-final-approval/gates.js barrel alongside many other gate factories.
 */
import { describe, it, expect } from 'vitest';
import { createPhaseCoverageExitGate } from './gates.js';
import { createQueuedSupabaseMock } from '../../../../../tests/factories/queued-supabase-mock.js';

const plan = {
  sections: {
    implementation_phases: [{ title: 'Phase 1', covered_by_sd_key: 'SD-ORPHAN' }],
  },
};
const ctx = () => ({ sd: { id: 'sd-1', sd_key: 'SD-CURRENT', metadata: { arch_key: 'ARCH-1' } } });

describe('ARCHITECTURE_PHASE_COVERAGE_EXIT any-SD lookup', () => {
  it('marks a phase covered when the referenced SD exists and is completed', async () => {
    const supabase = createQueuedSupabaseMock([
      { data: plan, error: null }, // architecture plan
      { data: [], error: null }, // linked SDs (none)
      { data: { sd_key: 'SD-ORPHAN', status: 'completed' }, error: null }, // any-SD lookup
    ]);
    const gate = createPhaseCoverageExitGate(supabase);

    const result = await gate.validator(ctx());

    expect(result.passed).toBe(true);
  });

  it('FR-2: fails closed (passed:false) when the any-SD lookup query is broken', async () => {
    const supabase = createQueuedSupabaseMock([
      { data: plan, error: null }, // architecture plan
      { data: [], error: null }, // linked SDs (none)
      { data: null, error: { message: 'connection reset', code: '08006' } }, // any-SD lookup fails
    ]);
    const gate = createPhaseCoverageExitGate(supabase);

    const result = await gate.validator(ctx());

    expect(result.passed).toBe(false);
  });
});
