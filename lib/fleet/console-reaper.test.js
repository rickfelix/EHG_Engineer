// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5b — death test + reap decision.

import { describe, it, expect, vi } from 'vitest';
import {
  isSeatDead,
  isConsoleReapable,
  reapEmptyConsoles,
  MIN_ACTIVITY_SAMPLE_GAP_MS,
} from './console-reaper.mjs';

const REAP_ON = { FLEET_CONSOLE_REAPER_ENABLED: 'on' };
const goodSample = (identical) => ({ ok: true, identical, intervalMs: MIN_ACTIVITY_SAMPLE_GAP_MS });

describe('FR5b-DEAD: both legs required, NEITHER sufficient', () => {
  it('dead only when absent from the image set AND last_tool_at did not move', () => {
    const r = isSeatDead({ absentFromClaudeImages: true, activitySample: goodSample(true) });
    expect(r).toMatchObject({ dead: true, legA: true, legB: true });
  });

  it('LEG A ALONE IS NOT ENOUGH — absent pid but the agent is still working', () => {
    const r = isSeatDead({ absentFromClaudeImages: true, activitySample: goodSample(false) });
    expect(r.dead).toBe(false);
    expect(r.why).toMatch(/advanced between samples/);
  });

  it('LEG B ALONE IS NOT ENOUGH — idle, but a live claude.exe still carries the pid', () => {
    const r = isSeatDead({ absentFromClaudeImages: false, activitySample: goodSample(true) });
    expect(r.dead).toBe(false);
    expect(r.why).toMatch(/live claude\.exe still carries this pid/);
  });

  it('an UNKNOWN leg is not a passing leg', () => {
    expect(isSeatDead({ absentFromClaudeImages: null, activitySample: goodSample(true) }).dead).toBe(false);
    expect(isSeatDead({ absentFromClaudeImages: true, activitySample: null }).dead).toBe(false);
  });

  it('a FAILED activity sample is not evidence of death', () => {
    // FR-1's primitive returns identical:false on failure precisely so it authorises nothing.
    const r = isSeatDead({ absentFromClaudeImages: true, activitySample: { ok: false, identical: false, intervalMs: MIN_ACTIVITY_SAMPLE_GAP_MS } });
    expect(r.dead).toBe(false);
    expect(r.why).toMatch(/unreadable sample is not evidence/);
  });

  it('samples closer than 10 minutes apart do not satisfy leg B', () => {
    const r = isSeatDead({ absentFromClaudeImages: true, activitySample: { ok: true, identical: true, intervalMs: 60_000 } });
    expect(r.dead).toBe(false);
    expect(r.why).toMatch(/less than 10 minutes apart/);
  });
});

describe('FR5b-REAPABLE: only a genuinely observed, genuinely empty console', () => {
  it('zero descendants is reapable', () => {
    expect(isConsoleReapable({ descendantCount: 0 }).reapable).toBe(true);
  });

  it('an occupied console is spared', () => {
    expect(isConsoleReapable({ descendantCount: 2 }).reapable).toBe(false);
  });

  it('A FAILED PROBE IS NOT AN EMPTY CONSOLE', () => {
    // The FR-5a defect in miniature: if a failed enumeration arrives here as zero, the reaper
    // reasons about a desktop it never saw.
    expect(isConsoleReapable({ descendantCount: 0, observed: false }).reapable).toBe(false);
    expect(isConsoleReapable({ descendantCount: undefined }).reapable).toBe(false);
  });
});

