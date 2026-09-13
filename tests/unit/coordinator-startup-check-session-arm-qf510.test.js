// QF-20260822-510 — joint Adam+Solomon ruling (operator commission 60153bf2): 8 gha_backed
// STANDARD_LOOPS entries drop their session-armed leg (GHA is now trusted as sole cadence);
// relay-drain and sms-relay-drain are DELIBERATELY EXCLUDED (chairman-lane carve-out, GHA
// copies measured degraded). This pins the ruling as data + behavior so a future edit can't
// silently re-arm a dropped loop or forget to tear one down.
//
// QF-20260830-100: `singleton-relaunch` was RETIRED entirely (removed from STANDARD_LOOPS,
// not merely re-armed) — its consumer half was never built and it fired 4x with zero
// relaunches, feeding false periodic-liveness escalations.
//
// QF-20260912-894: the header's own REVERSAL CONDITION triggered for 4 of the remaining 7
// dropped loops (gauge-runner, fleet-retro, relay-drop-gauge, unranked-gauge) — each measured
// well beyond 2x its declared GHA cadence. Their session_arm flipped back to true (see
// REVERSED_KEYS below). QF-894's own description also named singleton-relaunch as a 5th loop
// to re-arm, but that premise doesn't hold against current main: QF-20260830-100 already
// removed it from STANDARD_LOOPS entirely for an unrelated reason (no consumer, false
// escalations), so there is no session_arm field left to flip — re-adding the entry here would
// silently re-litigate that separate retirement under this ticket. DROPPED_KEYS now pins the
// remaining 3-member GHA-only set (sweep, row-growth, feedback-sla).
import { describe, it, expect } from 'vitest';
import { STANDARD_LOOPS, REVERSED_ON_QF894, parseArmedSet, renderLoops } from '../../scripts/coordinator-startup-check.mjs';

const DROPPED_KEYS = ['sweep', 'row-growth', 'feedback-sla'];
const REVERSED_KEYS = ['gauge-runner', 'fleet-retro', 'relay-drop-gauge', 'unranked-gauge'];
const CARVE_OUT_KEYS = ['relay-drain', 'sms-relay-drain'];

function byKey(key) {
  const loop = STANDARD_LOOPS.find((l) => l.key === key);
  if (!loop) throw new Error(`STANDARD_LOOPS has no entry for key "${key}"`);
  return loop;
}

describe('QF-20260822-510 — session_arm:false ruling data', () => {
  it('the 3 remaining dropped keys are gha_backed AND session_arm:false', () => {
    for (const key of DROPPED_KEYS) {
      const loop = byKey(key);
      expect(loop.gha_backed, `${key}.gha_backed`).toBe(true);
      expect(loop.session_arm, `${key}.session_arm`).toBe(false);
    }
  });

  it('the chairman-lane carve-out keys are NOT dropped (session_arm stays default/true)', () => {
    for (const key of CARVE_OUT_KEYS) {
      const loop = byKey(key);
      expect(loop.gha_backed, `${key}.gha_backed`).toBe(true);
      expect(loop.session_arm).not.toBe(false);
    }
  });

  it('exactly 3 STANDARD_LOOPS entries carry session_arm:false', () => {
    const flagged = STANDARD_LOOPS.filter((l) => l.session_arm === false).map((l) => l.key);
    expect(flagged.sort()).toEqual([...DROPPED_KEYS].sort());
  });

  it('singleton-relaunch has no STANDARD_LOOPS entry (QF-20260830-100 retirement stands)', () => {
    expect(STANDARD_LOOPS.find((l) => l.key === 'singleton-relaunch')).toBeUndefined();
  });
});

describe('QF-20260912-894 — session_arm reversal for 4 loops that breached the 2x threshold', () => {
  it('all 4 reversed keys are gha_backed AND session_arm:true', () => {
    for (const key of REVERSED_KEYS) {
      const loop = byKey(key);
      expect(loop.gha_backed, `${key}.gha_backed`).toBe(true);
      expect(loop.session_arm, `${key}.session_arm`).toBe(true);
    }
  });

  it('REVERSED_ON_QF894 exported set matches exactly the 4 reversed keys', () => {
    expect(REVERSED_ON_QF894.slice().sort()).toEqual([...REVERSED_KEYS].sort());
  });

  it('renderLoops marks each reversed key as re-armed, not gha-only', () => {
    const none = parseArmedSet([], {});
    const out = renderLoops(none);
    for (const key of REVERSED_KEYS) {
      expect(out).not.toContain(`[⏸ gha-only] ${key}`);
      expect(out).toMatch(new RegExp(`${key}\\s+.*\\[🔄 re-armed QF-20260912-894\\]`));
    }
  });
});

describe('QF-20260822-510 — renderLoops respects session_arm:false', () => {
  it('never recommends CronCreate for a dropped loop, even when nothing is armed', () => {
    const none = parseArmedSet([], {});
    const out = renderLoops(none);
    for (const key of DROPPED_KEYS) {
      const loop = byKey(key);
      expect(out.includes(loop.prompt), `${key}.prompt must not appear as a CronCreate target`).toBe(false);
      expect(out).toContain(`[⏸ gha-only] ${key}`);
    }
  });

  it('recommends tearing down a dropped loop found LIVE (session cron left over from before the ruling)', () => {
    const armed = parseArmedSet(['--armed', DROPPED_KEYS.map((k) => byKey(k).script).join(',')], {});
    const out = renderLoops(armed);
    expect(out).toMatch(/TEAR DOWN 3 standalone cron\(s\) dropped by QF-20260822-510/);
    for (const key of DROPPED_KEYS) {
      const loop = byKey(key);
      expect(out).toContain(`CronDelete <prompt: ${JSON.stringify(loop.prompt)}>`);
    }
  });

  it('does not disturb the carve-out keys — they still render as normal armable loops', () => {
    const none = parseArmedSet([], {});
    const out = renderLoops(none);
    for (const key of CARVE_OUT_KEYS) {
      const loop = byKey(key);
      expect(out.includes(loop.prompt), `${key}.prompt should still be CronCreate-able`).toBe(true);
    }
  });
});
