/**
 * Unit pins for the Adam role-adherence probes.
 * SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001 — FR-1 (probes) + FR-5 (fail-loud).
 */
import { describe, it, expect } from 'vitest';
import {
  probeSourcingCadence, probeVisionMonitoring, probeFrictionSignaling, probeProposeOnly,
  runAdherenceProbes, hasDrift, ADHERENCE_PROBES, VERDICT,
} from '../../../lib/adam/adherence-probes.js';

describe('probeSourcingCadence (P1)', () => {
  it('pass when work was sourced; fail when none; unknown when unresolved', () => {
    expect(probeSourcingCadence({ sourcedInWindow: 2, windowDays: 7 }).verdict).toBe('pass');
    expect(probeSourcingCadence({ sourcedInWindow: 0, windowDays: 7 }).verdict).toBe('fail');
    expect(probeSourcingCadence({ sourcedInWindow: null }).verdict).toBe('unknown');
    expect(probeSourcingCadence({}).verdict).toBe('unknown'); // undefined fact => unknown (not pass)
  });
});

describe('probeVisionMonitoring (P2)', () => {
  it('pass when read; fail when not; unknown when unresolved', () => {
    expect(probeVisionMonitoring({ visionGaugeReadInWindow: true }).verdict).toBe('pass');
    expect(probeVisionMonitoring({ visionGaugeReadInWindow: false }).verdict).toBe('fail');
    expect(probeVisionMonitoring({ visionGaugeReadInWindow: null }).verdict).toBe('unknown');
  });
});

describe('probeFrictionSignaling (P3)', () => {
  it('pass when no recurrences; pass when recurrences were signalled; fail when unsignalled; unknown when unresolved', () => {
    expect(probeFrictionSignaling({ recurrencesInWindow: 0, signalsInWindow: 0 }).verdict).toBe('pass');
    expect(probeFrictionSignaling({ recurrencesInWindow: 3, signalsInWindow: 2 }).verdict).toBe('pass');
    expect(probeFrictionSignaling({ recurrencesInWindow: 3, signalsInWindow: 0 }).verdict).toBe('fail');
    expect(probeFrictionSignaling({ recurrencesInWindow: null, signalsInWindow: 1 }).verdict).toBe('unknown');
  });
});

describe('probeProposeOnly (P4) — CONST-002 cardinal', () => {
  it('pass when zero Adam-authored builds; fail on any; unknown when unresolved', () => {
    expect(probeProposeOnly({ adamAuthoredBuildsInWindow: 0 }).verdict).toBe('pass');
    expect(probeProposeOnly({ adamAuthoredBuildsInWindow: 1 }).verdict).toBe('fail');
    expect(probeProposeOnly({ adamAuthoredBuildsInWindow: null }).verdict).toBe('unknown');
  });
});

describe('FAIL-LOUD contract (FR-5): unresolved facts NEVER silent-pass', () => {
  it('every probe returns unknown (never pass) on a fully-empty facts object', () => {
    for (const bar of runAdherenceProbes({})) {
      expect(bar.verdict).toBe('unknown');
      expect(bar.verdict).not.toBe('pass');
    }
  });
  it('runAdherenceProbes never throws (a throwing probe degrades to unknown)', () => {
    // Pass a hostile facts object whose getter throws when read.
    const hostile = {};
    Object.defineProperty(hostile, 'sourcedInWindow', { get() { throw new Error('boom'); }, enumerable: true });
    const bars = runAdherenceProbes(hostile);
    expect(bars).toHaveLength(4);
    expect(bars[0].verdict).toBe('unknown');
  });
});

describe('runAdherenceProbes + hasDrift', () => {
  it('runs the full canonical probe set (4) with {probe,duty,verdict,detail} shape', () => {
    expect(ADHERENCE_PROBES).toHaveLength(4);
    const bars = runAdherenceProbes({ sourcedInWindow: 1, visionGaugeReadInWindow: true, recurrencesInWindow: 0, signalsInWindow: 0, adamAuthoredBuildsInWindow: 0 });
    expect(bars).toHaveLength(4);
    for (const b of bars) {
      expect(typeof b.probe).toBe('string');
      expect(typeof b.duty).toBe('string');
      expect([VERDICT.PASS, VERDICT.FAIL, VERDICT.UNKNOWN]).toContain(b.verdict);
      expect(typeof b.detail).toBe('string');
    }
    expect(hasDrift(bars)).toBe(false); // all pass
  });
  it('hasDrift is true when any probe fails (a CONST-002 build violation)', () => {
    const bars = runAdherenceProbes({ sourcedInWindow: 1, visionGaugeReadInWindow: true, recurrencesInWindow: 0, signalsInWindow: 0, adamAuthoredBuildsInWindow: 2 });
    expect(hasDrift(bars)).toBe(true);
  });
});
