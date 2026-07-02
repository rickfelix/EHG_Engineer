/**
 * Unit pins for the Adam role-adherence probes.
 * SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001 — FR-1 (probes) + FR-5 (fail-loud).
 */
import { describe, it, expect } from 'vitest';
import {
  probeSourcingCadence, probeVisionMonitoring, probeFrictionSignaling, probeProposeOnly,
  probePmBoard, encodeFingerprintsTail, parseFingerprintsTail, encodeSnapshotTail, parseSnapshotTail,
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
    // SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-C: an 8th probe (pm_board) was added.
    expect(bars).toHaveLength(8);
    expect(bars[0].verdict).toBe('unknown');
  });
});

describe('runAdherenceProbes + hasDrift', () => {
  it('runs the full canonical probe set (8) with {probe,duty,verdict,detail} shape', () => {
    // SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-C: pm_board is the 8th canonical probe.
    expect(ADHERENCE_PROBES).toHaveLength(8);
    const bars = runAdherenceProbes({
      sourcedInWindow: 1, visionGaugeReadInWindow: true, recurrencesInWindow: 0, signalsInWindow: 0,
      adamAuthoredBuildsInWindow: 0, claimableBelt: 1, idleWorkers: 0, sourceableBacklogCount: 0,
      advisoryBody: 'ok', adamChairmanDecisionQuestionsInWindow: [],
      pmBoardSnapshot: [], pmBoardPriorSnapshot: new Map(),
    });
    expect(bars).toHaveLength(8);
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

describe('probePmBoard (P8) — SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-C', () => {
  it('unknown when pmBoardSnapshot is unresolved', () => {
    expect(probePmBoard({}).verdict).toBe('unknown');
    expect(probePmBoard({ pmBoardSnapshot: null, pmBoardPriorSnapshot: new Map() }).verdict).toBe('unknown');
  });

  it('PASS on an empty board, regardless of prior/history state (no baseline needed to know nothing is stalled)', () => {
    expect(probePmBoard({ pmBoardSnapshot: [], pmBoardPriorSnapshot: new Map() }).verdict).toBe('pass');
    expect(probePmBoard({ pmBoardSnapshot: [], pmBoardPriorSnapshot: null }).verdict).toBe('pass');
  });

  it('unknown on a non-empty board with no prior recorded check (first-ever run — no baseline to judge staleness)', () => {
    const r = probePmBoard({ pmBoardSnapshot: [{ id: 'a', status: 'open' }], pmBoardPriorSnapshot: null });
    expect(r.verdict).toBe('unknown');
  });

  it('PASS when prior was legitimately empty and current has new items (board newly in use, not a stall)', () => {
    const r = probePmBoard({ pmBoardSnapshot: [{ id: 'a', status: 'open' }], pmBoardPriorSnapshot: new Map() });
    expect(r.verdict).toBe('pass');
  });

  it('FAIL — true regression-to-non-use: current identical to prior, nothing moved', () => {
    const r = probePmBoard({
      pmBoardSnapshot: [{ id: 'a', status: 'open' }],
      pmBoardPriorSnapshot: new Map([['a', 'open']]),
    });
    expect(r.verdict).toBe('fail');
    expect(r.detail).toMatch(/regression-to-non-use/);
  });

  it('PASS — a shared item transitioned status since the prior check', () => {
    const r = probePmBoard({
      pmBoardSnapshot: [{ id: 'a', status: 'in_progress' }],
      pmBoardPriorSnapshot: new Map([['a', 'open']]),
    });
    expect(r.verdict).toBe('pass');
  });

  it('PASS — a prior item completed/left the open set since the prior check', () => {
    const r = probePmBoard({
      pmBoardSnapshot: [{ id: 'b', status: 'open' }], // 'a' is gone (completed/cancelled)
      pmBoardPriorSnapshot: new Map([['a', 'open']]),
    });
    expect(r.verdict).toBe('pass');
  });

  it('FAIL despite a brand-new unrelated item appearing (regression test: new-item churn alone must not mask a true stall)', () => {
    const r = probePmBoard({
      pmBoardSnapshot: [{ id: 'a', status: 'open' }, { id: 'b', status: 'open' }], // b is new; a unchanged
      pmBoardPriorSnapshot: new Map([['a', 'open']]),
    });
    expect(r.verdict).toBe('fail');
  });

  it('is immune to updated_at-style noise by construction — it never reads that column, only status equality', () => {
    // Same status across two runs regardless of any timestamp -> still FAIL. There is no timestamp
    // input to this pure function at all, which is the point: the naive threshold design this
    // replaces would have silently masked this exact case.
    const r = probePmBoard({
      pmBoardSnapshot: [{ id: 'a', status: 'blocked' }],
      pmBoardPriorSnapshot: new Map([['a', 'blocked']]),
    });
    expect(r.verdict).toBe('fail');
  });
});

describe('encodeSnapshotTail / parseSnapshotTail', () => {
  it('round-trips a non-empty snapshot, sorted by id', () => {
    const tail = encodeSnapshotTail([{ id: 'b', status: 'open' }, { id: 'a', status: 'blocked' }]);
    expect(tail).toBe(' ::pmsnap=a:blocked,b:open');
    const parsed = parseSnapshotTail(tail);
    expect([...parsed.entries()]).toEqual([['a', 'blocked'], ['b', 'open']]);
  });

  it('distinguishes a legitimately-empty snapshot (Map present, size 0) from no snapshot at all (null)', () => {
    const emptyTail = encodeSnapshotTail([]);
    expect(emptyTail).toBe(' ::pmsnap=');
    const parsedEmpty = parseSnapshotTail(emptyTail);
    expect(parsedEmpty).not.toBeNull();
    expect(parsedEmpty.size).toBe(0);

    expect(parseSnapshotTail('some unrelated detail text with no pmsnap tail')).toBeNull();
    expect(parseSnapshotTail(null)).toBeNull();
    expect(parseSnapshotTail(undefined)).toBeNull();
  });
});

describe('fingerprint tail codec unchanged after generalization (FR-2 regression guard)', () => {
  it('encodeFingerprintsTail/parseFingerprintsTail round-trip exactly as before', () => {
    expect(encodeFingerprintsTail([])).toBe('');
    expect(encodeFingerprintsTail(['a1b2c3d4e5f6'])).toBe(' ::fps=a1b2c3d4e5f6');
    expect(encodeFingerprintsTail(['a1b2c3d4e5f6', 'f6e5d4c3b2a1'])).toBe(' ::fps=a1b2c3d4e5f6,f6e5d4c3b2a1');
    expect(parseFingerprintsTail(' ::fps=a1b2c3d4e5f6,f6e5d4c3b2a1')).toEqual(['a1b2c3d4e5f6', 'f6e5d4c3b2a1']);
    expect(parseFingerprintsTail('no tail here')).toEqual([]);
    expect(parseFingerprintsTail(null)).toEqual([]);
  });

  it('an fps tail and a pmsnap tail do not cross-contaminate when parsed independently', () => {
    const combined = `some detail${encodeFingerprintsTail(['abc123'])}${encodeSnapshotTail([{ id: 'x', status: 'open' }])}`;
    expect(parseFingerprintsTail(combined)).toEqual(['abc123']);
    expect([...parseSnapshotTail(combined).entries()]).toEqual([['x', 'open']]);
  });
});
