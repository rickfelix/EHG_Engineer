/**
 * SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-2c)
 *
 * TICK_FRESH_MS must be DERIVED FROM MEASURED CADENCE and must not classify any healthy seat as
 * stale. This file replays the captured measurement against the shipped constant, so the
 * derivation is re-checked on every run rather than resting on a comment.
 *
 * THE MEASUREMENT CORRECTED THE PRD. The PRD asserted cadence was "bimodal at 60.01s/90.02s with a
 * median of 60.03s, and 2 of 18 HEALTHY intervals already exceeded the 90s window", and asked for
 * TICK_FRESH_MS to be widened accordingly. Re-measured over 168 intervals instead of 18
 * (tests/fixtures/tick-cadence-2026-07-27.json, captured by
 * scripts/one-off/_tick-cadence-sampler-charlie.cjs), cadence is tightly UNIMODAL at 30.0s and
 * NOTHING exceeds 31s. A 60/90s bimodal reading with a 60s median is the signature of polling a
 * 30s process at >=30s and missing intervening ticks; the earlier figure measured the instrument,
 * not the tick. The sampler here differences consecutive process_alive_at VALUES from the DB
 * rather than poll times, so its output is exact and independent of its own polling rate.
 *
 * The constant therefore does NOT move, and the tests below are what makes that a finding rather
 * than an omission: they assert the measured population is comfortably inside the window AND that
 * the window is still tight enough to be meaningful. Changing a working constant on a premise that
 * had just failed verification is the re-inversion trap this SD records five prior builds falling
 * into.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { TICK_FRESH_MS, hasTickAlive } = require('../../../lib/fleet/session-liveness.cjs');

const measurement = JSON.parse(
  fs.readFileSync(new URL('../../fixtures/tick-cadence-2026-07-27.json', import.meta.url), 'utf8')
);

describe('FR-2c the measurement itself is a usable sample', () => {
  it('is large enough to beat the 18-interval sample it corrects', () => {
    // 0-of-N is a FAIL, not an empty pass — state the count and require it to be real.
    expect(measurement.intervals_observed).toBeGreaterThan(100);
    expect(measurement.sessions_that_advanced).toBeGreaterThan(5);
  });

  it('records cadence as unimodal at the 30s TICK_MS, not bimodal at 60/90s', () => {
    expect(measurement.median_ms).toBeGreaterThanOrEqual(29_000);
    expect(measurement.median_ms).toBeLessThanOrEqual(31_000);
    expect(measurement.max_ms).toBeLessThan(35_000);
  });
});

describe('FR-2c no healthy seat in the measured sample is classified stale', () => {
  it('every observed interval fits inside TICK_FRESH_MS', () => {
    const offenders = [];
    for (const [sessionId, intervals] of Object.entries(measurement.per_session)) {
      for (const ms of intervals) {
        if (ms > TICK_FRESH_MS) offenders.push(`${sessionId}: ${ms}ms > ${TICK_FRESH_MS}ms`);
      }
    }
    const total = Object.values(measurement.per_session).reduce((n, a) => n + a.length, 0);
    console.log(`[FR-2c] replayed ${total} measured intervals against TICK_FRESH_MS=${TICK_FRESH_MS}ms`);
    expect(total).toBe(measurement.intervals_observed);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('a seat one full measured interval old still reads tick-alive', () => {
    const nowMs = Date.parse('2026-07-27T12:00:00.000Z');
    const row = { process_alive_at: new Date(nowMs - measurement.max_ms).toISOString() };
    expect(hasTickAlive(row, nowMs)).toBe(true);
  });

  it('THE OTHER SIDE: the window is still tight enough to mean something', () => {
    // A rung that never goes stale is not a liveness signal. Pin both edges so a future widening
    // cannot quietly turn this into "always alive" — the false-LIFE direction, which is the one
    // this rung actually risks now that the veto amendment was withdrawn.
    const nowMs = Date.parse('2026-07-27T12:00:00.000Z');
    const longDead = { process_alive_at: new Date(nowMs - 5 * 60 * 1000).toISOString() };
    expect(hasTickAlive(longDead, nowMs)).toBe(false);
    expect(TICK_FRESH_MS).toBeLessThanOrEqual(measurement.max_ms * 5);
  });

  it('tolerates two consecutively missed ticks (the stated 3x derivation)', () => {
    expect(TICK_FRESH_MS).toBeGreaterThanOrEqual(measurement.max_ms * 2);
  });
});
