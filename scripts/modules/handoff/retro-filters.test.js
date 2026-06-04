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
      select: () => c, eq: () => c, or: () => c, gt: () => c, is: () => c, order: () => c, limit: () => c,
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

/**
 * SD-LEO-INFRA-NORMALIZE-HANDOFF-RETROSPECTIVE-001 — regression: the gate must
 * exclude handoff-time retros (now retro_type='HANDOFF') and admit only genuine
 * SD-completion retros (retro_type='SD_COMPLETION' with retrospective_type NULL
 * or 'SD_COMPLETION'). The no-op mock above cannot express predicate exclusion,
 * so this mock actually APPLIES the gate's .eq()/.or()/.gt()/order/limit query
 * against a candidate row set — proving the filter semantics, not just plumbing.
 */
function buildPredicateSupabase({ handoffRow = null, rows = [] } = {}) {
  const retroChain = () => {
    const eqs = {};
    let orPred = null;
    let gtPred = null;
    let orderDesc = false;
    const c = {
      select: () => c,
      eq: (col, val) => { eqs[col] = val; return c; },
      or: (str) => { orPred = str; return c; },
      gt: (col, val) => { gtPred = { col, val }; return c; },
      is: () => c,
      order: (_col, opts) => { orderDesc = opts && opts.ascending === false; return c; },
      limit: () => c,
      maybeSingle: () => {
        let out = rows.filter((r) => Object.entries(eqs).every(([k, v]) => r[k] === v));
        if (orPred) {
          // Parse the exact gate clause: retrospective_type.is.null,retrospective_type.eq.SD_COMPLETION
          out = out.filter((r) => r.retrospective_type == null || r.retrospective_type === 'SD_COMPLETION');
        }
        if (gtPred) out = out.filter((r) => r[gtPred.col] > gtPred.val);
        if (orderDesc) out = [...out].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        return Promise.resolve({ data: out[0] || null, error: null });
      },
    };
    return c;
  };
  return {
    from: vi.fn((table) => {
      if (table === 'sd_phase_handoffs') {
        const c = {
          select: () => c, eq: () => c, order: () => c, limit: () => c,
          maybeSingle: () => Promise.resolve({ data: handoffRow, error: null }),
        };
        return c;
      }
      if (table === 'retrospectives') return { select: () => retroChain() };
      return { select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) };
    }),
  };
}

describe('getFilteredRetrospective — HANDOFF exclusion (NORMALIZE-HANDOFF-RETROSPECTIVE-001)', () => {
  const sdUuid = 'sd-uuid';
  const accepted = '2026-04-01T00:00:00.000Z';

  it('excludes a HANDOFF row even when it is the newest, and returns the SD_COMPLETION|null completion retro', async () => {
    const rows = [
      { id: 'handoff-newest', sd_id: sdUuid, retro_type: 'HANDOFF', retrospective_type: 'PLAN_TO_EXEC', created_at: '2026-04-20T00:00:00.000Z' },
      { id: 'completion', sd_id: sdUuid, retro_type: 'SD_COMPLETION', retrospective_type: null, created_at: '2026-04-10T00:00:00.000Z' },
    ];
    const supabase = buildPredicateSupabase({ handoffRow: { accepted_at: accepted }, rows });
    const { retrospective } = await getFilteredRetrospective(sdUuid, null, supabase);
    expect(retrospective?.id).toBe('completion');
  });

  it('admits a SD_COMPLETION|SD_COMPLETION retro (retro-agent enhance shape, QF-670)', async () => {
    const rows = [
      { id: 'enhanced', sd_id: sdUuid, retro_type: 'SD_COMPLETION', retrospective_type: 'SD_COMPLETION', created_at: '2026-04-12T00:00:00.000Z' },
      { id: 'handoff', sd_id: sdUuid, retro_type: 'HANDOFF', retrospective_type: 'LEAD_TO_PLAN', created_at: '2026-04-13T00:00:00.000Z' },
    ];
    const supabase = buildPredicateSupabase({ handoffRow: { accepted_at: accepted }, rows });
    const { retrospective } = await getFilteredRetrospective(sdUuid, null, supabase);
    expect(retrospective?.id).toBe('enhanced');
  });

  it('returns null when the only row is a HANDOFF retro (no completion retro exists)', async () => {
    const rows = [
      { id: 'handoff-only', sd_id: sdUuid, retro_type: 'HANDOFF', retrospective_type: 'PLAN_TO_EXEC', created_at: '2026-04-20T00:00:00.000Z' },
    ];
    const supabase = buildPredicateSupabase({ handoffRow: { accepted_at: accepted }, rows });
    const { retrospective } = await getFilteredRetrospective(sdUuid, null, supabase);
    expect(retrospective).toBeNull();
  });
});
