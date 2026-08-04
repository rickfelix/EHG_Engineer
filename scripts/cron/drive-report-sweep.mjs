#!/usr/bin/env node
/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (TR-1) — the Drive Report dispatcher.
 *
 * The defect class this retires: machinery that is armed but never fired. The producer, the
 * composer, the score legs and the SMS leg all existed and were tested, and NOTHING RAN THEM.
 * This script is the named dispatcher, and .github/workflows/drive-report-cron.yml is the thing
 * that names it. Static wiring is pinned by tests/unit/cron/drive-report-wiring.test.js, so any
 * edge of workflow -> sweep -> producer that decays fails CI instead of going quiet.
 *
 * ── WHY THIS LIVES IN scripts/, NOT lib/drive-loop ────────────────────────────────────────
 * It writes. The FR-7 propose-only scan fails the build on any insert/update/claim/dispatch call
 * under lib/drive-loop, and for a writer that is a REAL violation rather than a false positive.
 * The guard decided the layout; this is not a preference.
 *
 * ── THE WINDOW KEY IS THE IDEMPOTENCE KEY, AND IT IS NOT GITHUB_RUN_ID ────────────────────
 * This is the subtle one. GITHUB_RUN_ID is unique PER FIRE, so on a self-healing window that
 * ticks every 15 minutes it would key every tick differently and write a row every tick. Section
 * 5 computes report-over-report deltas against the immediately prior row, so the trend would
 * silently become a sequence of 15-minute self-comparisons instead of day-over-day movement —
 * a corrupted history that reads like a very quiet week.
 *
 * So the key is the WINDOW: `drive-YYYY-MM-DD` on the America/New_York calendar. The first tick
 * that succeeds writes the row; every later tick in the same window finds it and reports
 * `already_produced`. That is what makes the window self-healing BY CONSTRUCTION rather than by
 * a second mechanism that can drift out of sync with the first: if the first tick failed, the
 * next one simply finds nothing and produces. There is no retry bookkeeping to get wrong.
 *
 * ── DUAL CRON LINES, ONE ET WINDOW (TR-1) ─────────────────────────────────────────────────
 * GitHub cron is UTC and does not observe DST, so a single UTC schedule drifts an hour twice a
 * year. Both candidate schedules are registered permanently and the runner decides: withinWindow
 * admits a tick only if the AMERICA/NEW_YORK wall-clock hour is in the window. The union of two
 * UTC schedules, filtered by the ET hour, is exactly one ET window in both offsets — the halves
 * only work together, which is why the test asserts the ADMITTED SET rather than either half.
 *
 * ── WHAT A RUN CAN HONESTLY MEASURE TODAY ─────────────────────────────────────────────────
 * Section 1 only. The other sections and every leg report `unavailable` WITH A SPECIFIC REASON,
 * which is exactly the machinery FR-7 exists for: unmeasurable over an explicitly reduced
 * denominator, never zero. This is deliberate and it is not a stub — see buildGather, where each
 * reason states the actual blocker. In particular, sourcing the item-based sections from
 * computePlanCheckStatus().next would be WRONG, not merely incomplete: that array is capped at 10.
 */

import { buildPlanPosition } from '../../lib/drive-loop/sections/plan-position.js';
import { SECTION_ID as BELT_ID } from '../../lib/drive-loop/sections/belt-diagnosis.js';
import { SECTION_ID as CHAIN_ID } from '../../lib/drive-loop/sections/chain-to-gate.js';
import { SECTION_ID as ACTS_ID } from '../../lib/drive-loop/sections/next-acts.js';
import { SECTION_ID as STALL_ID } from '../../lib/drive-loop/sections/stall-deltas.js';
import { LEG_ID as LEG1_ID } from '../../lib/drive-loop/score/leg1-landed.js';
import { LEG_ID as LEG2_ID } from '../../lib/drive-loop/score/leg2-uptake.js';
import { LEG_ID as LEG4_ID } from '../../lib/drive-loop/score/leg4-capacity.js';
import { aggregateScore } from '../../lib/drive-loop/score/aggregate.js';
import { unavailable, LAST_RUN_FIELD } from '../../lib/drive-loop/report-posture.js';
import { armedProcessKey } from '../../lib/machinery-class/armed-registration.js';
import { produceDriveReport } from '../drive-report-produce.mjs';

export const ET_ZONE = 'America/New_York';

/** Inclusive ET hours the report may be produced in. 05:00-08:59 ET. */
export const WINDOW_START_HOUR = 5;
export const WINDOW_END_HOUR = 8;

export const SD_KEY = 'SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B';
export const ACTIVATION_TRIGGER = '.github/workflows/drive-report-cron.yml';
export const EXPECTED_INTERVAL_SECONDS = 24 * 60 * 60;

