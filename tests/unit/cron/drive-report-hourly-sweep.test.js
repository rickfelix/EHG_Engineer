// SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 — tests for the hourly-cadence sibling sweep.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import {
  hourlyWindowKey, runDriveReportHourlySweep, HOURLY_SD_KEY, HOURLY_ACTIVATION_TRIGGER,
  HOURLY_EXPECTED_INTERVAL_SECONDS, HOURLY_PROCESS_KEY,
} from '../../../scripts/cron/drive-report-hourly-sweep.mjs';
import { windowKey, buildGather } from '../../../scripts/cron/drive-report-sweep.mjs';
import { LAST_RUN_FIELD } from '../../../lib/drive-loop/report-posture.js';
import { assertProducedLegsMatchSSOT, RATIFIED_LEG_IDS } from '../../../lib/drive-loop/score/drive-score-legs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('hourlyWindowKey — UTC-derived, DST-immune idempotence key', () => {
  it('produces the expected format', () => {
    // 2026-08-13T05:23:11.000Z
    expect(hourlyWindowKey(Date.UTC(2026, 7, 13, 5, 23, 11))).toBe('drive-hourly-2026-08-13T05');
  });

  it('refuses a non-finite clock rather than inventing one', () => {
    expect(() => hourlyWindowKey(undefined)).toThrow(/nowMs must be a finite number/);
    expect(() => hourlyWindowKey(NaN)).toThrow(/nowMs must be a finite number/);
  });

  it('is disjoint from the daily windowKey() format at every hour of a full day', () => {
    for (let h = 0; h < 24; h++) {
      const t = Date.UTC(2026, 7, 13, h, 0, 0);
      const hourly = hourlyWindowKey(t);
      const daily = windowKey(t);
      expect(hourly).not.toBe(daily);
      // Structural disjointness, not just today's accidental non-equality: the hourly scheme
      // always contains 'hourly' and 'T', which the daily scheme never does.
      expect(hourly).toContain('hourly');
      expect(hourly).toMatch(/T\d{2}$/);
      expect(daily).not.toContain('hourly');
      expect(daily).not.toMatch(/T\d{2}$/);
    }
  });

  it('[PROPERTY] every distinct UTC hour across a full day produces a distinct key', () => {
    const keys = new Set();
    for (let h = 0; h < 24; h++) {
      keys.add(hourlyWindowKey(Date.UTC(2026, 7, 13, h, 0, 0)));
    }
    expect(keys.size).toBe(24);
  });

  it('[PROPERTY, DST FALL-BACK] two real instants that map to the SAME ET wall-clock hour (01:00 ET, repeated on fall-back) still produce DIFFERENT UTC-derived keys', () => {
    // US DST fall-back 2026: clocks fall back at 02:00 EDT -> 01:00 EST on 2026-11-01. The two
    // real instants both read as "1am ET" on the wall clock, one hour apart in real time. A
    // naive ET-wall-clock-hour key would collide here; the UTC-derived key must not.
    const firstOneAmEt = Date.UTC(2026, 10, 1, 5, 30, 0);  // 05:30 UTC = 01:30 EDT (UTC-4)
    const secondOneAmEt = Date.UTC(2026, 10, 1, 6, 30, 0); // 06:30 UTC = 01:30 EST (UTC-5), the repeated hour
    expect(firstOneAmEt).not.toBe(secondOneAmEt);
    const k1 = hourlyWindowKey(firstOneAmEt);
    const k2 = hourlyWindowKey(secondOneAmEt);
    expect(k1).not.toBe(k2);
  });

  it('[PROPERTY] consecutive hourly ticks across a simulated DST fall-back day never collide', () => {
    // 48 consecutive hourly ticks starting the day before fall-back, covering the transition.
    const start = Date.UTC(2026, 9, 31, 0, 0, 0);
    const keys = [];
    for (let i = 0; i < 48; i++) keys.push(hourlyWindowKey(start + i * 3_600_000));
    expect(new Set(keys).size).toBe(48);
  });
});

