import { describe, it, expect, vi } from 'vitest';
import { getFilteredRetrospective, resolveLeadToPlanAcceptedAt } from './retro-filters.js';

/**
 * SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001 — helper-level unit tests for the
 * three retrospective-gate invariants. These tests exercise the filter logic
 * that the Supabase JS mock in the gate tests cannot express (the mock's .eq()
 * and .gt() are no-ops).
 */

/** Build a Supabase mock that routes per-table with pluggable response data. */
function buildSupabase({ handoffRow = null, retrospective = null } = {}) {
  const makeChainable = (resolveValue) => {
    const c = {
      select: () => c, eq: () => c, gt: () => c, order: () => c, limit: () => c,
      maybeSingle: () => Promise.resolve(resolveValue),
      single: () => Promise.resolve(resolveValue),
      then: (fn) => Promise.resolve(resolveValue).then(fn),
    };
    return c;
  };

  return {
    from: vi.fn((table) => {
      if (table === 'sd_phase_handoffs') {
        return { select: () => makeChainable({ data: handoffRow, error: null }) };
      }
      if (table === 'retrospectives') {
        return { select: () => makeChainable({ data: retrospective, error: null }) };
      }
      return { select: () => makeChainable({ data: null, error: null }) };
    }),
  };
}

describe('resolveLeadToPlanAcceptedAt', () => {
  it('returns the handoff accepted_at when a LEAD→PLAN accepted row exists', async () => {
    const accepted = '2026-04-01T12:00:00.000Z';
    const supabase = buildSupabase({ handoffRow: { accepted_at: accepted } });
    const result = await resolveLeadToPlanAcceptedAt('sd-uuid', '2026-03-15T00:00:00.000Z', supabase);
    expect(result).toBe(accepted);
  });

  it('falls back to sdCreatedAt when no accepted LEAD→PLAN handoff exists', async () => {
    const sdCreated = '2026-03-15T00:00:00.000Z';
    const supabase = buildSupabase({ handoffRow: null });
    const result = await resolveLeadToPlanAcceptedAt('sd-uuid', sdCreated, supabase);
    expect(result).toBe(sdCreated);
  });

  it('falls back to epoch when neither handoff nor sdCreatedAt is available', async () => {
    const supabase = buildSupabase({ handoffRow: null });
    const result = await resolveLeadToPlanAcceptedAt('sd-uuid', null, supabase);
    expect(result).toBe(new Date(0).toISOString());
  });
});

describe('getFilteredRetrospective', () => {
  it('returns null when no row matches the three filters (zero-rows path)', async () => {
    const supabase = buildSupabase({ handoffRow: { accepted_at: '2026-04-01T00:00:00.000Z' }, retrospective: null });
    const { retrospective, leadToPlanAcceptedAt } =
      await getFilteredRetrospective('sd-uuid', '2026-03-15T00:00:00.000Z', supabase);
    expect(retrospective).toBeNull();
    expect(leadToPlanAcceptedAt).toBe('2026-04-01T00:00:00.000Z');
  });

  it('returns the matching row when filters are satisfied', async () => {
    const retro = { id: 'r1', retro_type: 'SD_COMPLETION', created_at: '2026-04-10T00:00:00.000Z' };
    const supabase = buildSupabase({ handoffRow: { accepted_at: '2026-04-01T00:00:00.000Z' }, retrospective: retro });
    const { retrospective } =
      await getFilteredRetrospective('sd-uuid', null, supabase);
    expect(retrospective).toBe(retro);
  });

  it('surfaces the resolved leadToPlanAcceptedAt alongside the retrospective', async () => {
    const accepted = '2026-04-15T06:00:00.000Z';
    const supabase = buildSupabase({ handoffRow: { accepted_at: accepted }, retrospective: null });
    const { leadToPlanAcceptedAt } =
      await getFilteredRetrospective('sd-uuid', null, supabase);
    expect(leadToPlanAcceptedAt).toBe(accepted);
  });
});
