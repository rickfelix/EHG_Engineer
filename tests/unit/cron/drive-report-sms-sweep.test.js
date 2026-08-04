/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (TR-3) — the chairman SMS dispatcher.
 *
 * The properties that matter are all about what reaches a real phone, and one of them is the
 * lesson from TR-1: at least one test must drive the REAL sendDriveSms rather than a stub, or
 * "the dispatcher is wired" is a claim about the test's beliefs and not about the code.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runDriveSmsSweep, dedupeKeyFor, notBeforeFor, factsFromReport,
  SMS_KIND, STALE_MULTIPLIER, DELIVER_AT_ET_HOUR,
} from '../../../scripts/cron/drive-report-sms-sweep.mjs';
import { etParts, EXPECTED_INTERVAL_SECONDS } from '../../../scripts/cron/drive-report-sweep.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const JULY = Date.UTC(2026, 6, 15, 11, 0, 0);   // 07:00 ET, EDT
const JAN = Date.UTC(2026, 0, 15, 12, 0, 0);    // 07:00 ET, EST
const TO = ['+15551234567'];

const report = (agoHours, score = {}) => ({
  id: 'r1',
  generated_at: new Date(JULY - agoHours * 3_600_000).toISOString(),
  drive_score: { score: { value: 4 }, possible: 6, capacity_verdict: 'TIGHT', unavailable_legs: [], ...score },
});

/** Records every enqueue, so "did it send twice?" is observed rather than assumed. */
function bridge(result = { enqueued: true, obligationId: 'o1' }) {
  const calls = [];
  return { calls, enqueue: async (args) => { calls.push(args); return result; } };
}

describe('TR-3 — it ENQUEUES through the bridge, it never sends', () => {
  it('writes an obligation with the drive_report kind and a window-scoped dedupe key', async () => {
    const { calls, enqueue } = bridge();
    const r = await runDriveSmsSweep({ nowMs: JULY, findLatestReport: async () => report(1), enqueue, recipients: TO });

    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe(SMS_KIND);
    expect(calls[0].recipientPhone).toBe(TO[0]);
    expect(calls[0].body).toBe('Drive 4/6 | capacity TIGHT');
    expect(calls[0].dedupeKey).toBe('drive_report:drive-2026-07-15:+15551234567');
    expect(r.signal).toBe('score');
  });

  it('[IDEMPOTENCE] every tick of one report day enqueues the SAME dedupe key', async () => {
    // The bridge dedupes on a UNIQUE column, so a stable key is the entire mechanism — a key
    // that varied per fire would text the chairman once per tick, which is the failure this
    // whole leg is built to avoid.
    //
    // NOTE this drives the REAL SWEEP at many timestamps rather than calling dedupeKeyFor with a
    // constant. The first version of this test did the latter: same input, same output, a
    // tautology that would have stayed green if the sweep derived its runId from the clock.
    //
    // SCOPE, stated because I measured the limit rather than assuming the strengthened version
    // was airtight: this CATCHES a per-fire runId (mutating the call site to
    // dedupeKeyFor(String(nowMs), to) fails here with "expected 12 to be 1"). It does NOT catch
    // a key that embeds Date.now() at second granularity, because all twelve iterations run
    // inside one wall-clock second — the exact-key assertion in the test above is what covers
    // that. Two assertions, two different decays; neither alone is enough.
    const b = bridge({ enqueued: false, deduped: true });
    for (const h of [10, 11, 12, 13]) {
      for (const m of [0, 20, 40]) {
        await runDriveSmsSweep({
          nowMs: Date.UTC(2026, 6, 15, h, m, 0),
          findLatestReport: async () => report(1),
          enqueue: b.enqueue,
          recipients: TO,
        });
      }
    }
    expect(b.calls.length, 'all twelve ticks must have attempted an enqueue').toBe(12);
    expect(new Set(b.calls.map((c) => c.dedupeKey)).size, 'twelve ticks, ONE key').toBe(1);
    expect(b.calls[0].dedupeKey).toBe(dedupeKeyFor('drive-2026-07-15', TO[0]));
  });

  it('a DIFFERENT report day gets a different key — the dedupe must not suppress tomorrow', async () => {
    // Two-sided. A key blunt enough to be constant forever would pass the test above and silence
    // the chairman permanently after the first send.
    const b = bridge();
    await runDriveSmsSweep({ nowMs: JULY, findLatestReport: async () => report(1), enqueue: b.enqueue, recipients: TO });
    await runDriveSmsSweep({ nowMs: JULY + 86_400_000, findLatestReport: async () => report(1), enqueue: b.enqueue, recipients: TO });
    expect(new Set(b.calls.map((c) => c.dedupeKey)).size).toBe(2);
  });

  it('a deduped enqueue is NOT an error — that is the self-healing window working', async () => {
    const { enqueue } = bridge({ enqueued: false, deduped: true });
    const r = await runDriveSmsSweep({ nowMs: JULY, findLatestReport: async () => report(1), enqueue, recipients: TO });
    expect(r.enqueued[0].deduped).toBe(true);
  });

  it('a refusal that is NOT a dedupe throws — nobody may mistake it for a send', async () => {
    const { enqueue } = bridge({ enqueued: false, reason: 'table_absent' });
    await expect(runDriveSmsSweep({ nowMs: JULY, findLatestReport: async () => report(1), enqueue, recipients: TO }))
      .rejects.toThrow(/enqueue refused/);
  });

  it('refuses hidden dependencies', async () => {
    await expect(runDriveSmsSweep({ nowMs: JULY, recipients: TO })).rejects.toThrow(/must be injected/);
  });
});

