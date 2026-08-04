/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (TR-1) — the Drive Report dispatcher.
 *
 * Three properties, none of which is visible by reading the code:
 *   1. the two UTC cron lines and the runner's ET gate together cover exactly one ET window,
 *      in BOTH DST offsets — neither half is correct alone, so the test asserts the union;
 *   2. the idempotence key is the WINDOW, not the fire, so a 15-minute self-healing window
 *      writes one row per day instead of one row per tick;
 *   3. registration must precede the stamp, because registration NULLS the stamped field.
 *
 * The DST assertions read the cron lines out of the workflow file rather than restating them.
 *
 * SCOPE, corrected after the TESTING sub-agent measured what this actually catches — the header
 * previously claimed "editing a schedule without editing the window fails here", which was true
 * only of hour-field edits at the union boundary. Now asserted explicitly: the HOUR union (both
 * offsets), the EXACT spill hours, and the MINUTE field. The hour union is still a union, so an
 * edit that shrinks one line INSIDE the 10-12 UTC overlap is masked by the other line and is
 * NOT caught here — stated rather than papered over.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  etParts, windowKey, withinWindow, runDriveReportSweep, buildGather,
  WINDOW_START_HOUR, WINDOW_END_HOUR, PROCESS_KEY, ACTIVATION_TRIGGER, SD_KEY,
} from '../../../scripts/cron/drive-report-sweep.mjs';
import { armedProcessKey } from '../../../lib/machinery-class/armed-registration.js';
import { produceDriveReport } from '../../../scripts/drive-report-produce.mjs';
import { LAST_RUN_FIELD } from '../../../lib/drive-loop/report-posture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const WORKFLOW = path.join(repoRoot, '.github', 'workflows', 'drive-report-cron.yml');

/** The cron expressions that ship in the workflow. */
function scheduledCrons() {
  const yml = fs.readFileSync(WORKFLOW, 'utf8');
  const crons = [...yml.matchAll(/^\s*-\s*cron:\s*'([^']+)'/gm)].map((m) => m[1]);
  expect(crons.length, 'the workflow must register BOTH DST cron lines').toBe(2);
  return crons;
}

/** The UTC hours the workflow's schedules actually fire on, parsed from the file that ships. */
function scheduledUtcHours() {
  const hours = new Set();
  for (const expr of scheduledCrons()) {
    const hourField = expr.split(/\s+/)[1];
    for (const part of hourField.split(',')) {
      const [lo, hi] = part.split('-').map(Number);
      for (let h = lo; h <= (Number.isFinite(hi) ? hi : lo); h++) hours.add(h);
    }
  }
  return [...hours].sort((a, b) => a - b);
}

// The MINUTE field, which this file used to ignore entirely.
//
// Found by the TESTING sub-agent: parsing only the hour field meant the every-15-minutes cadence
// could be edited away to a single tick per hour and every assertion here stayed GREEN — silently
// cutting the self-healing window from 16 ticks a day to 4. That cadence IS the self-healing
// property, per the workflow's own header, so a test claiming "editing a schedule without editing
// the window fails here" overstated its reach on exactly the field carrying the behaviour.
//
// LINE comments, not JSDoc, deliberately: the cron literal contains the block-comment terminator,
// so writing it inside a block comment silently truncates the comment and breaks the file.
function scheduledMinuteFields() {
  return scheduledCrons().map((expr) => expr.split(/\s+/)[0]);
}

/** ET hours admitted by the runner's gate, for every scheduled UTC hour on a given date. */
function admittedEtHours(y, m, d) {
  const admitted = new Set();
  for (const utcHour of scheduledUtcHours()) {
    const ms = Date.UTC(y, m, d, utcHour, 0, 0);
    const gate = withinWindow(ms);
    if (gate.inside) admitted.add(gate.etHour);
  }
  return [...admitted].sort((a, b) => a - b);
}

const JULY = [2026, 6, 15];   // EDT, UTC-4
const JAN = [2026, 0, 15];    // EST, UTC-5