/**
 * The registry row this sweep registers AND stamps — DERIVED from the same function
 * registerArmedMachinery uses, never written out by hand.
 *
 * This was a hand-written 'drive_report_producer' for about ten minutes. registerArmedMachinery
 * keys its row with armedProcessKey(sdKey) => `g3-armed-<slug>`, so the stamp would have targeted
 * a row that does not exist. A Supabase .update() matching zero rows returns NO ERROR, so the
 * stamp would have failed silently every single run and left the FR-7 alarm stuck on — the exact
 * defect fixed one commit ago, re-introduced one layer up by a plausible-looking constant.
 * Two names for one row is the whole bug; there is now one derivation.
 */
export const PROCESS_KEY = armedProcessKey(SD_KEY);

/**
 * Wall-clock parts in America/New_York. Intl does the DST arithmetic; doing it by hand with a
 * fixed offset is the bug this function exists to not have.
 */
export function etParts(nowMs) {
  if (!Number.isFinite(nowMs)) throw new Error('etParts(): nowMs must be a finite number — an implicit clock cannot be tested at a DST boundary');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ET_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(nowMs));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { year: get('year'), month: get('month'), day: get('day'), hour: Number(get('hour')) };
}

/**
 * The idempotence key: one report per ET calendar day. NOT the GHA run id — see the header.
 */
export function windowKey(nowMs) {
  const { year, month, day } = etParts(nowMs);
  return `drive-${year}-${month}-${day}`;
}

/**
 * Does this tick fall inside the intended ET window? This is the half of the DST handling that
 * lives in the runner: both UTC cron lines fire year-round, and this is what makes their union
 * equal one ET window in both offsets.
 */
export function withinWindow(nowMs) {
  const { hour } = etParts(nowMs);
  const inside = hour >= WINDOW_START_HOUR && hour <= WINDOW_END_HOUR;
  return {
    inside,
    etHour: hour,
    reason: inside
      ? `${hour}:00 ET is inside the ${WINDOW_START_HOUR}:00-${WINDOW_END_HOUR}:59 ET window`
      : `${hour}:00 ET is outside the ${WINDOW_START_HOUR}:00-${WINDOW_END_HOUR}:59 ET window — this is the other DST cron line firing, which is expected, not a fault`,
  };
}

/**
 * Build the gather function the producer calls.
 *
 * Every `unavailable` reason below is a MEASURED blocker, not a shrug. Read them before
 * "finishing" any of them — two are traps where the obvious wiring produces a confidently wrong
 * number rather than an incomplete one.
 */
export function buildGather({ supabase, computePlanCheckStatus }) {
  // Stated once; three sections share it.
  const CAPPED_SOURCE = 'the only item set available today is computePlanCheckStatus().next, which is CAPPED AT 10. '
    + 'Classifying those as the belt would describe ten items while rendering as the whole belt — a wrong number, not a short list. '
    + 'This needs an UNCAPPED roadmap_wave_items-to-SD join, and it must be the same representation section 1 cites rather than a second derivation of the remainder (TR-5)';

  return async function gather() {
    const sections = {
      // The only section with a real, single-representation source today (TR-5: cite the
      // enriched computePlanCheckStatus rather than becoming a fourth wave rollup).
      plan_position: await buildPlanPosition({ computePlanCheckStatus, supabase }),

      [BELT_ID]: { section: BELT_ID, unavailable: unavailable(`belt items are not sourced: ${CAPPED_SOURCE}`) },
      [CHAIN_ID]: { section: CHAIN_ID, unavailable: unavailable(`chain resolution is not sourced: roadmap waves are not queried by this job, and ${CAPPED_SOURCE}`) },
      [ACTS_ID]: { section: ACTS_ID, unavailable: unavailable(`per-item next acts are not sourced: ${CAPPED_SOURCE}`) },

      // NOT an empty array. computeItemDeltas with an empty current set and a prior report
      // returns closed = EVERY item the prior report saw — it would report the entire belt as
      // completed since the last run. Verified by reading stall-deltas.js computeItemDeltas,
      // not inferred from the signature. An empty default is the dangerous option here.
      [STALL_ID]: {
        section: STALL_ID,
        unavailable: unavailable('item ids are not sourced, and an empty set is NOT a safe default: '
          + 'computeItemDeltas would then compute closed = every item the prior report saw and report the whole belt as completed since the last run'),
      },
    };

    // Legs 1, 2 and 4. There is deliberately no leg 3 — "leg 3" appears zero times in the SD and
    // the PRD, and inventing one to make the denominator look like the spec's X/8 would be
    // fabricating a measurement. aggregateScore already discloses that the denominator is
    // unratified, and excludes unavailable legs from it rather than scoring them zero.
    const legs = [
      { leg: LEG1_ID, unavailable: unavailable('scoreLeg1 needs the same uncapped chain-item set as the belt sections, plus a git runner in the job; neither is wired into this cron') },
      { leg: LEG2_ID, unavailable: unavailable('scoreLeg2 needs the ranked top-5 backlog, which this job does not query') },
      { leg: LEG4_ID, unavailable: unavailable('scoreLeg4 needs coordinator-capacity-forecast\'s computeVerdict AND a persist for the durable verdict row it cites (FR-2); that writer belongs in this script layer and is not built') },
    ];

    return { sections, driveScore: aggregateScore({ legs }) };
  };
}

