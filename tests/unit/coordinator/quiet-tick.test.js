/**
 * Unit tests for lib/coordinator/quiet-tick.cjs
 * SD-LEO-INFRA-FLEET-HIBERNATION-MECHANISM-001
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  decideCadence,
  detectSalientDelta,
  runCoresFailSoft,
  MAX_QUIESCENT_PARK_S,
  ACTIVE_MAX_S,
  PROMPT_CACHE_TTL_S,
  DIRECTIVE_WAKE_MIN_S,
  DIRECTIVE_WAKE_MAX_S,
} = require('../../../lib/coordinator/quiet-tick.cjs');

describe('decideCadence (FR-5/FR-6)', () => {
  it('quiescent park never exceeds the 15-min cap', () => {
    for (const offset of [0, 100, 420, 5000]) {
      const d = decideCadence({ quiescent: true, partyOffsetS: offset });
      expect(d).toBeLessThanOrEqual(MAX_QUIESCENT_PARK_S);
      expect(d).toBeGreaterThan(ACTIVE_MAX_S);
    }
  });

  it('a requested short quiescent park is honored but still capped', () => {
    expect(decideCadence({ quiescent: true, desiredQuiescentParkS: 600 })).toBe(600);
    expect(decideCadence({ quiescent: true, desiredQuiescentParkS: 99999 })).toBe(MAX_QUIESCENT_PARK_S);
  });

  it('active cadence stays in the fast band and strictly below the cache TTL', () => {
    for (const offset of [0, 1, 50, 270, 999]) {
      const d = decideCadence({ quiescent: false, partyOffsetS: offset });
      expect(d).toBeGreaterThanOrEqual(180);
      expect(d).toBeLessThanOrEqual(ACTIVE_MAX_S);
      expect(d).toBeLessThan(PROMPT_CACHE_TTL_S);
    }
  });

  it('NEVER returns exactly 300s in any mode (prompt-cache TTL invariant)', () => {
    for (const quiescent of [true, false]) {
      for (let offset = 0; offset <= 1000; offset += 7) {
        for (const desired of [120, 300, 301, 600, 900]) {
          const d = decideCadence({ quiescent, partyOffsetS: offset, desiredQuiescentParkS: desired });
          expect(d).not.toBe(300);
          expect(d).toBeGreaterThan(0);
        }
      }
    }
  });

  it('phasing produces distinct coordinator vs Adam parks in active mode', () => {
    const coord = decideCadence({ quiescent: false, partyOffsetS: 0 });
    const adam = decideCadence({ quiescent: false, partyOffsetS: 60 });
    expect(coord).not.toBe(adam);
  });
});

describe('decideCadence hasUnactionedDirective hard-wake override (SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 FR-1)', () => {
  it('overrides a quiescent long park with a short hard-wake delay', () => {
    const d = decideCadence({ quiescent: true, hasUnactionedDirective: true });
    expect(d).toBeLessThan(ACTIVE_MAX_S);
    expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
    expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
  });

  it('overrides the normal active band too — a directive is always faster than plain active', () => {
    const d = decideCadence({ quiescent: false, hasUnactionedDirective: true });
    expect(d).toBeLessThan(180); // strictly below ACTIVE_MIN_S
  });

  it('reproduces the 2026-07-09 incident shape: quiescent + directive pending never approaches the 900s park', () => {
    const d = decideCadence({ quiescent: true, hasUnactionedDirective: true, desiredQuiescentParkS: MAX_QUIESCENT_PARK_S });
    expect(d).toBeLessThan(60);
  });

  it('hasUnactionedDirective=false is byte-identical to the pre-FR-1 behavior (regression-safe default)', () => {
    for (const quiescent of [true, false]) {
      for (const offset of [0, 100, 420]) {
        const withFalse = decideCadence({ quiescent, partyOffsetS: offset, hasUnactionedDirective: false });
        const withOmitted = decideCadence({ quiescent, partyOffsetS: offset });
        expect(withFalse).toBe(withOmitted);
      }
    }
  });

  it('phasing spreads directive hard-wake delays across the short band without breaching it', () => {
    for (const offset of [0, 10, 30, 100, 999]) {
      const d = decideCadence({ quiescent: true, hasUnactionedDirective: true, partyOffsetS: offset });
      expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
      expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
    }
  });

  it('never returns exactly 300s under the directive override either', () => {
    for (let offset = 0; offset <= 100; offset += 3) {
      const d = decideCadence({ quiescent: true, hasUnactionedDirective: true, partyOffsetS: offset });
      expect(d).not.toBe(300);
    }
  });
});

describe('decideCadence hasUndeliveredChairmanEscalation hard-park precondition (SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-H FR-2, FW-3 §6d)', () => {
  it('an undelivered chairman-escalation overrides the quiescent long park with the hard-wake band', () => {
    const d = decideCadence({ quiescent: true, hasUndeliveredChairmanEscalation: true, desiredQuiescentParkS: MAX_QUIESCENT_PARK_S });
    expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
    expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
  });

  it('overrides the active band too — an undelivered escalation is always faster than plain active', () => {
    const d = decideCadence({ quiescent: false, hasUndeliveredChairmanEscalation: true });
    expect(d).toBeLessThan(180); // strictly below ACTIVE_MIN_S
  });

  it('BOTH flags true stays inside the hard-wake band across offsets — shared branch, no double-offset drift', () => {
    for (const offset of [0, 10, 30, 100, 420, 999]) {
      const d = decideCadence({ quiescent: true, hasUnactionedDirective: true, hasUndeliveredChairmanEscalation: true, partyOffsetS: offset });
      expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
      expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
      expect(d).not.toBe(300);
    }
  });

  it('escalation flag false/omitted is byte-identical to today across quiescent, active AND directive branches', () => {
    for (const quiescent of [true, false]) {
      for (const hasUnactionedDirective of [true, false]) {
        for (const offset of [0, 100, 420]) {
          const withFalse = decideCadence({ quiescent, partyOffsetS: offset, hasUnactionedDirective, hasUndeliveredChairmanEscalation: false });
          const withOmitted = decideCadence({ quiescent, partyOffsetS: offset, hasUnactionedDirective });
          expect(withFalse).toBe(withOmitted);
        }
      }
    }
  });

  it("Adam's 420s party offset stays inside the hard-wake band under the escalation override", () => {
    const d = decideCadence({ quiescent: true, hasUndeliveredChairmanEscalation: true, partyOffsetS: 420 });
    expect(d).toBeGreaterThanOrEqual(DIRECTIVE_WAKE_MIN_S);
    expect(d).toBeLessThanOrEqual(DIRECTIVE_WAKE_MAX_S);
  });

  it('never returns exactly 300s under the escalation override', () => {
    for (let offset = 0; offset <= 100; offset += 3) {
      const d = decideCadence({ quiescent: true, hasUndeliveredChairmanEscalation: true, partyOffsetS: offset });
      expect(d).not.toBe(300);
    }
  });
});

describe('detectSalientDelta (FR-4)', () => {
  it('first tick is always a delta', () => {
    expect(detectSalientDelta(null, { beltZero: true, openSignalCount: 0 }).changed).toBe(true);
  });

  it('no change => no ping (still-idle is suppressed)', () => {
    const prev = { beltZero: true, openSignalCount: 0, venture1State: 'S17' };
    const cur = { beltZero: true, openSignalCount: 0, venture1State: 'S17' };
    expect(detectSalientDelta(prev, cur).changed).toBe(false);
  });

  it('belt 0<->non-zero transition is a delta', () => {
    expect(detectSalientDelta({ beltZero: true }, { beltZero: false }).fields).toContain('beltZero');
    expect(detectSalientDelta({ beltZero: false }, { beltZero: true }).fields).toContain('beltZero');
  });

  it('a NEW signal (count up) is a delta; draining is not', () => {
    expect(detectSalientDelta({ openSignalCount: 0 }, { openSignalCount: 1 }).changed).toBe(true);
    expect(detectSalientDelta({ openSignalCount: 2 }, { openSignalCount: 1 }).changed).toBe(false);
  });

  it('venture-1 state change is a delta', () => {
    expect(detectSalientDelta({ venture1State: 'S17' }, { venture1State: 'S18' }).fields).toContain('venture1State');
  });
});

describe('runCoresFailSoft (FR-1)', () => {
  it('one core throwing does not abort the tick — others still run', async () => {
    const ran = [];
    const out = await runCoresFailSoft([
      { key: 'a', run: () => { ran.push('a'); return 'done-a'; } },
      { key: 'boom', run: () => { throw new Error('kaboom'); } },
      { key: 'c', run: async () => { ran.push('c'); return 'done-c'; } },
    ]);
    expect(ran).toEqual(['a', 'c']);
    expect(out.failedCount).toBe(1);
    expect(out.ranCount).toBe(3);
    expect(out.results.find((r) => r.key === 'boom').status).toBe('fail');
    expect(out.summary).toContain('boom:fail');
  });

  it('skip=true records a quiescent skip without running', async () => {
    let calls = 0;
    const out = await runCoresFailSoft([
      { key: 'forecast', skip: true, run: () => { calls++; } },
      { key: 'inbox', run: () => 'ok' },
    ]);
    expect(calls).toBe(0);
    expect(out.skippedCount).toBe(1);
    expect(out.results.find((r) => r.key === 'forecast').status).toBe('skipped');
  });

  it('emits a single summary line for the whole tick', async () => {
    const out = await runCoresFailSoft([
      { key: 'x', run: () => 'ok' },
      { key: 'y', run: () => 'ok' },
    ]);
    expect(out.summary).toBe('x:ok y:ok');
  });
});
