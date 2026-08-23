// QF-20260822-510 — joint Adam+Solomon ruling (operator commission 60153bf2): 8 gha_backed
// STANDARD_LOOPS entries drop their session-armed leg (GHA is now trusted as sole cadence);
// relay-drain and sms-relay-drain are DELIBERATELY EXCLUDED (chairman-lane carve-out, GHA
// copies measured degraded). This pins the ruling as data + behavior so a future edit can't
// silently re-arm a dropped loop or forget to tear one down.
import { describe, it, expect } from 'vitest';
import { STANDARD_LOOPS, parseArmedSet, renderLoops } from '../../scripts/coordinator-startup-check.mjs';

const DROPPED_KEYS = [
  'sweep', 'unranked-gauge', 'singleton-relaunch', 'relay-drop-gauge',
  'fleet-retro', 'row-growth', 'gauge-runner', 'feedback-sla',
];
const CARVE_OUT_KEYS = ['relay-drain', 'sms-relay-drain'];

function byKey(key) {
  const loop = STANDARD_LOOPS.find((l) => l.key === key);
  if (!loop) throw new Error(`STANDARD_LOOPS has no entry for key "${key}"`);
  return loop;
}

describe('QF-20260822-510 — session_arm:false ruling data', () => {
  it('all 8 dropped keys are gha_backed AND session_arm:false', () => {
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

  it('exactly 8 STANDARD_LOOPS entries carry session_arm:false', () => {
    const flagged = STANDARD_LOOPS.filter((l) => l.session_arm === false).map((l) => l.key);
    expect(flagged.sort()).toEqual([...DROPPED_KEYS].sort());
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
    expect(out).toMatch(/TEAR DOWN 8 standalone cron\(s\) dropped by QF-20260822-510/);
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
