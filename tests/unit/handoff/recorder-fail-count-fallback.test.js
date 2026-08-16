// QF-20260816-725. HandoffRecorder._incrementHandoffFailCount fixed two silent bugs:
// (1) the RPC's {error} return was never checked, so a missing increment_handoff_fail_count
//     function (confirmed absent live: PGRST202) never triggered any fallback at all;
// (2) the fallback itself called supabase.raw(...), a Knex.js idiom absent from supabase-js,
//     which threw synchronously and was swallowed by the outer catch.
import { describe, it, expect } from 'vitest';
import { HandoffRecorder } from '../../../scripts/modules/handoff/recording/HandoffRecorder.js';

function makeRecorder({ rpcError = null, sessionRow = { handoff_fail_count: 2 }, readError = null, updateError = null } = {}) {
  const calls = { rpc: [], update: [] };
  const supabase = {
    rpc: (name, args) => {
      calls.rpc.push({ name, args });
      return Promise.resolve({ data: null, error: rpcError });
    },
    from(table) {
      return {
        select() { return this; },
        update(row) {
          calls.update.push({ table, row });
          return { eq: () => ({ eq: () => Promise.resolve({ data: null, error: updateError }) }) };
        },
        eq() { return this; },
        maybeSingle: () => Promise.resolve({ data: sessionRow, error: readError }),
      };
    },
  };
  const recorder = new HandoffRecorder(supabase, {
    contentBuilder: {},
    validationOrchestrator: {},
  });
  return { recorder, calls };
}

describe('QF-20260816-725: HandoffRecorder._incrementHandoffFailCount', () => {
  it('RPC succeeds -> no fallback read/update attempted', async () => {
    const { recorder, calls } = makeRecorder({ rpcError: null });
    await recorder._incrementHandoffFailCount('SD-T-001');
    expect(calls.rpc).toHaveLength(1);
    expect(calls.update).toHaveLength(0);
  });

  it('RPC returns an error (e.g. PGRST202, function missing) -> fallback read-then-update increments the counter', async () => {
    const { recorder, calls } = makeRecorder({
      rpcError: { message: 'Could not find the function public.increment_handoff_fail_count(p_sd_id) in the schema cache' },
      sessionRow: { handoff_fail_count: 2 },
    });
    await recorder._incrementHandoffFailCount('SD-T-001');
    expect(calls.update).toHaveLength(1);
    expect(calls.update[0].row).toEqual({ handoff_fail_count: 3 });
  });

  it('RPC error + no active session found -> does not throw, no update attempted', async () => {
    const { recorder, calls } = makeRecorder({
      rpcError: { message: 'function missing' },
      sessionRow: null,
    });
    await expect(recorder._incrementHandoffFailCount('SD-T-001')).resolves.toBeUndefined();
    expect(calls.update).toHaveLength(0);
  });

  it('RPC error + fallback read also errors -> does not throw', async () => {
    const { recorder } = makeRecorder({
      rpcError: { message: 'function missing' },
      readError: { message: 'connection reset' },
    });
    await expect(recorder._incrementHandoffFailCount('SD-T-001')).resolves.toBeUndefined();
  });

  it('RPC error + fallback update errors -> does not throw', async () => {
    const { recorder } = makeRecorder({
      rpcError: { message: 'function missing' },
      updateError: { message: 'constraint violation' },
    });
    await expect(recorder._incrementHandoffFailCount('SD-T-001')).resolves.toBeUndefined();
  });

  it('handoff_fail_count starts NULL -> treated as 0, fallback sets it to 1', async () => {
    const { recorder, calls } = makeRecorder({
      rpcError: { message: 'function missing' },
      sessionRow: { handoff_fail_count: null },
    });
    await recorder._incrementHandoffFailCount('SD-T-001');
    expect(calls.update[0].row).toEqual({ handoff_fail_count: 1 });
  });
});