describe('runDriveReportHourlySweep — orchestration', () => {
  const NOW = Date.UTC(2026, 7, 13, 5, 0, 0);

  function makeStubs({ produceResult = { written: true, id: 'r1' }, registerResult = { ok: true } } = {}) {
    const calls = { produce: [], register: [], stamp: [], order: [], log: [] };
    return {
      calls,
      gather: vi.fn(async () => ({ sections: {}, driveScore: {} })),
      produce: vi.fn(async (args) => { calls.produce.push(args); return produceResult; }),
      persist: vi.fn(async () => ({ id: 'r1' })),
      register: vi.fn(async (opts) => { calls.register.push(opts); calls.order.push('register'); return registerResult; }),
      stamp: vi.fn(async (opts) => { calls.stamp.push(opts); calls.order.push('stamp'); }),
      findExisting: vi.fn(async () => null),
      log: (m) => calls.log.push(m),
    };
  }

  it('rejects when produce, gather, or persist are not injected', async () => {
    await expect(runDriveReportHourlySweep({ nowMs: NOW })).rejects.toThrow(/must be injected/);
  });

  it('derives run_id from hourlyWindowKey(nowMs), never a per-fire id', async () => {
    const s = makeStubs();
    await runDriveReportHourlySweep({ nowMs: NOW, ...s });
    expect(s.calls.produce[0].runId).toBe(hourlyWindowKey(NOW));
  });

  it('passes cadence="hourly" to produce — never "scheduled"', async () => {
    const s = makeStubs();
    await runDriveReportHourlySweep({ nowMs: NOW, ...s });
    expect(s.calls.produce[0].cadence).toBe('hourly');
  });

  it('registers with THIS sweep\'s own identity, not the daily sweep\'s', async () => {
    const s = makeStubs();
    await runDriveReportHourlySweep({ nowMs: NOW, ...s });
    expect(s.calls.register[0]).toEqual({
      activationTrigger: HOURLY_ACTIVATION_TRIGGER,
      expectedIntervalSeconds: HOURLY_EXPECTED_INTERVAL_SECONDS,
    });
    expect(HOURLY_EXPECTED_INTERVAL_SECONDS).toBe(3600);
    expect(HOURLY_SD_KEY).not.toBe('SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B');
    expect(HOURLY_PROCESS_KEY).toBeTruthy();
  });

  it('a registration failure does not block the report — the report matters more than its bookkeeping', async () => {
    const s = makeStubs({ registerResult: { ok: false, error: 'boom' } });
    const out = await runDriveReportHourlySweep({ nowMs: NOW, ...s });
    expect(out.ran).toBe(true);
    expect(s.calls.log.some((m) => m.includes('registration failed'))).toBe(true);
  });

  it('a table-absent block is reported, not thrown, and the alarm must stay armed — no stamp', async () => {
    const s = makeStubs({ produceResult: { id: null, blocked: true } });
    const out = await runDriveReportHourlySweep({ nowMs: NOW, ...s });
    expect(out.ran).toBe(true);
    expect(out.blocked).toBe('table_absent');
    expect(s.calls.stamp, 'a blocked run wrote nothing — stamping it would report healthy while no report exists').toHaveLength(0);
  });

  it('works with no register/findExisting/stamp injected (all optional)', async () => {
    const s = makeStubs();
    delete s.register;
    delete s.findExisting;
    delete s.stamp;
    const out = await runDriveReportHourlySweep({ nowMs: NOW, gather: s.gather, produce: s.produce, persist: s.persist, log: s.log });
    expect(out.ran).toBe(true);
  });
});