describe('TR-1 dual cron + wall-clock gate — the halves are only correct together', () => {
  it('[CONTROL] the chosen dates really are in the two different offsets', () => {
    // Without this the DST tests could both be measuring the same offset and agree for the
    // wrong reason. 12:00 UTC is 08:00 in EDT and 07:00 in EST.
    expect(etParts(Date.UTC(...JULY, 12, 0, 0)).hour, 'July must be UTC-4').toBe(8);
    expect(etParts(Date.UTC(...JAN, 12, 0, 0)).hour, 'January must be UTC-5').toBe(7);
  });

  it('admits EXACTLY the intended ET window in BOTH offsets', () => {
    const expected = [];
    for (let h = WINDOW_START_HOUR; h <= WINDOW_END_HOUR; h++) expected.push(h);
    expect(admittedEtHours(...JULY), 'EDT coverage').toEqual(expected);
    expect(admittedEtHours(...JAN), 'EST coverage').toEqual(expected);
  });

  it('DISCARDS exactly the spill hour each line produces in the offset it was not written for', () => {
    // The other half of "exactly": coverage alone would be satisfied by a gate that admitted
    // everything. Each offset has a scheduled UTC hour that maps OUTSIDE the ET window.
    //
    // TIGHTENED from toBeGreaterThan(0) after the TESTING sub-agent pointed out that "at least
    // one spill exists" also passes if the schedule were WIDENED to spill far more — the
    // assertion named "discards the spill hour" while only proving some spill was discarded.
    // The exact ET hours are asserted now: 09:00 in EDT, 04:00 in EST.
    const spillEtHours = (y, m, d) => scheduledUtcHours()
      .map((h) => withinWindow(Date.UTC(y, m, d, h, 0, 0)))
      .filter((g) => !g.inside)
      .map((g) => g.etHour)
      .sort((a, b) => a - b);
    expect(spillEtHours(...JULY), 'EDT spills exactly 09:00 ET').toEqual([9]);
    expect(spillEtHours(...JAN), 'EST spills exactly 04:00 ET').toEqual([4]);

    const firstSpill = scheduledUtcHours()
      .map((h) => withinWindow(Date.UTC(...JULY, h, 0, 0)))
      .find((g) => !g.inside);
    expect(firstSpill.reason).toMatch(/expected, not a fault/);
  });

  it('[MINUTE FIELD] both lines keep the */15 cadence that IS the self-healing window', () => {
    // The gap the TESTING sub-agent found: every other assertion here reads only the HOUR field,
    // so `*/15 9-12` -> `0 9-12` stayed green while silently cutting 16 ticks a day to 4. The
    // repeated tick is not a detail — it is the entire retry mechanism, since a failed first tick
    // is recovered only by a later one finding no row for the window key.
    for (const minuteField of scheduledMinuteFields()) {
      expect(minuteField, 'the self-healing cadence must survive a schedule edit').toBe('*/15');
    }
  });

  it('a tick outside the window is REPORTED as skipped and touches nothing', async () => {
    const calls = [];
    const r = await runDriveReportSweep({
      nowMs: Date.UTC(...JULY, 22, 0, 0),          // 18:00 ET — nowhere near the window
      produce: async () => { calls.push('produce'); return { written: true }; },
      gather: async () => ({}),
      persist: async () => ({ id: 'x' }),
      register: async () => { calls.push('register'); return { ok: true }; },
      stamp: async () => { calls.push('stamp'); },
    });
    expect(r).toMatchObject({ ran: false, skipped: 'outside_et_window', et_hour: 18 });
    expect(calls, 'an out-of-window tick must not register, stamp or produce').toEqual([]);
  });
});

describe('the idempotence key is the WINDOW, not the fire', () => {
  it('every tick in one ET day produces the SAME run id', () => {
    // The defect this prevents: keying on GITHUB_RUN_ID, which is unique per fire, so a
    // */15 window would write ~16 rows a day and section 5 would diff a report against one
    // written 15 minutes earlier — a corrupted history that renders as a very quiet week.
    const keys = new Set();
    for (const utcHour of [9, 10, 11, 12]) {
      for (const min of [0, 15, 30, 45]) keys.add(windowKey(Date.UTC(...JULY, utcHour, min, 0)));
    }
    expect([...keys]).toEqual(['drive-2026-07-15']);
  });

  it('keys on the ET calendar day, not the UTC one', () => {
    // 03:00 UTC on the 16th is still 23:00 ET on the 15th. Keying in UTC would silently split
    // one ET day across two report rows twice a year and once every night at the boundary.
    expect(windowKey(Date.UTC(2026, 6, 16, 3, 0, 0))).toBe('drive-2026-07-15');
  });

  it('passes that key to the producer as runId', async () => {
    let seen = null;
    await runDriveReportSweep({
      nowMs: Date.UTC(...JULY, 9, 30, 0),
      produce: async (o) => { seen = o; return { written: true }; },
      gather: async () => ({}),
      persist: async () => ({ id: 'x' }),
    });
    expect(seen.runId).toBe('drive-2026-07-15');
    expect(seen.cadence).toBe('scheduled');
    expect(seen.generatedAt).toBe(new Date(Date.UTC(...JULY, 9, 30, 0)).toISOString());
  });
});

