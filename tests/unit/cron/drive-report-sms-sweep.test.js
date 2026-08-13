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
  SMS_KIND, PRODUCER_WINDOW_CLOSE_ET_HOUR, DELIVER_AT_ET_HOUR, ageHoursOf,
  SMS_ACTIVATION_TRIGGER, SMS_SD_KEY,
} from '../../../scripts/cron/drive-report-sms-sweep.mjs';
import { etParts } from '../../../scripts/cron/drive-report-sweep.mjs';
import { hourlyWindowKey } from '../../../scripts/cron/drive-report-hourly-sweep.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const JULY = Date.UTC(2026, 6, 15, 11, 0, 0);   // 07:00 ET, EDT
const JAN = Date.UTC(2026, 0, 15, 12, 0, 0);    // 07:00 ET, EST
const TO = ['+15551234567'];

const report = (agoHours, score = {}, runId = 'drive-2026-07-15') => ({
  id: 'r1',
  run_id: runId,
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
    const CLOSED = Date.UTC(2026, 6, 15, 14, 0, 0);   // 10:00 ET, producer window closed
    await runDriveSmsSweep({ nowMs: CLOSED, findLatestReport: async () => report(1), enqueue: b.enqueue, recipients: TO });
    await runDriveSmsSweep({
      nowMs: CLOSED + 86_400_000,
      findLatestReport: async () => report(1, {}, 'drive-2026-07-16'),   // tomorrow's own report
      enqueue: b.enqueue,
      recipients: TO,
    });
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

  it('[NO SEAM] an injected sendDriveSms is IGNORED — the real one is not substitutable', async () => {
    // Pins the ABSENCE of a seam, which was the one thing here nothing guarded.
    //
    // Every sweep test necessarily drives the REAL sendDriveSms, because it is a static import
    // (:48) called directly (:228) with no injection point. That is a good property — but it was
    // "safe by construction" with NOTHING enforcing the construction: adding
    // `sendDriveSms = realSendDriveSms` to the destructure at :189 and stubbing it everywhere
    // would keep every suite green, and the source-match assertion in the WIRING block would
    // still pass on a file that imports the symbol without using it.
    //
    // So: pass a THROWING sendDriveSms. Today the fixed destructure discards it and the real one
    // runs, which the body assertion proves. Introduce the seam and the throwing stub gets picked
    // up and this fails, naming the cause. Suggested by the seam-census peer; mechanism verified
    // here before adopting (fixed destructure at :189, static import at :48, call at :228).
    //
    // SCOPE, stated so this does not become another overclaiming name: it pins
    // NON-SUBSTITUTABILITY only. It does not prove the real sendDriveSms is correct, and it does
    // nothing for the two drift gaps against enqueueChairmanSms and computePlanCheckStatus.
    const b = bridge();
    const r = await runDriveSmsSweep({
      nowMs: JULY,
      findLatestReport: async () => report(1),
      enqueue: b.enqueue,
      recipients: TO,
      sendDriveSms: () => { throw new Error('a seam was introduced — the real sendDriveSms is now substitutable'); },
    });
    expect(b.calls[0].body, 'the REAL formatter ran, so the real sendDriveSms ran').toBe('Drive 4/6 | capacity TIGHT');
    expect(r.signal).toBe('score');
  });
});

