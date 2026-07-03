/**
 * SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001 (Ship-witness D)
 * FR-1, FR-2, FR-4: witness-adoption.mjs — identity-matched WATCH-HOLE detection +
 * N-consecutive-day adoption readiness. Pure unit tests, no live DB/gh calls.
 */
import { describe, it, expect } from 'vitest';
import {
  WITNESS_CUTOVER_ISO,
  defaultFetchMergedPlatformPRs,
  classifyMerges,
  detectUnwitnessedMerges,
  computeAdoptionReadiness,
} from '../../../lib/ship/witness-adoption.mjs';

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function dayOffset(todayIso, offsetDays) {
  const d = new Date(`${todayIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return isoDay(d);
}

describe('defaultFetchMergedPlatformPRs', () => {
  function makeRunner(stdout, code = 0) {
    return () => ({ code, stdout, stderr: '' });
  }

  it('maps gh CLI output to {repo, prNumber, mergedAt} and lowercases repo', () => {
    const runner = makeRunner(JSON.stringify([{ number: 42, mergedAt: '2026-07-04T00:00:00Z' }]));
    const merges = defaultFetchMergedPlatformPRs('rickfelix', 'EHG_Engineer', '2026-07-03T00:00:00Z', runner);
    expect(merges).toEqual([{ repo: 'rickfelix/ehg_engineer', prNumber: 42, mergedAt: '2026-07-04T00:00:00Z' }]);
  });

  it('filters out merges before sinceIso even if gh returns them', () => {
    const runner = makeRunner(JSON.stringify([{ number: 1, mergedAt: '2026-07-01T00:00:00Z' }, { number: 2, mergedAt: '2026-07-04T00:00:00Z' }]));
    const merges = defaultFetchMergedPlatformPRs('rickfelix', 'ehg', '2026-07-03T00:00:00Z', runner);
    expect(merges.map((m) => m.prNumber)).toEqual([2]);
  });

  it('returns [] on gh CLI failure', () => {
    const runner = makeRunner('', 1);
    expect(defaultFetchMergedPlatformPRs('rickfelix', 'ehg', WITNESS_CUTOVER_ISO, runner)).toEqual([]);
  });

  it('returns [] on unparseable output', () => {
    const runner = makeRunner('not json');
    expect(defaultFetchMergedPlatformPRs('rickfelix', 'ehg', WITNESS_CUTOVER_ISO, runner)).toEqual([]);
  });
});

describe('classifyMerges / detectUnwitnessedMerges (identity matching)', () => {
  it('matches by (repo, prNumber) IDENTITY — a coincidental same-count different-PR row is NOT a match', () => {
    const merges = [{ repo: 'rickfelix/ehg', prNumber: 10, mergedAt: '2026-07-04T00:00:00Z' }];
    const telemetryRows = [{ repo: 'rickfelix/ehg', pr_number: 99 }]; // different PR, same repo
    const result = detectUnwitnessedMerges(merges, telemetryRows);
    expect(result.count).toBe(1);
    expect(result.unwitnessed[0].prNumber).toBe(10);
  });

  it('matches case-insensitively on repo', () => {
    const merges = [{ repo: 'rickfelix/EHG_Engineer', prNumber: 5, mergedAt: '2026-07-04T00:00:00Z' }];
    const telemetryRows = [{ repo: 'rickfelix/ehg_engineer', pr_number: 5 }];
    const result = detectUnwitnessedMerges(merges, telemetryRows);
    expect(result.count).toBe(0);
  });

  it('a real matching row marks the merge witnessed', () => {
    const merges = [{ repo: 'rickfelix/ehg', prNumber: 10, mergedAt: '2026-07-04T00:00:00Z' }];
    const telemetryRows = [{ repo: 'rickfelix/ehg', pr_number: 10 }];
    const classified = classifyMerges(merges, telemetryRows);
    expect(classified[0].witnessed).toBe(true);
  });

  it('empty telemetry rows means every merge is unwitnessed', () => {
    const merges = [
      { repo: 'rickfelix/ehg', prNumber: 1, mergedAt: '2026-07-04T00:00:00Z' },
      { repo: 'rickfelix/ehg', prNumber: 2, mergedAt: '2026-07-04T01:00:00Z' },
    ];
    const result = detectUnwitnessedMerges(merges, []);
    expect(result.count).toBe(2);
    expect(result.total).toBe(2);
  });
});

describe('computeAdoptionReadiness', () => {
  const TODAY = '2026-08-01';

  function buildClean7DayFixture(today) {
    const merges = [];
    const telemetryRows = [];
    for (let i = 0; i < 7; i++) {
      const day = dayOffset(today, i);
      merges.push({ repo: 'rickfelix/ehg', prNumber: 100 + i, mergedAt: `${day}T12:00:00Z` });
      telemetryRows.push({ repo: 'rickfelix/ehg', pr_number: 100 + i });
    }
    return { merges, telemetryRows };
  }

  it('ready=true, consecutiveDays=7 for a clean 7-day fixture', () => {
    const { merges, telemetryRows } = buildClean7DayFixture(TODAY);
    const readiness = computeAdoptionReadiness({ merges, telemetryRows, today: TODAY, requiredConsecutiveDays: 7 });
    expect(readiness.ready).toBe(true);
    expect(readiness.consecutiveDays).toBe(7);
  });

  it('one unwitnessed merge on a recent day resets the streak — ready=false, does not count days before the gap', () => {
    const { merges, telemetryRows } = buildClean7DayFixture(TODAY);
    // Remove the telemetry row for the merge 3 days back — that day becomes fully unwitnessed.
    const gapIndex = telemetryRows.findIndex((t) => t.pr_number === 103);
    telemetryRows.splice(gapIndex, 1);

    const readiness = computeAdoptionReadiness({ merges, telemetryRows, today: TODAY, requiredConsecutiveDays: 7 });
    expect(readiness.ready).toBe(false);
    // Days 0,1,2 (most recent, closer to today) are clean and counted; day 3 breaks the walk.
    expect(readiness.consecutiveDays).toBe(3);
  });

  it('a day with zero merges is skipped — does not break or extend the streak', () => {
    // 7 evidenced days spread across 8 calendar days (one quiet day with zero merges in between).
    const merges = [];
    const telemetryRows = [];
    const offsets = [0, 1, 2, 3, 5, 6, 7]; // day offset 4 is intentionally quiet (no merges at all)
    offsets.forEach((offset, idx) => {
      const day = dayOffset(TODAY, offset);
      merges.push({ repo: 'rickfelix/ehg', prNumber: 200 + idx, mergedAt: `${day}T12:00:00Z` });
      telemetryRows.push({ repo: 'rickfelix/ehg', pr_number: 200 + idx });
    });

    const readiness = computeAdoptionReadiness({ merges, telemetryRows, today: TODAY, requiredConsecutiveDays: 7 });
    expect(readiness.ready).toBe(true);
    expect(readiness.consecutiveDays).toBe(7);
  });

  it('reflects real production state: 1 historical telemetry row is far short of 7 days — not ready', () => {
    const merges = [{ repo: 'rickfelix/ehg_engineer', prNumber: 5415, mergedAt: '2026-07-03T03:37:35Z' }];
    const telemetryRows = [{ repo: 'rickfelix/ehg_engineer', pr_number: 5415 }];
    const readiness = computeAdoptionReadiness({ merges, telemetryRows, today: '2026-07-03', requiredConsecutiveDays: 7 });
    expect(readiness.ready).toBe(false);
    expect(readiness.consecutiveDays).toBeLessThan(7);
  });
});
