/**
 * SD-LEO-INFRA-FIX-JOURNEY-WALK-001 FR-3 (PLAN_VERIFICATION finding) — recordWait() must
 * persist a deliberately-frozen `first_wait_at: null` (an EXEMPT wait) as null, not stamp
 * "now" over it. The pre-fix `||` could not distinguish "no waitMetadata" from "waitMetadata
 * with first_wait_at intentionally null", silently undoing ValidationOrchestrator's freeze
 * at the persistence boundary and reintroducing the false-escalation class this SD exists
 * to prevent.
 */
import { describe, it, expect, vi } from 'vitest';
import { HandoffRecorder } from './HandoffRecorder.js';

function makeSupabase() {
  const inserted = [];
  const fromChain = {
    select: vi.fn(() => fromChain),
    or: vi.fn(() => fromChain),
    single: vi.fn(async () => ({ data: { id: 'sd-1' }, error: null })),
    insert: vi.fn((payload) => { inserted.push(payload); return fromChain; }),
  };
  const supabase = { from: vi.fn(() => fromChain) };
  return { supabase, inserted };
}

describe('HandoffRecorder.recordWait() — first_wait_at persistence', () => {
  it('persists a deliberately-null first_wait_at as null (frozen/exempt wait), not "now"', async () => {
    const { supabase, inserted } = makeSupabase();
    const recorder = new HandoffRecorder(supabase);

    await recorder.recordWait('PLAN-TO-LEAD', 'SD-1', {
      waitReasons: ['journey walk not yet attempted'],
      waitingGates: ['PREREQUISITE_HANDOFF_CHECK'],
      waitMetadata: { wait_attempts: 0, first_wait_at: null },
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0].metadata.first_wait_at).toBeNull();
    expect(inserted[0].metadata.wait_attempts).toBe(0);
  });

  it('legacy path (no waitMetadata at all) still stamps "now" (unchanged, regression-safe)', async () => {
    const { supabase, inserted } = makeSupabase();
    const recorder = new HandoffRecorder(supabase);

    await recorder.recordWait('PLAN-TO-LEAD', 'SD-1', {
      waitReasons: ['children incomplete'],
      waitingGates: ['SOME_GATE'],
      // no waitMetadata
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0].metadata.first_wait_at).not.toBeNull();
    expect(new Date(inserted[0].metadata.first_wait_at).getTime()).not.toBeNaN();
  });

  it('a real (non-exempt) wait with an explicit first_wait_at anchor persists that anchor unchanged', async () => {
    const { supabase, inserted } = makeSupabase();
    const recorder = new HandoffRecorder(supabase);
    const anchor = '2026-08-01T00:00:00.000Z';

    await recorder.recordWait('PLAN-TO-LEAD', 'SD-1', {
      waitReasons: ['children incomplete'],
      waitingGates: ['SOME_GATE'],
      waitMetadata: { wait_attempts: 3, first_wait_at: anchor },
    });

    expect(inserted[0].metadata.first_wait_at).toBe(anchor);
    expect(inserted[0].metadata.wait_attempts).toBe(3);
  });
});