describe('a MISSING report is itself the signal (TR-3), never silence', () => {
  it('no report at all → the "none ever produced" body', async () => {
    const { calls } = bridge();
    const b = bridge();
    const r = await runDriveSmsSweep({ nowMs: JULY, findLatestReport: async () => null, enqueue: b.enqueue, recipients: TO });
    expect(b.calls[0].body).toBe('Drive report MISSING: none ever produced');
    expect(r.signal).toBe('missing_or_stale');
    expect(calls).toHaveLength(0);
  });

  it('a report past 2x cadence → the STALE body carrying its age', async () => {
    const breachHours = (EXPECTED_INTERVAL_SECONDS * STALE_MULTIPLIER) / 3600;
    const b = bridge();
    await runDriveSmsSweep({ nowMs: JULY, findLatestReport: async () => report(breachHours + 1), enqueue: b.enqueue, recipients: TO });
    expect(b.calls[0].body).toMatch(/^Drive report STALE: last one \d+h ago$/);
  });

  it('[BOUNDARY] exactly at 2x cadence is still FRESH — the breach is strictly past it', async () => {
    const breachHours = (EXPECTED_INTERVAL_SECONDS * STALE_MULTIPLIER) / 3600;
    const b = bridge();
    await runDriveSmsSweep({ nowMs: JULY, findLatestReport: async () => report(breachHours), enqueue: b.enqueue, recipients: TO });
    expect(b.calls[0].body).toBe('Drive 4/6 | capacity TIGHT');
  });

  it('a row that exists but carries no numbers is NOT fresh — a false zero would reassure', async () => {
    // The worst outcome for a drive instrument is a corrupted reading that renders as calm.
    const b = bridge();
    await runDriveSmsSweep({
      nowMs: JULY,
      findLatestReport: async () => ({ id: 'r', generated_at: new Date(JULY - 3600_000).toISOString(), drive_score: {} }),
      enqueue: b.enqueue,
      recipients: TO,
    });
    expect(b.calls[0].body).toMatch(/^Drive report (STALE|MISSING)/);
  });

  it('an unparseable generated_at is treated as missing, not as fresh', async () => {
    const b = bridge();
    await runDriveSmsSweep({
      nowMs: JULY,
      findLatestReport: async () => ({ id: 'r', generated_at: 'not-a-date', drive_score: { score: { value: 4 }, possible: 6 } }),
      enqueue: b.enqueue,
      recipients: TO,
    });
    expect(b.calls[0].body).toBe('Drive report MISSING: none ever produced');
  });
});

