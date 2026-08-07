// SD-LEO-INFRA-SIGNAL-PROMOTION-RESOLUTION-CHECK-001 (FR-5) — promoted severity is DERIVED, not
// inherited from the reporter's own adjective. Measured baseline: 49 of 53 promoted rows arrived
// severity=critical because severity was pure inheritance across eight hops (feedback.severity
// equalled quick_fixes.severity for 61/61), which left critical-qf-jump reordering rather than
// selecting.
//
// Lives in tests/unit/feedback/ deliberately: per this SD's TR-2 the promoter's only pre-existing
// test sits in the db project, gated to an empty include, and has never executed in CI. This path
// matches unit-tier.yml's **/*.test.js glob and actually runs.
import { describe, it, expect } from 'vitest';
import { derivePromotedSeverity } from '../../../lib/feedback/promoted-severity.js';

describe('derivePromotedSeverity (FR-5)', () => {
  it('passes non-critical severities through completely unchanged', () => {
    for (const declared of ['high', 'medium', 'low']) {
      const r = derivePromotedSeverity({ declared, callsigns: 1, occurrences: 1 });
      expect(r.severity).toBe(declared);
      expect(r.derived).toBe(false);
    }
  });

  it('caps an UNCORROBORATED critical at high — one author\'s adjective must not preempt every seat', () => {
    const r = derivePromotedSeverity({ declared: 'critical', callsigns: 1, occurrences: 1 });
    expect(r.severity).toBe('high');
    expect(r.derived).toBe(true);
    expect(r.reason).toMatch(/single reporter/i);
  });

  // The SD forbids anything that "breaks genuine worker criticals". These two are that guard.
  it('RETAINS critical when a second callsign corroborates', () => {
    const r = derivePromotedSeverity({ declared: 'critical', callsigns: 2, occurrences: 1 });
    expect(r.severity).toBe('critical');
    expect(r.derived).toBe(false);
  });

  it('RETAINS critical when the fingerprint recurs, even from one callsign', () => {
    const r = derivePromotedSeverity({ declared: 'critical', callsigns: 1, occurrences: 2 });
    expect(r.severity).toBe('critical');
    expect(r.derived).toBe(false);
  });

  it('is case-insensitive on the declared value', () => {
    expect(derivePromotedSeverity({ declared: 'CRITICAL', callsigns: 1, occurrences: 1 }).severity).toBe('high');
    expect(derivePromotedSeverity({ declared: 'CRITICAL', callsigns: 3, occurrences: 3 }).severity).toBe('critical');
  });

  it('is total — missing/garbage input never throws and never invents a critical', () => {
    for (const input of [undefined, {}, { declared: null }, { declared: '' }, { declared: 'nonsense' }]) {
      const r = derivePromotedSeverity(input);
      expect(r).toHaveProperty('severity');
      expect(r.severity).not.toBe('critical');
    }
  });

  it('always explains itself, so a severity change is never silent', () => {
    for (const r of [
      derivePromotedSeverity({ declared: 'critical', callsigns: 1, occurrences: 1 }),
      derivePromotedSeverity({ declared: 'critical', callsigns: 2, occurrences: 2 }),
      derivePromotedSeverity({ declared: 'low' }),
    ]) {
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});