describe('runDriveReportHourlySweep — the stamp is what lets the liveness alarm CLEAR (SECURITY sub-agent finding)', () => {
  // Without this coverage the sweep can produce a report every single hour while
  // periodic-liveness-watcher.mjs reports it permanently OVERDUE, because
  // registerArmedMachinery upserts last_fired_at: null and nothing ever advances it off NULL.
  const NOW = Date.UTC(2026, 7, 13, 5, 0, 0);

  function makeStubs({ produceResult = { written: true, id: 'r1' }, registerResult = { ok: true } } = {}) {
    const calls = { produce: [], register: [], stamp: [], order: [], log: [] };
    return {
      calls,
      gather: vi.fn(async () => ({ sections: {}, driveScore: {} })),
      produce: vi.fn(async (args) => { calls.produce.push(args); return produceResult; }),
      persist: vi.fn(async () => ({ id: 'r1' })),
      register: vi.fn(async (opts) => { calls.register.push(opts); calls.order.push('register'); return registerResult; }),
      stamp: vi.fn(async (opts) => { calls.stamp.push(opts); calls.order.push('stamp'); }),
      findExisting: vi.fn(async () => null),
      log: (m) => calls.log.push(m),
    };
  }

  it('[ORDER] registers BEFORE stamping — reversed, registerArmedMachinery\'s null upsert erases the stamp', async () => {
    const s = makeStubs();
    await runDriveReportHourlySweep({ nowMs: NOW, ...s });
    expect(s.calls.order).toEqual(['register', 'stamp']);
  });

  it('stamps with THIS sweep\'s own process key and the shared LAST_RUN_FIELD constant', async () => {
    const s = makeStubs();
    await runDriveReportHourlySweep({ nowMs: NOW, ...s });
    expect(s.calls.stamp).toHaveLength(1);
    expect(s.calls.stamp[0].processKey).toBe(HOURLY_PROCESS_KEY);
    expect(s.calls.stamp[0].field).toBe(LAST_RUN_FIELD);
    expect(s.calls.stamp[0].field).toBe('last_fired_at');
    expect(s.calls.stamp[0].at).toBe(new Date(NOW).toISOString());
  });

  it('stamps on already_produced too — otherwise every tick after the first re-arms the alarm', async () => {
    const s = makeStubs({ produceResult: { written: false, skipped: 'already_produced', id: 'r1' } });
    await runDriveReportHourlySweep({ nowMs: NOW, ...s });
    expect(s.calls.stamp, 'a report already existing for this window is HEALTHY, not "did not run"').toHaveLength(1);
  });

  it('does NOT stamp when the producer throws — a failed run must leave the alarm armed', async () => {
    const s = makeStubs();
    s.produce = vi.fn(async () => { throw new Error('boom'); });
    await expect(runDriveReportHourlySweep({ nowMs: NOW, ...s })).rejects.toThrow('boom');
    expect(s.calls.stamp).toHaveLength(0);
  });

  it('[TWO-SIDED] a genuinely successful run DOES stamp', async () => {
    // Pairs with the blocked/throw tests above — without this, a guard that never stamped would
    // pass both negative tests while permanently leaving the alarm stuck on.
    const s = makeStubs();
    const out = await runDriveReportHourlySweep({ nowMs: NOW, ...s });
    expect(out.ran).toBe(true);
    expect(s.calls.stamp).toHaveLength(1);
  });
});

describe('[SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-6, AC-3] CLI wiring: capacityRunId is the HOURLY key, never the daily one', () => {
  // The CLI's own construction of capacityRunId (isMainModule block) is only reachable statically
  // — asserted here, mirroring this repo's own drive-report-wiring.test.js pattern. The behavioural
  // proof that 3 real ticks resolve to 3 real distinct persisted run_ids lives in the FR-6 AC-3
  // describe block below, which drives the real buildGather()/scoreCapacityLeg() pipeline directly
  // rather than the CLI block itself.
  const source = readFileSync(join(ROOT, 'scripts/cron/drive-report-hourly-sweep.mjs'), 'utf8');

  it('capacityRunId is derived from hourlyWindowKey(cliNowMs)', () => {
    expect(source).toMatch(/capacityRunId\s*=\s*hourlyWindowKey\(cliNowMs\)/);
  });

  it('capacityRunId is actually PASSED to buildGather(), not just computed and discarded', () => {
    // VALIDATION sub-agent finding: the assertion above proves the variable's own assignment, but
    // neither it nor the behavioural block below asserts buildGather({...}) is called WITH it —
    // drop the property from that call and both would still pass while it silently defaults to
    // null (buildGather's own default), which is exactly the FR-6 AC-3 regression this SD exists
    // to prevent.
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codeOnly).toMatch(/buildGather\(\{[\s\S]{0,400}?capacityRunId,/);
  });

  it('[NEGATIVE CONTROL] the daily windowKey is never IMPORTED (executable usage, not this file\'s own prose explaining why)', () => {
    // The header comments explain the design decision by NAME-DROPPING windowKey() in prose,
    // which a bare word-boundary scan would also match — this checks the import statement
    // specifically, the actual executable-usage signal, not the explanatory text about it.
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/import\s*\{[^}]*\bwindowKey\b[^}]*\}\s*from\s*['"]\.\/drive-report-sweep\.mjs['"]/);
  });
});

