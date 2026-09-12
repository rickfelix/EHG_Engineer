// QF-20260911-765: public.get_progress_breakdown's text/uuid overload ambiguity (PGRST203) is
// structural -- PostgREST cannot disambiguate when both overloads share the same parameter name,
// regardless of the value's shape. readProgressBreakdownForDisplay tolerates this specific,
// diagnostic-only readback so it no longer surfaces as a spurious entry in autoCompleteDeliverables'
// result.errors on every EXEC-TO-PLAN handoff, while a genuine successful read still passes through.
import { describe, it, expect } from 'vitest';
import { readProgressBreakdownForDisplay } from '../../../scripts/modules/handoff/auto-complete-deliverables.js';

function fakeSupabase(rpcResult) {
  return { rpc: () => Promise.resolve(rpcResult) };
}

describe('readProgressBreakdownForDisplay (QF-20260911-765)', () => {
  it('returns null (not throw) on the ambiguous-overload PGRST203 error', async () => {
    const supabase = fakeSupabase({
      data: null,
      error: {
        code: 'PGRST203',
        message: 'Could not choose the best candidate function between: public.get_progress_breakdown(sd_id_param => text), public.get_progress_breakdown(sd_id_param => uuid)',
      },
    });
    await expect(readProgressBreakdownForDisplay(supabase, 'SD-TEST-001')).resolves.toBeNull();
  });

  it('returns the breakdown on a genuine success', async () => {
    const supabase = fakeSupabase({ data: { total_progress: 80, can_complete: false }, error: null });
    const result = await readProgressBreakdownForDisplay(supabase, 'SD-TEST-001');
    expect(result).toEqual({ total_progress: 80, can_complete: false });
  });
});
