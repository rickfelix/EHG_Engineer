import { describe, it, expect } from 'vitest';
import {
  isValidEtDate, addEtDays, windowDates, computeRetirementWindow, MIN_REQUIRED_CONSECUTIVE_DAYS,
} from './retirement-window.mjs';

describe('isValidEtDate', () => {
  it('accepts a real calendar date', () => {
    expect(isValidEtDate('2026-09-07')).toBe(true);
  });
  it('rejects a non-existent calendar date (Feb 30)', () => {
    expect(isValidEtDate('2026-02-30')).toBe(false);
  });
  it('rejects an out-of-range month', () => {
    expect(isValidEtDate('2026-13-01')).toBe(false);
  });
  it('rejects non-YYYY-MM-DD shapes', () => {
    expect(isValidEtDate('9/7/2026')).toBe(false);
    expect(isValidEtDate('2026-9-7')).toBe(false);
    expect(isValidEtDate('')).toBe(false);
    expect(isValidEtDate(undefined)).toBe(false);
    expect(isValidEtDate(null)).toBe(false);
  });
});

describe('addEtDays', () => {
  it('adds days within a month', () => {
    expect(addEtDays('2026-09-01', 6)).toBe('2026-09-07');
  });
  it('rolls across a month boundary', () => {
    expect(addEtDays('2026-09-25', 10)).toBe('2026-10-05');
  });
  it('rolls across a year boundary', () => {
    expect(addEtDays('2026-12-28', 10)).toBe('2027-01-07');
  });
  it('is DST-boundary-safe (US DST ends 2026-11-01) — pure UTC calendar arithmetic', () => {
    // 14 days from 2026-10-25 crosses the Nov 1 2026 DST-end boundary.
    expect(addEtDays('2026-10-25', 13)).toBe('2026-11-07');
  });
});

describe('windowDates', () => {
  it('returns requiredConsecutiveDays ordered, distinct dates starting at windowStartEtDate', () => {
    const dates = windowDates('2026-09-01', 14);
    expect(dates).toHaveLength(14);
    expect(dates[0]).toBe('2026-09-01');
    expect(dates[13]).toBe('2026-09-14');
    expect(new Set(dates).size).toBe(14);
    for (let i = 1; i < dates.length; i++) expect(dates[i] > dates[i - 1]).toBe(true);
  });

  it('produces exactly 14 distinct dates across the 2026 US DST-end boundary', () => {
    const dates = windowDates('2026-10-25', 14);
    expect(dates).toHaveLength(14);
    expect(new Set(dates).size).toBe(14);
    expect(dates).toContain('2026-10-31');
    expect(dates).toContain('2026-11-01');
    expect(dates).toContain('2026-11-07');
  });
});

function fullStreakMaps(dates) {
  const briefRunsByDate = {};
  const ledgerByDate = {};
  for (const d of dates) { briefRunsByDate[d] = { verified: true }; ledgerByDate[d] = { et_date: d }; }
  return { briefRunsByDate, ledgerByDate };
}

describe('computeRetirementWindow — happy path', () => {
  it('a full 14-day verified+ledgered streak is ready, consecutiveDays=14', () => {
    const start = '2026-08-01';
    const dates = windowDates(start, 14);
    const { briefRunsByDate, ledgerByDate } = fullStreakMaps(dates);
    const today = addEtDays(start, 20); // well past window end
    const result = computeRetirementWindow({ windowStartEtDate: start, today, briefRunsByDate, ledgerByDate });
    expect(result).toMatchObject({ ready: true, consecutiveDays: 14, reason: 'WINDOW_ELAPSED' });
  });

  it('a full streak crossing the 2026 DST-end boundary is still ready with exactly 14 distinct dates counted', () => {
    const start = '2026-10-25';
    const dates = windowDates(start, 14);
    const { briefRunsByDate, ledgerByDate } = fullStreakMaps(dates);
    const today = addEtDays(start, 20);
    const result = computeRetirementWindow({ windowStartEtDate: start, today, briefRunsByDate, ledgerByDate });
    expect(result.ready).toBe(true);
    expect(result.consecutiveDays).toBe(14);
  });

  it('input-map key order never affects the result (dates are looked up, not iterated)', () => {
    const start = '2026-08-01';
    const dates = windowDates(start, 14);
    const shuffled = [...dates].reverse();
    const briefRunsByDate = {};
    const ledgerByDate = {};
    for (const d of shuffled) { briefRunsByDate[d] = { verified: true }; ledgerByDate[d] = { et_date: d }; }
    const today = addEtDays(start, 20);
    const result = computeRetirementWindow({ windowStartEtDate: start, today, briefRunsByDate, ledgerByDate });
    expect(result).toMatchObject({ ready: true, consecutiveDays: 14 });
  });
});

