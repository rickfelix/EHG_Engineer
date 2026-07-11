/**
 * SD-LEO-INFRA-TELEMETRY-AUDIENCE-ROUTING-001 (FR-1, FR-2): closure-map C7 —
 * a machine-telemetry category (fleet_dormancy) writes through an atomic
 * aggregate UPSERT RPC instead of the insert-or-noop dedup path, so repeated
 * detector firings collapse into ONE row with an incrementing occurrence_count
 * instead of one row per firing.
 */
import { describe, it, expect, vi } from 'vitest';
import { emitFeedback } from '../../../lib/governance/emit-feedback.js';
import { resolveFeedbackAudience, MACHINE_TELEMETRY_CATEGORIES } from '../../../lib/governance/feedback-audience.js';

function buildSupabaseWithRpc({ rpcResult = { ok: true, action: 'created', id: 'fb-agg-1' }, rpcError = null } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: rpcResult, error: rpcError });
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) })),
      insert: vi.fn(),
    })),
    rpc,
  };
}

describe('resolveFeedbackAudience', () => {
  it('classifies fleet_dormancy as machine-telemetry', () => {
    expect(resolveFeedbackAudience('fleet_dormancy')).toBe('machine-telemetry');
  });

  it('classifies harness_backlog (emitFeedback\'s own default category) as coordinator-operational, NOT machine-telemetry', () => {
    // Regression pin: harness_backlog is used broadly by dozens of callers for
    // genuinely distinct content. Including it in the telemetry allowlist would
    // silently collapse distinct backlog items into one aggregate row per day —
    // discovered via the pre-existing test suite failing when it was included.
    expect(resolveFeedbackAudience('harness_backlog')).toBe('coordinator-operational');
  });

  it('fails open to coordinator-operational for any unknown category', () => {
    expect(resolveFeedbackAudience('totally_unknown_category')).toBe('coordinator-operational');
    expect(resolveFeedbackAudience(undefined)).toBe('coordinator-operational');
  });

  it('MACHINE_TELEMETRY_CATEGORIES is scoped to only the empirically-proven incident category', () => {
    expect(MACHINE_TELEMETRY_CATEGORIES).toEqual(['fleet_dormancy']);
  });
});

describe('emitFeedback — machine-telemetry aggregate routing', () => {
  it('routes a fleet_dormancy write through record_telemetry_occurrence RPC, not a plain insert', async () => {
    const supabase = buildSupabaseWithRpc({ rpcResult: { ok: true, action: 'created', id: 'fb-agg-1' } });
    const result = await emitFeedback({
      supabase,
      title: 'Fleet dormancy',
      description: 'Fleet dormancy: 3 worker(s) armed a wakeup that never fired',
      category: 'fleet_dormancy',
      severity: 'high',
    });
    expect(result).toEqual({ id: 'fb-agg-1', deduped: false });
    expect(supabase.rpc).toHaveBeenCalledWith('record_telemetry_occurrence', expect.objectContaining({
      p_category: 'fleet_dormancy',
      p_severity: 'high',
    }));
    expect(supabase.from).not.toHaveBeenCalledWith('feedback');
  });

  it('reports deduped=true when the RPC aggregates into an existing row', async () => {
    const supabase = buildSupabaseWithRpc({ rpcResult: { ok: true, action: 'aggregated', id: 'fb-agg-1' } });
    const result = await emitFeedback({
      supabase, title: 'Fleet dormancy', description: 'Fleet dormancy: 5 worker(s)...', category: 'fleet_dormancy',
    });
    expect(result).toEqual({ id: 'fb-agg-1', deduped: true });
  });

  it('uses a stable per-category dedup hash even when description text varies between calls (the actual C7 bug)', async () => {
    const supabase = buildSupabaseWithRpc();
    await emitFeedback({ supabase, title: 't1', description: 'Fleet dormancy: 3 worker(s) armed a wakeup', category: 'fleet_dormancy' });
    const firstHash = supabase.rpc.mock.calls[0][1].p_dedup_hash;

    const supabase2 = buildSupabaseWithRpc();
    await emitFeedback({ supabase: supabase2, title: 't2', description: 'Fleet dormancy: 47 worker(s) armed a wakeup', category: 'fleet_dormancy' });
    const secondHash = supabase2.rpc.mock.calls[0][1].p_dedup_hash;

    // Same day, same category, varying description -> SAME hash (the fix).
    expect(firstHash).toBe(secondHash);
  });

  it('IGNORES a caller-supplied dedup_key entirely for telemetry writes (hash is category-only) — closes the real-world incident where an hourly dedup_key still produced 66 rows', async () => {
    // Mirrors scripts/stale-session-sweep.cjs's actual call: an hourly dedup_key
    // (`dormancy:${hourBucket}`) that changes every hour, which alone was proven
    // insufficient (the description also varies within the hour). The fix must
    // collapse ALL of these into one row regardless of the caller's dedup_key.
    const supabase = buildSupabaseWithRpc();
    await emitFeedback({
      supabase, title: 't', description: 'first call description', category: 'fleet_dormancy', dedup_key: 'dormancy:2026-07-11T02',
    });
    const supabase2 = buildSupabaseWithRpc();
    await emitFeedback({
      supabase: supabase2, title: 't', description: 'totally different description text', category: 'fleet_dormancy', dedup_key: 'dormancy:2026-07-11T14',
    });
    expect(supabase.rpc.mock.calls[0][1].p_dedup_hash).toBe(supabase2.rpc.mock.calls[0][1].p_dedup_hash);
  });

  it('throws when the RPC call itself errors', async () => {
    const supabase = buildSupabaseWithRpc({ rpcError: { message: 'connection reset' } });
    await expect(emitFeedback({
      supabase, title: 't', description: 'd', category: 'fleet_dormancy',
    })).rejects.toThrow(/telemetry RPC failed: connection reset/);
  });

  it('throws when the RPC rejects (e.g. guard-clause category mismatch)', async () => {
    const supabase = buildSupabaseWithRpc({ rpcResult: { ok: false, reason: 'category_not_telemetry' } });
    await expect(emitFeedback({
      supabase, title: 't', description: 'd', category: 'fleet_dormancy',
    })).rejects.toThrow(/telemetry RPC rejected: category_not_telemetry/);
  });

  it('a non-telemetry category (e.g. harness_backlog default) never calls rpc()', async () => {
    const supabase = buildSupabaseWithRpc();
    supabase.from = vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
      insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'fb-1' }, error: null }) })) })),
    }));
    const result = await emitFeedback({ supabase, title: 't', description: 'd' });
    expect(result.id).toBe('fb-1');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