describe('a MISSING report is itself the signal (TR-3), never silence', () => {
  it('no report at all → the "none ever produced" body', async () => {
    const { calls } = bridge();
    const b = bridge();
    // AFTER the producer window closes — before it, "no report" is a wait, not a signal.
    const r = await runDriveSmsSweep({ nowMs: Date.UTC(2026, 6, 15, 14, 0, 0), findLatestReport: async () => null, enqueue: b.enqueue, recipients: TO });
    expect(b.calls[0].body).toBe('Drive report MISSING: none ever produced');
    expect(r.signal).toBe('missing_or_stale');
    expect(calls).toHaveLength(0);
  });

  it("[REGRESSION] YESTERDAY's report is never sent as today's — identity, not age", async () => {
    // THE BUG THIS REPLACES. Freshness used to be "within 2x cadence" (48h). In EST the other
    // DST cron line fires at 05:00 ET, BEFORE the producer runs, and yesterday's report is only
    // ~24h old — comfortably fresh by that rule. So the sweep enqueued YESTERDAY'S NUMBERS under
    // TODAY'S dedupe key, and because dedupe_key is UNIQUE every later tick carrying the real
    // report was deduped away. The chairman would have got yesterday's score every day, forever,
    // with plausible numbers and no error anywhere.
    const b = bridge();
    const yesterday = report(20, {}, 'drive-2026-07-14');   // 20h old: FRESH under the old rule
    const r = await runDriveSmsSweep({
      nowMs: Date.UTC(2026, 6, 15, 14, 0, 0),               // 10:00 ET — producer window CLOSED
      findLatestReport: async () => yesterday,
      enqueue: b.enqueue,
      recipients: TO,
    });
    expect(b.calls[0].body, 'a stale-day report must never render as a score').toMatch(/^Drive report STALE/);
    expect(r.signal).toBe('missing_or_stale');
  });

  it('[WAITING] before the producer window closes, a missing report enqueues NOTHING', async () => {
    // The other half, and it is what makes the fix safe. If "no report yet" enqueued a MISSING
    // body at 05:00, that body would take the day's UNIQUE dedupe key and the real score could
    // never replace it. Not-yet-produced is not a signal; it is a wait, and it is REPORTED.
    const b = bridge();
    const r = await runDriveSmsSweep({
      nowMs: Date.UTC(2026, 6, 15, 10, 0, 0),               // 06:00 ET — window still open
      findLatestReport: async () => null,
      enqueue: b.enqueue,
      recipients: TO,
    });
    expect(b.calls, 'nothing may be enqueued while the producer still might produce').toHaveLength(0);
    expect(r).toMatchObject({ sent: false, waiting: 'producer_window_still_open' });
  });

  it('[WAITING] a stale-day report ALSO waits while the window is open', async () => {
    const b = bridge();
    const r = await runDriveSmsSweep({
      nowMs: Date.UTC(2026, 6, 15, 10, 0, 0),               // 06:00 ET
      findLatestReport: async () => report(20, {}, 'drive-2026-07-14'),
      enqueue: b.enqueue,
      recipients: TO,
    });
    expect(b.calls).toHaveLength(0);
    expect(r.waiting).toBe('producer_window_still_open');
  });

  it('once the window CLOSES with no report, the MISSING signal does go out', async () => {
    // Two-sided: waiting must not become permanent silence. A dead instrument has to be heard.
    const b = bridge();
    await runDriveSmsSweep({
      nowMs: Date.UTC(2026, 6, 15, 14, 0, 0),               // 10:00 ET
      findLatestReport: async () => null,
      enqueue: b.enqueue,
      recipients: TO,
    });
    expect(b.calls[0].body).toBe('Drive report MISSING: none ever produced');
  });

  it("TODAY's report sends the score even at the very first tick", async () => {
    const b = bridge();
    await runDriveSmsSweep({
      nowMs: Date.UTC(2026, 6, 15, 10, 0, 0),               // 06:00 ET, window still open
      findLatestReport: async () => report(1),              // but TODAY's run_id
      enqueue: b.enqueue,
      recipients: TO,
    });
    expect(b.calls[0].body).toBe('Drive 4/6 | capacity TIGHT');
  });

  it('the window-close hour is after the producer window ends', () => {
    expect(PRODUCER_WINDOW_CLOSE_ET_HOUR).toBe(9);
  });

  it('a row that exists but carries no numbers is NOT fresh — a false zero would reassure', async () => {
    // The worst outcome for a drive instrument is a corrupted reading that renders as calm.
    const b = bridge();
    await runDriveSmsSweep({
      nowMs: JULY,
      findLatestReport: async () => ({ id: 'r', run_id: 'drive-2026-07-15', generated_at: new Date(JULY - 3600_000).toISOString(), drive_score: {} }),
      enqueue: b.enqueue,
      recipients: TO,
    });
    expect(b.calls[0].body).toMatch(/^Drive report (STALE|MISSING|UNUSABLE)/);
  });

  it('an unparseable generated_at is treated as missing, not as fresh', async () => {
    const b = bridge();
    await runDriveSmsSweep({
      nowMs: Date.UTC(2026, 6, 15, 14, 0, 0),
      findLatestReport: async () => ({ id: 'r', run_id: 'drive-2026-07-14', generated_at: 'not-a-date', drive_score: { score: { value: 4 }, possible: 6 } }),
      enqueue: b.enqueue,
      recipients: TO,
    });
    expect(b.calls[0].body).toBe('Drive report MISSING: none ever produced');
  });
});

// SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-4 AC-3. Every findLatestReport above is a bare stub
// returning a fixed row — it proves isTodays given a CORRECT result, never exercises the actual
// selection rule the real CLI closure applies (.eq('cadence','scheduled').order('generated_at',
// {ascending:false}).limit(1)). This models that selection rule over a real in-memory row set
// instead of hand-picking the answer, so the test can actually fail if the rule regresses.
describe('[SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-4 AC-3] an hourly row newer than the daily one does not trigger a false STALE alarm', () => {
  // The producer window must be CLOSED for a wrongly-resolved report to reach the STALE branch
  // at all (isTodays=false otherwise falls into "producer window still open" and never enqueues,
  // which is a different code path — using an open-window nowMs here would make the negative
  // control below assert on an enqueue call that never happened).
  const CLOSED = Date.UTC(2026, 6, 15, 14, 0, 0); // 10:00 ET, producer window closed
  const TODAY_RUN_ID = 'drive-2026-07-15';
  const dailyRow = { id: 'd1', run_id: TODAY_RUN_ID, cadence: 'scheduled', generated_at: new Date(JULY - 3_600_000).toISOString(), drive_score: { score: { value: 4 }, possible: 6, capacity_verdict: 'TIGHT', unavailable_legs: [] } };
  const hourlyRow = { id: 'h1', run_id: hourlyWindowKey(JULY), cadence: 'hourly', generated_at: new Date(JULY - 600_000).toISOString(), drive_score: { score: { value: 9 }, possible: 6, capacity_verdict: 'TIGHT', unavailable_legs: [] } };

  /** Mirrors the real Supabase call: filter to cadence, newest first, take one. */
  const cadenceFilteredFindLatest = (rows) => async () => {
    const filtered = rows.filter((r) => r.cadence === 'scheduled');
    filtered.sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));
    return filtered[0] ?? null;
  };

  it('resolves to the daily row and sends the real score, even though the hourly row is newer', async () => {
    expect(new Date(hourlyRow.generated_at).getTime(), 'the fixture must actually be newer to be a meaningful test').toBeGreaterThan(new Date(dailyRow.generated_at).getTime());
    const b = bridge();
    const r = await runDriveSmsSweep({
      nowMs: CLOSED,
      findLatestReport: cadenceFilteredFindLatest([dailyRow, hourlyRow]),
      enqueue: b.enqueue,
      recipients: TO,
    });
    expect(r.signal).toBe('score');
    expect(b.calls[0].body).toBe('Drive 4/6 | capacity TIGHT');
  });

  it('[NEGATIVE CONTROL] without the cadence filter, the same row set DOES produce a false STALE alarm', async () => {
    // Proves the filter is load-bearing for this exact scenario, not incidentally passing: an
    // unfiltered "newest wins" selection (the pre-SD behavior) picks the hourly row, whose
    // run_id never equals today's daily windowKey, so isTodays goes false.
    const unfilteredFindLatest = (rows) => async () => {
      const sorted = [...rows].sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));
      return sorted[0] ?? null;
    };
    const b = bridge();
    await runDriveSmsSweep({
      nowMs: CLOSED,
      findLatestReport: unfilteredFindLatest([dailyRow, hourlyRow]),
      enqueue: b.enqueue,
      recipients: TO,
    });
    expect(b.calls[0].body).toMatch(/^Drive report STALE/);
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

  it('[STATIC] the sweep SOURCE names the bridge and imports NO provider', () => {
    // RENAMED. This was "the sweep enqueues through the bridge", which claimed a behaviour no
    // assertion here delivers — all three checks are source-string matches and nothing enqueues.
    // That is the same sentence-shape as the TR-1 wiring assertion that stayed green while the
    // pipeline threw on every tick. The "imports no provider" half IS genuinely delivered (the
    // stripper control below proves the scan is not inert); the enqueueing behaviour is covered
    // by the injected-bridge tests above, not here. Named for what it checks. (seam-census.)
    const src = code(SWEEP);
    expect(src).toMatch(/enqueueChairmanSms/);
    expect(src, 'a direct provider send would be a second representation of chairman delivery').not.toMatch(/twilio|Twilio/);
    expect(src).toMatch(/import\s*\{[^}]*sendDriveSms[^}]*\}\s*from\s*['"]\.\.\/drive-report-sms\.mjs['"]/);
  });

  it('[REGRESSION] the CLI supplies EVERY dependency — register/stamp are OPTIONAL, so omitting them fails silently', () => {
    // THE ASYMMETRY seam-census found, and it is the TR-1 bug reintroduced one leg over.
    //
    // The producer got a CLI guard after TR-1 (drive-report-wiring.test.js). The SMS leg never
    // got one — and `register`/`stamp` default to null in runDriveSmsSweep, so dropping them
    // from the CLI is not an error: the sweep enqueues, returns success and exits 0 while this
    // leg's FR-7 liveness row is NEVER stamped. That is precisely the "SMS leg dead, alarm
    // green" defect F4 was filed to close, recreated through the wiring rather than the logic.
    //
    // MEASURED before writing this: I deleted the CLI's `register:` line and ALL 218 tests in
    // tests/unit/cron/ still passed. Every behaviour test supplies those deps explicitly, so
    // none of them can see a CLI that stops supplying them.
    const src = code(SWEEP);
    for (const dep of ['findLatestReport', 'enqueue', 'findObligation', 'register', 'stamp']) {
      expect(src, `the CLI must inject ${dep} — the sweep tolerates its absence, so nothing else would notice`)
        .toMatch(new RegExp(`\\n\\s{4}${dep}:`));
    }
    expect(src, 'the stamp must target this leg OWN registry key, not the producer key').toMatch(/armedProcessKey\(SMS_SD_KEY\)/);
  });

  it('[CONTROL] the comment-stripper works, or the assertions above are vacuous', () => {
    expect(read(SWEEP), 'the header discusses Twilio in prose').toMatch(/Twilio/);
    expect(code(SWEEP), 'and it must not survive stripping').not.toMatch(/Twilio/);
  });
});


