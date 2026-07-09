/**
 * lib/apa/assertion-library unit tests
 * SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-B
 *
 * Covers PRD test scenarios TS-1 through TS-8 plus FR-1's independent
 * unit-testability requirement (synthetic evidence, no live sandbox).
 */

import { describe, it, expect } from 'vitest';
import {
  PRIMITIVE_CATEGORIES,
  PRIMITIVES_BY_CATEGORY,
  ASSERTION_PRIMITIVES,
  evaluateAssertion,
  deriveAssertionsFromRegistryClaims,
  deriveAssertionsFromAppCopy,
  deriveAssertions,
} from '../../../lib/apa/assertion-library.mjs';

describe('FR-1: declarative assertion-primitive registry', () => {
  it('exports at least the 5 primitive categories from design §4', () => {
    const expected = [
      PRIMITIVE_CATEGORIES.SIDE_EFFECT_HONESTY,
      PRIMITIVE_CATEGORIES.RECOVERY_PATH,
      PRIMITIVE_CATEGORIES.PERSISTENCE,
      PRIMITIVE_CATEGORIES.NO_DEAD_END,
      PRIMITIVE_CATEGORIES.INTEGRITY,
    ];
    for (const category of expected) {
      expect(PRIMITIVES_BY_CATEGORY[category]).toBeDefined();
    }
    expect(ASSERTION_PRIMITIVES.length).toBeGreaterThanOrEqual(5);
  });

  it('each primitive is independently unit-testable via synthetic probe/predicate, no live sandbox', () => {
    const primitive = PRIMITIVES_BY_CATEGORY[PRIMITIVE_CATEGORIES.INTEGRITY];
    const probeResult = primitive.probe({ claim: { label: 'total matches sum' }, expected: 10, actual: 10 });
    const verdict = primitive.predicate(probeResult);
    expect(verdict.pass).toBe(true);
  });
});

describe('TS-1/TS-2: side-effect-honesty', () => {
  const primitive = PRIMITIVES_BY_CATEGORY[PRIMITIVE_CATEGORIES.SIDE_EFFECT_HONESTY];

  it('TS-1: claimed effect with zero sink events FAILS', () => {
    const evidence = { claim: { label: 'we emailed you', sinkType: 'email' }, sinkEvents: [] };
    const verdict = primitive.predicate(primitive.probe(evidence));
    expect(verdict.pass).toBe(false);
  });

  it('TS-2: claimed effect with a matching real sink event PASSES', () => {
    const evidence = {
      claim: { label: 'we emailed you', sinkType: 'email' },
      sinkEvents: [{ type: 'email', source: 'real-transport', to: 'user@example.com' }],
    };
    const verdict = primitive.predicate(primitive.probe(evidence));
    expect(verdict.pass).toBe(true);
  });

  it('never accepts a mocked/synthetic sink event as evidence', () => {
    const evidence = {
      claim: { label: 'we emailed you', sinkType: 'email' },
      sinkEvents: [{ type: 'email', source: 'mocked', to: 'user@example.com' }],
    };
    const verdict = primitive.predicate(primitive.probe(evidence));
    expect(verdict.pass).toBe(false);
  });
});

describe('TS-3/TS-4: recovery-path / expected-affordance', () => {
  const primitive = PRIMITIVES_BY_CATEGORY[PRIMITIVE_CATEGORIES.RECOVERY_PATH];

  it('TS-3: declared flow with unreachable route FAILS', () => {
    const evidence = { claim: { label: 'password reset' }, flowState: { reachable: false } };
    const verdict = primitive.predicate(primitive.probe(evidence));
    expect(verdict.pass).toBe(false);
  });

  it('declared flow that 404s/dead-ends mid-flow FAILS', () => {
    const evidence = { claim: { label: 'password reset' }, flowState: { reachable: true, completed: false, error: '404' } };
    const verdict = primitive.predicate(primitive.probe(evidence));
    expect(verdict.pass).toBe(false);
  });

  it('TS-4: declared flow that completes successfully PASSES', () => {
    const evidence = { claim: { label: 'password reset' }, flowState: { reachable: true, completed: true, error: null } };
    const verdict = primitive.predicate(primitive.probe(evidence));
    expect(verdict.pass).toBe(true);
  });
});

