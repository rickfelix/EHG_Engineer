/**
 * QF-20260912-197.
 *
 * The RCA repeat-guard (scripts/hooks/retry-state-manager.cjs) hard-blocks a Bash invocation on
 * its 3rd occurrence within 10 minutes unless the invoking script is exempt (builtin
 * EXEMPT_PATTERNS, or scripts/hooks/recurring-tick-exemptions.json). A STANDARD_LOOPS entry
 * (scripts/coordinator-startup-check.mjs) whose cron cadence is under 10 minutes will produce
 * 3+ identical, healthy invocations inside that window BY CONSTRUCTION -- exactly what
 * index-jam-detector.mjs (every-2-minute cadence) hit before this QF registered it.
 *
 * This gauge reads the LIVE STANDARD_LOOPS array (never a text-scan of the source file, which
 * would miss entries whose fields wrap across source lines) and asserts every sub-10-minute
 * entry's script is covered by one of the two exemption lists, with the current set pinned as a
 * baseline so a future sub-10-minute loop cannot be added unregistered.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { STANDARD_LOOPS } from '../../../scripts/coordinator-startup-check.mjs';

const require = createRequire(import.meta.url);
const { isExempt } = require('../../../scripts/hooks/retry-state-manager.cjs');

/**
 * Whether a standard 5-field cron string fires more than once per 10-minute window.
 * Conservative: any field other than `*` in hour/day/month/weekday means NOT sub-hourly
 * (daily/weekly cadences never trip the 10-minute repeat-guard window).
 */
export function cronCadenceMinutesUnderTen(cron) {
  if (typeof cron !== 'string') return false;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, dom, month, dow] = parts;
  if (hour !== '*' || dom !== '*' || month !== '*' || dow !== '*') return false;
  if (minute === '*') return true;
  const step = minute.match(/^\*\/(\d+)$/);
  if (step) return Number(step[1]) < 10;
  if (/^\d+(,\d+)*$/.test(minute)) {
    const vals = minute.split(',').map(Number).sort((a, b) => a - b);
    if (vals.length < 2) return false; // a single fixed minute in the hour = hourly, not sub-10-min
    let minGap = Infinity;
    for (let i = 1; i < vals.length; i++) minGap = Math.min(minGap, vals[i] - vals[i - 1]);
    minGap = Math.min(minGap, 60 - vals[vals.length - 1] + vals[0]); // wrap-around gap
    return minGap < 10;
  }
  return false;
}

describe('cronCadenceMinutesUnderTen', () => {
  it('classifies known shapes correctly', () => {
    expect(cronCadenceMinutesUnderTen('*/2 * * * *')).toBe(true);
    expect(cronCadenceMinutesUnderTen('*/5 * * * *')).toBe(true);
    expect(cronCadenceMinutesUnderTen('2,7,12,17,22,27,32,37,42,47,52,57 * * * *')).toBe(true); // 5-min gaps
    expect(cronCadenceMinutesUnderTen('*/10 * * * *')).toBe(false); // exactly 10, not UNDER 10
    expect(cronCadenceMinutesUnderTen('5,15,25,35,45,55 * * * *')).toBe(false); // 10-min gaps
    expect(cronCadenceMinutesUnderTen('0,15,30,45 * * * *')).toBe(false); // 15-min gaps
    expect(cronCadenceMinutesUnderTen('0 * * * *')).toBe(false); // hourly (single minute value)
    expect(cronCadenceMinutesUnderTen('0 10 * * *')).toBe(false); // daily (hour fixed)
    expect(cronCadenceMinutesUnderTen('0 9 * * 1')).toBe(false); // weekly (weekday fixed)
    expect(cronCadenceMinutesUnderTen('41 6,18 * * *')).toBe(false); // twice-daily (hour list)
  });
});

describe('QF-20260912-197 — every sub-10-minute STANDARD_LOOPS entry is RCA-repeat-guard exempt', () => {
  const subTenMinuteEntries = STANDARD_LOOPS.filter((l) => l.script && cronCadenceMinutesUnderTen(l.cron));

  it('sanity: the filter is not vacuously empty', () => {
    expect(subTenMinuteEntries.length).toBeGreaterThan(0);
  });

  // Pinned baseline (SD-LEO-FIX-EXEMPT-REGISTERED-RECURRING-001 lineage): a future sub-10-minute
  // STANDARD_LOOPS entry must be deliberately added here AND registered in one of the two
  // exemption lists -- it cannot silently ship unregistered and rediscover this QF's incident.
  it('the current sub-10-minute key set matches the asserted baseline', () => {
    const keys = subTenMinuteEntries.map((l) => l.key).sort();
    expect(keys).toEqual(
      ['sweep', 'dashboard', 'identity', 'inbox', 'self-review', 'sms-relay-drain', 'sms-status-relay-drain', 'index-jam-detector'].sort()
    );
  });

  it("every sub-10-minute entry's script is covered by a builtin EXEMPT_PATTERNS or a recurring-tick-exemptions.json entry", () => {
    const uncovered = subTenMinuteEntries
      .filter((l) => !isExempt(`node scripts/${l.script}`))
      .map((l) => ({ key: l.key, script: l.script }));
    expect(uncovered).toEqual([]);
  });

  it('DISCRIMINATES: an unregistered sub-10-minute script would be reported uncovered (proves this is not vacuously green)', () => {
    const fakeLoop = { key: 'fake-loop', script: 'definitely-not-registered-anywhere.mjs', cron: '*/2 * * * *' };
    expect(isExempt(`node scripts/${fakeLoop.script}`)).toBe(false);
  });
});
