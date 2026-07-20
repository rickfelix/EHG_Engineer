// SD-LEO-INFRA-FLEET-DIAL-TOKEN-EFFORT-BUILD-001 — the capacity-dial ETA seam.
// etaMinForClaim gains an injectable phaseMinOverride; the CRITICAL property is that with
// phaseMinOverride=null it is BYTE-IDENTICAL to the prior static behavior (fallback-to-static, no
// silent degradation), while a provided actuals object drives the ETA from real elapsed minutes.
import { describe, it, expect } from 'vitest';
import { etaMinForClaim, PHASE_MIN_STATIC, computePhaseMinsFromActuals } from '../../../scripts/coordinator-capacity-forecast.mjs';

// The reference static implementation BEFORE this SD (frozen here to prove byte-identical equivalence).
function etaStaticReference(progress, phase) {
  const PHASE_MIN = { LEAD: 3, PLAN: 12, EXEC: 30, FINAL: 5 };
  const TOTAL_MIN = PHASE_MIN.LEAD + PHASE_MIN.PLAN + PHASE_MIN.EXEC;
  const u = String(phase || '').toUpperCase();
  const ph = u.includes('EXEC') ? 'EXEC' : u.includes('PLAN') ? 'PLAN'
    : (u.includes('FINAL') || u.includes('VERIF') || u.includes('APPROV')) ? 'FINAL' : 'LEAD';
  if (ph === 'FINAL') return Math.max(2, PHASE_MIN.FINAL * (1 - (progress || 0) / 100));
  const remaining = TOTAL_MIN * (1 - Math.min(99, progress || 0) / 100);
  return Math.max(2, Math.round(remaining));
}

describe('etaMinForClaim — null override is byte-identical to the static reference (fallback-to-static)', () => {
  const phases = ['LEAD', 'PLAN', 'EXEC', 'FINAL', 'PLAN_PRD', 'EXEC_IMPL', 'PLAN_VERIFICATION', 'LEAD_FINAL_APPROVAL', '', null, undefined];
  const progresses = [0, 1, 25, 50, 65, 99, 100, undefined, null];
  it('matches across the full phase × progress grid', () => {
    for (const ph of phases) {
      for (const pr of progresses) {
        expect(etaMinForClaim(pr, ph, null)).toBe(etaStaticReference(pr, ph));
        expect(etaMinForClaim(pr, ph)).toBe(etaStaticReference(pr, ph)); // default arg
      }
    }
  });
  it('PHASE_MIN_STATIC retains the canonical values', () => {
    expect(PHASE_MIN_STATIC).toEqual({ LEAD: 3, PLAN: 12, EXEC: 30, FINAL: 5 });
  });
});

describe('etaMinForClaim — a provided actuals override drives the ETA', () => {
  const actuals = { LEAD: 6, PLAN: 24, EXEC: 60, FINAL: 10 }; // 2× the static table
  it('uses the override total (LEAD+PLAN+EXEC) for non-FINAL phases', () => {
    // total = 90; at 0% progress → round(90) = 90 (vs static 45)
    expect(etaMinForClaim(0, 'EXEC', actuals)).toBe(90);
    expect(etaMinForClaim(50, 'PLAN', actuals)).toBe(45); // 90 * 0.5
  });
  it('uses the override FINAL for the FINAL branch (floor preserved)', () => {
    expect(etaMinForClaim(0, 'LEAD_FINAL_APPROVAL', actuals)).toBe(10); // FINAL=10 * 1.0
    expect(etaMinForClaim(90, 'FINAL', actuals)).toBe(Math.max(2, 10 * 0.1)); // floored at 2
  });
  it('still floors at 2 minutes for a near-complete claim', () => {
    expect(etaMinForClaim(99, 'EXEC', actuals)).toBe(Math.max(2, Math.round(90 * 0.01)));
  });
});

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: computePhaseMinsFromActuals now
// routes its read through fetchAllPaginated, which chains TWO .order(...) calls then a terminal
// .range(...) (resolving { data, error }) instead of a single .order().limit(). The fake builder
// below is chainable on .order() (any number of calls) and terminates on .range().
function fakeActualsSb({ data, error = null }) {
  return {
    from: () => ({
      select: () => {
        const builder = {
          gte: () => builder,
          not: () => builder,
          order: () => builder,
          range: () => Promise.resolve({ data, error }),
        };
        return builder;
      },
    }),
  };
}

describe('computePhaseMinsFromActuals — fail-open to null', () => {
  it('returns null on a query error (caller falls back to static)', async () => {
    const sb = fakeActualsSb({ data: null, error: { message: 'boom' } });
    expect(await computePhaseMinsFromActuals(sb)).toBeNull();
  });
  it('returns null when there are no rows in the window', async () => {
    const sb = fakeActualsSb({ data: [] });
    expect(await computePhaseMinsFromActuals(sb)).toBeNull();
  });
  it('returns null when a phase has insufficient samples (below the min-samples threshold)', async () => {
    // 2 infra SD-phase rows only (EXEC) — below ACTUALS_MIN_SAMPLES=5, and other phases empty → null.
    const rows = [
      { sd_id: 'a', phase: 'EXEC', execution_time: 1800, created_at: new Date().toISOString() },
      { sd_id: 'b', phase: 'EXEC', execution_time: 1800, created_at: new Date().toISOString() },
    ];
    const sb = {
      from: (t) => t === 'sub_agent_execution_results'
        ? fakeActualsSb({ data: rows }).from()
        : ({ select: () => ({ in: () => Promise.resolve({ data: [{ id: 'a', sd_type: 'infrastructure' }, { id: 'b', sd_type: 'infrastructure' }], error: null }) }) }),
    };
    expect(await computePhaseMinsFromActuals(sb)).toBeNull();
  });
});