describe('TS-5: auto-derivation from unified registry claims', () => {
  it('a new registry claim produces a corresponding assertion instance without derivation code changes', () => {
    const registryClaims = [
      { id: 'claim-new-001', type: 'recovery-flow', label: 'logout flow', behaviorallyTestable: true },
    ];
    const derived = deriveAssertionsFromRegistryClaims(registryClaims);
    expect(derived).toHaveLength(1);
    expect(derived[0]).toMatchObject({
      id: 'assertion-registry-claim-new-001',
      category: PRIMITIVE_CATEGORIES.RECOVERY_PATH,
      source: 'registry',
    });
  });

  it('skips claims explicitly marked not behaviorally testable', () => {
    const derived = deriveAssertionsFromRegistryClaims([
      { id: 'claim-002', type: 'integrity', label: 'non-testable', behaviorallyTestable: false },
    ]);
    expect(derived).toHaveLength(0);
  });

  it('unrecognized claim types fall back to integrity rather than being dropped', () => {
    const derived = deriveAssertionsFromRegistryClaims([
      { id: 'claim-003', type: 'some-future-type', label: 'unknown' },
    ]);
    expect(derived).toHaveLength(1);
    expect(derived[0].category).toBe(PRIMITIVE_CATEGORIES.INTEGRITY);
  });
});

describe('TS-6: auto-derivation from emergent UI copy scan', () => {
  it('detects a side-effect phrase and produces a side-effect-honesty assertion instance', () => {
    const derived = deriveAssertionsFromAppCopy('Thanks for signing up — we emailed you a confirmation.');
    expect(derived.length).toBeGreaterThan(0);
    expect(derived.every((a) => a.category === PRIMITIVE_CATEGORIES.SIDE_EFFECT_HONESTY)).toBe(true);
    expect(derived.some((a) => a.source === 'ui-copy-scan')).toBe(true);
  });

  it('produces no assertions when no side-effect phrase is present', () => {
    const derived = deriveAssertionsFromAppCopy('Welcome to the dashboard.');
    expect(derived).toHaveLength(0);
  });

  it('deriveAssertions combines both claim sources', () => {
    const derived = deriveAssertions({
      registryClaims: [{ id: 'c1', type: 'side-effect', label: 'notify', behaviorallyTestable: true }],
      appCopy: 'payment processed successfully',
    });
    expect(derived.some((a) => a.source === 'registry')).toBe(true);
    expect(derived.some((a) => a.source === 'ui-copy-scan')).toBe(true);
  });
});

describe('TS-7/TS-8: 10.2a provenance-exists', () => {
  const primitive = PRIMITIVES_BY_CATEGORY[PRIMITIVE_CATEGORIES.PROVENANCE_EXISTS];

  it('TS-7: metric with a real DB source PASSES', () => {
    const evidence = {
      claim: { label: 'active ventures count' },
      source: { type: 'db-row', table: 'ventures' },
    };
    const verdict = primitive.predicate(primitive.probe(evidence));
    expect(verdict.pass).toBe(true);
  });

  it('metric with a real computation source PASSES', () => {
    const evidence = { claim: { label: 'total revenue' }, source: { type: 'computation' } };
    const verdict = primitive.predicate(primitive.probe(evidence));
    expect(verdict.pass).toBe(true);
  });

  it('TS-8: hardcoded/null-derived metric FAILS and identifies the metric', () => {
    const evidence = { claim: { label: 'growth rate' }, source: { type: 'hardcoded' } };
    const verdict = primitive.predicate(primitive.probe(evidence));
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toContain('growth rate');
  });

  it('null source FAILS', () => {
    const evidence = { claim: { label: 'churn rate' }, source: null };
    const verdict = primitive.predicate(primitive.probe(evidence));
    expect(verdict.pass).toBe(false);
  });
});

describe('evaluateAssertion: end-to-end assertion-instance evaluation', () => {
  it('evaluates a derived assertion instance against an evidence bundle', () => {
    const [assertion] = deriveAssertionsFromAppCopy('we emailed you the receipt');
    const result = evaluateAssertion(assertion, {
      sinkEvents: [{ type: 'email', source: 'real-transport' }],
    });
    expect(result.pass).toBe(true);
    expect(result.id).toBe(assertion.id);
  });

  it('returns a failing verdict for an unregistered category rather than throwing', () => {
    const result = evaluateAssertion({ id: 'x', category: 'not-a-real-category', claim: {} }, {});
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('no primitive registered');
  });
});