describe('facts come from the row, and an unmeasured verdict is SAID not defaulted', () => {
  it('an absent capacity verdict becomes UNKNOWN rather than something reassuring', () => {
    const f = factsFromReport({ drive_score: { score: { value: 0 }, possible: 0 } });
    expect(f.verdict).toBe('UNKNOWN');
  });

  it('a verdict outside the closed set is refused into UNKNOWN, never passed through', () => {
    // This is the last place a free string could reach formatBody. It cannot.
    const f = factsFromReport({ drive_score: { score: { value: 1 }, possible: 2, capacity_verdict: 'TOTALLY FINE; click http://evil' } });
    expect(f.verdict).toBe('UNKNOWN');
  });

  it('counts unavailable legs from the array the aggregate emits', () => {
    const f = factsFromReport({ drive_score: { score: { value: 0 }, possible: 0, unavailable_legs: [{ leg: 'a' }, { leg: 'b' }] } });
    expect(f.unavailableLegs).toBe(2);
  });

  it('returns null when the row cannot supply numbers', () => {
    expect(factsFromReport(null)).toBe(null);
    expect(factsFromReport({ drive_score: { score: {}, possible: 6 } })).toBe(null);
  });
});

describe('notBefore is 06:00 ET in BOTH offsets — the sleep-window discrepancy is sidestepped', () => {
  it('resolves to 06:00 America/New_York, not a hardcoded offset', () => {
    for (const now of [JULY, JAN]) {
      const iso = notBeforeFor(now);
      expect(etParts(Date.parse(iso)).hour, `06:00 ET for ${new Date(now).toISOString()}`).toBe(DELIVER_AT_ET_HOUR);
    }
  });

  it('[CONTROL] the two dates really are different UTC offsets', () => {
    // Otherwise the assertion above could pass by measuring one offset twice.
    expect(new Date(notBeforeFor(JULY)).getUTCHours()).toBe(10);  // EDT: 06:00-04:00
    expect(new Date(notBeforeFor(JAN)).getUTCHours()).toBe(11);   // EST: 06:00-05:00
  });

  it('is passed to the bridge on every enqueue', async () => {
    const b = bridge();
    await runDriveSmsSweep({ nowMs: JULY, findLatestReport: async () => report(1), enqueue: b.enqueue, recipients: TO });
    expect(etParts(Date.parse(b.calls[0].notBefore)).hour).toBe(DELIVER_AT_ET_HOUR);
  });
});

describe('[WIRING] the dispatcher exists and is named by a workflow', () => {
  const WORKFLOW = path.join(repoRoot, '.github', 'workflows', 'drive-report-sms-cron.yml');
  const SWEEP = path.join(repoRoot, 'scripts', 'cron', 'drive-report-sms-sweep.mjs');
  const read = (p) => fs.readFileSync(p, 'utf8');
  const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('the workflow invokes the sweep and registers both DST lines', () => {
    expect(fs.existsSync(WORKFLOW)).toBe(true);
    expect(read(WORKFLOW)).toMatch(/node\s+scripts\/cron\/drive-report-sms-sweep\.mjs/);
    const crons = [...read(WORKFLOW).matchAll(/^\s*-\s*cron:\s*'([^']+)'/gm)].map((m) => m[1]);
    expect(crons).toHaveLength(2);
    expect(new Set(crons).size, 'two identical lines are one schedule').toBe(2);
  });

  it('the sweep enqueues through the bridge and NEVER imports a provider', () => {
    const src = code(SWEEP);
    expect(src).toMatch(/enqueueChairmanSms/);
    expect(src, 'a direct provider send would be a second representation of chairman delivery').not.toMatch(/twilio|Twilio/);
    expect(src).toMatch(/import\s*\{[^}]*sendDriveSms[^}]*\}\s*from\s*['"]\.\.\/drive-report-sms\.mjs['"]/);
  });

  it('[CONTROL] the comment-stripper works, or the assertions above are vacuous', () => {
    expect(read(SWEEP), 'the header discusses Twilio in prose').toMatch(/Twilio/);
    expect(code(SWEEP), 'and it must not survive stripping').not.toMatch(/Twilio/);
  });
});
