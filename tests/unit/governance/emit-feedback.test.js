/**
 * Unit tests for lib/governance/emit-feedback.js
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B / PA-5 (database-agent C-DB-2 + C-DB-3, security-agent C-SEC-3B)
 */

import { describe, it, expect, vi } from 'vitest';
import { emitFeedback } from '../../../lib/governance/emit-feedback.js';

function buildSupabase({ existing = null, insertResult = { id: 'fb-1' }, insertError = null } = {}) {
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: insertResult, error: insertError }),
    })),
  }));

  const dedupSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
      })),
    })),
  }));

  return {
    from: vi.fn(() => ({
      select: dedupSelect,
      insert,
    })),
    _insert: insert, // expose for assertions
  };
}

describe('emitFeedback', () => {
  it('inserts a new feedback row when no dedup match', async () => {
    const supabase = buildSupabase({ existing: null });
    const result = await emitFeedback({
      supabase,
      title: 'Test bug',
      description: 'Detailed description of the test bug',
      severity: 'high',
      sd_id: 'sd-uuid-123',
      metadata: { layer_suppressed: 'api', venture_name: 'CommitCraft AI' },
      dedup_key: 'lib/eva/lifecycle-sd-bridge.js',
    });
    expect(result.deduped).toBe(false);
    expect(result.id).toBe('fb-1');
    expect(supabase._insert).toHaveBeenCalled();

    const insertCall = supabase._insert.mock.calls[0][0];
    expect(insertCall.title).toBe('Test bug');
    expect(insertCall.description).toBe('Detailed description of the test bug');
    expect(insertCall.severity).toBe('high');
    expect(insertCall.sd_id).toBe('sd-uuid-123');
    expect(insertCall.metadata.dedup_hash).toBeDefined();
    expect(insertCall.metadata.dedup_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(insertCall.metadata.layer_suppressed).toBe('api');
  });

  it('returns deduped=true when an existing row matches the dedup_hash', async () => {
    const supabase = buildSupabase({ existing: { id: 'fb-existing' } });
    const result = await emitFeedback({
      supabase,
      title: 'Already logged',
      description: 'Same description',
      dedup_key: 'same-key',
    });
    expect(result.deduped).toBe(true);
    expect(result.id).toBe('fb-existing');
    expect(supabase._insert).not.toHaveBeenCalled();
  });

  it('caps title at 120 chars with ellipsis', async () => {
    const supabase = buildSupabase();
    const longTitle = 'a'.repeat(150);
    await emitFeedback({ supabase, title: longTitle, description: 'desc' });
    const insertCall = supabase._insert.mock.calls[0][0];
    expect(insertCall.title).toHaveLength(120);
    expect(insertCall.title).toMatch(/\.\.\.$/);
  });

  it('uses canonical column name sd_id (not related_sd_id) per C-DB-2', async () => {
    const supabase = buildSupabase();
    await emitFeedback({ supabase, title: 't', description: 'd', sd_id: 'sd-1' });
    const insertCall = supabase._insert.mock.calls[0][0];
    expect(insertCall.sd_id).toBe('sd-1');
    expect(insertCall.related_sd_id).toBeUndefined();
  });

  it('C-SEC-3B: structured metadata fields are preserved verbatim, not stringified into description', async () => {
    const supabase = buildSupabase();
    const ventureName = 'CommitCraft\nAI'; // newline could break a string-concatenated body
    await emitFeedback({
      supabase,
      title: 'Capability suppression mismatch',
      description: 'Layer suppressed for venture-mismatched SD',
      metadata: { venture_name: ventureName, target_application: 'EHG' },
    });
    const insertCall = supabase._insert.mock.calls[0][0];
    expect(insertCall.metadata.venture_name).toBe(ventureName);
    expect(insertCall.description).not.toContain(ventureName); // not concatenated
  });

  it('throws when supabase missing', async () => {
    await expect(emitFeedback({ title: 't', description: 'd' })).rejects.toThrow(/supabase client is required/);
  });

  it('throws when title or description missing', async () => {
    const supabase = buildSupabase();
    await expect(emitFeedback({ supabase, description: 'd' })).rejects.toThrow(/title is required/);
    await expect(emitFeedback({ supabase, title: 't' })).rejects.toThrow(/description is required/);
  });

  it('default values: type=enhancement, category=harness_backlog, severity=medium', async () => {
    const supabase = buildSupabase();
    await emitFeedback({ supabase, title: 't', description: 'd' });
    const insertCall = supabase._insert.mock.calls[0][0];
    expect(insertCall.type).toBe('enhancement');
    expect(insertCall.category).toBe('harness_backlog');
    expect(insertCall.severity).toBe('medium');
    expect(insertCall.status).toBe('new');
    expect(insertCall.source_application).toBe('EHG_Engineer');
  });

  it('propagates insert error', async () => {
    const supabase = buildSupabase({ insertError: { message: 'pg constraint violation' } });
    await expect(
      emitFeedback({ supabase, title: 't', description: 'd' })
    ).rejects.toThrow(/INSERT failed: pg constraint violation/);
  });

  // SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001: dedup_key was previously used ONLY to compute the
  // one-way dedup_hash (never itself persisted) — downstream consumers (e.g. the sourcing/refill staging
  // pipeline) had no stable finding identity to read back. Persisting it into metadata.dedup_key closes
  // that gap without changing the hash contract.
  it('persists dedup_key into metadata.dedup_key (durable fingerprint, independent of the hash)', async () => {
    const supabase = buildSupabase();
    await emitFeedback({
      supabase, title: 'WAVE_LINKAGE_STARVATION: wave-linkage coverage 62% < 80%', description: 'd',
      dedup_key: 'WAVE_LINKAGE_STARVATION',
    });
    const insertCall = supabase._insert.mock.calls[0][0];
    expect(insertCall.metadata.dedup_key).toBe('WAVE_LINKAGE_STARVATION');
  });

  it('does not overwrite a caller-supplied metadata.dedup_key with the dedup_key arg', async () => {
    const supabase = buildSupabase();
    await emitFeedback({
      supabase, title: 't', description: 'd',
      metadata: { dedup_key: 'explicit-value' }, dedup_key: 'different-value',
    });
    const insertCall = supabase._insert.mock.calls[0][0];
    expect(insertCall.metadata.dedup_key).toBe('explicit-value');
  });

  it('omits metadata.dedup_key when no dedup_key is supplied (no regression)', async () => {
    const supabase = buildSupabase();
    await emitFeedback({ supabase, title: 't', description: 'd' });
    const insertCall = supabase._insert.mock.calls[0][0];
    expect(insertCall.metadata).not.toHaveProperty('dedup_key');
  });
});
