/**
 * Tests for GATE_DELIVERABLES_PLANNING's profile/deliverables queries
 * (SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 FR-2).
 */
import { describe, it, expect } from 'vitest';
import { validateDeliverablesPlanning } from './deliverables-planning.js';
import { createQueuedSupabaseMock } from '../../../../../../tests/factories/queued-supabase-mock.js';

const sd = { id: 'sd-1', sd_type: 'feature' };

describe('GATE_DELIVERABLES_PLANNING queries', () => {
  it('reports existing deliverables when both queries succeed', async () => {
    const supabase = createQueuedSupabaseMock([
      { data: { requires_deliverables_gate: true }, error: null }, // profile
      { data: [{ id: 'd1', deliverable_name: 'Ship X', completion_status: 'completed' }], error: null }, // deliverables
    ]);

    const result = await validateDeliverablesPlanning(supabase, sd);

    expect(result.passed).toBe(true);
    expect(result.details.deliverableCount).toBe(1);
  });

  it('FR-2: fails closed (passed:false) when the deliverables query is broken', async () => {
    const supabase = createQueuedSupabaseMock([
      { data: { requires_deliverables_gate: true }, error: null }, // profile
      { data: null, error: { message: 'RLS denied', code: '42501' } }, // deliverables fails
    ]);

    const result = await validateDeliverablesPlanning(supabase, sd);

    expect(result.passed).toBe(false);
  });
});
