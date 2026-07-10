// SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C (FR-1)
import { describe, it, expect, vi } from 'vitest';
import { runAdapterLivenessProbe } from '../../../scripts/canary/run-adapter-liveness-probe.mjs';

function buildSupabase({ updateError = null } = {}) {
  const calls = [];
  return {
    calls,
    from: (table) => {
      if (table !== 'venture_distribution_channels') throw new Error(`unexpected table: ${table}`);
      return {
        update: (row) => {
          calls.push({ op: 'update', row });
          return { eq: () => ({ eq: () => Promise.resolve({ error: updateError }) }) };
        },
      };
    },
  };
}

describe('runAdapterLivenessProbe (SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C FR-1)', () => {
  it('passes and records evidence when a real (non-dry-run) post lands', async () => {
    const publishFn = vi.fn().mockResolvedValue({ success: true, postId: 'x-999', postUrl: 'https://x.com/i/status/x-999' });
    const supabase = buildSupabase();

    const result = await runAdapterLivenessProbe({ supabase, ventureId: 'v-1', channelId: 'chan-1', platform: 'x', publishFn });

    expect(result.passed).toBe(true);
    expect(result.postId).toBe('x-999');
    expect(supabase.calls[0].row).toMatchObject({ liveness_state: 'proven_live', liveness_evidence_ref: 'https://x.com/i/status/x-999' });
  });

  it('FAILS a dry-run result — a dry-run success must never satisfy the liveness proof', async () => {
    const publishFn = vi.fn().mockResolvedValue({ success: true, postId: 'dry-run-123', dryRun: true });
    const supabase = buildSupabase();

    const result = await runAdapterLivenessProbe({ supabase, ventureId: 'v-1', channelId: 'chan-1', platform: 'x', publishFn });

    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/DRY RUN/);
    expect(supabase.calls).toHaveLength(0);
  });

  it('fails when publish() is blocked by the autonomy gate — the probe respects the same safety rails as any other post', async () => {
    const publishFn = vi.fn().mockResolvedValue({ success: false, error: 'AUTONOMY_APPROVAL_REQUIRED: ...', blockedBy: 'autonomy-gate' });
    const supabase = buildSupabase();

    const result = await runAdapterLivenessProbe({ supabase, ventureId: 'v-1', channelId: 'chan-1', platform: 'x', publishFn });

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('autonomy-gate');
  });

  it('fails when publish() succeeds but reports no postId', async () => {
    const publishFn = vi.fn().mockResolvedValue({ success: true });
    const supabase = buildSupabase();

    const result = await runAdapterLivenessProbe({ supabase, ventureId: 'v-1', channelId: 'chan-1', platform: 'x', publishFn });

    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/no postId/);
  });

  it('reports a failure (but preserves the postId) when the real post lands but the liveness-state update fails', async () => {
    const publishFn = vi.fn().mockResolvedValue({ success: true, postId: 'x-999', postUrl: 'https://x.com/i/status/x-999' });
    const supabase = buildSupabase({ updateError: { message: 'row not found' } });

    const result = await runAdapterLivenessProbe({ supabase, ventureId: 'v-1', channelId: 'chan-1', platform: 'x', publishFn });

    expect(result.passed).toBe(false);
    expect(result.postId).toBe('x-999');
    expect(result.reason).toContain('row not found');
  });
});
