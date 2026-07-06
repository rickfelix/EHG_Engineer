/**
 * SD-LEO-INFRA-ADVERSARIAL-VERIFICATION-SWEEP-001 — classifyItem decision-table tests.
 *
 * Exercises the REAL exported classifyItem (no mocks). The classifier encodes a REFUTE stance:
 * a pass ('verified_working') is only ever returned when reachability AND an observed side effect
 * are both explicitly true. Every branch of the decision table is hit at least once, and a
 * property test proves no null in reachable/sideEffectObserved can ever yield a pass.
 */
import { describe, it, expect } from 'vitest';
import { classifyItem } from '../../scripts/adversarial-verification-sweep.mjs';

describe('classifyItem — planted fixtures (spec a–e)', () => {
  it('(a) planted dormant item (reachable:false) → refuted_dormant', () => {
    const r = classifyItem({
      reachable: false,
      triggerFired: null,
      sideEffectObserved: null,
      safetyBar: 'read_only',
      notes: 'no live invocation path',
    });
    expect(r.disposition).toBe('refuted_dormant');
    expect(r.evidence.notes).toBe('no live invocation path');
  });

  it('(b) known-working item (reachable+trigger+sideEffect all true) → verified_working', () => {
    const r = classifyItem({
      reachable: true,
      triggerFired: true,
      sideEffectObserved: true,
      safetyBar: 'fixture_safe',
      notes: 'row written and read back',
    });
    expect(r.disposition).toBe('verified_working');
  });

  it('(c) reachable but side-effect absent after a real fire → refuted_broken', () => {
    const r = classifyItem({
      reachable: true,
      triggerFired: true,
      sideEffectObserved: false,
      safetyBar: 'fixture_safe',
      notes: 'fired the trigger, no row appeared',
    });
    expect(r.disposition).toBe('refuted_broken');
  });

  it('(d) reachable but unsafe to fire → unverifiable with non-empty reason', () => {
    const r = classifyItem({
      reachable: true,
      triggerFired: null,
      sideEffectObserved: null,
      safetyBar: 'unsafe',
      notes: 'would send real chairman email',
    });
    expect(r.disposition).toBe('unverifiable');
    expect(typeof r.reason).toBe('string');
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it('(e) incomplete reachability trace (reachable:null) → unverifiable with reason', () => {
    const r = classifyItem({
      reachable: null,
      triggerFired: null,
      sideEffectObserved: null,
      safetyBar: 'read_only',
      notes: 'grep timed out',
    });
    expect(r.disposition).toBe('unverifiable');
    expect(r.reason).toBe('reachability trace incomplete');
  });
});

describe('classifyItem — full decision-table branch coverage', () => {
  it('reachable===null AND trace completed with no live path → refuted_dormant', () => {
    const r = classifyItem({
      reachable: null,
      triggerFired: null,
      sideEffectObserved: null,
      safetyBar: 'read_only',
      reachabilityTraceComplete: true,
      notes: 'trace ran, no caller found',
    });
    expect(r.disposition).toBe('refuted_dormant');
  });

  it('reachable===true with unresolved trigger and non-unsafe bar → unverifiable fallthrough', () => {
    // Not refuted_broken (sideEffectObserved is null, not false), not verified_working, and
    // safetyBar is not 'unsafe' so it misses that branch too — the REFUTE default must catch it.
    const r = classifyItem({
      reachable: true,
      triggerFired: false,
      sideEffectObserved: null,
      safetyBar: 'read_only',
      notes: 'reachable but never exercised',
    });
    expect(r.disposition).toBe('unverifiable');
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it('every disposition is producible; evidence passes through on every branch', () => {
    const cases = [
      { reachable: false },
      { reachable: true, triggerFired: true, sideEffectObserved: false },
      { reachable: true, triggerFired: true, sideEffectObserved: true },
      { reachable: true, triggerFired: null, sideEffectObserved: null, safetyBar: 'unsafe' },
      { reachable: null, reachabilityTraceComplete: true },
      { reachable: null },
    ];
    const seen = new Set();
    for (const c of cases) {
      const r = classifyItem(c);
      seen.add(r.disposition);
      expect(r).toHaveProperty('evidence'); // evidence passthrough on all
      expect(r.evidence).toHaveProperty('reachable');
    }
    expect(seen).toEqual(
      new Set(['refuted_dormant', 'refuted_broken', 'verified_working', 'unverifiable']),
    );
  });

  it('unverifiable branches always carry a non-empty reason', () => {
    const unverifiableCases = [
      { reachable: true, triggerFired: null, sideEffectObserved: null, safetyBar: 'unsafe' },
      { reachable: null },
      { reachable: true, triggerFired: false, sideEffectObserved: null, safetyBar: 'read_only' },
    ];
    for (const c of unverifiableCases) {
      const r = classifyItem(c);
      expect(r.disposition).toBe('unverifiable');
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('classifyItem — REFUTE property: null uncertainty never passes', () => {
  it('any null in reachable OR sideEffectObserved never yields verified_working', () => {
    const triState = [true, false, null];
    const bars = ['read_only', 'fixture_safe', 'unsafe'];
    let checked = 0;
    for (const reachable of triState) {
      for (const triggerFired of triState) {
        for (const sideEffectObserved of triState) {
          for (const safetyBar of bars) {
            for (const traceComplete of [true, false, undefined]) {
              const r = classifyItem({
                reachable,
                triggerFired,
                sideEffectObserved,
                safetyBar,
                reachabilityTraceComplete: traceComplete,
              });
              checked += 1;
              if (reachable === null || sideEffectObserved === null) {
                expect(r.disposition).not.toBe('verified_working');
              }
              // verified_working is only ever legal when both are explicitly true.
              if (r.disposition === 'verified_working') {
                expect(reachable).toBe(true);
                expect(sideEffectObserved).toBe(true);
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('empty / undefined input does not throw and defaults to unverifiable', () => {
    expect(classifyItem({}).disposition).toBe('unverifiable');
    expect(classifyItem(undefined).disposition).toBe('unverifiable');
  });
});
