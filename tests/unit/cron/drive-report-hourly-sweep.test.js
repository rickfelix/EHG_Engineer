// SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 — tests for the hourly-cadence sibling sweep.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import {
  hourlyWindowKey, runDriveReportHourlySweep, HOURLY_SD_KEY, HOURLY_ACTIVATION_TRIGGER,
  HOURLY_EXPECTED_INTERVAL_SECONDS, HOURLY_PROCESS_KEY,
} from '../../../scripts/cron/drive-report-hourly-sweep.mjs';
import { windowKey } from '../../../scripts/cron/drive-report-sweep.mjs';

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
    const calls = { produce: [], register: [], log: [] };
    return {
      calls,
      gather: vi.fn(async () => ({ sections: {}, driveScore: {} })),
      produce: vi.fn(async (args) => { calls.produce.push(args); return produceResult; }),
      persist: vi.fn(async () => ({ id: 'r1' })),
      register: vi.fn(async (opts) => { calls.register.push(opts); return registerResult; }),
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

  it('a table-absent block is reported, not thrown', async () => {
    const s = makeStubs({ produceResult: { id: null, blocked: true } });
    const out = await runDriveReportHourlySweep({ nowMs: NOW, ...s });
    expect(out.ran).toBe(true);
    expect(out.blocked).toBe('table_absent');
  });

  it('works with no register/findExisting injected (both optional)', async () => {
    const s = makeStubs();
    delete s.register;
    delete s.findExisting;
    const out = await runDriveReportHourlySweep({ nowMs: NOW, gather: s.gather, produce: s.produce, persist: s.persist, log: s.log });
    expect(out.ran).toBe(true);
  });
});

describe('[SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-6, AC-3] CLI wiring: capacityRunId is the HOURLY key, never the daily one', () => {
  // A behavioural test would need to stub the whole gather()/leg4 chain to observe capacityRunId,
  // which is only ever constructed inside the CLI (isMainModule) block. This asserts the wiring
  // statically instead, mirroring this repo's own drive-report-wiring.test.js pattern for exactly
  // this class of "is the CLI edge wired to the right function" concern — the discriminating
  // regression here is a future edit that reintroduces windowKey(cliNowMs) (the DAILY key) for
  // capacityRunId, which would silently accumulate duplicate belt_capacity_verdicts rows (no
  // unique constraint on run_id there) without ever throwing or failing a behavioural test.
  const source = readFileSync(join(ROOT, 'scripts/cron/drive-report-hourly-sweep.mjs'), 'utf8');

  it('capacityRunId is derived from hourlyWindowKey(cliNowMs)', () => {
    expect(source).toMatch(/capacityRunId\s*=\s*hourlyWindowKey\(cliNowMs\)/);
  });

  it('[NEGATIVE CONTROL] the daily windowKey is never IMPORTED (executable usage, not this file\'s own prose explaining why)', () => {
    // The header comments explain the design decision by NAME-DROPPING windowKey() in prose,
    // which a bare word-boundary scan would also match — this checks the import statement
    // specifically, the actual executable-usage signal, not the explanatory text about it.
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/import\s*\{[^}]*\bwindowKey\b[^}]*\}\s*from\s*['"]\.\/drive-report-sweep\.mjs['"]/);
  });
});
