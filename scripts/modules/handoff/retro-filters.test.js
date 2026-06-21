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

/**
 * SD-FDBK-INFRA-RETROSPECTIVE-EXISTS-GATE-001 — RACE GUARD.
 *
 * The RETROSPECTIVE_EXISTS gate at LEAD-FINAL was hypothesized to false-fail because the freshness
 * boundary might resolve to the LATEST-accepted handoff (PLAN-TO-LEAD, stamped AFTER the SD_COMPLETION
 * retro is generated during PLAN-TO-LEAD setup), so a legitimate retro would fail created_at > boundary.
 * VERIFY-THE-PREMISE: resolveLeadToPlanAcceptedAt is ALREADY pinned to from_phase='LEAD' AND
 * to_phase='PLAN' (since the original gate commit, SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001), so the
 * boundary is the LEAD-TO-PLAN handoff and the race cannot occur. But the no-op-.eq() mock above never
 * PROVED that pin excludes a PLAN-TO-LEAD handoff. These tests use a handoff-PREDICATE-aware mock that
 * actually applies the from_phase/to_phase/status .eq() filters, pinning the invariant so a future
 * un-pinning (which would re-introduce the race) fails here. No production code change.
 *
 * The boundary must NOT be loosened (e.g. `>` → `>=` or dropping the filter) — that would re-admit
 * stale pre-LEAD-TO-PLAN handoff retros fleet-wide, the exact thing the gate exists to block (covered
 * by the pre-boundary-retro-fails case below).
 */
function buildHandoffPredicateSupabase({ handoffRows = [], rows = [] } = {}) {
  const handoffChain = () => {
    const eqs = {};
    let orderDesc = false;
    const c = {
      select: () => c,
      eq: (col, val) => { eqs[col] = val; return c; },
      order: (_col, opts) => { orderDesc = opts && opts.ascending === false; return c; },
      limit: () => c,
      maybeSingle: () => {
        let out = handoffRows.filter((r) => Object.entries(eqs).every(([k, v]) => r[k] === v));
        if (orderDesc) out = [...out].sort((a, b) => (a.accepted_at < b.accepted_at ? 1 : -1));
        return Promise.resolve({ data: out[0] || null, error: null });
      },
    };
    return c;
  };
  // Reuse the retrospectives predicate chain shape from buildPredicateSupabase.
  const retroChain = () => {
    const eqs = {};
    let orPred = null; let gtPred = null; let orderDesc = false;
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
        if (orPred) out = out.filter((r) => r.retrospective_type == null || r.retrospective_type === 'SD_COMPLETION');
        if (gtPred) out = out.filter((r) => r[gtPred.col] > gtPred.val);
        if (orderDesc) out = [...out].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        return Promise.resolve({ data: out[0] || null, error: null });
      },
    };
    return c;
  };
  return {
    from: vi.fn((table) => {
      if (table === 'sd_phase_handoffs') return { select: () => handoffChain() };
      if (table === 'retrospectives') return { select: () => retroChain() };
      return { select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) };
    }),
  };
}

describe('retro-gate freshness boundary is pinned to LEAD-TO-PLAN (SD-FDBK-INFRA-RETROSPECTIVE-EXISTS-GATE-001)', () => {
  const sdUuid = 'sd-uuid';
  const leadToPlanAccepted = '2026-04-01T00:00:00.000Z';   // T1 — the correct boundary
  const planToLeadAccepted = '2026-04-20T00:00:00.000Z';   // T2 > T1 — stamped later, must be IGNORED

  it('resolveLeadToPlanAcceptedAt returns the LEAD-TO-PLAN accepted_at and IGNORES a later PLAN-TO-LEAD handoff', async () => {
    const supabase = buildHandoffPredicateSupabase({
      handoffRows: [
        { sd_id: sdUuid, from_phase: 'LEAD', to_phase: 'PLAN', status: 'accepted', accepted_at: leadToPlanAccepted },
        { sd_id: sdUuid, from_phase: 'PLAN', to_phase: 'LEAD', status: 'accepted', accepted_at: planToLeadAccepted },
      ],
    });
    const result = await resolveLeadToPlanAcceptedAt(sdUuid, null, supabase);
    expect(result).toBe(leadToPlanAccepted); // NOT planToLeadAccepted — the race cannot occur
  });

  it('end-to-end: a retro generated AFTER LEAD-TO-PLAN but BEFORE PLAN-TO-LEAD PASSES (the race that was feared cannot happen)', async () => {
    const retroDuringPlanToLead = '2026-04-10T00:00:00.000Z'; // T1 < this < T2
    const supabase = buildHandoffPredicateSupabase({
      handoffRows: [
        { sd_id: sdUuid, from_phase: 'LEAD', to_phase: 'PLAN', status: 'accepted', accepted_at: leadToPlanAccepted },
        { sd_id: sdUuid, from_phase: 'PLAN', to_phase: 'LEAD', status: 'accepted', accepted_at: planToLeadAccepted },
      ],
      rows: [
        { id: 'completion', sd_id: sdUuid, retro_type: 'SD_COMPLETION', retrospective_type: null, created_at: retroDuringPlanToLead },
      ],
    });
    const { retrospective, leadToPlanAcceptedAt } = await getFilteredRetrospective(sdUuid, null, supabase);
    expect(leadToPlanAcceptedAt).toBe(leadToPlanAccepted);
    expect(retrospective?.id).toBe('completion'); // created_at > T1 → passes (would FAIL if boundary were T2)
  });

  it("end-to-end: a retro created BEFORE the LEAD-TO-PLAN boundary FAILS (the gate's real job is preserved)", async () => {
    const stalePreLeadRetro = '2026-03-15T00:00:00.000Z'; // < T1
    const supabase = buildHandoffPredicateSupabase({
      handoffRows: [
        { sd_id: sdUuid, from_phase: 'LEAD', to_phase: 'PLAN', status: 'accepted', accepted_at: leadToPlanAccepted },
      ],
      rows: [
        { id: 'stale', sd_id: sdUuid, retro_type: 'SD_COMPLETION', retrospective_type: null, created_at: stalePreLeadRetro },
      ],
    });
    const { retrospective } = await getFilteredRetrospective(sdUuid, null, supabase);
    expect(retrospective).toBeNull(); // freshness filter still rejects a stale pre-LEAD retro
  });
});
