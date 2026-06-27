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