describe('registry bookkeeping — the stamp is what lets the FR-7 alarm CLEAR', () => {
  const base = {
    nowMs: Date.UTC(...JULY, 9, 0, 0),
    gather: async () => ({}),
    persist: async () => ({ id: 'x' }),
  };

  it('[ORDER] registers BEFORE stamping — reversed, the stamp is erased every run', async () => {
    // registerArmedMachinery upserts last_fired_at: null. Stamping first therefore wipes the
    // stamp on every single run and puts the staleness alarm permanently back into the stuck-on
    // state this SD just fixed, while every individual piece still looks correct. Nothing about
    // reading the code makes that visible, so it is pinned here.
    const order = [];
    await runDriveReportSweep({
      ...base,
      produce: async () => ({ written: true }),
      register: async () => { order.push('register'); return { ok: true }; },
      stamp: async () => { order.push('stamp'); },
    });
    expect(order).toEqual(['register', 'stamp']);
  });

  it('stamps the row the registration actually creates, and the field that actually exists', async () => {
    // Two names for one row was a real bug here for about ten minutes: a hand-written
    // 'drive_report_producer' would have updated ZERO rows, and a Supabase update matching
    // nothing returns no error — a silent no-op that leaves the alarm stuck on forever.
    let stamped = null;
    await runDriveReportSweep({
      ...base,
      produce: async () => ({ written: true }),
      register: async () => ({ ok: true }),
      stamp: async (o) => { stamped = o; },
    });
    expect(stamped.processKey).toBe(armedProcessKey(SD_KEY));
    expect(PROCESS_KEY, 'the key must be DERIVED, never a second hand-written literal').toBe(armedProcessKey(SD_KEY));
    expect(stamped.field).toBe(LAST_RUN_FIELD);
    expect(stamped.field).toBe('last_fired_at');
  });

  it('stamps on already_produced too — otherwise every tick after the first re-arms the alarm', async () => {
    let stamped = false;
    const r = await runDriveReportSweep({
      ...base,
      produce: async () => ({ written: false, skipped: 'already_produced' }),
      stamp: async () => { stamped = true; },
    });
    expect(r.skipped).toBe('already_produced');
    expect(stamped, 'a report that already exists for this window is HEALTHY, not "did not run"').toBe(true);
  });

  it('does NOT stamp when the producer throws — a failed run must leave the alarm armed', async () => {
    let stamped = false;
    await expect(runDriveReportSweep({
      ...base,
      produce: async () => { throw new Error('boom'); },
      stamp: async () => { stamped = true; },
    })).rejects.toThrow(/boom/);
    expect(stamped).toBe(false);
  });

  it('names the workflow that dispatches it', async () => {
    let opts = null;
    await runDriveReportSweep({ ...base, produce: async () => ({ written: true }), register: async (o) => { opts = o; return { ok: true }; } });
    expect(opts.activationTrigger).toBe(ACTIVATION_TRIGGER);
    expect(fs.existsSync(path.join(repoRoot, ACTIVATION_TRIGGER)), 'the named dispatcher must exist').toBe(true);
  });

  it('a registration failure does not lose the report', async () => {
    // Bookkeeping is not the deliverable. Losing the day's report because a registry upsert
    // failed would be the tail wagging the dog.
    const r = await runDriveReportSweep({
      ...base,
      produce: async () => ({ written: true }),
      register: async () => ({ ok: false, error: 'nope' }),
    });
    expect(r.ran).toBe(true);
  });
});

