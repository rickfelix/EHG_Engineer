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

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  etParts, windowKey, withinWindow, runDriveReportSweep, buildGather, scoreCapacityLeg, computeLeg2,
  WINDOW_START_HOUR, WINDOW_END_HOUR, PROCESS_KEY, ACTIVATION_TRIGGER, SD_KEY,
} from '../../../scripts/cron/drive-report-sweep.mjs';
import { CLAIM_WINDOW_MS as LEG2_CLAIM_WINDOW_MS } from '../../../lib/drive-loop/score/leg2-uptake.js';
import { armedProcessKey } from '../../../lib/machinery-class/armed-registration.js';
import { produceDriveReport } from '../../../scripts/drive-report-produce.mjs';
import { LAST_RUN_FIELD } from '../../../lib/drive-loop/report-posture.js';
import { makeCapacityVerdictPersist } from '../../../scripts/lib/capacity-verdict-store.mjs';
import { gatherCapacityInputs } from '../../../scripts/lib/capacity-inputs.mjs';
import { hourlyWindowKey } from '../../../scripts/cron/drive-report-hourly-sweep.mjs';

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
  // SD-LEO-INFRA-UNCAPPED-ROADMAP-ITEMS-001: `next` and `open_items_all` carry DELIBERATELY
  // DIFFERENT rows. That difference is the whole instrument — it is what lets a test tell which
  // field buildGather actually fed the sections. Previously this stub had no open_items_all at
  // all, so the sections received [] and every assertion about them passed trivially: swapping
  // the wiring back to the capped `next` left the entire suite green.
  const status = {
    open_total: 42,
    next: [{ item_id: 'i1' }, { item_id: 'i2' }],
    next_truncated: true,
    // SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001: empty on purpose. This shared fixture pre-dates
    // leg1 reading `done` at all (leg1 was unconditionally unavailable before this SD); keeping it
    // empty here preserves every test below exactly as it read before A-LOCAL wiring landed. The
    // MEASURED path (non-empty done[]) gets its own dedicated fixtures further down.
    done: [],
    slipped: [],
    waves: [{ id: 'w1', title: 'Wave 1', sequence_rank: 1, status: 'approved' }],
    // RAW consumer-read field names — the rename of these is the defect this SD had to fix.
    open_items_all: [
      { id: 'UNCAPPED-a', wave_id: 'w1', title: 'A', promoted_to_sd_key: null, item_disposition: 'pending', remainder_state: 'promotable_now', lane: null, metadata: {}, sd: null },
      { id: 'UNCAPPED-b', wave_id: 'w1', title: 'B', promoted_to_sd_key: null, item_disposition: 'pending', remainder_state: 'promotable_now', lane: null, metadata: {}, sd: null },
      { id: 'UNCAPPED-c', wave_id: 'w1', title: 'C', promoted_to_sd_key: null, item_disposition: 'pending', remainder_state: 'promotable_now', lane: null, metadata: {}, sd: null },
    ],
  };
  // SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 (TS-7): leg4's injections, in the state this SD SHIPS
  // in — the verdict table is staged chairman-gated and NOT applied, so the write fails
  // table-absent and leg4 reports unavailable exactly as it did before. Every assertion in this
  // block is unchanged, and that is the point: the pre-ceremony state is a PASS, not a regression.
  const gatherCapacity = async () => ({ idleNow: 1, freeingSoon: 0, claimableCount: 0, openQfCount: 0 });
  const persistTableAbsent = async () => { const e = new Error('relation does not exist'); e.code = 'PGRST205'; throw e; };
  // SD-LEO-INFRA-DRIVE-SCORE-LEG2-001: no snapshot cohort has ever been ranked in this stub world,
  // so leg2 stays unavailable — matching the pre-existing "3 unavailable legs" pin below exactly.
  const readLeg2Cohort = async () => null;
  const gather = buildGather({
    supabase: {}, computePlanCheckStatus: async () => status,
    gatherCapacity, persistVerdict: persistTableAbsent,
    // SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001: never invoked (done: [] above takes the
    // unavailable branch before runGitLog is called), but mandatory injection still requires a
    // function here.
    runGitLog: () => [],
    readLeg2Cohort, nowMs: Date.parse('2026-08-07T09:00:00.000Z'),
    resolveRows: TEST_RESOLVE_ROWS,
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

  it('WIRING PINNED: the sections are fed open_items_all, PROVABLY not the capped `next`', async () => {
    // THIS IS THE TEST WHOSE ABSENCE WAS THE REAL GAP. A re-review demonstrated that swapping
    // buildGather's `planStatus.open_items_all` for `planStatus.next` — reverting the exact thing
    // this SD exists to do — left 624/624 tests GREEN. The suite asserted that the sections were
    // AVAILABLE and that the pure functions behaved, but nothing anywhere asserted WHICH FIELD
    // they were handed. The code comment claimed the wiring test did this; it did not.
    //
    // The stub's `next` and `open_items_all` hold disjoint ids, so the built section's own row
    // ids say unambiguously which field reached it. This fails if the wiring is ever reverted.
    const { sections } = await gather();
    const emitted = JSON.stringify(sections.belt_diagnosis);
    expect(emitted, 'belt must reflect the UNCAPPED set').toMatch(/UNCAPPED-/);
    expect(emitted, 'belt must NOT be fed the capped `next` rows').not.toMatch(/"i1"|"i2"/);
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

  it('leg1 reason tells the MEASURED truth, with provenance — not the stale not-wired claim', async () => {
    // SD-LEO-INFRA-DRIVE-SCORE-LEG1-001 (Option B, ruling fea8b4c4). This pin is the ONLY
    // instrument that observes the reason text (measured: swapping it left 531/531 green), so
    // both halves are load-bearing. Read through unavailable_legs — LEGS do not use the
    // sections' `.unavailable.reason` idiom; copying it reads undefined and vacuously passes.
    const { driveScore } = await gather();
    const reason = driveScore.unavailable_legs.find((l) => l.leg === 'leg1_landed').reason;
    expect(reason).toMatch(/unearnable/i);            // the finding, not a wiring excuse
    expect(reason).toMatch(/7\/111/);                 // the population-scoped measurement
    expect(reason).toMatch(/ab82da6b/);               // VALIDATION evidence provenance
    expect(reason).toMatch(/fea8b4c4/);               // the coordinator ruling holding it
    expect(reason).not.toMatch(/neither is wired/);   // the stale claim's unique fingerprint
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

describe('leg1 A-LOCAL wiring — measures for real when the completed-items window has data (SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001)', () => {
  const gatherCapacity = async () => ({ idleNow: 1, freeingSoon: 0, claimableCount: 0, openQfCount: 0 });
  const persistTableAbsent = async () => { const e = new Error('relation does not exist'); e.code = 'PGRST205'; throw e; };
  const runGitLog = () => ['Merge pull request #1 from rickfelix/feat/SD-REALLY-LANDED-001'];
  // SD-LEO-INFRA-DRIVE-SCORE-LEG2-001: this block is about leg1 only. No snapshot cohort has ever
  // been ranked in these fixtures, so leg2 stays unavailable — mandatory injection only.
  const readLeg2Cohort = async () => null;
  const nowMs = Date.parse('2026-08-07T09:00:00.000Z');

  it('[F1, TESTING evidence 7b22c9ee] computePlanCheckStatus is called with windowHours: 720 -- reverting to the 48h/168h default silently no-ops the whole SD (measured empty at PLAN time)', async () => {
    const receivedOptions = [];
    const gather = buildGather({
      supabase: {},
      computePlanCheckStatus: async (_supabase, options) => {
        receivedOptions.push(options);
        return { open_total: 0, next: [], next_truncated: false, slipped: [], open_items_all: [], waves: [], done: [] };
      },
      gatherCapacity, persistVerdict: persistTableAbsent, runGitLog, readLeg2Cohort, nowMs, resolveRows: TEST_RESOLVE_ROWS,
    });
    await gather();
    expect(receivedOptions, 'computePlanCheckStatus must be called exactly once (the dedupe this file already documents)').toHaveLength(1);
    expect(receivedOptions[0]).toEqual({ windowHours: 720 });
  });

  it('[TS-7] empty done[] leaves the unavailable reason byte-identical to LEG1-001\'s shipped text', async () => {
    const gather = buildGather({
      supabase: {},
      computePlanCheckStatus: async () => ({ open_total: 0, next: [], next_truncated: false, slipped: [], open_items_all: [], waves: [], done: [] }),
      gatherCapacity, persistVerdict: persistTableAbsent, runGitLog, readLeg2Cohort, nowMs, resolveRows: TEST_RESOLVE_ROWS,
    });
    const { driveScore } = await gather();
    const reason = driveScore.unavailable_legs.find((l) => l.leg === 'leg1_landed').reason;
    expect(reason).toMatch(/unearnable/i);
    expect(reason).toMatch(/7\/111/);
    expect(reason).toMatch(/ab82da6b/);
    expect(reason).toMatch(/fea8b4c4/);
  });

  it('non-empty done[] measures leg1 for real — it leaves unavailable_legs and joins measured_legs', async () => {
    const gather = buildGather({
      supabase: {},
      computePlanCheckStatus: async () => ({
        open_total: 0, next: [], next_truncated: false, slipped: [],
        open_items_all: [], waves: [],
        done: [{ item_id: 'd1', sd_key: 'SD-REALLY-LANDED-001', title: 'T', wave: 'W', completed_at: '2026-01-01T00:00:00Z' }],
      }),
      gatherCapacity, persistVerdict: persistTableAbsent, runGitLog, readLeg2Cohort, nowMs, resolveRows: TEST_RESOLVE_ROWS,
    });
    const { driveScore } = await gather();
    expect(driveScore.unavailable_legs.map((l) => l.leg)).not.toContain('leg1_landed');
    expect(driveScore.measured_legs.map((m) => m.leg)).toContain('leg1_landed');
  });

  it('[TS-4, WIRING population-discrimination guard] leg1 stays unavailable when open_items_all looks landed but done[] is empty — the wiring must never read from open_items_all', async () => {
    // The forbidden population (open_items_all is definitionally not-landed per LEG1-001's own
    // premise) is populated with REAL-looking landed keys, while done[] -- the only population
    // buildGather is allowed to feed leg1 -- stays empty. If the wiring ever silently swapped
    // populations, this fixture would make leg1 measure landed; it must not.
    const gather = buildGather({
      supabase: {},
      computePlanCheckStatus: async () => ({
        open_total: 0, next: [], next_truncated: false, slipped: [],
        open_items_all: [
          { id: 'o1', wave_id: 'w1', title: 'A', promoted_to_sd_key: 'SD-REALLY-LANDED-001', item_disposition: 'pending', remainder_state: 'promotable_now', lane: null, metadata: {}, sd: null },
        ],
        waves: [],
        done: [],
      }),
      gatherCapacity, persistVerdict: persistTableAbsent, runGitLog, readLeg2Cohort, nowMs, resolveRows: TEST_RESOLVE_ROWS,
    });
    const { driveScore } = await gather();
    expect(driveScore.unavailable_legs.map((l) => l.leg), 'leg1 must stay unavailable -- done[] is empty regardless of what open_items_all contains').toContain('leg1_landed');
    expect(driveScore.measured_legs.map((m) => m.leg)).not.toContain('leg1_landed');
  });

  it('[TS-4b, scorer-level population-discrimination guard] scoring the SAME predicate against open_items_all instead of done[] must NOT read as landed', async () => {
    // Same-test negative control, proving the fixture is non-vacuous: done[] and open_items_all
    // are constructed to DISAGREE by design (real landed keys in done[], fabricated never-landed
    // keys in open_items_all). Scoring against done[] must be non-zero; scoring the identical
    // predicate against a done[]-shaped read of open_items_all must be 0. A future edit that
    // silently reverts the population back to open_items_all (the LEG1-001-forbidden population)
    // fails this test loudly rather than shipping a false measurement.
    const { scoreLeg1ALocal } = await import('../../../lib/drive-loop/score/leg1-landed-alocal.js');
    const doneItems = [{ item_id: 'd1', sd_key: 'SD-REALLY-LANDED-001' }];
    const openItemsAll = [
      { id: 'o1', promoted_to_sd_key: 'SD-FAKE-NEVER-MERGED-001' },
      { id: 'o2', promoted_to_sd_key: 'SD-FAKE-ALSO-NEVER-001' },
    ];
    const fromDone = scoreLeg1ALocal({ items: doneItems, runGitLog });
    expect(fromDone.points.value).toBeGreaterThan(0);

    // The forbidden population, read through the SAME done[]-shaped contract (sd_key field) so
    // the two calls are apples-to-apples -- a caller who reverted the population would pass
    // exactly this shape.
    const fromOpenItemsAll = scoreLeg1ALocal({
      items: openItemsAll.map((o) => ({ item_id: o.id, sd_key: o.promoted_to_sd_key })),
      runGitLog,
    });
    expect(fromOpenItemsAll.points.value, 'the forbidden population must never read as landed against these fabricated keys').toBe(0);
  });
});

/**
 * SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 — computeLeg2: cohort selection, window anchor, and failure
 * isolation. The reader's own SELECT logic (nearest fully-elapsed cohort, live refetch, integrity
 * check) is unit-tested against a fake supabase client in
 * tests/unit/drive-loop/score/leg2-cohort-reader.test.js; these tests exercise computeLeg2's
 * CONTRACT with that reader — a plain function stub is enough here, matching how the sibling
 * `gather — what this job can HONESTLY measure today` block above stubs its own dependencies.
 */
describe('SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 — computeLeg2 wiring', () => {
  const RANKED_AT = '2026-08-06T09:00:00.000Z'; // 24h before the report nowMs used below
  const REPORT_NOW = Date.parse('2026-08-07T09:00:00.000Z');
  const claimedSd = (id, agoMs) => ({
    id, sd_key: id,
    metadata: { claim_history: [{ session_id: 's', claimed_at: new Date(Date.parse(RANKED_AT) + LEG2_CLAIM_WINDOW_MS - agoMs).toISOString() }] },
  });

  it('TS-1 [HAPPY PATH] a fully-elapsed cohort with a claimed SD is measured, not unavailable', async () => {
    const cohort = {
      rankedAt: RANKED_AT,
      rankedTop5: [claimedSd('SD-A', 1000)],
      cohortSize: 1,
      integrityOk: true,
    };
    const leg = await computeLeg2({ readLeg2Cohort: async () => cohort, nowMs: REPORT_NOW });
    expect(leg.unavailable, 'a real cohort with a real claim must not be unavailable').toBeUndefined();
    expect(leg.fraction.value).toBe(1);
    expect(leg.fraction.citation.row_ids).toEqual(['SD-A']);
  });

  it('TS-4 no fully-elapsed cohort yet — unavailable, never a scored zero', async () => {
    const leg = await computeLeg2({ readLeg2Cohort: async () => null, nowMs: REPORT_NOW });
    expect(leg.unavailable.available).toBe(false);
    expect(leg.unavailable.value).toBe(null);
    expect(leg.unavailable.reason).toMatch(/no ranked-top-5 snapshot cohort/);
  });

  it('TS-3 [WINDOW-ANCHOR INVARIANCE] the fraction is identical whether the report fires at ET-05 or ET-08', async () => {
    // Same cohort (same rankedAt, same claim data). The self-healing window can fire this report
    // anywhere from 21h to 27h after ranking — computeLeg2 must not let that drift change the
    // measured fraction, because it anchors nowMs to cohort.rankedAt, not to its own argument.
    const cohort = { rankedAt: RANKED_AT, rankedTop5: [claimedSd('SD-A', 1000)], cohortSize: 1, integrityOk: true };
    const at05 = Date.parse('2026-08-07T05:00:00.000Z'); // 20h after ranked_at
    const at08 = Date.parse('2026-08-07T13:00:00.000Z'); // 28h after ranked_at
    const legAt05 = await computeLeg2({ readLeg2Cohort: async () => cohort, nowMs: at05 });
    const legAt08 = await computeLeg2({ readLeg2Cohort: async () => cohort, nowMs: at08 });
    expect(legAt05.fraction.value).toBe(legAt08.fraction.value);
    expect(legAt05.points.value).toBe(legAt08.points.value);
  });

  it('TS-10/R8 a live-refetch shortfall is a data-integrity flag, never a silently shrunk denominator', async () => {
    const cohort = { rankedAt: RANKED_AT, rankedTop5: [claimedSd('SD-A', 1000)], cohortSize: 5, integrityOk: false };
    const leg = await computeLeg2({ readLeg2Cohort: async () => cohort, nowMs: REPORT_NOW });
    expect(leg.unavailable.available).toBe(false);
    expect(leg.unavailable.reason).toMatch(/data-integrity mismatch/);
    expect(leg.unavailable.reason).toMatch(/recorded 5 SD\(s\)/);
  });

  it('TS-5/R7 a rejecting cohort reader is caught, never crashes gather() — leg2 degrades to unavailable', async () => {
    const leg = await computeLeg2({
      readLeg2Cohort: async () => { throw new Error('relation "drive_rank_snapshots" does not exist'); },
      nowMs: REPORT_NOW,
    });
    expect(leg.unavailable.available).toBe(false);
    expect(leg.unavailable.reason).toMatch(/leg2 cohort read\/score failed/);
    expect(leg.unavailable.reason).toMatch(/drive_rank_snapshots/);
  });

  it('[FULL GATHER] a rejecting readLeg2Cohort does not take down the other legs or sections', async () => {
    const status = { open_total: 1, next: [], next_truncated: false, done: [], slipped: [], open_items_all: [] };
    const gather = buildGather({
      supabase: {}, computePlanCheckStatus: async () => status,
      gatherCapacity: async () => ({ idleNow: 0, freeingSoon: 0, claimableCount: 0, openQfCount: 0 }),
      persistVerdict: async () => { const e = new Error('relation does not exist'); e.code = 'PGRST205'; throw e; },
      // SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001: status.done is [] above -- never invoked,
      // mandatory injection only.
      runGitLog: () => [],
      readLeg2Cohort: async () => { throw new Error('boom'); },
      nowMs: REPORT_NOW,
      resolveRows: TEST_RESOLVE_ROWS,
    });
    const { driveScore } = await gather();
    const ids = driveScore.unavailable_legs.map((l) => l.leg);
    expect(ids, 'leg1 and leg4 must still be present despite leg2 throwing').toEqual(['leg1_landed', 'leg2_uptake', 'leg4_capacity']);
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
// Module-scoped (not describe-scoped) so the FR-4 AC-5 block below can reuse the identical real
// gather() pipeline rather than re-declare a second, potentially-drifting fixture.
/**
 * SD-LEO-INFRA-DRIVE-SCORE-PER-001 (FR-3): buildGather now REFUSES an uninjected resolveRows, so
 * every construction below supplies one. This stub resolves whatever it is asked, which is correct
 * for THESE tests — none of them is about citation resolution, and their fixture ids exist in no
 * real table, so a strict resolver would turn every unrelated pin into a citation failure.
 *
 * An echo resolver is precisely the vacuous shape the control must not have in production, and it
 * is proven not to have one in tests/unit/drive-loop/score/verify-leg-citations.test.js, where the
 * any-table resolver is asserted to ACCEPT the defective drive-2026-08-12 row while the
 * table-scoped one rejects it. Named here so a later reader does not mistake this stub for the
 * contract.
 */
const TEST_RESOLVE_ROWS = async (_table, ids) => ids;

const E2E_STATUS = { open_total: 42, next: [{ item_id: 'i1' }], next_truncated: false, done: [], slipped: [] };
const realGather = (nowMs = Date.UTC(...JULY, 10, 0, 0)) => buildGather({
  supabase: {}, computePlanCheckStatus: async () => E2E_STATUS,
  gatherCapacity: async () => ({ idleNow: 1, freeingSoon: 0, claimableCount: 0, openQfCount: 0 }),
  persistVerdict: async () => { const e = new Error('relation does not exist'); e.code = 'PGRST205'; throw e; },
  runGitLog: () => [], // E2E_STATUS.done is [] above -- never invoked, mandatory injection only.
  // SD-LEO-INFRA-DRIVE-SCORE-LEG2-001: no snapshot cohort has ever been ranked in this E2E
  // fixture world; leg2 stays unavailable, unchanged from before this SD.
  readLeg2Cohort: async () => null,
  nowMs,
  resolveRows: TEST_RESOLVE_ROWS,
});

describe('[END-TO-END] the sweep drives the REAL producer — no stub in between', () => {

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

// SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-4 AC-5. This is the ONE consumer-guard site that lives
// in THIS file rather than the hourly sweep's own: the daily sweep's own already-produced check
// (findExisting, injected by the CLI at drive-report-sweep.mjs:541) relies solely on the two
// window-key schemes being string-disjoint to avoid ever matching an hourly row. The disjointness
// of the KEY FORMATS is already proven exhaustively in drive-report-hourly-sweep.test.js; this
// proves the CONSUMING function — findExisting as actually used inside runDriveReportSweep's
// already-produced check — is not fooled when an hourly row genuinely coexists in the same table.
// A test-only addition; the daily sweep's own production code is untouched (PRD TR-1).
describe('[SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-4 AC-5] the daily already-produced check is never fooled by a coexisting hourly row', () => {
  const IN_WINDOW = Date.UTC(...JULY, 10, 0, 0); // 06:00 ET, drive-2026-07-15

  it('an hourly row for the same day does NOT make the daily sweep think it already ran', async () => {
    // Seeds ONLY an hourly-scheme row — no daily row exists yet for this window.
    const seeded = [{ run_id: hourlyWindowKey(IN_WINDOW) }];
    const findExisting = async (id) => (seeded.find((x) => x.run_id === id) ? { id: 'row-1' } : null);
    const rows = [];
    const out = await runDriveReportSweep({
      nowMs: IN_WINDOW,
      produce: produceDriveReport,
      gather: realGather(),
      persist: async (row) => { rows.push(row); return { id: `row-${rows.length}` }; },
      findExisting,
    });

    expect(out.written, 'the hourly row must not be mistaken for the daily one').toBe(true);
    expect(rows, 'the daily sweep must still write its own row').toHaveLength(1);
    expect(rows[0].run_id).toBe(windowKey(IN_WINDOW));
    expect(rows[0].run_id).not.toBe(seeded[0].run_id);
  });

  it('[TWO-SIDED] a genuine daily row for the same window IS recognized as already-produced', async () => {
    // Companion to the test above: proves findExisting is not simply vacuously permissive — it
    // still correctly recognizes ITS OWN key scheme, it just does not conflate the other one.
    const seeded = [{ run_id: windowKey(IN_WINDOW) }, { run_id: hourlyWindowKey(IN_WINDOW) }];
    const findExisting = async (id) => (seeded.find((x) => x.run_id === id) ? { id: 'row-1' } : null);
    const rows = [];
    const out = await runDriveReportSweep({
      nowMs: IN_WINDOW,
      produce: produceDriveReport,
      gather: realGather(),
      persist: async (row) => { rows.push(row); return { id: `row-${rows.length}` }; },
      findExisting,
    });

    expect(out).toMatchObject({ ran: true, written: false, skipped: 'already_produced' });
    expect(rows, 'a genuinely already-produced daily window must not write again').toHaveLength(0);
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

  // QF-20260816-435: the [TRAP] test above proves scoreCapacityLeg converts ANY thrown gather to
  // unavailable, using an arbitrary stub. These two prove the REAL gatherCapacityInputs (not a
  // stub) now actually throws when the sessions or SD read fails — the fix this QF makes — and
  // that no belt_capacity_verdicts row gets persisted when it does.
  it('[QF-20260816-435] a real claude_sessions read failure -> leg4 unavailable, nothing persisted', async () => {
    const captured = [];
    const client = { from(n) { return n === 'claude_sessions' ? { select() { throw new Error('sessions down'); } } : { select() { return this; }, eq() { return this; }, in() { return this; }, is() { return this; }, not() { return this; }, gte() { return this; }, order() { return this; }, range() { return Promise.resolve({ data: [], error: null }); }, then(res) { return Promise.resolve({ data: [], error: null }).then(res); } }; } };
    const leg = await scoreCapacityLeg({
      gatherCapacity: () => gatherCapacityInputs(client),
      persistVerdict: okPersist(captured),
    });
    expect(leg.unavailable.reason).toMatch(/sessions down/);
    expect(captured, 'a failed gather must never reach the persist call').toHaveLength(0);
  });

  it('[QF-20260816-435] a real strategic_directives_v2 read failure -> leg4 unavailable, nothing persisted', async () => {
    const captured = [];
    const client = { from(n) { return n === 'strategic_directives_v2' ? { select() { throw new Error('sds down'); } } : { select() { return this; }, eq() { return this; }, in() { return this; }, is() { return this; }, not() { return this; }, gte() { return this; }, order() { return this; }, range() { return Promise.resolve({ data: [], error: null }); }, then(res) { return Promise.resolve({ data: [], error: null }).then(res); } }; } };
    const leg = await scoreCapacityLeg({
      gatherCapacity: () => gatherCapacityInputs(client),
      persistVerdict: okPersist(captured),
    });
    expect(leg.unavailable.reason).toMatch(/sds down/);
    expect(captured, 'a failed gather must never reach the persist call').toHaveLength(0);
  });

  it('buildGather REFUSES an uninjected leg4 rather than defaulting it', () => {
    // A default would make this read as wired while the CLI passed nothing — exactly how `persist`
    // went missing from runDriveReportSweep and threw on every tick with the suite green.
    expect(() => buildGather({ supabase: {}, computePlanCheckStatus: async () => ({}) }))
      .toThrow(/gatherCapacity and persistVerdict must be injected/);
  });

  it('buildGather REFUSES an uninjected runGitLog rather than shelling out silently (SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001)', () => {
    expect(() => buildGather({
      supabase: {},
      computePlanCheckStatus: async () => ({}),
      gatherCapacity: async () => ({}),
      persistVerdict: async () => ({}),
    })).toThrow(/runGitLog must be injected/);
  });

  // SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (TS-9/R6): the third mandatory injection, asserted with the
  // SAME refuse-without-it shape leg4's two injections already have above — an unwired CLI must
  // fail loudly at construction, never hide behind a green stubbed suite.
  it('buildGather REFUSES an uninjected leg2 cohort reader / nowMs rather than defaulting it', () => {
    const okLeg4Args = {
      supabase: {}, computePlanCheckStatus: async () => ({}),
      gatherCapacity: async () => ({}), persistVerdict: async () => ({}),
      // SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001: runGitLog is now ALSO mandatory and its guard
      // runs before this one — satisfy it here so this test isolates the leg2 guard specifically.
      runGitLog: () => [],
    };
    expect(() => buildGather(okLeg4Args))
      .toThrow(/readLeg2Cohort \(function\) and nowMs \(finite number\) must be injected/);
    expect(() => buildGather({ ...okLeg4Args, readLeg2Cohort: async () => null }))
      .toThrow(/readLeg2Cohort \(function\) and nowMs \(finite number\) must be injected/); // nowMs still missing
    expect(() => buildGather({ ...okLeg4Args, readLeg2Cohort: async () => null, nowMs: Date.now(), resolveRows: TEST_RESOLVE_ROWS }))
      .not.toThrow();
  });

  // SD-LEO-INFRA-DRIVE-SCORE-PER-001 (FR-3): the fourth mandatory injection. Here the refusal is
  // the requirement rather than a convention — the citation check is DEFINED by which table it
  // queries, so a defaulted resolver would let the suite prove the check ran while proving nothing
  // about what it asked, which is the exact blindness this SD exists to remove.
  it('buildGather REFUSES an uninjected resolveRows rather than defaulting the citation check', () => {
    const okArgs = {
      supabase: {}, computePlanCheckStatus: async () => ({}),
      gatherCapacity: async () => ({}), persistVerdict: async () => ({}),
      runGitLog: () => [], readLeg2Cohort: async () => null, nowMs: Date.now(),
    };
    expect(() => buildGather(okArgs)).toThrow(/resolveRows must be injected/);
    expect(() => buildGather({ ...okArgs, resolveRows: TEST_RESOLVE_ROWS })).not.toThrow();
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
    // SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (TS-9): the third injection, at the SAME CLI edge —
    // prospective testing-agent risk R6 measured this file's own precedent (persist going
    // missing from runDriveReportSweep, suite green) and found leg2's reader had zero coverage
    // here before this SD.
    expect(src, 'the CLI must supply the real cohort reader, bound to the real supabase client').toMatch(
      /readLeg2Cohort:\s*\([^)]*\)\s*=>\s*readRankedTop5Cohort\(supabase,/
    );
    expect(src, 'and the real report clock, not a second Date.now() read').toMatch(/nowMs:\s*cliNowMs/);
    // SD-LEO-INFRA-DRIVE-SCORE-PER-001 (FR-3): the FOURTH injection, at the same CLI edge. Found
    // missing by the EXEC testing-agent: buildGather REFUSES an absent resolveRows (so the
    // behavioural tests all pass one), but nothing asserted the CLI passes the REAL one — the
    // identical gap that let `persist` go missing from runDriveReportSweep with the suite green.
    expect(src, 'the CLI must supply the real row resolver, bound to the real supabase client').toMatch(
      /resolveRows:\s*makeRowResolver\(supabase\)/
    );
    expect(src, 'and the citation check must actually be CALLED, not merely imported').toMatch(/await\s+verifyLegCitations\(/);
    expect(src, 'the legs array must call computeLeg2').toMatch(/await\s+computeLeg2\(/);
  });
});

/**
 * SD-LEO-FIX-BELT-CAPACITY-VERDICTS-001 — FR-3/TS-1/TS-2/TS-3: persistUnavailable, wired into
 * scoreCapacityLeg's catch block. Best-effort and optional — see that function's own header
 * comment for why a secondary sentinel failure must never be allowed to change what the caller
 * sees, and why the legacy (no persistUnavailable) call shape must stay byte-identical.
 */
describe('SD-LEO-FIX-BELT-CAPACITY-VERDICTS-001 FR-3 — persistUnavailable, wired into the catch block', () => {
  const gatherCapacity = async () => { throw new Error('belt query failed'); };
  const okPersist = (captured) => async (row) => { captured.push(row); return { id: 'verdict-row-1' }; };

  it('TS-1 — a forced gather failure, with persistUnavailable injected, writes exactly one sentinel row and still reports unavailable', async () => {
    const sentinelCalls = [];
    const persistVerdictCalls = [];
    const leg = await scoreCapacityLeg({
      gatherCapacity,
      persistVerdict: okPersist(persistVerdictCalls),
      persistUnavailable: async (row) => { sentinelCalls.push(row); return { id: 'sentinel-row-1' }; },
      runId: 'drive-2026-08-16',
    });

    expect(sentinelCalls, 'exactly one sentinel write').toHaveLength(1);
    expect(sentinelCalls[0]).toMatchObject({ run_id: 'drive-2026-08-16' });
    expect(sentinelCalls[0].detail?.reason, 'the sentinel row must carry the real failure reason').toMatch(/belt query failed/);
    expect(persistVerdictCalls, 'the normal-path writer must never be called on a gather failure').toHaveLength(0);
    expect(leg.leg).toBe('leg4_capacity');
    expect(leg.unavailable.available).toBe(false);
    expect(leg.unavailable.reason).toMatch(/belt query failed/);
    expect(leg.points, 'a sentinel write must never produce points').toBeUndefined();
  });

  it('TS-2 — persistUnavailable itself throwing does not propagate; scoreCapacityLeg still resolves with unavailable()', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const leg = await scoreCapacityLeg({
        gatherCapacity,
        persistVerdict: okPersist([]),
        persistUnavailable: async () => { throw new Error('sentinel table not migrated yet'); },
      });
      expect(leg.unavailable.available).toBe(false);
      expect(leg.unavailable.reason, 'the PRIMARY (gather) failure reason must survive the SECONDARY sentinel failure').toMatch(/belt query failed/);
      expect(consoleErrorSpy, 'the secondary failure must be logged, not silently dropped').toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toMatch(/sentinel table not migrated yet/);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('TS-3 — scoreCapacityLeg constructed WITHOUT persistUnavailable (legacy call shape) attempts no sentinel write of any kind', async () => {
    // Byte-identical to every pre-existing test in the FR-3 block above (none of which pass
    // persistUnavailable and all still pass unmodified) — named explicitly here rather than left
    // implicit across other tests' incidental omission of the parameter.
    const leg = await scoreCapacityLeg({ gatherCapacity, persistVerdict: okPersist([]) });
    expect(leg.unavailable.available).toBe(false);
    expect(leg.unavailable.reason).toMatch(/belt query failed/);
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
