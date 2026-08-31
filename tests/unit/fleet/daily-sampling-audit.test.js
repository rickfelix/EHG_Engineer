/**
 * SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-8): lib/fleet/daily-sampling-audit.js
 */
import { describe, it, expect } from 'vitest';
import { pickSample, recordSamplingAudit, MIN_SAMPLE_SIZE, SAMPLING_AUDIT_PROBE } from '../../../lib/fleet/daily-sampling-audit.js';

describe('pickSample', () => {
  it('picks the most-recently-updated MIN_SAMPLE_SIZE items', () => {
    const qfs = [
      { id: 'QF-1', updated_at: '2026-08-01T00:00:00Z' },
      { id: 'QF-2', updated_at: '2026-08-03T00:00:00Z' },
      { id: 'QF-3', updated_at: '2026-08-02T00:00:00Z' },
    ];
    expect(pickSample(qfs)).toEqual(['QF-2', 'QF-3']);
  });

  it('never pads with fabricated ids when the population is smaller than the sample size', () => {
    expect(pickSample([{ id: 'QF-1', updated_at: '2026-08-01T00:00:00Z' }])).toEqual(['QF-1']);
    expect(pickSample([])).toEqual([]);
  });
});

function fakeSupabase({ insertError = null } = {}) {
  const inserted = [];
  return {
    inserted,
    from: () => ({
      insert: (row) => {
        inserted.push(row);
        return insertError ? { error: insertError } : { error: null };
      },
    }),
  };
}

describe('recordSamplingAudit', () => {
  it('records a pass verdict when the sample meets MIN_SAMPLE_SIZE', async () => {
    const supabase = fakeSupabase();
    const result = await recordSamplingAudit(supabase, ['QF-1', 'QF-2'], { randomUUID: () => 'fixed-uuid' });
    expect(result).toEqual({ recorded: true, verdict: 'pass', count: 2 });
    expect(supabase.inserted[0]).toMatchObject({ probe: SAMPLING_AUDIT_PROBE, verdict: 'pass', run_id: 'fixed-uuid' });
  });

  it('records unknown (never a fabricated pass) when the population is too small to sample', async () => {
    const supabase = fakeSupabase();
    const result = await recordSamplingAudit(supabase, ['QF-1'], { randomUUID: () => 'fixed-uuid' });
    expect(result.verdict).toBe('unknown');
    expect(result.count).toBe(1);
    expect(MIN_SAMPLE_SIZE).toBe(2);
  });

  it('reports a failed write rather than swallowing it', async () => {
    const supabase = fakeSupabase({ insertError: { message: 'boom' } });
    const result = await recordSamplingAudit(supabase, ['QF-1', 'QF-2'], { randomUUID: () => 'fixed-uuid' });
    expect(result.recorded).toBe(false);
    expect(result.error).toBe('boom');
  });
});
