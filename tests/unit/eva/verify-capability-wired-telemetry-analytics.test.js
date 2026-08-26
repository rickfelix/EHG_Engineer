/**
 * SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C (FR-3, FR-5)
 *
 * Unit coverage for verifyCapabilityWired's telemetry-analytics branch: calls
 * fn_venture_usage_window_summary via supabase.rpc() (never a raw table SELECT),
 * and reports active_users as distinct(actor_hash), never raw event-row count.
 */
import { describe, it, expect, vi } from 'vitest';
import { verifyCapabilityWired, WIRED_CAPABILITY_FEEDBACK_TYPES } from '../../../lib/eva/utils/validate-venture-default-capabilities.js';

function buildMockSupabaseWithRpc(rpcResult) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return {
    rpc,
    from() {
      throw new Error('verifyCapabilityWired must call fn_venture_usage_window_summary via .rpc(), never .from() for telemetry-analytics');
    },
  };
}

describe('SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C: verifyCapabilityWired telemetry-analytics', () => {
  it('TS-1: reports wired=true with event_count and active_users when the RPC returns real data', async () => {
    const supabase = buildMockSupabaseWithRpc({ data: [{ event_count: 3, active_users: 2 }], error: null });
    const result = await verifyCapabilityWired(supabase, 'venture-a', 'telemetry-analytics');
    expect(result.wired).toBe(true);
    expect(result.active_users).toBe(2);
    expect(supabase.rpc).toHaveBeenCalledWith(
      'fn_venture_usage_window_summary',
      expect.objectContaining({ p_venture_id: 'venture-a' }),
    );
  });

  it('TS-2: reports wired=false when the RPC returns zero events', async () => {
    const supabase = buildMockSupabaseWithRpc({ data: [{ event_count: 0, active_users: 0 }], error: null });
    const result = await verifyCapabilityWired(supabase, 'venture-b', 'telemetry-analytics');
    expect(result.wired).toBe(false);
  });

  it('FR-5: active_users reflects distinct(actor_hash), not raw event-row count (10 events, 1 actor)', async () => {
    const supabase = buildMockSupabaseWithRpc({ data: [{ event_count: 10, active_users: 1 }], error: null });
    const result = await verifyCapabilityWired(supabase, 'venture-c', 'telemetry-analytics');
    expect(result.wired).toBe(true);
    expect(result.active_users).toBe(1);
    expect(result.active_users).not.toBe(10);
  });

  it('reports wired=false (not a thrown error) when the RPC call errors', async () => {
    const supabase = buildMockSupabaseWithRpc({ data: null, error: { message: 'connection reset' } });
    const result = await verifyCapabilityWired(supabase, 'venture-d', 'telemetry-analytics');
    expect(result.wired).toBe(false);
    expect(result.reason).toMatch(/connection reset/);
  });

  it('AC-5 (dead-code-placement): telemetry-analytics is handled before the WIRED_CAPABILITY_FEEDBACK_TYPES lookup', () => {
    // If a future edit regresses the branch to AFTER the registry lookup, this assertion
    // documents why: telemetry-analytics deliberately has NO entry in the feedback-table
    // registry, so a post-lookup placement would always hit the early "no wired-
    // verification signal" return and never reach the RPC-based check.
    expect(WIRED_CAPABILITY_FEEDBACK_TYPES['telemetry-analytics']).toBeUndefined();
  });

  it('existing feedback-widget/error-capture-middleware behavior is unmodified', async () => {
    const supabase = {
      from(table) {
        expect(table).toBe('feedback');
        return {
          select() {
            return {
              eq() { return this; },
              in() { return this; },
              limit() {
                return Promise.resolve({ data: [{ id: 'row-1' }], error: null });
              },
            };
          },
        };
      },
    };
    const result = await verifyCapabilityWired(supabase, 'venture-e', 'feedback-widget');
    expect(result.wired).toBe(true);
  });
});