describe('computeRetirementWindow — ANY gap breaks the streak (never skipped, unlike witness-adoption.mjs)', () => {
  const start = '2026-08-01';
  const dates = windowDates(start, 14);
  const today = addEtDays(start, 20);

  it('a missing michael_brief_runs row at day 1 breaks the streak immediately', () => {
    const { briefRunsByDate, ledgerByDate } = fullStreakMaps(dates);
    delete briefRunsByDate[dates[0]];
    const result = computeRetirementWindow({ windowStartEtDate: start, today, briefRunsByDate, ledgerByDate });
    expect(result).toMatchObject({ ready: false, consecutiveDays: 0, reason: 'WINDOW_HAS_GAP', gapDate: dates[0], gapReason: 'NO_VERIFIED_BRIEF' });
  });

  it('a missing michael_brief_runs row at day 7 (mid-window) breaks the streak at consecutiveDays=6', () => {
    const { briefRunsByDate, ledgerByDate } = fullStreakMaps(dates);
    delete briefRunsByDate[dates[6]];
    const result = computeRetirementWindow({ windowStartEtDate: start, today, briefRunsByDate, ledgerByDate });
    expect(result).toMatchObject({ ready: false, consecutiveDays: 6, gapDate: dates[6] });
  });

  it('a missing row at day 14 (the last day) still breaks the streak — the classic off-by-one boundary', () => {
    const { briefRunsByDate, ledgerByDate } = fullStreakMaps(dates);
    delete briefRunsByDate[dates[13]];
    const result = computeRetirementWindow({ windowStartEtDate: start, today, briefRunsByDate, ledgerByDate });
    expect(result).toMatchObject({ ready: false, consecutiveDays: 13, gapDate: dates[13] });
  });

  it('verified: false (row exists but unverified) counts as a gap, not a pass', () => {
    const { briefRunsByDate, ledgerByDate } = fullStreakMaps(dates);
    briefRunsByDate[dates[3]] = { verified: false };
    const result = computeRetirementWindow({ windowStartEtDate: start, today, briefRunsByDate, ledgerByDate });
    expect(result).toMatchObject({ ready: false, consecutiveDays: 3, gapReason: 'NO_VERIFIED_BRIEF' });
  });

  it('a missing michael_feedback_ledger row (even with a verified brief) counts as a gap', () => {
    const { briefRunsByDate, ledgerByDate } = fullStreakMaps(dates);
    delete ledgerByDate[dates[5]];
    const result = computeRetirementWindow({ windowStartEtDate: start, today, briefRunsByDate, ledgerByDate });
    expect(result).toMatchObject({ ready: false, consecutiveDays: 5, gapReason: 'NO_LEDGER_ENTRY' });
  });

  it('missing both brief and ledger on the same date reports the combined reason', () => {
    const { briefRunsByDate, ledgerByDate } = fullStreakMaps(dates);
    delete briefRunsByDate[dates[2]];
    delete ledgerByDate[dates[2]];
    const result = computeRetirementWindow({ windowStartEtDate: start, today, briefRunsByDate, ledgerByDate });
    expect(result.gapReason).toBe('NO_VERIFIED_BRIEF_AND_NO_LEDGER_ENTRY');
  });
});

describe('computeRetirementWindow — refusals', () => {
  it('refuses an invalid windowStartEtDate', () => {
    const result = computeRetirementWindow({ windowStartEtDate: 'not-a-date', today: '2026-09-01' });
    expect(result).toMatchObject({ ready: false, reason: 'INVALID_WINDOW_START' });
  });

  it('refuses a future windowStartEtDate value that is simply malformed', () => {
    const result = computeRetirementWindow({ windowStartEtDate: '2026-13-40', today: '2026-09-01' });
    expect(result.reason).toBe('INVALID_WINDOW_START');
  });

  it('refuses an invalid today', () => {
    const result = computeRetirementWindow({ windowStartEtDate: '2026-08-01', today: 'nope' });
    expect(result).toMatchObject({ ready: false, reason: 'INVALID_TODAY' });
  });

  it('reports WINDOW_NOT_YET_ELAPSED distinctly from a genuine gap when the window has not finished yet', () => {
    const start = '2026-09-01';
    const dates = windowDates(start, 14);
    const { briefRunsByDate, ledgerByDate } = fullStreakMaps(dates.slice(0, 5)); // only the first 5 days have any data
    const today = addEtDays(start, 4); // today is still inside the window
    const result = computeRetirementWindow({ windowStartEtDate: start, today, briefRunsByDate, ledgerByDate });
    expect(result).toMatchObject({ ready: false, reason: 'WINDOW_NOT_YET_ELAPSED' });
  });

  it('refuses requiredConsecutiveDays below the 14-day floor — never CLI-lowerable', () => {
    const start = '2026-08-01';
    const dates = windowDates(start, 1);
    const { briefRunsByDate, ledgerByDate } = fullStreakMaps(dates);
    const today = addEtDays(start, 5);
    const result = computeRetirementWindow({ windowStartEtDate: start, today, briefRunsByDate, ledgerByDate, requiredConsecutiveDays: 1 });
    expect(result).toMatchObject({ ready: false, reason: 'REQUIRED_DAYS_BELOW_FLOOR' });
  });

  it('MIN_REQUIRED_CONSECUTIVE_DAYS is 14', () => {
    expect(MIN_REQUIRED_CONSECUTIVE_DAYS).toBe(14);
  });
});