/**
 * @param {object} o
 * @param {number} o.nowMs injected — the whole DST property is a function of this
 * @param {Function} o.produce the producer (injected so writes are OBSERVED, never assumed)
 * @param {Function} o.gather
 * @param {Function} [o.register] registerArmedMachinery
 * @param {Function} [o.stamp] writes LAST_RUN_FIELD = now on the registry row
 * @param {Function} [o.findExisting]
 */
export async function runDriveReportSweep({ nowMs, produce, gather, register = null, stamp = null, findExisting = null, log = () => {} } = {}) {
  if (typeof produce !== 'function' || typeof gather !== 'function') {
    throw new Error('runDriveReportSweep(): produce and gather must be injected — a sweep whose write is hidden cannot be tested for whether it ran');
  }

  const gate = withinWindow(nowMs);
  if (!gate.inside) {
    // REPORTED, never disguised as success, and deliberately NOT touching the registry: an
    // out-of-window tick did not fail, it simply was not this schedule's turn. Nulling the
    // last-fired stamp here would make the other DST cron line reset the alarm every day.
    log(`skipped: ${gate.reason}`);
    return { ran: false, skipped: 'outside_et_window', et_hour: gate.etHour, reason: gate.reason };
  }

  const runId = windowKey(nowMs);

  // ORDER IS LOAD-BEARING, AND IT IS THE OPPOSITE OF THE OBVIOUS ONE.
  // registerArmedMachinery upserts last_fired_at: null. Stamping BEFORE registering therefore
  // erases the stamp on every run, which puts the FR-7 staleness alarm permanently back into the
  // stuck-on state this SD just fixed — while every individual piece still looks correct. The
  // register-then-stamp order is pinned by test, because nothing about reading this code makes
  // the hazard visible.
  if (register) {
    const r = await register({ activationTrigger: ACTIVATION_TRIGGER, expectedIntervalSeconds: EXPECTED_INTERVAL_SECONDS });
    if (r && r.ok === false) log(`registry: registration failed (${r.error}) — continuing; the report matters more than its bookkeeping`);
  }

  const result = await produce({
    gather,
    findExisting,
    runId,
    generatedAt: new Date(nowMs).toISOString(),
    cadence: 'scheduled',
  });

  // Stamp on either healthy outcome. `already_produced` means a report for this window EXISTS,
  // which is precisely what the alarm asks about — treating it as "did not run" would make every
  // tick after the first re-arm the alarm. A genuine failure throws before reaching here and
  // leaves the stamp alone, so the alarm fires. Fail-closed, and able to clear.
  if (stamp) await stamp({ processKey: PROCESS_KEY, field: LAST_RUN_FIELD, at: new Date(nowMs).toISOString() });

  log(result.written ? `produced report for ${runId}` : `${result.skipped} for ${runId}`);
  return { ran: true, run_id: runId, et_hour: gate.etHour, ...result };
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────
// Everything above is pure of clocks and clients; this block is the thin edge that supplies the
// real ones. Nothing here is decision logic, deliberately.
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  const { createClient } = await import('@supabase/supabase-js');
  const { computePlanCheckStatus } = await import('../../lib/roadmap/plan-check-status.js');
  const { registerArmedMachinery } = await import('../../lib/machinery-class/armed-registration.js');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Refuse rather than run against a half-configured client: every query would fail one at a
    // time and the run would look like "the data was unmeasurable" instead of "we were not
    // authenticated", which are the same output and opposite problems.
    throw new Error('drive-report-sweep: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const out = await runDriveReportSweep({
    nowMs: Date.now(),
    produce: produceDriveReport,
    gather: buildGather({ supabase, computePlanCheckStatus }),
    findExisting: async (id) => {
      const { data } = await supabase.from('drive_reports').select('id').eq('run_id', id).maybeSingle();
      return data || null;
    },
    register: (opts) => registerArmedMachinery(supabase, { sd_key: SD_KEY }, opts),
    stamp: async ({ processKey, field, at }) => {
      const { error } = await supabase.from('periodic_process_registry').update({ [field]: at }).eq('process_key', processKey);
      if (error) console.warn(`[drive-report-sweep] stamp failed: ${error.message}`);
    },
    log: (m) => console.log(`[drive-report-sweep] ${m}`),
  });

  console.log(JSON.stringify({ ...out, row: undefined }));
}