describe('gather — what this job can HONESTLY measure today', () => {
  const status = {
    open_total: 42,
    next: [{ item_id: 'i1' }, { item_id: 'i2' }],
    next_truncated: true,
    done: [{ item_id: 'd1' }],
    slipped: [],
  };
  const gather = buildGather({ supabase: {}, computePlanCheckStatus: async () => status });

  it('section 1 is REAL — the enriched remainder, not next.length', async () => {
    const { sections } = await gather();
    expect(sections.plan_position.remainder.value).toBe(42);
    expect(sections.plan_position.remainder.value, 'must be open_total, never the capped list length').not.toBe(status.next.length);
  });

  it('every unsourced section is unavailable WITH A SPECIFIC REASON, never zero', async () => {
    const { sections } = await gather();
    for (const id of ['belt_diagnosis', 'chain_to_gate', 'next_acts', 'stall_deltas']) {
      expect(sections[id].unavailable.available).toBe(false);
      expect(sections[id].unavailable.value).toBe(null);
      expect(sections[id].unavailable.reason.length, `${id} reason is a shrug`).toBeGreaterThan(40);
    }
  });

  it('the three item-based sections name the CAP as the blocker, not "todo"', async () => {
    // The reason has to be actionable enough that a future reader does not "finish" it by
    // wiring status.next — which is capped at 10 and would produce a wrong number that looks
    // completely reasonable.
    const { sections } = await gather();
    for (const id of ['belt_diagnosis', 'chain_to_gate', 'next_acts']) {
      expect(sections[id].unavailable.reason).toMatch(/CAPPED AT 10/);
    }
  });

  it('section 5 states why an EMPTY item set is not a safe default', async () => {
    const { sections } = await gather();
    expect(sections.stall_deltas.unavailable.reason).toMatch(/every item the prior report saw/);
  });

  it('unavailable legs are EXCLUDED from the denominator, not scored zero', async () => {
    const { driveScore } = await gather();
    expect(driveScore.possible, 'nothing measured means nothing possible — 0/6 would be a claim about the fleet').toBe(0);
    expect(driveScore.measured_legs).toEqual([]);
    expect(driveScore.unavailable_legs).toHaveLength(3);
  });

  it('[LEG 3 DOES NOT EXIST] no leg is invented to make the denominator look like the spec', async () => {
    const { driveScore } = await gather();
    const ids = driveScore.unavailable_legs.map((l) => l.leg);
    expect(ids).toEqual(['leg1_landed', 'leg2_uptake', 'leg4_capacity']);
    expect(ids.some((i) => /leg3/.test(i)), 'leg 3 appears zero times in the SD and the PRD').toBe(false);
  });

  it('composes into a report the producer will accept', async () => {
    // The end-to-end shape, so "gather returns something" is not the claim — composeReport
    // refuses a sectionless report, and this proves the real gather clears that bar.
    const { composeReport } = await import('../../../lib/drive-loop/compose-report.js');
    const { sections, driveScore } = await gather();
    const row = composeReport({ sections, driveScore, generatedAt: '2026-07-15T09:00:00.000Z', runId: 'drive-2026-07-15' });
    expect(row.metadata.unavailable_sections.map((u) => u.section).sort())
      .toEqual(['belt_diagnosis', 'chain_to_gate', 'next_acts', 'stall_deltas']);
    expect(row.metadata.section_ids).toContain('plan_position');
  });
});

/**
 * THE TEST THAT WOULD HAVE CAUGHT IT.
 *
 * Everything above injects a STUB `produce`, and the wiring test asserts only the EDGE
 * (`produce: produceDriveReport` appears in the source). Both were green while the shipped cron
 * threw on every single in-window tick, because the sweep never passed `persist` and the REAL
 * produceDriveReport refuses without one. Two suites, twenty-nine assertions, and no path that
 * ran the two real modules against each other.
 *
 * A stub proves the caller's shape matches what the TEST believes the callee wants. Only the real
 * callee proves it matches what the callee ACTUALLY wants. Found by the SECURITY sub-agent, which
 * executed the pipeline instead of reading it.
 */
describe('[END-TO-END] the sweep drives the REAL producer — no stub in between', () => {
  const status = { open_total: 42, next: [{ item_id: 'i1' }], next_truncated: false, done: [], slipped: [] };
  const realGather = () => buildGather({ supabase: {}, computePlanCheckStatus: async () => status });

  it('writes exactly one real row through the real producer', async () => {
    const rows = [];
    const r = await runDriveReportSweep({
      nowMs: Date.UTC(...JULY, 10, 0, 0),                     // 06:00 ET
      produce: produceDriveReport,                             // THE REAL ONE
      gather: realGather(),
      persist: async (row) => { rows.push(row); return { id: `row-${rows.length}` }; },
      findExisting: async () => null,
    });

    expect(rows, 'the pipeline must actually reach a write').toHaveLength(1);
    expect(r).toMatchObject({ ran: true, written: true, run_id: 'drive-2026-07-15' });
    expect(rows[0].run_id).toBe('drive-2026-07-15');
    expect(rows[0].cadence).toBe('scheduled');
    expect(rows[0].sections.plan_position.remainder.value).toBe(42);
    expect(rows[0].metadata.unavailable_sections).toHaveLength(4);
  });

  it('the second tick of the same window writes NOTHING and reports the skip', async () => {
    const rows = [];
    const persist = async (row) => { rows.push(row); return { id: `row-${rows.length}` }; };
    const findExisting = async (id) => (rows.find((x) => x.run_id === id) ? { id: 'row-1' } : null);
    const opts = { produce: produceDriveReport, gather: realGather(), persist, findExisting };

    await runDriveReportSweep({ ...opts, nowMs: Date.UTC(...JULY, 10, 0, 0) });   // 06:00 ET
    const second = await runDriveReportSweep({ ...opts, nowMs: Date.UTC(...JULY, 10, 15, 0) }); // 06:15 ET

    expect(rows, 'a self-healing window must not write once per tick').toHaveLength(1);
    expect(second).toMatchObject({ ran: true, written: false, skipped: 'already_produced' });
  });

  it('REFUSES without persist, naming the sweep rather than failing deep in the producer', async () => {
    await expect(runDriveReportSweep({
      nowMs: Date.UTC(...JULY, 10, 0, 0),
      produce: produceDriveReport,
      gather: realGather(),
    })).rejects.toThrow(/persist must be injected/);
  });
});