// Shared by the two behavioural blocks below. Mirrors drive-report-sweep.test.js's own
// `realGather` helper (same fixture status shape) so the hourly path is exercised through the
// SAME buildGather()/scoreCapacityLeg() pipeline the daily sweep already proves end-to-end —
// not a second, parallel test double. capacityRunId is hourlyWindowKey(nowMs), matching the real
// CLI wiring asserted statically above.
const HOURLY_STATUS = { open_total: 1, next: [], next_truncated: false, done: [], slipped: [] };
function stubHourlyGather(nowMs, { persistVerdict = async () => ({ id: 'v1' }) } = {}) {
  return buildGather({
    supabase: {}, computePlanCheckStatus: async () => HOURLY_STATUS,
    gatherCapacity: async () => ({ idleNow: 1, freeingSoon: 0, claimableCount: 0, openQfCount: 0 }),
    persistVerdict,
    capacityRunId: hourlyWindowKey(nowMs),
    runGitLog: () => [], // HOURLY_STATUS.done is [] — never invoked, mandatory injection only.
    readLeg2Cohort: async () => null, // no ranked cohort in this fixture world — leg2 unavailable.
    nowMs,
    // SD-LEO-INFRA-DRIVE-SCORE-PER-001 (FR-3): mandatory injection. Resolves whatever it is asked,
    // because none of this file's assertions is about citation resolution — the control's real
    // semantics are pinned in tests/unit/drive-loop/score/verify-leg-citations.test.js.
    resolveRows: async (_table, ids) => ids,
  });
}

describe('[SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-3 AC-1] the hourly gather() output is pinned to the ratified 3-leg SSOT', () => {
  // buildGather() is reused verbatim from the daily sweep (PRD TR-1) — this is not a new leg-
  // scoring path, but FR-3 asks for a SECOND invocation-site assertion specifically at the hourly
  // path's own consumption of it, following the existing drive-score-legs.test.js pattern. The
  // regression this catches: a future edit adds/drops a leg inside buildGather() without noticing
  // the hourly caller also depends on the produced set exactly matching RATIFIED_LEG_IDS.
  it('measured_legs + unavailable_legs together equal RATIFIED_LEG_IDS, never more, never fewer', async () => {
    const gather = stubHourlyGather(Date.UTC(2026, 6, 15, 10, 0, 0)); // 06:00 ET
    const { driveScore } = await gather();
    const producedLegIds = [...driveScore.measured_legs.map((m) => m.leg), ...driveScore.unavailable_legs.map((u) => u.leg)];

    expect(() => assertProducedLegsMatchSSOT(producedLegIds)).not.toThrow();
    expect(new Set(producedLegIds)).toEqual(new Set(RATIFIED_LEG_IDS));
    expect(producedLegIds).toHaveLength(RATIFIED_LEG_IDS.length);
  });

  it('[POSITIVE CONTROL] a leg dropped from the produced set is NOT silently accepted', () => {
    // Proves the assertion above is load-bearing, not vacuous — mirrors the existing POSITIVE
    // CONTROL pattern in drive-score-legs.test.js, applied to this file's own import of the guard.
    const missingOne = RATIFIED_LEG_IDS.slice(1);
    expect(() => assertProducedLegsMatchSSOT(missingOne)).toThrow(/DRIVE_SCORE_LEG_SET_DRIFT/);
  });
});

describe('[SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-6 AC-3] three consecutive hourly ticks write three distinct capacity-verdict run_ids', () => {
  // Without this, capacityRunId reverting to a shared/daily key would silently accumulate
  // duplicate belt_capacity_verdicts rows under one run_id every hour — no unique constraint on
  // run_id there to catch it, and the static wiring test above only proves the CLI's assignment
  // expression, not that three real ticks actually resolve to three real distinct values.
  it('persistVerdict receives 3 distinct run_ids across 3 consecutive hourly ticks in the same ET day', async () => {
    const seenRunIds = [];
    const persistVerdict = async (row) => { seenRunIds.push(row.run_id); return { id: 'v1' }; };

    const ticks = [
      Date.UTC(2026, 6, 15, 9, 0, 0),  // 05:00 ET
      Date.UTC(2026, 6, 15, 10, 0, 0), // 06:00 ET
      Date.UTC(2026, 6, 15, 11, 0, 0), // 07:00 ET
    ];
    for (const nowMs of ticks) {
      await stubHourlyGather(nowMs, { persistVerdict })();
    }

    expect(seenRunIds).toHaveLength(3);
    expect(new Set(seenRunIds).size, 'all 3 must be distinct — not 1 shared key').toBe(3);
    expect(seenRunIds).toEqual(ticks.map((t) => hourlyWindowKey(t)));
  });
});