describe('FR5b-RECHECK: the pre-kill re-check is the safety mechanism, not the scan', () => {
  it('spares a console that GAINED a child between scan and kill', async () => {
    // The scan said empty; by kill time it has a process. Adam's executed reap did exactly
    // this and spared such consoles — it is why a stale scan cannot destroy work.
    const kill = vi.fn(async () => {});
    const r = await reapEmptyConsoles([{ pid: 101 }], {
      recheckDescendants: vi.fn(async () => ({ descendantCount: 1 })),
      kill, env: REAP_ON,
    });
    expect(kill).not.toHaveBeenCalled();
    expect(r.killed).toEqual([]);
    expect(r.spared[0].why).toMatch(/occupied/);
  });

  it('kills only what the re-check still finds empty', async () => {
    const kill = vi.fn(async () => {});
    const recheck = vi.fn(async (pid) => ({ descendantCount: pid === 202 ? 0 : 3 }));
    const r = await reapEmptyConsoles([{ pid: 202 }, { pid: 303 }], { recheckDescendants: recheck, kill, env: REAP_ON });
    expect(r.killed).toEqual([202]);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(r.spared.map((s) => s.pid)).toEqual([303]);
  });

  it('refuses to kill when the re-check itself fails', async () => {
    const kill = vi.fn(async () => {});
    const r = await reapEmptyConsoles([{ pid: 404 }], {
      recheckDescendants: vi.fn(async () => { throw new Error('wmi down'); }),
      kill, env: REAP_ON,
    });
    expect(kill).not.toHaveBeenCalled();
    expect(r.spared[0].why).toMatch(/refusing to kill on an unverified console/);
  });

  it('records a failed kill without aborting the sweep', async () => {
    const r = await reapEmptyConsoles([{ pid: 1 }, { pid: 2 }], {
      recheckDescendants: vi.fn(async () => ({ descendantCount: 0 })),
      kill: vi.fn(async (pid) => { if (pid === 1) throw new Error('access denied'); }), env: REAP_ON,
    });
    expect(r.failed).toEqual([{ pid: 1, error: 'access denied' }]);
    expect(r.killed).toEqual([2]); // the sweep continued
  });
});

describe('FR5b-EXCLUSIONS: the rejected signals stay rejected', () => {
  it('the module records WHY each excluded signal is excluded', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('./console-reaper.mjs', import.meta.url)), 'utf8');
    // SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 (UAT-agent finding, traced to feedback a64a6807,
    // 2026-07-28): the header names FIVE excluded signals, but this loop only greped four --
    // process.kill(pid,0) was silently unchecked, so an edit removing THAT SPECIFIC exclusion's
    // documentation would never fail this test. Restored to all five.
    for (const signal of ['heartbeat_at', 'is_alive', 'process_alive_at', 'process.kill(pid,0)', 'window presence']) {
      expect(src).toContain(signal);
    }
  });

  // SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 (UAT-agent finding): the ORIGINAL "none participate"
  // assertion passed heartbeat_at/is_alive as EXTRA keys alongside isSeatDead's real inputs -- JS
  // object destructuring silently drops unrecognized properties regardless of whether the
  // function's logic ever meant to read them, so that assertion could not fail for the reason it
  // existed (same class as this SD's own FR-4 resume_uuid guard, before it was widened). Replaced
  // with a genuine DIFFERENTIAL test: two calls identical except for the excluded fields must
  // produce an IDENTICAL verdict -- if isSeatDead ever started consulting one of them, the two
  // calls would diverge and this would fail.
  it('excluded signals genuinely have ZERO influence on the verdict (differential, not extra-keys-ignored)', () => {
    const base = { absentFromClaudeImages: true, activitySample: goodSample(true) };
    const withExcludedSignalsFresh = {
      ...base,
      heartbeat_at: new Date().toISOString(), // ticking NOW -- would flip a heartbeat-based verdict
      is_alive: true,
      process_alive_at: new Date().toISOString(),
    };
    const withExcludedSignalsStale = {
      ...base,
      heartbeat_at: '2000-01-01T00:00:00.000Z', // ancient -- would ALSO flip a heartbeat-based verdict, the other direction
      is_alive: false,
      process_alive_at: null,
    };
    const rFresh = isSeatDead(withExcludedSignalsFresh);
    const rStale = isSeatDead(withExcludedSignalsStale);
    const rBare = isSeatDead(base);
    expect(rFresh).toEqual(rBare);
    expect(rStale).toEqual(rBare);
  });
});

describe('FR5b-GATE: the flag is checked ON THE FUNCTION THAT KILLS', () => {
  it('refuses to kill when FLEET_CONSOLE_REAPER_ENABLED is unset, even with an empty console', async () => {
    // The runner checks the same flag, but a guard one level ABOVE the kill primitive holds only
    // while today's single caller remains the only one.
    const kill = vi.fn(async () => {});
    const r = await reapEmptyConsoles([{ pid: 1 }], {
      recheckDescendants: vi.fn(async () => ({ descendantCount: 0 })), kill, env: {},
    });
    expect(kill).not.toHaveBeenCalled();
    expect(r.refused).toMatch(/FLEET_CONSOLE_REAPER_ENABLED/);
  });
});
