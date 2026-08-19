/**
 * SD-FDBK-ENH-PERIODIC-LIVENESS-WATCHER-001 -- unit coverage for
 * lib/periodic-liveness/cron-gap.mjs, added after EXEC-TO-PLAN SECURITY review found the
 * module had zero negative-input coverage -- the proximate reason a fail-open (out-of-domain
 * hour values silently pinning staleness at 0 forever) shipped unnoticed. This file's job is
 * specifically the malformed/adversarial-input paths; the acceptance binary's T0 already covers
 * the happy path.
 */
import { describe, it, expect } from 'vitest';
import { parseCronHours, hasDeclaredGap, largestDeclaredGapSeconds, gapAdjustedAgeMs } from '../../../lib/periodic-liveness/cron-gap.mjs';

const iso = (s) => new Date(s).getTime();

describe('parseCronHours -- malformed/out-of-domain input (fail-open regression)', () => {
  it('an out-of-domain range (24-30) is rejected, not silently added', () => {
    expect(parseCronHours('0 24-30 * * *')).toBeNull();
  });

  it('a single out-of-domain hour (30) is rejected', () => {
    expect(parseCronHours('0 30 * * *')).toBeNull();
  });

  it('a mixed valid+invalid list keeps only the in-domain values', () => {
    const hours = parseCronHours('0 10,30,15 * * *');
    expect(hours && [...hours].sort((a, b) => a - b)).toEqual([10, 15]);
  });

  it('an inverted range (23-5) is rejected rather than silently producing zero hours', () => {
    expect(parseCronHours('0 23-5 * * *')).toBeNull();
  });

  it('a 6-field expression (unsupported shape) is rejected, not misread via the wrong field', () => {
    // Naively taking parts[1] here would read '15' -- the seconds-field-shifted "minute" token --
    // as the hour field, producing a plausible-looking WRONG answer instead of a safe null.
    expect(parseCronHours('0 15 0-2,10-23 * * *')).toBeNull();
  });

  it('a genuinely valid range still parses correctly (no regression)', () => {
    const hours = parseCronHours('15 0-2,10-23 * * *');
    expect(hours && hours.size).toBe(17);
    expect(hours.has(3)).toBe(false);
    expect(hours.has(9)).toBe(false);
    expect(hours.has(10)).toBe(true);
  });

  it('a large out-of-domain range does not hang (closes the unbounded-loop cost alongside the fail-open)', () => {
    const start = Date.now();
    expect(parseCronHours('0 0-3000000 * * *')).toBeNull();
    expect(Date.now() - start).toBeLessThan(100);
  });
});

describe('gapAdjustedAgeMs -- end-to-end safety property for malformed workflow_cron', () => {
  it('falls back to raw elapsed time (never 0) when workflow_cron is malformed, even for a very stale row', () => {
    const since = iso('2026-08-14T00:00:00Z');
    const at = iso('2026-08-19T05:48:00Z'); // ~127.8h later
    const raw = at - since;
    expect(gapAdjustedAgeMs('0 24-30 * * *', since, at)).toBe(raw);
    expect(gapAdjustedAgeMs('0 30 * * *', since, at)).toBe(raw);
    expect(gapAdjustedAgeMs('0 15 0-2,10-23 * * *', since, at)).toBe(raw);
  });

  it('a genuinely valid, gap-declaring cron still subtracts correctly (no regression from the domain guard)', () => {
    const adjusted = gapAdjustedAgeMs('15 0-2,10-23 * * *', iso('2026-08-20T02:15:00Z'), iso('2026-08-20T05:00:00Z'));
    expect(adjusted).toBe(45 * 60_000);
  });
});

describe('hasDeclaredGap / largestDeclaredGapSeconds -- malformed input reads as "no gap data"', () => {
  it('hasDeclaredGap is false for a malformed hour field (never mistaken for "fires every hour")', () => {
    expect(hasDeclaredGap('0 24-30 * * *')).toBe(false);
  });

  it('largestDeclaredGapSeconds is 0 for a malformed hour field (never a fabricated non-zero gap)', () => {
    expect(largestDeclaredGapSeconds('0 24-30 * * *')).toBe(0);
  });
});
