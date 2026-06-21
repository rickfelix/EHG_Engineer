/**
 * SD-REFILL-00V80FV3 — dep-resolver semantic split on status=deferred.
 * coordinator-audit.mjs counted a deferred (or cancelled) dependency as satisfied because it reused
 * the lifecycle-TERMINAL set ([completed,cancelled,archived,deferred]) for dependency-satisfaction.
 * A deferred/cancelled dep is NOT delivered, so the dependent must count as BLOCKED, not dep-satisfied.
 */
import { describe, it, expect } from 'vitest';
import { DEP_SATISFIED, isDepSatisfied, isDependentBlocked } from '../../lib/coordinator/dep-readiness.mjs';

describe('isDepSatisfied (delivered-only)', () => {
  it('treats completed/archived as satisfied', () => {
    expect(isDepSatisfied('completed')).toBe(true);
    expect(isDepSatisfied('archived')).toBe(true);
  });
  it('does NOT treat deferred or cancelled as satisfied (the bug)', () => {
    expect(isDepSatisfied('deferred')).toBe(false);
    expect(isDepSatisfied('cancelled')).toBe(false);
  });
  it('does NOT treat in-flight/unknown/missing as satisfied', () => {
    for (const s of ['in_progress', 'draft', 'active', 'blocked', undefined, null, '']) {
      expect(isDepSatisfied(s)).toBe(false);
    }
  });
  it('DEP_SATISFIED excludes the lifecycle-only terminal states', () => {
    expect(DEP_SATISFIED).not.toContain('deferred');
    expect(DEP_SATISFIED).not.toContain('cancelled');
    expect(DEP_SATISFIED).toEqual(['completed', 'archived']);
  });
});

describe('isDependentBlocked', () => {
  it('no dependencies -> not blocked', () => {
    expect(isDependentBlocked([], {})).toBe(false);
    expect(isDependentBlocked(undefined, {})).toBe(false);
  });
  it('all deps delivered -> not blocked', () => {
    expect(isDependentBlocked(['A', 'B'], { A: 'completed', B: 'archived' })).toBe(false);
  });
  it('REGRESSION: a deferred dep blocks the dependent (was mis-counted as satisfied)', () => {
    expect(isDependentBlocked(['A'], { A: 'deferred' })).toBe(true);
    expect(isDependentBlocked(['A', 'B'], { A: 'completed', B: 'deferred' })).toBe(true);
  });
  it('a cancelled dep blocks the dependent', () => {
    expect(isDependentBlocked(['A'], { A: 'cancelled' })).toBe(true);
  });
  it('an unknown/missing dep key blocks the dependent', () => {
    expect(isDependentBlocked(['A'], {})).toBe(true);
    expect(isDependentBlocked(['A'], { A: 'in_progress' })).toBe(true);
  });
  it('total on a null status map', () => {
    expect(isDependentBlocked(['A'], null)).toBe(true);
  });
});
