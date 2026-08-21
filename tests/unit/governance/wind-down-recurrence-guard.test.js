// SD-LEO-INFRA-WIND-DOWN-SURVEY-001 (FR-3, TS-7): the recurrence guard must trip on a
// flat/rising trend vs. the ship-time baseline and pass on a declining trend — never on a fixed
// absolute threshold, per TESTING evidence (sub_agent_execution_results 143b8c17-d017-4982-b0ab-02532ec87daa)
// on the expected multi-day, multi-worktree rollout tail.
import { describe, it, expect } from 'vitest';
import { evaluateWindDownRecurrence, SHIP_TIME_BASELINE_COUNT_24H } from '../../../lib/governance/wind-down-recurrence-guard.js';

describe('evaluateWindDownRecurrence (SD-LEO-INFRA-WIND-DOWN-SURVEY-001 FR-3)', () => {
  it('passes (not alarmed) on a declining trend vs. baseline', () => {
    const v = evaluateWindDownRecurrence({ baselineCount: 206, trailingCount: 50 });
    expect(v.alarmed).toBe(false);
    expect(v.reason).toMatch(/converging as expected/);
  });

  it('alarms on a flat trend vs. baseline (no decline at all)', () => {
    const v = evaluateWindDownRecurrence({ baselineCount: 206, trailingCount: 206 });
    expect(v.alarmed).toBe(true);
    expect(v.reason).toMatch(/recurrence suspected/);
  });

  it('alarms on a rising trend vs. baseline', () => {
    const v = evaluateWindDownRecurrence({ baselineCount: 206, trailingCount: 300 });
    expect(v.alarmed).toBe(true);
  });

  it('does NOT alarm on a small trailing count even without a recorded baseline, if below the fallback floor', () => {
    const v = evaluateWindDownRecurrence({ baselineCount: 0, trailingCount: 3 });
    expect(v.alarmed).toBe(false);
    expect(v.reason).toMatch(/no recorded baseline/);
  });

  it('alarms on an unexplained trailing count above the fallback floor when there is no baseline', () => {
    const v = evaluateWindDownRecurrence({ baselineCount: 0, trailingCount: 40 });
    expect(v.alarmed).toBe(true);
  });

  it('a custom fallbackFloor is honored', () => {
    const v = evaluateWindDownRecurrence({ baselineCount: undefined, trailingCount: 12, fallbackFloor: 20 });
    expect(v.alarmed).toBe(false);
  });

  it('treats invalid trailingCount as insufficient data, never alarmed', () => {
    expect(evaluateWindDownRecurrence({ baselineCount: 206, trailingCount: NaN }).alarmed).toBe(false);
    expect(evaluateWindDownRecurrence({ baselineCount: 206, trailingCount: -1 }).alarmed).toBe(false);
    expect(evaluateWindDownRecurrence({ baselineCount: 206, trailingCount: undefined }).alarmed).toBe(false);
  });

  it('SHIP_TIME_BASELINE_COUNT_24H is the live-measured value recorded at FR-1 ship time', () => {
    expect(SHIP_TIME_BASELINE_COUNT_24H).toBe(206);
  });

  it('exactly-zero trailing count against a real baseline is a pass (fully converged)', () => {
    const v = evaluateWindDownRecurrence({ baselineCount: 206, trailingCount: 0 });
    expect(v.alarmed).toBe(false);
  });
});
