/**
 * SD-LEO-INFRA-GATE-THRESHOLD-TUNING-002 — the acceptance must be able to falsify the change.
 *
 * The two seeded scenarios below are the ways this SD could COMPLETE WHILE PROVING NOTHING: an
 * overlapping-window comparison that yields a real number supporting an invalid inference, and a null
 * post-change read passing as "unchanged". Both are invisible in a summary that only prints failures.
 */

import { describe, it, expect } from 'vitest';
import { evaluateChange, windowsOverlap, OUTCOME, MIN_AFTER } from '../../lib/quality/threshold-acceptance.js';

const DAY = 864e5;
const T = Date.parse('2026-08-04T00:00:00Z');
const rows = (n, score, threshold) =>
  Array.from({ length: n }, () => ({ weighted_score: score, pass_threshold: threshold }));

describe('TS-3 — SEEDED: an overlapping comparison is REFUSED, not computed', () => {
  it('two 4-week windows taken days apart are refused', () => {
    // THE REALISTIC MISTAKE: read the 4-week view, apply the change, read it again days later.
    // Those windows share three weeks of assessments, so the delta is diluted toward zero and cannot
    // detect the change. It would still look like a measurement.
    const r = evaluateChange({
      sd_type: 'refactor', before_threshold: 60, after_threshold: 65,
      beforeWindow: { start: T - 28 * DAY, end: T },
      afterWindow: { start: T - 25 * DAY, end: T + 3 * DAY },
      beforeRows: rows(50, 70, 60), afterRows: rows(50, 70, 65),
    });
    expect(r.outcome).toBe(OUTCOME.OVERLAPPING_WINDOW);
    expect(r.after_pass_rate).toBeNull();
  });

  it('the refusal happens BEFORE any rate is computed, so no contaminated number is emitted', () => {
    const r = evaluateChange({
      sd_type: 'feature', before_threshold: 60, after_threshold: 65,
      beforeWindow: { start: T - 10 * DAY, end: T },
      afterWindow: { start: T - 1 * DAY, end: T + 5 * DAY },
      beforeRows: rows(40, 90, 60), afterRows: rows(40, 20, 65),
    });
    expect(r.outcome).toBe(OUTCOME.OVERLAPPING_WINDOW);
    expect(r.before_pass_rate).toBeNull();
  });

  it('cleanly separated windows are accepted — touching endpoints do not overlap', () => {
    // Applying the change at T splits [.., T) from [T, ..) with no shared instant. Without this the
    // refusal would reject the one comparison the SD actually wants.
    expect(windowsOverlap({ start: T - 7 * DAY, end: T }, { start: T, end: T + 7 * DAY })).toBe(false);
  });
});

describe('TS-4 — SEEDED: no post-change data reports INSUFFICIENT, never "unchanged"', () => {
  it('a tuned type with zero post-change assessments is INSUFFICIENT', () => {
    const r = evaluateChange({
      sd_type: 'refactor', before_threshold: 60, after_threshold: 65,
      beforeWindow: { start: T - 14 * DAY, end: T }, afterWindow: { start: T, end: T + DAY },
      beforeRows: rows(40, 82, 60), afterRows: [],
    });
    expect(r.outcome).toBe(OUTCOME.INSUFFICIENT);
    expect(r.after_pass_rate).toBeNull();
    expect(r.after_n).toBe(0);
  });

  it('below the floor is still INSUFFICIENT — a rate from 4 rows is not a measurement', () => {
    const r = evaluateChange({
      sd_type: 'refactor', before_threshold: 60, after_threshold: 65,
      beforeWindow: { start: T - 14 * DAY, end: T }, afterWindow: { start: T, end: T + DAY },
      beforeRows: rows(40, 82, 60), afterRows: rows(MIN_AFTER - 1, 82, 65),
    });
    expect(r.outcome).toBe(OUTCOME.INSUFFICIENT);
  });
});

describe('TS-5 — the measurement records its prediction and can contradict it', () => {
  it('a raised bar that lowers pass-rate matches the prediction', () => {
    const r = evaluateChange({
      sd_type: 'refactor', before_threshold: 60, after_threshold: 65,
      beforeWindow: { start: T - 14 * DAY, end: T }, afterWindow: { start: T, end: T + 7 * DAY },
      beforeRows: rows(40, 62, 60), afterRows: rows(40, 62, 65),
    });
    expect(r.outcome).toBe(OUTCOME.MEASURED);
    expect(r.before_pass_rate).toBe(100);
    expect(r.after_pass_rate).toBe(0);
    expect(r.contradicted).toBe(false);
  });

  it('a raised bar whose pass-rate RISES is flagged as contradicted, not averaged away', () => {
    // The population moved more than the bar did. That is a real and interesting outcome, and it must
    // surface per-type — a single blended number across four types would hide it entirely.
    const r = evaluateChange({
      sd_type: 'refactor', before_threshold: 60, after_threshold: 65,
      beforeWindow: { start: T - 14 * DAY, end: T }, afterWindow: { start: T, end: T + 7 * DAY },
      beforeRows: [...rows(20, 90, 60), ...rows(20, 10, 60)],
      afterRows: rows(40, 90, 65),
    });
    expect(r.outcome).toBe(OUTCOME.MEASURED);
    expect(r.contradicted).toBe(true);
  });

  it('a genuine measurement is produced when the windows are clean and the data is there', () => {
    // THE POSITIVE HALF: a checker that refused everything would pass every scenario above.
    const r = evaluateChange({
      sd_type: 'refactor', before_threshold: 60, after_threshold: 65,
      beforeWindow: { start: T - 14 * DAY, end: T }, afterWindow: { start: T, end: T + 7 * DAY },
      beforeRows: rows(30, 82, 60), afterRows: rows(30, 82, 65),
    });
    expect(r.outcome).toBe(OUTCOME.MEASURED);
    expect(r.after_pass_rate).toBe(100);
  });
});
