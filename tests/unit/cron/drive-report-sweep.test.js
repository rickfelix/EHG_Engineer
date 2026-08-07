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
  etParts, windowKey, withinWindow, runDriveReportSweep, buildGather, scoreCapacityLeg,
  WINDOW_START_HOUR, WINDOW_END_HOUR, PROCESS_KEY, ACTIVATION_TRIGGER, SD_KEY,
} from '../../../scripts/cron/drive-report-sweep.mjs';
import { armedProcessKey } from '../../../lib/machinery-class/armed-registration.js';
import { produceDriveReport } from '../../../scripts/drive-report-produce.mjs';
import { LAST_RUN_FIELD } from '../../../lib/drive-loop/report-posture.js';
import { makeCapacityVerdictPersist } from '../../../scripts/lib/capacity-verdict-store.mjs';

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

  it('derives the stamp key from armedProcessKey and names the measured column constant', async () => {
    // RENAMED from "stamps the row the registration actually creates, and the field that actually
    // exists". Both "actually" clauses were checked against CONSTANTS, not against a registration
    // or a schema — no row and no catalogue is consulted here. The process-key half is sound by
    // DERIVATION (it must equal armedProcessKey(SD_KEY)); the field half asserts the constant
    // equals 'last_fired_at', whose correspondence to the real column is pinned by
    // REGISTRY_COLUMNS in report-posture.test.js — itself a hand-copied snapshot with its own
    // stated limit. Naming it honestly matters here more than most: the defect this test was
    // written for is a silent no-op nobody can see. (seam-census.)
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
  // SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 (TS-7): leg4's injections, in the state this SD SHIPS
  // in — the verdict table is staged chairman-gated and NOT applied, so the write fails
  // table-absent and leg4 reports unavailable exactly as it did before. Every assertion in this
  // block is unchanged, and that is the point: the pre-ceremony state is a PASS, not a regression.
  const gatherCapacity = async () => ({ idleNow: 1, freeingSoon: 0, claimableCount: 0, openQfCount: 0 });
  const persistTableAbsent = async () => { const e = new Error('relation does not exist'); e.code = 'PGRST205'; throw e; };
  const gather = buildGather({
    supabase: {}, computePlanCheckStatus: async () => status,
    gatherCapacity, persistVerdict: persistTableAbsent,
  });

  it('section 1 is REAL — the enriched remainder, not next.length', async () => {
    const { sections } = await gather();
    expect(sections.plan_position.remainder.value).toBe(42);
    expect(sections.plan_position.remainder.value, 'must be open_total, never the capped list length').not.toBe(status.next.length);
  });

  it('every STILL-unsourced section is unavailable WITH A SPECIFIC REASON, never zero', async () => {
    // SD-LEO-INFRA-UNCAPPED-ROADMAP-ITEMS-001 FR-2/FR-3: this list used to name all four. The
    // three item-based sections are now SOURCED from the uncapped join, so only stall_deltas
    // remains — and it stays deliberately (FR-4 is CONDITIONAL: its `suppressed` park predicate,
    // documented as supplied by FR_A/-E, has no implementation anywhere in the repo).
    const { sections } = await gather();
    for (const id of ['stall_deltas']) {
      expect(sections[id].unavailable.available).toBe(false);
      expect(sections[id].unavailable.value).toBe(null);
      expect(sections[id].unavailable.reason.length, `${id} reason is a shrug`).toBeGreaterThan(40);
    }
  });

  it('THE THREE ITEM-BASED SECTIONS ARE NOW SOURCED, not unavailable', async () => {
    // Replaces the old "name the CAP as the blocker" test, whose comment warned that a future
    // reader must not "finish" this by wiring status.next — capped at 10, producing a wrong
    // number that looks completely reasonable. That warning is honoured: buildGather feeds these
    // sections computePlanCheckStatus().open_items_all, the UNCAPPED set, never status.next.
    //
    // Asserting `unavailable === undefined` is the load-bearing half. The sections are PURE
    // functions, so a wiring that handed them the capped array would still return well-shaped
    // output and every section-level unit test would stay green — the bug would just move one
    // layer up into buildGather. The companion assertion that the set is genuinely uncapped
    // lives in tests/unit/roadmap/plan-check-uncapped-pagination.test.js, mutation-proven there.
    const { sections } = await gather();
    for (const id of ['belt_diagnosis', 'chain_to_gate', 'next_acts']) {
      expect(sections[id].unavailable, `${id} should now be SOURCED`).toBeUndefined();
      expect(sections[id].section).toBe(id);
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
    // FR-2/FR-3: three of these four are now SOURCED from the uncapped join. stall_deltas is
    // the only remaining unavailable section, and it stays that way on purpose (FR-4 CONDITIONAL
    // — no FR_A/-E suppression predicate exists in the repo). This list shrinking from 4 to 1 IS
    // the deliverable; it is asserted exactly rather than loosened to "at most 4".
    expect(row.metadata.unavailable_sections.map((u) => u.section).sort())
      .toEqual(['stall_deltas']);
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
  const realGather = () => buildGather({
    supabase: {}, computePlanCheckStatus: async () => status,
    gatherCapacity: async () => ({ idleNow: 1, freeingSoon: 0, claimableCount: 0, openQfCount: 0 }),
    persistVerdict: async () => { const e = new Error('relation does not exist'); e.code = 'PGRST205'; throw e; },
  });

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
    // FR-2/FR-3: was 4; only stall_deltas remains unavailable (FR-4 CONDITIONAL, unowned predicate).
    expect(rows[0].metadata.unavailable_sections).toHaveLength(1);
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

describe('[BLOCKED] table-absent is a known state, not a healthy run and not a crash', () => {
  // VALIDATION found that FR-7's staleness alarm is the compensating control for a producer
  // that cannot write — and that it degraded in exactly the state this SD ships in. These pin
  // both halves of the fix: the run does not spam CI red, and it does NOT silence the alarm.
  const IN_WINDOW = Date.UTC(2026, 6, 15, 10, 0, 0);   // 06:00 ET

  it('does NOT stamp the registry when persist reports the table is absent', async () => {
    // The stamp is what silences the alarm. Stamping here would report healthy while no report
    // exists — the false-green this instrument refuses. I shipped a comment claiming this before
    // the code did it; the test is what makes the claim true.
    let stamped = false;
    const r = await runDriveReportSweep({
      nowMs: IN_WINDOW,
      produce: async () => ({ written: true, id: null, blocked: 'table_absent' }),
      gather: async () => ({}),
      persist: async () => ({ id: null, blocked: 'table_absent' }),
      stamp: async () => { stamped = true; },
    });
    expect(r.blocked).toBe('table_absent');
    expect(stamped, 'a blocked run must leave the staleness alarm armed').toBe(false);
  });

  it('[TWO-SIDED] a genuinely successful run DOES stamp', async () => {
    // Without this, a guard that never stamped would pass the test above while permanently
    // arming the alarm — an alarm that can never clear, which is a defect this SD already fixed
    // once at the field-name level.
    let stamped = false;
    const r = await runDriveReportSweep({
      nowMs: IN_WINDOW,
      produce: async () => ({ written: true, id: 'row-1' }),
      gather: async () => ({}),
      persist: async () => ({ id: 'row-1' }),
      stamp: async () => { stamped = true; },
    });
    expect(r.blocked).toBeUndefined();
    expect(stamped).toBe(true);
  });

  it('the CLI passes grace_multiplier: 2 — FR-7 says 2x, the column default is 3', async () => {
    // isSelfStale() implements the 2x rule and has ZERO production callers; the live path is
    // periodic-liveness-watcher.mjs reading grace_multiplier off this row. Without setting it,
    // the 48h alarm the PRD promises would not fire until 72h. A rule implemented in a function
    // nobody calls is a rule that is not in force.
    const src = fs.readFileSync(path.join(repoRoot, 'scripts', 'cron', 'drive-report-sweep.mjs'), 'utf8');
    expect(src).toMatch(/grace_multiplier:\s*2/);
  });
});

/**
 * SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 — FR-3: leg4, wired.
 *
 * The block above pins the state this SD SHIPS in (table staged, unapplied, leg4 unavailable —
 * TS-7). This block pins the state it ships FOR: the ceremony has run, the write lands, and the
 * leg scores. Both are needed. Without the second, an implementation that refused on every path
 * would satisfy every negative case while leaving leg4 exactly as dark as it is today, which is
 * the state this SD exists to leave rather than to entrench.
 */
describe('FR-3 — leg4 is injected, not declared unavailable', () => {
  const inputs = { idleNow: 1, freeingSoon: 0, claimableCount: 3, openQfCount: 0 };
  const gatherCapacity = async () => inputs;
  const okPersist = (captured) => async (row) => { captured.push(row); return { id: 'verdict-row-1' }; };

  it('TS-1/TS-5 — a working persist writes the row AND the leg scores', async () => {
    // beltDepth 3, demandSoon 1, buffer 1 -> deficit -1 -> SURPLUS. Deliberately NOT the healthy
    // verdict; scoring is asserted separately below so a pass here cannot come from the wrong axis.
    const captured = [];
    const leg = await scoreCapacityLeg({ gatherCapacity, persistVerdict: okPersist(captured), runId: 'drive-2026-08-07' });

    expect(captured, 'the row must actually be written').toHaveLength(1);
    expect(captured[0]).toMatchObject({ run_id: 'drive-2026-08-07', verdict: 'SURPLUS', belt_depth: 3, demand_soon: 1, deficit: -1 });
    expect(leg.unavailable, 'leg4 must no longer be unavailable').toBeUndefined();
    expect(leg.verdict_row_id, 'the leg must cite the row that was written').toBe('verdict-row-1');
  });

  it('TS-3 — SURPLUS does not earn the healthy points, TIGHT does', async () => {
    // The bidirectional gauge, end to end through the wiring. A build that awarded points for
    // SURPLUS scores HIGHER and fails here — that is what makes the mistake attractive.
    const surplus = await scoreCapacityLeg({ gatherCapacity, persistVerdict: okPersist([]) });
    expect(surplus.points.value, 'SURPLUS is the flooded pole, not a good run').toBe(0);

    // beltDepth 2, demandSoon 1, buffer 1 -> deficit 0 -> TIGHT.
    const tight = await scoreCapacityLeg({
      gatherCapacity: async () => ({ idleNow: 1, freeingSoon: 0, claimableCount: 2, openQfCount: 0 }),
      persistVerdict: okPersist([]),
    });
    expect(tight.points.value, 'TIGHT is the target — the positive control').toBe(2);
  });

  it('TS-2 — SEEDED: a failing persist leaves the leg UNMEASURED, never scored', async () => {
    // The whole invariant: a score is never reported unless the verdict behind it was durably
    // written. A wiring that swallowed this and scored anyway is the SD's own defect one layer down.
    const leg = await scoreCapacityLeg({
      gatherCapacity,
      persistVerdict: async () => { throw new Error('insert blew up'); },
    });
    expect(leg.unavailable.available).toBe(false);
    expect(leg.unavailable.value, 'unmeasurable is NOT zero').toBe(null);
    expect(leg.unavailable.reason).toMatch(/insert blew up/);
    expect(leg.points, 'a failed write must not produce points at all').toBeUndefined();
  });

  it('TS-7 — table-absent degrades to unavailable, and the whole report still runs', async () => {
    const leg = await scoreCapacityLeg({
      gatherCapacity,
      persistVerdict: async () => { const e = new Error('no relation'); e.code = 'PGRST205'; throw e; },
    });
    expect(leg.leg).toBe('leg4_capacity');
    expect(leg.unavailable.available).toBe(false);
  });

  it('[TRAP] an ASYNC persist would fire-and-forget — the sync hand-back is what prevents it', async () => {
    // scoreLeg4 calls persist WITHOUT await and reads row.id. Had the async writer been injected
    // straight in, row.id would be undefined, the write would never be awaited, and a rejection
    // would become an unhandled rejection the leg could not see — so leg4-capacity.js:72 would
    // never fire while the leg happily scored. This asserts the id is real, which it can only be
    // if durability was proven BEFORE scoring.
    const leg = await scoreCapacityLeg({ gatherCapacity, persistVerdict: okPersist([]) });
    expect(leg.verdict_row_id).toBe('verdict-row-1');
    expect(leg.verdict_row_id, 'undefined here means the write was never awaited').not.toBeUndefined();
  });

  it('[TRAP] a gather that fails does NOT silently score a confident verdict from zeros', async () => {
    // Zeros would read beltDepth 0 with idleNow 0 -> SURPLUS, the most reassuring answer available,
    // built on nothing. It must be unavailable instead.
    const leg = await scoreCapacityLeg({
      gatherCapacity: async () => { throw new Error('belt query failed'); },
      persistVerdict: okPersist([]),
    });
    expect(leg.unavailable.reason).toMatch(/belt query failed/);
  });

  it('buildGather REFUSES an uninjected leg4 rather than defaulting it', () => {
    // A default would make this read as wired while the CLI passed nothing — exactly how `persist`
    // went missing from runDriveReportSweep and threw on every tick with the suite green.
    expect(() => buildGather({ supabase: {}, computePlanCheckStatus: async () => ({}) }))
      .toThrow(/gatherCapacity and persistVerdict must be injected/);
  });

  it('[WIRING] the CLI passes the REAL gatherer and the REAL writer', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'scripts', 'cron', 'drive-report-sweep.mjs'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src, 'the CLI must resolve the shared gatherer').toMatch(/gatherCapacity:\s*\(\)\s*=>\s*gatherCapacityInputs\(supabase\)/);
    expect(src, 'and the real durable writer').toMatch(/persistVerdict:\s*makeCapacityVerdictPersist\(supabase\)/);
    // The legs array must CALL the leg, not declare it dead. Note this is deliberately not a blanket
    // "no LEG4_ID beside unavailable" scan: scoreCapacityLeg's catch legitimately builds exactly that
    // shape when a run cannot be measured, and forbidding it would outlaw the honest degradation.
    expect(src, 'the legs array must score leg4').toMatch(/await\s+scoreCapacityLeg\(/);
    expect(src, 'the old "writer is not built" declaration must be gone').not.toMatch(/is not built/);
  });
});

/**
 * SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 — the gap the TESTING sub-agent MEASURED, closed.
 *
 * It mutated makeCapacityVerdictPersist to swallow its insert error and return {id:'x'}. The store's
 * own suite went red (4 failures) and THIS FILE STAYED 35/35 GREEN — because the FR-3 block above
 * injects only hand-rolled stubs, so `makeCapacityVerdictPersist` appeared in it exactly once, inside
 * a source-text regex. Gutting the real writer was invisible to the file that claims to test the
 * wiring. A stub proves the caller matches what the TEST believes the callee wants; only the real
 * callee proves it matches what the callee ACTUALLY wants — the same lesson the END-TO-END block
 * above already records about the producer, recurring one level down because the new seam was built
 * with stubs on both sides.
 *
 * These bind scoreCapacityLeg to the REAL writer over a fake supabase client, so the async→sync
 * bridge is exercised end to end.
 */
describe('[BOUND] scoreCapacityLeg against the REAL writer, not a stub', () => {
  const gatherCapacity = async () => ({ idleNow: 1, freeingSoon: 0, claimableCount: 2, openQfCount: 0 });

  /** Fake supabase. `fail` makes the insert return a PostgREST-shaped error. */
  const client = ({ fail = null, captured = {} } = {}) => ({
    from(table) {
      captured.table = table;
      return {
        insert(row) {
          captured.row = row;
          return { select: () => ({ single: async () => (fail
            ? { data: null, error: fail }
            : { data: { id: 'real-row-9', verdict: row.verdict, recorded_at: '2026-08-07T10:00:00Z' }, error: null }) }) };
        },
      };
    },
  });

  it('the real writer + the real leg score together, and the row actually lands', async () => {
    const captured = {};
    const leg = await scoreCapacityLeg({
      gatherCapacity,
      persistVerdict: makeCapacityVerdictPersist(client({ captured })),
      runId: 'drive-2026-08-07',
    });

    expect(captured.table).toBe('belt_capacity_verdicts');
    expect(captured.row, 'the real writer must receive every measurement').toMatchObject({
      run_id: 'drive-2026-08-07', verdict: 'TIGHT', belt_depth: 2, demand_soon: 1, deficit: 0,
    });
    expect(captured.row, 'recorded_at is the DATABASE default, never a client clock')
      .not.toHaveProperty('recorded_at');
    expect(leg.verdict_row_id).toBe('real-row-9');
    expect(leg.points.value).toBe(2);
  });

  it('[MUTATION GUARD] a writer that swallowed its insert error FAILS here', async () => {
    // The assertion the stub-only block could not make. If makeCapacityVerdictPersist is ever
    // changed to catch-and-log, this leg would score against a row that does not exist — so a
    // scored leg is the failure condition, and unavailable is the pass.
    const leg = await scoreCapacityLeg({
      gatherCapacity,
      persistVerdict: makeCapacityVerdictPersist(client({ fail: { code: '42501', message: 'permission denied' } })),
      runId: 'drive-2026-08-07',
    });

    expect(leg.points, 'a leg that scores here means the writer swallowed its failure').toBeUndefined();
    expect(leg.unavailable.available).toBe(false);
    expect(leg.unavailable.reason).toMatch(/durable write failed/);
    expect(leg.unavailable.reason, 'the real code must reach the reason string').toMatch(/42501/);
  });

  it('table-absent through the REAL writer is still just unavailable (TS-7, unstubbed)', async () => {
    const leg = await scoreCapacityLeg({
      gatherCapacity,
      persistVerdict: makeCapacityVerdictPersist(client({ fail: { code: 'PGRST205', message: 'no relation' } })),
    });
    expect(leg.unavailable.available).toBe(false);
    expect(leg.points).toBeUndefined();
  });
});

/**
 * SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 — the guard that could actually fire.
 *
 * The VALIDATION sub-agent's finding, and it is a sharper shape than "a missing check": the sync
 * persist re-checked four fields that both sides derive from the SAME pure function over the SAME
 * closed-over inputs, so that check cannot disagree today — it is a drift guard for a future edit
 * to leg4. Meanwhile `written.id`, the ONE value arriving from outside, was unchecked. So the guard
 * that existed could not fire and the guard that could fire was missing.
 *
 * What it let through: a persistVerdict resolving {}, null or {id: null} scored the full 2 points
 * with verdict_row_id null — and leg4 rendered "Provenance is the persisted row (unwritten)",
 * anticipating the state and printing it honestly while nothing failed. It is unreachable through
 * the real writer because PostgREST .single() guarantees data when error is null; that is a
 * property of today's writer, not of the injection contract.
 */
describe('[PROVENANCE] a resolved promise is not evidence that a row exists', () => {
  const gatherCapacity = async () => ({ idleNow: 1, freeingSoon: 0, claimableCount: 2, openQfCount: 0 });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty object', {}],
    ['a row with a null id', { id: null }],
  ])('refuses to score when the write returns %s', async (_label, resolved) => {
    const leg = await scoreCapacityLeg({ gatherCapacity, persistVerdict: async () => resolved });
    expect(leg.points, 'scoring here means the leg cited a row it cannot prove exists').toBeUndefined();
    expect(leg.unavailable.available).toBe(false);
    expect(leg.unavailable.reason).toMatch(/returned no row id/);
  });

  it('[CONTROL] and a real id still scores — the guard is not simply always-on', async () => {
    const leg = await scoreCapacityLeg({ gatherCapacity, persistVerdict: async () => ({ id: 'row-42' }) });
    expect(leg.points.value).toBe(2);
    expect(leg.verdict_row_id).toBe('row-42');
  });

  it('the sweep names itself in the row it writes, so two producers stay distinguishable', async () => {
    const captured = [];
    await scoreCapacityLeg({
      gatherCapacity,
      persistVerdict: async (row) => { captured.push(row); return { id: 'row-42' }; },
    });
    expect(captured[0].detail).toMatchObject({ source: 'drive-report-sweep' });
  });
});
