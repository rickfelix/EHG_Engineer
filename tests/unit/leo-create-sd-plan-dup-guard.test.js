/**
 * Unit tests for QF-20260509-LEO-CREATE-PLAN-DUP-GUARD
 *
 * Verifies that scripts/leo-create-sd.js exposes a deterministic
 * computePlanContentHash() helper and a findRecentSDByPlanHash() query that
 * the --from-plan duplicate guard relies on.
 *
 * Background — feedback 082b421c (2026-05-03): leo-create-sd --from-plan ran
 * twice on the same plan within 5 minutes and produced two separate SDs
 * (LEO-FEAT-* and LEO-FIX-*) because the auto-classifier picked different
 * sd_type values across runs (likely due to a small mid-run edit). The fix
 * is to refuse the second INSERT when the same plan content (whitespace-
 * normalized SHA256) was already used to create a non-cancelled SD in the
 * past 24h, with --force-create as the documented override.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the supabase client BEFORE importing leo-create-sd because
// it instantiates one at module load (line 56: createSupabaseServiceClient()).
const supabaseFromCalls = [];
const queryState = {
  rows: [],
  error: null,
};
const queryBuilder = {
  select() { return queryBuilder; },
  eq() { return queryBuilder; },
  gte() { return queryBuilder; },
  not() { return queryBuilder; },
  order() { return queryBuilder; },
  limit() {
    return Promise.resolve({ data: queryState.rows, error: queryState.error });
  },
};

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: vi.fn((table) => {
      supabaseFromCalls.push(table);
      return queryBuilder;
    }),
  }),
}));

beforeEach(() => {
  supabaseFromCalls.length = 0;
  queryState.rows = [];
  queryState.error = null;
});

describe('computePlanContentHash', () => {
  it('returns a stable 64-char hex digest for identical input', async () => {
    const { computePlanContentHash } = await import('../../scripts/leo-create-sd.js');
    const a = computePlanContentHash('# Plan A\n\nbody');
    const b = computePlanContentHash('# Plan A\n\nbody');
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(b);
  });

  it('normalizes CRLF→LF so editor save-formatting changes do not bypass the guard', async () => {
    const { computePlanContentHash } = await import('../../scripts/leo-create-sd.js');
    expect(computePlanContentHash('foo\r\nbar')).toBe(computePlanContentHash('foo\nbar'));
  });

  it('strips trailing whitespace per line', async () => {
    const { computePlanContentHash } = await import('../../scripts/leo-create-sd.js');
    expect(computePlanContentHash('foo   \nbar  ')).toBe(computePlanContentHash('foo\nbar'));
  });

  it('produces different hashes for genuinely different content', async () => {
    const { computePlanContentHash } = await import('../../scripts/leo-create-sd.js');
    expect(computePlanContentHash('plan one')).not.toBe(computePlanContentHash('plan two'));
  });

  it('handles empty/null input without throwing', async () => {
    const { computePlanContentHash } = await import('../../scripts/leo-create-sd.js');
    expect(computePlanContentHash('')).toMatch(/^[a-f0-9]{64}$/);
    expect(computePlanContentHash(null)).toMatch(/^[a-f0-9]{64}$/);
    expect(computePlanContentHash(undefined)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('findRecentSDByPlanHash', () => {
  it('returns the row when supabase finds a matching SD', async () => {
    queryState.rows = [{
      id: 'uuid-1',
      sd_key: 'SD-LEO-FEAT-X-001',
      title: 'Existing',
      status: 'active',
      created_at: new Date().toISOString(),
    }];
    const { findRecentSDByPlanHash } = await import('../../scripts/leo-create-sd.js');
    const dup = await findRecentSDByPlanHash('a'.repeat(64));
    expect(dup).toMatchObject({ sd_key: 'SD-LEO-FEAT-X-001', status: 'active' });
    expect(supabaseFromCalls).toContain('strategic_directives_v2');
  });

  it('returns null when no rows match (clean run)', async () => {
    queryState.rows = [];
    const { findRecentSDByPlanHash } = await import('../../scripts/leo-create-sd.js');
    expect(await findRecentSDByPlanHash('b'.repeat(64))).toBeNull();
  });

  it('returns null when hash is missing (defensive guard)', async () => {
    const { findRecentSDByPlanHash } = await import('../../scripts/leo-create-sd.js');
    expect(await findRecentSDByPlanHash('')).toBeNull();
    expect(await findRecentSDByPlanHash(null)).toBeNull();
    // No DB call when input is empty — the guard short-circuits.
    expect(supabaseFromCalls).toEqual([]);
  });

  it('falls back to null (does not throw) when supabase returns an error', async () => {
    queryState.error = { message: 'connection lost' };
    const { findRecentSDByPlanHash } = await import('../../scripts/leo-create-sd.js');
    expect(await findRecentSDByPlanHash('c'.repeat(64))).toBeNull();
  });
});
