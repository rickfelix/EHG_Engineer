/**
 * Tests for coordinator-fleet-retro.mjs's summary-string builder
 * QF-20260727-390: a captured=0 run read identically whether the fleet was genuinely
 * quiet or workers had stopped emitting the FLEET-RETRO convention. This locks in the
 * newest-retro-age surfacing and the loud zero-signal warning.
 */

import { describe, it, expect } from 'vitest';
import { buildFleetRetroSummary } from '../../scripts/coordinator-fleet-retro.mjs';

describe('buildFleetRetroSummary', () => {
  it('reports the newest retro age when the digest has entries', () => {
    const now = new Date('2026-07-28T12:00:00Z').getTime();
    const all = [
      { created_at: '2026-07-28T06:00:00Z' }, // 6h old, newest (list is created_at desc)
      { created_at: '2026-07-27T15:20:00Z' },
    ];

    const { summaryLine, zeroSignalWarning } = buildFleetRetroSummary({ captured: 3, errs: 0, all, now });

    expect(summaryLine).toContain('captured 3 new this run');
    expect(summaryLine).toContain('2 retros in last 7d');
    expect(summaryLine).toContain('(newest 6.0h old)');
    expect(zeroSignalWarning).toBeNull();
  });

  it('flags a zero-capture run loudly instead of reading as silent success', () => {
    const now = new Date('2026-07-28T12:00:00Z').getTime();
    const all = [{ created_at: '2026-07-27T15:20:00Z' }]; // 20.7h old

    const { summaryLine, zeroSignalWarning } = buildFleetRetroSummary({ captured: 0, errs: 0, all, now });

    expect(summaryLine).toContain('captured 0 new this run');
    expect(summaryLine).toContain('(newest 20.7h old)');
    expect(zeroSignalWarning).not.toBeNull();
    expect(zeroSignalWarning).toContain('cross-check the retrospectives table');
  });

  it('reports an EMPTY digest distinctly from a stale-but-present one', () => {
    const { summaryLine, zeroSignalWarning } = buildFleetRetroSummary({ captured: 0, errs: 0, all: [], now: Date.now() });

    expect(summaryLine).toContain('0 retros in last 7d');
    expect(summaryLine).toContain('(digest EMPTY)');
    expect(zeroSignalWarning).not.toBeNull();
  });

  it('surfaces insert errors in the summary line without suppressing the zero-signal warning', () => {
    const { summaryLine, zeroSignalWarning } = buildFleetRetroSummary({ captured: 0, errs: 2, all: [], now: Date.now() });

    expect(summaryLine).toContain('(2 insert errors)');
    expect(zeroSignalWarning).not.toBeNull();
  });

  it('does not warn when at least one new signal was captured this run', () => {
    const { zeroSignalWarning } = buildFleetRetroSummary({ captured: 1, errs: 0, all: [{ created_at: new Date().toISOString() }], now: Date.now() });

    expect(zeroSignalWarning).toBeNull();
  });
});
