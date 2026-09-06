import { describe, it, expect } from 'vitest';
import {
  UNSCORED,
  SEVERITY_WEIGHT,
  severityWeightFor,
  mostRecentRiskScore,
  computeSdCriticality,
  computeQfCriticality,
} from '../../../lib/priority/criticality.js';

/** Minimal stand-in for the Supabase query builder chain criticality.js calls. Client-injected
 * per TR-2 — no live connection needed to test this module. */
function fakeSupabase(rows) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit() {
                      return Promise.resolve({ data: rows, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function fakeSupabaseError() {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit() {
                      return Promise.resolve({ data: null, error: new Error('boom') });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('severityWeightFor (FR-4/FR-5)', () => {
  it('reads an SD priority and a QF severity through the same weight map', () => {
    expect(severityWeightFor({ priority: 'critical' })).toBe(SEVERITY_WEIGHT.critical);
    expect(severityWeightFor({ severity: 'critical' })).toBe(SEVERITY_WEIGHT.critical);
    expect(severityWeightFor({ priority: 'high' })).toBe(severityWeightFor({ severity: 'high' }));
  });

  it('ranks critical > high > medium > low', () => {
    expect(severityWeightFor({ priority: 'critical' })).toBeGreaterThan(severityWeightFor({ priority: 'high' }));
    expect(severityWeightFor({ priority: 'high' })).toBeGreaterThan(severityWeightFor({ priority: 'medium' }));
    expect(severityWeightFor({ priority: 'medium' })).toBeGreaterThan(severityWeightFor({ priority: 'low' }));
  });

  it('an unrecognized or missing level reads UNSCORED, not a numeric default', () => {
    expect(severityWeightFor({})).toBe(UNSCORED);
    expect(severityWeightFor({ priority: 'nonsense' })).toBe(UNSCORED);
  });

  it('a prototype-chain key never reads as a recognized severity level', () => {
    // A naive `level in SEVERITY_WEIGHT` check would misread these as "recognized".
    expect(severityWeightFor({ priority: 'constructor' })).toBe(UNSCORED);
    expect(severityWeightFor({ priority: 'toString' })).toBe(UNSCORED);
    expect(severityWeightFor({ priority: '__proto__' })).toBe(UNSCORED);
  });
});

describe('mostRecentRiskScore (FR-4, TS-6)', () => {
  it('returns the most-recently-assessed row\'s overall_risk_score', async () => {
    // The DB read is ORDER BY assessed_at DESC LIMIT 1, so the fake client only ever needs to
    // hand back the single row a real query would already have selected.
    const client = fakeSupabase([{ overall_risk_score: 7.5, assessed_at: '2026-09-06T10:00:00Z' }]);
    expect(await mostRecentRiskScore('sd-uuid-1', client)).toBe(7.5);
  });

  it('reads UNSCORED when the SD has no risk_assessments row at all', async () => {
    const client = fakeSupabase([]);
    expect(await mostRecentRiskScore('sd-uuid-1', client)).toBe(UNSCORED);
  });

  it('reads UNSCORED on a query error rather than throwing or defaulting to 0', async () => {
    const client = fakeSupabaseError();
    expect(await mostRecentRiskScore('sd-uuid-1', client)).toBe(UNSCORED);
  });
});

describe('computeSdCriticality / computeQfCriticality (FR-4, FR-5, TS-5)', () => {
  it('two same-severity SDs order by blast radius when both have a risk score', async () => {
    const highRisk = await computeSdCriticality({ id: 'sd-1', priority: 'high' }, fakeSupabase([{ overall_risk_score: 8, assessed_at: '2026-09-06T10:00:00Z' }]));
    const lowRisk = await computeSdCriticality({ id: 'sd-2', priority: 'high' }, fakeSupabase([{ overall_risk_score: 2, assessed_at: '2026-09-06T10:00:00Z' }]));
    expect(highRisk.severityWeight).toBe(lowRisk.severityWeight);
    expect(highRisk.blastRadius).toBeGreaterThan(lowRisk.blastRadius);
  });

  it('an SD with no risk_assessments rows reads UNSCORED for blast radius, never 0', async () => {
    const result = await computeSdCriticality({ id: 'sd-3', priority: 'medium' }, fakeSupabase([]));
    expect(result.blastRadius).toBe(UNSCORED);
    expect(result.blastRadius).not.toBe(0);
  });

  it('a QF\'s blast radius is always UNSCORED — no risk_assessments equivalent exists for QFs', () => {
    const result = computeQfCriticality({ id: 'QF-1', severity: 'critical' });
    expect(result.severityWeight).toBe(SEVERITY_WEIGHT.critical);
    expect(result.blastRadius).toBe(UNSCORED);
  });
});
