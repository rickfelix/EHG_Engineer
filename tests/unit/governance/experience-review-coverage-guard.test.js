// SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D (X3, TS-5): the coverage guard must return an
// EXPLICIT tri-state (not_applicable / clear / alarmed) -- a TESTING sub-agent pass on this SD
// flagged that a naive binary {alarmed} shape (as wind-down-recurrence-guard.js uses) collapses
// "nothing to check yet" into the same alarmed:false reading as "checked and clean". Active-only,
// per-venture filtering is the other load-bearing property (live-measured: 56 ventures at
// stage>=20 split across {active, cancelled} statuses).
import { describe, it, expect } from 'vitest';
import { evaluateExperienceReviewCoverage } from '../../../lib/governance/experience-review-coverage-guard.js';

describe('evaluateExperienceReviewCoverage (SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D X3)', () => {
  it("status='not_applicable' (never alarmed) when zero ventures qualify", () => {
    const v = evaluateExperienceReviewCoverage({ qualifyingVentureIds: [], coveredVentureIds: [] });
    expect(v.status).toBe('not_applicable');
    expect(v.alarmed).toBe(false);
  });

  it("status='clear' when every qualifying venture has at least one run", () => {
    const v = evaluateExperienceReviewCoverage({
      qualifyingVentureIds: ['v-1', 'v-2'],
      coveredVentureIds: ['v-1', 'v-2'],
    });
    expect(v.status).toBe('clear');
    expect(v.alarmed).toBe(false);
  });

  it("status='alarmed' when at least one qualifying venture has zero runs", () => {
    const v = evaluateExperienceReviewCoverage({
      qualifyingVentureIds: ['v-1', 'v-2'],
      coveredVentureIds: ['v-1'],
    });
    expect(v.status).toBe('alarmed');
    expect(v.alarmed).toBe(true);
    expect(v.uncoveredCount).toBe(1);
  });

  it('a Set is accepted for coveredVentureIds, same result as an array', () => {
    const v = evaluateExperienceReviewCoverage({
      qualifyingVentureIds: ['v-1'],
      coveredVentureIds: new Set(['v-1']),
    });
    expect(v.status).toBe('clear');
  });

  it("not_applicable and clear are never confused: a caller reading only 'alarmed' cannot tell them apart, but 'status' can", () => {
    const notApplicable = evaluateExperienceReviewCoverage({ qualifyingVentureIds: [], coveredVentureIds: [] });
    const clear = evaluateExperienceReviewCoverage({ qualifyingVentureIds: ['v-1'], coveredVentureIds: ['v-1'] });
    expect(notApplicable.alarmed).toBe(clear.alarmed); // both false
    expect(notApplicable.status).not.toBe(clear.status); // but distinguishable
  });

  it('treats a non-array qualifyingVentureIds as insufficient data, never alarmed', () => {
    expect(evaluateExperienceReviewCoverage({ qualifyingVentureIds: undefined, coveredVentureIds: [] }).alarmed).toBe(false);
    expect(evaluateExperienceReviewCoverage({}).status).toBe('not_applicable');
  });

  it('a cancelled venture at stage>=20 must be pre-filtered by the caller -- the guard itself trusts qualifyingVentureIds verbatim', () => {
    // Decisive fixture per TS-5: the executor (experience-review-coverage-check.mjs) is
    // responsible for excluding status='cancelled' ventures BEFORE calling this guard.
    // A guard-level test cannot observe venture status directly (it is a pure function over
    // already-filtered ids), so this documents the contract the executor test enforces.
    const v = evaluateExperienceReviewCoverage({ qualifyingVentureIds: [], coveredVentureIds: [] });
    expect(v.alarmed).toBe(false);
  });
});
