/**
 * SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001 — disposition CLI unit tests.
 * Pins: acceptDisposition upserts on the fingerprint UNIQUE constraint (re-dispositioning refreshes,
 * never duplicates), required-field validation, and getDisposition/listDispositions read shapes.
 */
import { describe, it, expect, vi } from 'vitest';
import { acceptDisposition, getDisposition, listDispositions } from '../../scripts/gauge-findings/disposition.js';

function buildSupabase({ upsertResult = { id: 'd-1', fingerprint: 'X', re_review_at: '2026-07-30T00:00:00.000Z' }, upsertError = null,
  selectResult = null, selectError = null, listResult = [] } = {}) {
  const upsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: upsertResult, error: upsertError }),
    })),
  }));
  const eqThenMaybeSingle = vi.fn(() => ({
    maybeSingle: vi.fn().mockResolvedValue({ data: selectResult, error: selectError }),
  }));
  const select = vi.fn(() => ({
    eq: eqThenMaybeSingle,
    order: vi.fn(() => ({
      limit: vi.fn().mockResolvedValue({ data: listResult, error: null }),
    })),
  }));
  return { from: vi.fn(() => ({ upsert, select })), _upsert: upsert };
}

describe('acceptDisposition', () => {
  it('upserts on the fingerprint UNIQUE constraint with disposition=accepted_known_state', async () => {
    const supabase = buildSupabase();
    const row = await acceptDisposition(supabase, {
      fingerprint: 'WAVE_LINKAGE_STARVATION', reReviewAt: '2026-07-30', reason: 'pending D1-D9 ruling', dispositionedBy: 'coordinator',
    });
    expect(row.fingerprint).toBe('X'); // mocked return value
    const [payload, opts] = supabase._upsert.mock.calls[0];
    expect(payload.fingerprint).toBe('WAVE_LINKAGE_STARVATION');
    expect(payload.disposition).toBe('accepted_known_state');
    expect(payload.reason).toBe('pending D1-D9 ruling');
    expect(payload.dispositioned_by).toBe('coordinator');
    expect(opts).toEqual({ onConflict: 'fingerprint' });
  });

  it('throws on missing required fields', async () => {
    const supabase = buildSupabase();
    await expect(acceptDisposition(supabase, { reReviewAt: '2026-07-30', reason: 'r', dispositionedBy: 'c' }))
      .rejects.toThrow(/fingerprint is required/);
    await expect(acceptDisposition(supabase, { fingerprint: 'F', reason: 'r', dispositionedBy: 'c' }))
      .rejects.toThrow(/reReviewAt is required/);
    await expect(acceptDisposition(supabase, { fingerprint: 'F', reReviewAt: '2026-07-30', dispositionedBy: 'c' }))
      .rejects.toThrow(/reason is required/);
    await expect(acceptDisposition(supabase, { fingerprint: 'F', reReviewAt: '2026-07-30', reason: 'r' }))
      .rejects.toThrow(/dispositionedBy is required/);
  });

  it('throws on an invalid re_review_at date', async () => {
    const supabase = buildSupabase();
    await expect(acceptDisposition(supabase, { fingerprint: 'F', reReviewAt: 'not-a-date', reason: 'r', dispositionedBy: 'c' }))
      .rejects.toThrow(/invalid re_review_at/);
  });

  it('propagates an upsert error', async () => {
    const supabase = buildSupabase({ upsertError: { message: 'constraint violation' } });
    await expect(acceptDisposition(supabase, { fingerprint: 'F', reReviewAt: '2026-07-30', reason: 'r', dispositionedBy: 'c' }))
      .rejects.toThrow(/upsert failed: constraint violation/);
  });
});

describe('getDisposition', () => {
  it('returns null when no row matches', async () => {
    const supabase = buildSupabase({ selectResult: null });
    expect(await getDisposition(supabase, 'UNKNOWN')).toBeNull();
  });

  it('returns the matching row', async () => {
    const row = { fingerprint: 'WAVE_LINKAGE_STARVATION', re_review_at: '2026-07-30T00:00:00.000Z' };
    const supabase = buildSupabase({ selectResult: row });
    expect(await getDisposition(supabase, 'WAVE_LINKAGE_STARVATION')).toEqual(row);
  });
});

describe('listDispositions', () => {
  it('returns all rows (bounded)', async () => {
    const rows = [{ fingerprint: 'A' }, { fingerprint: 'B' }];
    const supabase = buildSupabase({ listResult: rows });
    expect(await listDispositions(supabase)).toEqual(rows);
  });
});
