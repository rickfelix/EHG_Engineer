/**
 * SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001 -- TS-1 (eligibility, fail-closed).
 */
import { describe, it, expect } from 'vitest';
import { isEligibleForBaselineResearch } from '../../../lib/discovery/venture-eligibility.js';

describe('isEligibleForBaselineResearch', () => {
  it('TS-1: a real, named, active, non-fixture venture is eligible', () => {
    expect(isEligibleForBaselineResearch({ name: 'ApexNiche AI', status: 'active', is_demo: false })).toBe(true);
  });

  it('TS-1: a null/undefined venture is EXCLUDED (fail-closed, unlike isFixtureVenture upstream)', () => {
    expect(isEligibleForBaselineResearch(null)).toBe(false);
    expect(isEligibleForBaselineResearch(undefined)).toBe(false);
  });

  it('TS-1: a venture missing name is EXCLUDED (fail-closed) even if active and not is_demo', () => {
    expect(isEligibleForBaselineResearch({ status: 'active', is_demo: false })).toBe(false);
    expect(isEligibleForBaselineResearch({ name: '', status: 'active' })).toBe(false);
    expect(isEligibleForBaselineResearch({ name: '   ', status: 'active' })).toBe(false);
  });

  it('TS-1: an id-only row (no name selected in the query) is EXCLUDED, not silently eligible', () => {
    // Regression fixture for the exact bug the TESTING review named: a query selecting
    // only "id, status" and passing the row through would previously fail OPEN.
    expect(isEligibleForBaselineResearch({ id: '809ec7e7-...', status: 'active' })).toBe(false);
  });

  it('TS-1: a fixture-pattern name is EXCLUDED', () => {
    expect(isEligibleForBaselineResearch({ name: 'TS-fixture-abc123', status: 'active', is_demo: false })).toBe(false);
    expect(isEligibleForBaselineResearch({ name: '__e2e_park_status__', status: 'active' })).toBe(false);
  });

  it('TS-1: is_demo=true is EXCLUDED even with a plausible-looking name', () => {
    expect(isEligibleForBaselineResearch({ name: 'Real-Sounding Venture', status: 'active', is_demo: true })).toBe(false);
  });

  it('TS-1: a non-active status is EXCLUDED', () => {
    expect(isEligibleForBaselineResearch({ name: 'AltifyAI', status: 'cancelled', is_demo: false })).toBe(false);
  });
});