describe('SECURITY re-run findings — the alarm must not break when it has something to say', () => {
  const CLOSED = Date.UTC(2026, 6, 15, 14, 0, 0);   // 10:00 ET, producer window closed

  it('[F1] a FUTURE-dated report does not crash the missing branch — clock skew is not negative age', async () => {
    // MEASURED before the fix: a 3-SECOND skew threw. generated_at is stamped on the producer's
    // machine and compared here against a DIFFERENT runner's clock, so this needed no attacker —
    // and one future-dated row wins ORDER BY generated_at DESC, killing every tick from then on.
    // The throw lived on the MISSING branch only, so the alarm failed exactly when it fired.
    for (const skewMs of [3_000, 48 * 3_600_000]) {
      const b = bridge();
      const future = { id: 'r', run_id: 'drive-2026-07-14', generated_at: new Date(CLOSED + skewMs).toISOString(), drive_score: {} };
      await expect(runDriveSmsSweep({ nowMs: CLOSED, findLatestReport: async () => future, enqueue: b.enqueue, recipients: TO }))
        .resolves.toBeTruthy();
      expect(b.calls[0].body).toMatch(/^Drive report (STALE|MISSING)/);
    }
    expect(ageHoursOf({ generated_at: new Date(CLOSED + 3_000).toISOString() }, CLOSED), 'clamped, not negative').toBe(0);
  });

  it('[F2] a NEGATIVE number degrades to the missing signal instead of aborting the run', async () => {
    // factsFromReport validated finiteness while formatBody validated range, so a corrupt number
    // threw and the chairman got NOTHING — silence instead of "something is wrong".
    for (const bad of [{ score: { value: -5 }, possible: 6 }, { score: { value: 1 }, possible: 6, unowned_blockers: -1 }]) {
      const b = bridge();
      const row = { id: 'r', run_id: 'drive-2026-07-15', generated_at: new Date(CLOSED - 3_600_000).toISOString(), drive_score: bad };
      await expect(runDriveSmsSweep({ nowMs: CLOSED, findLatestReport: async () => row, enqueue: b.enqueue, recipients: TO }))
        .resolves.toBeTruthy();
      expect(b.calls[0].body).toMatch(/^Drive report UNUSABLE/);
    }
  });

  it('[F9] an unreadable score says UNUSABLE, not "STALE 0h ago"', async () => {
    // "STALE: last one 0h ago" is self-contradicting, and it points at a dead producer when the
    // producer ran fine and the SCORE is broken. Different cause, different remedy.
    const b = bridge();
    const row = { id: 'r', run_id: 'drive-2026-07-15', generated_at: new Date(CLOSED).toISOString(), drive_score: {} };
    await runDriveSmsSweep({ nowMs: CLOSED, findLatestReport: async () => row, enqueue: b.enqueue, recipients: TO });
    expect(b.calls[0].body).toBe('Drive report UNUSABLE: produced 0h ago, score unreadable');
  });

  it('[F3] a dedupe held by a FOREIGN obligation throws instead of reporting success', async () => {
    // dedupe_key is a global UNIQUE namespace with caller-supplied writers, and our key is
    // deterministic. A foreign row squatting on it made every tick report "deduped", which we
    // treated as the self-healing window working — silent suppression, exit 0.
    const b = bridge({ enqueued: false, deduped: true });
    await expect(runDriveSmsSweep({
      nowMs: CLOSED,
      findLatestReport: async () => report(1),
      enqueue: b.enqueue,
      findObligation: async () => ({ id: 'x', kind: 'decision_question' }),
      recipients: TO,
    })).rejects.toThrow(/held by a foreign obligation/);
  });

  it('[F3 TWO-SIDED] a dedupe held by OUR OWN obligation is benign and reports verified', async () => {
    // Without this, a check that rejected every dedupe would pass the test above and break the
    // self-healing window entirely.
    const b = bridge({ enqueued: false, deduped: true });
    const r = await runDriveSmsSweep({
      nowMs: CLOSED,
      findLatestReport: async () => report(1),
      enqueue: b.enqueue,
      findObligation: async () => ({ id: 'x', kind: SMS_KIND }),
      recipients: TO,
    });
    expect(r.enqueued[0]).toMatchObject({ deduped: true, dedupe_verified: true });
  });

  it('[F4] the SMS leg CALLS register then stamp, in that order, with its OWN key', async () => {
    // RENAMED from "registers and stamps its OWN liveness row": no ROW is touched here. This
    // asserts the call ORDER of two injected stubs and that the key differs from the producer's.
    // Both claims hold, but "liveness row" appears nowhere in the evidence — and the row-level
    // fact is exactly the kind this SD keeps finding unverified. (seam-census.)
    // Producer healthy + SMS leg dead left FR-7 GREEN while the chairman got nothing: the
    // producer's registry key is not this leg's. Order matters for the same reason as the
    // producer's — registerArmedMachinery upserts last_fired_at NULL.
    const order = [];
    let opts = null;
    await runDriveSmsSweep({
      nowMs: CLOSED,
      findLatestReport: async () => report(1),
      enqueue: bridge().enqueue,
      register: async (o) => { order.push('register'); opts = o; return { ok: true }; },
      stamp: async () => { order.push('stamp'); },
      recipients: TO,
    });
    expect(order).toEqual(['register', 'stamp']);
    expect(opts.activationTrigger).toBe(SMS_ACTIVATION_TRIGGER);
    expect(SMS_SD_KEY, 'must be its OWN key, not the producer key').not.toBe('SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B');
  });

  it('[F4] a failed enqueue does NOT stamp — the leg own alarm stays armed', async () => {
    let stamped = false;
    await expect(runDriveSmsSweep({
      nowMs: CLOSED,
      findLatestReport: async () => report(1),
      enqueue: async () => ({ enqueued: false, reason: 'table_absent' }),
      stamp: async () => { stamped = true; },
      recipients: TO,
    })).rejects.toThrow(/enqueue refused/);
    expect(stamped).toBe(false);
  });
});
