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
import { SECTION_ID as BELT_ID, buildBeltDiagnosis } from '../../lib/drive-loop/sections/belt-diagnosis.js';
import { SECTION_ID as CHAIN_ID, buildChainToGate } from '../../lib/drive-loop/sections/chain-to-gate.js';
import { SECTION_ID as ACTS_ID, buildNextActs } from '../../lib/drive-loop/sections/next-acts.js';
import { SECTION_ID as STALL_ID } from '../../lib/drive-loop/sections/stall-deltas.js';
import { LEG_ID as LEG1_ID } from '../../lib/drive-loop/score/leg1-landed.js';
// SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001: the chairman-ratified live rule. leg1-landed.js
// (imported above for LEG_ID only) is reference-only now — see its header amendment.
import { scoreLeg1ALocal } from '../../lib/drive-loop/score/leg1-landed-alocal.js';
import { runHardenedGit } from '../../lib/git/hardened-runner.cjs';
import { LEG_ID as LEG2_ID, CLAIM_WINDOW_MS as LEG2_CLAIM_WINDOW_MS, scoreLeg2 } from '../../lib/drive-loop/score/leg2-uptake.js';
// SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (FR-2): the cohort reader is imported here for the CLI wiring
// block at the bottom of this file, and injected into buildGather like every other real dependency
// — never defaulted inside buildGather itself (see the gatherCapacity/persistVerdict precedent below).
import { readRankedTop5Cohort } from '../../lib/drive-loop/score/leg2-cohort-reader.js';
import { LEG_ID as LEG4_ID, scoreLeg4 } from '../../lib/drive-loop/score/leg4-capacity.js';
// SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 (FR-3): the ladder, shared with the capacity forecast so
// the two ends cannot drift into two spellings; and BELT_BUFFER, whose calibration the forecast owns.
import { computeBeltVerdict } from '../../lib/drive-loop/belt-verdict.js';
import { BELT_BUFFER } from '../lib/capacity-inputs.mjs';
import { aggregateScore } from '../../lib/drive-loop/score/aggregate.js';
import { verifyLegCitations, makeRowResolver } from '../../lib/drive-loop/score/verify-leg-citations.js';
import { unavailable, LAST_RUN_FIELD } from '../../lib/drive-loop/report-posture.js';
import { armedProcessKey } from '../../lib/machinery-class/armed-registration.js';
import { produceDriveReport } from '../drive-report-produce.mjs';
// QF-20260807-118: canonical cross-platform entry guard. The hand-rolled
// `file://${process.argv[1]}`.replace(...) form this replaces NEVER fired on Windows — and the
// widened class-guard lint found this file only after that blind spot was closed.
import { isMainModule } from '../../lib/utils/is-main-module.js';

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
 * leg4, WIRED — SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001, FR-3.
 *
 * Replaces the `unavailable` branch whose reason string named exactly what was missing:
 * "coordinator-capacity-forecast's computeVerdict AND a persist for the durable verdict row it
 * cites". Both now exist, so both are supplied.
 *
 * ── scoreLeg4 IS SYNCHRONOUS ALL THE WAY THROUGH, AND THAT DICTATES THIS SHAPE ────────────────
 * leg4-capacity.js:61 calls `computeVerdict()` and :74 calls `persist(...)` WITHOUT await, then
 * reads `row?.id`. Handing it an async persist would have been the quiet disaster: the insert
 * returns a Promise, `row?.id` is undefined so the leg cites nothing, the write is never awaited,
 * and a REJECTION becomes an unhandled rejection that scoreLeg4 cannot see — so :72's "fail the leg
 * when persistence throws", the single guarantee TR-2 exists to protect, would silently never fire
 * while the leg scored its 2 points. An async function is type-correct here and behaviourally
 * catastrophic; FR-4 forbids editing the reader, and the reader is right.
 *
 * So durability is PROVEN FIRST: the verdict is computed (pure), the row is written and AWAITED,
 * and only then does scoreLeg4 run with a synchronous persist that hands back the row already on
 * disk. Persist-before-score is not merely preserved, it is strengthened — no score can exist
 * before the write has landed.
 *
 * THE SYNC persist RE-CHECKS RATHER THAN RUBBER-STAMPS. It compares the row leg4 built against the
 * row that was actually written and throws on any disagreement. Without that it would be a shell
 * game: returning an id for a row assembled from a second, parallel derivation. If a future edit
 * changes leg4's ladder or its row shape, the two stop matching and the leg fails loudly instead of
 * citing a durable row that does not describe it.
 *
 * A FAILURE DEGRADES TO `unavailable` WITH THE REAL REASON, NEVER TO A SCORE OF 0. That is this
 * report's house posture (report-posture.js) and aggregateScore excludes unavailable legs from the
 * denominator rather than scoring them zero. Letting the throw escape would take the ENTIRE drive
 * report down over one leg — strictly worse than today, where leg4 is simply unavailable.
 */
export async function scoreCapacityLeg({ gatherCapacity, persistVerdict, runId = null } = {}) {
  try {
    const inputs = await gatherCapacity();
    const computeVerdict = () => computeBeltVerdict({
      idleNow: inputs.idleNow,
      freeingSoon: inputs.freeingSoon,
      claimableCount: inputs.claimableCount,
      openQfCount: inputs.openQfCount,
      buffer: BELT_BUFFER,
    });

    // Pure and deterministic, so calling it here and again inside scoreLeg4 yields the same answer.
    const forecast = computeVerdict();
    const written = await persistVerdict({
      run_id: runId,
      verdict: forecast.verdict,
      belt_depth: forecast.beltDepth,
      demand_soon: forecast.demandSoon,
      deficit: forecast.deficit,
      // Names the producer. Without it the sweep's rows land with detail null and the two writers
      // (this and the 10-minute capacity forecast) are distinguishable only by inferring from
      // run_id — which is exactly the kind of implicit join that stops being true quietly.
      detail: { source: 'drive-report-sweep' },
    });

    // A WRITE THAT RETURNED NO ROW IS NOT A WRITE THAT SUCCEEDED, and this guard is the one that
    // can actually fire. The VALIDATION sub-agent found the asymmetry: the field re-check below
    // compares values that both derive from the same pure function over the same closed-over
    // inputs, so it can only fire if leg4 is later edited — a real drift guard, but inert today.
    // `written.id` is the single value arriving from OUTSIDE, and it was unchecked. A persist
    // resolving {}, null or {id: null} scored the full 2 points with verdict_row_id: null, and
    // leg4 rendered "Provenance is the persisted row (unwritten)" — it anticipated the state and
    // printed it honestly while NOTHING failed. Unreachable through the real writer today, because
    // PostgREST .single() guarantees data when error is null; that is a property of the current
    // writer, not of the contract, and it is the wrong thing to depend on silently.
    if (!written?.id) {
      throw new Error('leg4 persist: the durable write returned no row id — refusing to score a leg '
        + 'whose provenance is unproven. A resolved promise is not evidence that a row exists.');
    }

    const persist = (row) => {
      for (const [k, expected] of Object.entries({
        verdict: forecast.verdict,
        belt_depth: forecast.beltDepth,
        demand_soon: forecast.demandSoon,
        deficit: forecast.deficit,
      })) {
        if (row?.[k] !== expected) {
          throw new Error(`leg4 persist: the leg built ${k}=${JSON.stringify(row?.[k])} but the durable row `
            + `carries ${JSON.stringify(expected)} — refusing to cite a row that does not describe this score`);
        }
      }
      return written;
    };

    return scoreLeg4({ computeVerdict, persist, runId });
  } catch (err) {
    // Between merge and the chairman ceremony this is the EXPECTED path: the table is staged and
    // unapplied, the write throws PGRST205/42P01, and leg4 reports unavailable exactly as it does
    // today. That outcome is a PASS (FR-5/TS-7), not a regression — recorded here so a later reader
    // does not "fix" it.
    return { leg: LEG4_ID, unavailable: unavailable(`scoreLeg4 could not be scored this run: ${err?.message || err}`) };
  }
}

/**
 * SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (FR-2/FR-3/FR-5): reads the nearest fully-elapsed ranked-top-5
 * cohort and scores leg2, isolated in try/catch so a broken or missing snapshot (missing table,
 * malformed cohort, scoreLeg2 throwing on bad input) converts to an `unavailable` leg entry rather
 * than crashing the whole gather() call — every OTHER leg and section must still produce a report.
 * Exported so it is independently unit-testable without constructing the full buildGather closure.
 *
 * @param {object} o
 * @param {Function} o.readLeg2Cohort (nowMs, windowMs) => Promise<cohort|null>
 * @param {number} o.nowMs the report's own clock, used only to find the elapsed-window boundary
 */
export async function computeLeg2({ readLeg2Cohort, nowMs }) {
  try {
    const cohort = await readLeg2Cohort(nowMs, LEG2_CLAIM_WINDOW_MS);
    if (!cohort) {
      return { leg: LEG2_ID, unavailable: unavailable('no ranked-top-5 snapshot cohort has fully elapsed its 24h claim window yet (drive_rank_snapshots is empty, or every cohort is still within the open window)') };
    }
    // R8/TR-5: a live-refetch shortfall against the snapshot's own recorded cohort size is a
    // data-integrity condition, not a smaller-but-honest ranked-top-5 — refuse to score against
    // a silently shrunk denominator rather than inflate the fraction.
    if (!cohort.integrityOk) {
      return {
        leg: LEG2_ID,
        unavailable: unavailable(`ranked-top-5 snapshot cohort at ${cohort.rankedAt} recorded `
          + `${cohort.cohortSize} SD(s), but the live refetch returned only ${cohort.rankedTop5.length} — `
          + 'data-integrity mismatch, refusing to score against a silently shrunk denominator'),
      };
    }
    // FR-3: anchor the claim window to WHEN THE COHORT WAS RANKED, not the live report clock —
    // the self-healing 05:00-08:59 ET window can land report time 21-27h after ranking.
    const anchoredNowMs = Date.parse(cohort.rankedAt) + LEG2_CLAIM_WINDOW_MS;
    return scoreLeg2({ rankedTop5: cohort.rankedTop5, nowMs: anchoredNowMs });
  } catch (e) {
    return { leg: LEG2_ID, unavailable: unavailable(`leg2 cohort read/score failed: ${e.message}`) };
  }
}

/**
 * Build the gather function the producer calls.
 *
 * Every `unavailable` reason below is a MEASURED blocker, not a shrug. Read them before
 * "finishing" any of them — two are traps where the obvious wiring produces a confidently wrong
 * number rather than an incomplete one.
 */
export function buildGather({ supabase, computePlanCheckStatus, gatherCapacity, persistVerdict, capacityRunId = null, runGitLog, readLeg2Cohort, nowMs, resolveRows }) {
  // SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 (FR-3): leg4's two injections are REQUIRED here, not
  // defaulted to the real implementations. A default would make this function look wired while the
  // CLI passed nothing — which is precisely how `persist` went missing from runDriveReportSweep and
  // threw on every in-window tick with the whole suite green (see that function's comment). The
  // wiring test asserts the CLI passes the real ones; the behaviour tests pass stubs. Neither can
  // stand in for the other unless the argument is mandatory.
  if (typeof gatherCapacity !== 'function' || typeof persistVerdict !== 'function') {
    throw new Error('buildGather(): gatherCapacity and persistVerdict must be injected — leg4 refuses '
      + 'without them (leg4-capacity.js:57), and a defaulted injection hides an unwired CLI behind a green suite');
  }
  // SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 (FR-2): same mandatory-injection contract as above —
  // leg1's A-LOCAL predicate refuses to silently shell out (leg1-landed-alocal.js), so a missing
  // injection here must fail loudly rather than hide an unwired CLI behind a green suite.
  if (typeof runGitLog !== 'function') {
    throw new Error("buildGather(): runGitLog must be injected — leg1's A-LOCAL predicate refuses to silently shell out");
  }
  // SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (FR-2): same refuse-without-injection pattern as above —
  // an unwired CLI must fail loudly at construction, not hide behind a green stubbed test suite.
  // nowMs is required too: it is the ONLY input readLeg2Cohort uses to find the nearest
  // fully-elapsed snapshot cohort (nowMs - CLAIM_WINDOW_MS), and an implicit clock would make that
  // boundary untestable — the same reasoning scoreLeg2 itself already enforces (leg2-uptake.js:89-93).
  if (typeof readLeg2Cohort !== 'function' || !Number.isFinite(nowMs)) {
    throw new Error('buildGather(): readLeg2Cohort (function) and nowMs (finite number) must be injected — '
      + 'leg2 refuses without them, for the same reason leg4 refuses without gatherCapacity/persistVerdict');
  }
  // SD-LEO-INFRA-DRIVE-SCORE-PER-001 (FR-3): same mandatory-injection contract, and here it is the
  // point rather than a convention — the citation check is DEFINED by which table it queries, so a
  // defaulted resolver would let a test prove the check ran while proving nothing about what it asked.
  if (typeof resolveRows !== 'function') {
    throw new Error('buildGather(): resolveRows must be injected — the citation check is defined by '
      + 'WHICH TABLE it asks about (verify-leg-citations.js), and a defaulted resolver hides an '
      + 'unwired CLI behind a green suite');
  }

  return async function gather() {
    // SD-LEO-INFRA-UNCAPPED-ROADMAP-ITEMS-001 FR-2/FR-3: the CAPPED_SOURCE blocker is gone.
    // computePlanCheckStatus now paginates to completion and exposes `open_items_all` (the
    // UNCAPPED item set) plus `waves`, so the three item-based sections read the SAME
    // representation section 1 cites — no second derivation of the remainder (TR-5).
    //
    // THEY ARE FED open_items_all, NEVER status.next. `next` is still capped at NEXT_LIMIT=10
    // by design, and handing it to these classifiers is the precise failure the previous
    // unavailable-reason warned about: they would emit correctly-shaped output describing ten
    // items while rendering as the whole belt — a wrong number that looks completely reasonable,
    // with every section unit test still green because they are pure functions and would have
    // been handed exactly what they were asked for. The bug would simply move one layer up into
    // this file. That is why the wiring test asserts WHAT IS PASSED here, not what the sections
    // do with it.
    // SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 (FR-2): windowHours widened to 720h (30 days) for
    // leg1's population specifically — measured EMPTY at the 48h default and at 168h (7 days) at
    // PLAN time (open_items_all/waves are NOT window-filtered, verified in plan-check-status.js,
    // so this has no effect on the other consumers below). This is still the ONLY call to
    // computePlanCheckStatus in this function (see the dedupe comment above) — zero new queries.
    const planStatus = await computePlanCheckStatus(supabase, { windowHours: 720 });
    const beltItems = planStatus.open_items_all || [];

    const sections = {
      // The only section with a real, single-representation source today (TR-5: cite the
      // enriched computePlanCheckStatus rather than becoming a fourth wave rollup).
      // DEDUPE: computePlanCheckStatus was being called TWICE per tick — once above for
      // beltItems and again inside buildPlanPosition — measured with a call counter. That is two
      // full paginated scans of v_plan_of_record_remainder, strategic_directives_v2,
      // roadmap_waves and adam_task_ledger every cron tick, plus a narrow window where the two
      // halves of one report could disagree if the DB moved between them. Passing a thunk over
      // the already-fetched result keeps buildPlanPosition's contract intact — it still receives
      // a FUNCTION, and its "the citation target is part of the contract" guard still holds —
      // while the query runs once.
      plan_position: await buildPlanPosition({ computePlanCheckStatus: async () => planStatus, supabase }),

      [BELT_ID]: buildBeltDiagnosis(beltItems),
      [CHAIN_ID]: buildChainToGate({ waves: planStatus.waves || [], items: beltItems }),
      [ACTS_ID]: buildNextActs(beltItems),

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
      // SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001: the chairman-ratified A-LOCAL rule (SMS
      // 2026-08-10T23:26Z, ruling c8ad4998) supersedes the merge-base-ancestry rule
      // SD-LEO-INFRA-DRIVE-SCORE-LEG1-001 measured unearnable (evidence ab82da6b, ruling
      // fea8b4c4). When the (720h-windowed, see above) completed-items population is non-empty,
      // score it for real; an empty window is still a real, honest outcome — never a false 0-of-2
      // — and keeps the exact reason text a prior reader already saw.
      planStatus.done && planStatus.done.length > 0
        ? scoreLeg1ALocal({ items: planStatus.done, runGitLog })
        : { leg: LEG1_ID, unavailable: unavailable('scoreLeg1 is built but its ratified rule (merge-base ancestry, d50b9f12) is unearnable in this delete-branch-on-merge flow — measured 7/111 ancestors over even the favourable completed population (18 branches absent, 86 not-ancestor), and the open-item input set is definitionally not-landed (evidence ab82da6b). Held unavailable pending the chairman decision on the landing-question redefinition (ruling fea8b4c4).') },
      // SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (FR-2/FR-3/FR-5): the ranked-top-5 SNAPSHOT wiring —
      // see computeLeg2 above for the cohort-selection, window-anchor, and failure-isolation logic.
      await computeLeg2({ readLeg2Cohort, nowMs }),
      await scoreCapacityLeg({ gatherCapacity, persistVerdict, runId: capacityRunId }),
    ];

    // SD-LEO-INFRA-DRIVE-SCORE-PER-001 (FR-3): resolve every cited row id against the table ITS OWN
    // leg names, BEFORE aggregating and therefore before the insert. drive_score is append-only (a
    // DB freeze trigger raises on UPDATE), so there is no repair path after this point — a citation
    // that ships wrong ships wrong forever, which is how drive-2026-08-12 became permanent.
    //
    // Running it here rather than inside aggregateScore keeps that function synchronous and pure,
    // and lets an unresolvable leg arrive as an ordinary unavailable leg — reusing the exclusion
    // machinery instead of adding a second path. verifyLegCitations never throws on an unresolvable
    // citation, deliberately: produce() below has no try/catch, so a throw here would take the
    // chairman's daily report offline over a provenance defect.
    const { legs: verifiedLegs, verification } = await verifyLegCitations({ legs, resolveRows });

    return { sections, driveScore: aggregateScore({ legs: verifiedLegs, citationVerification: verification }) };
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
export async function runDriveReportSweep({ nowMs, produce, gather, persist, register = null, stamp = null, findExisting = null, log = () => {} } = {}) {
  if (typeof produce !== 'function' || typeof gather !== 'function') {
    throw new Error('runDriveReportSweep(): produce and gather must be injected — a sweep whose write is hidden cannot be tested for whether it ran');
  }
  // `persist` IS REQUIRED HERE, and that is a fix, not a preference. This function used to accept
  // it implicitly by not mentioning it: the CLI never passed one, produceDriveReport refuses
  // without it, and the cron therefore threw on EVERY in-window tick and never wrote a report.
  // Every test missed it because they all injected a stub `produce`, so the real producer's
  // requirement was never exercised — the wiring test asserted the EDGE (`produce:
  // produceDriveReport`) while the behaviour tests asserted a substitute. Both green, nothing
  // working. Refusing here means the misconfiguration cannot be silent, and it names the sweep
  // rather than surfacing as the producer's error from a stack the operator has to unwind.
  if (typeof persist !== 'function') {
    throw new Error('runDriveReportSweep(): persist must be injected — the producer requires it, and a sweep '
      + 'that omits it fails on every tick while every edge-level wiring assertion still passes');
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
    persist,
    findExisting,
    runId,
    generatedAt: new Date(nowMs).toISOString(),
    cadence: 'scheduled',
  });

  // A BLOCKED RUN IS NOT A HEALTHY ONE — checked BEFORE the stamp, because the stamp is what
  // silences FR-7's alarm and this run produced nothing. Without this the table-absent path
  // would exit cleanly AND stamp, so the alarm would read healthy while no report existed —
  // which is precisely the false-green this instrument is built to refuse, committed by the
  // very code that claims to refuse it. I wrote the comment saying "does NOT stamp" one edit
  // before the code made it true; the comment was the lie, briefly.
  const blocked = result?.row === undefined && result?.id === null && result?.written === true;
  if (blocked || result?.blocked) {
    log('BLOCKED: the report could not be persisted (table absent) — registry deliberately NOT stamped, so the staleness alarm still reports this window as missing');
    return { ran: true, blocked: 'table_absent', run_id: runId, et_hour: gate.etHour };
  }

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
if (isMainModule(import.meta.url)) {
  const { createClient } = await import('@supabase/supabase-js');
  const { computePlanCheckStatus } = await import('../../lib/roadmap/plan-check-status.js');
  const { registerArmedMachinery } = await import('../../lib/machinery-class/armed-registration.js');
  // FR-3 / FR-2: leg4's two injections, resolved at the edge like every other real dependency.
  const { gatherCapacityInputs } = await import('../lib/capacity-inputs.mjs');
  const { makeCapacityVerdictPersist } = await import('../lib/capacity-verdict-store.mjs');

  // BEFORE createClient, not after. This check sat below it and was unreachable dead code:
  // createClient(undefined, undefined) throws "supabaseUrl is required" first. Both orders fail
  // closed, so nothing was insecure — what was lost is exactly the diagnostic this check exists
  // to give, which is the difference between "we were not authenticated" and "the data was
  // unmeasurable". Those render the same and demand opposite responses.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('drive-report-sweep: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Read the clock ONCE. The sweep's window gate and leg4's run_id must describe the same tick;
  // two Date.now() calls could straddle an ET hour boundary and key them to different windows.
  const cliNowMs = Date.now();

  const out = await runDriveReportSweep({
    nowMs: cliNowMs,
    produce: produceDriveReport,
    gather: buildGather({
      supabase,
      computePlanCheckStatus,
      gatherCapacity: () => gatherCapacityInputs(supabase),
      persistVerdict: makeCapacityVerdictPersist(supabase),
      // The SAME window key the report row is written under, so an auditor can join a verdict to
      // the report that cites it. Derived from cliNowMs, not a second clock read.
      capacityRunId: windowKey(cliNowMs),
      // SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 (FR-2): the hardened runner (lib/git/hardened-runner.cjs)
      // is THE published shell-injection-safe git invocation — reused rather than re-derived. Only
      // ever asked `log main --merges --format=%s [--since=...]`, never a caller-controlled ref.
      runGitLog: (args) => runHardenedGit(args, { cwd: process.cwd() }).split('\n').filter(Boolean),
      // SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (FR-2): supabase pre-bound at this CLI edge, same
      // shape as gatherCapacity/persistVerdict above.
      readLeg2Cohort: (nowMsArg, windowMsArg) => readRankedTop5Cohort(supabase, nowMsArg, windowMsArg),
      nowMs: cliNowMs,
      // SD-LEO-INFRA-DRIVE-SCORE-PER-001 (FR-3): supabase pre-bound at this CLI edge, same shape as
      // the injections above. Shared with the hourly sweep rather than re-declared there.
      resolveRows: makeRowResolver(supabase),
    }),
    persist: async (row) => {
      const { data, error } = await supabase.from('drive_reports').insert(row).select('id').single();
      if (error) {
        // TABLE-ABSENT IS A KNOWN STATE, NOT A FAILURE — and telling them apart is this SD's
        // whole thesis applied to its own deployment.
        //
        // The migration is chairman-gated behind --prod-deploy, so between merge and apply this
        // table does not exist. Throwing on that produced ~32 red ticks a day (measured by the
        // REGRESSION sub-agent across both DST cron lines), which normalises red on the Actions
        // tab and masks a genuine failure for anyone triaging by "is anything red today".
        //
        // So a MISSING TABLE exits cleanly with a loud, distinct outcome, and every OTHER error
        // still throws. This path deliberately does NOT stamp the registry, which is correct —
        // stamping here would mark a report that was never written as freshly produced.
        //
        // ⚠️ WHAT THIS DOES **NOT** BUY, corrected after the VALIDATION re-run traced it end to end.
        // An earlier version of this comment claimed the alarm "still reports the report as overdue
        // … now genuinely at 2x cadence rather than the inherited 3x". THAT WAS FALSE ON THIS EXACT
        // PATH — the comment asserted the compensating control while standing in the one branch
        // where it does not fire. Traced:
        //   · grace_multiplier: 2 is written ONLY by stamp(), and stamp() is skipped right here.
        //   · registerArmedMachinery (lib/machinery-class/armed-registration.js) upserts
        //     last_fired_at: null every in-window tick and NEVER sets grace_multiplier, so the row
        //     carries NULL + the column default 3 — not 2.
        //   · periodic-liveness-watcher.mjs:247-248 returns UNVERIFIED (not OVERDUE) for a null
        //     last_fired_at, and UNVERIFIED escalates only past 7 CONTINUOUS DAYS.
        // So between merge and the chairman-gated apply — every tick — nothing alarms at 2x cadence.
        //
        // AC-8 IS satisfied once a report has succeeded ONCE: stamp() then writes both fields, and a
        // >48h gap yields OVERDUE via the watcher's cron. It is UNMET for a report that has NEVER
        // been produced, which is the state at merge and the most missing a report can be.
        // Carried into PLAN-TO-LEAD as a named unmet criterion, never as a limitation.
        if (error.code === 'PGRST205' || error.code === '42P01') {
          console.warn(`[drive-report-sweep] drive_reports does not exist yet (${error.code}) — the migration is chairman-gated and unapplied. NOT stamping the registry. NOTE: with last_fired_at still NULL the watcher reports this as UNVERIFIED, not OVERDUE — the 2x-cadence alarm (AC-8/FR-7) does NOT fire until a report has succeeded at least once.`);
          return { id: null, blocked: 'table_absent' };
        }
        throw new Error(`persist failed: ${error.message}`);
      }
      return data;
    },
    findExisting: async (id) => {
      const { data } = await supabase.from('drive_reports').select('id').eq('run_id', id).maybeSingle();
      return data || null;
    },
    register: (opts) => registerArmedMachinery(supabase, { sd_key: SD_KEY }, opts),
    stamp: async ({ processKey, field, at }) => {
      // grace_multiplier: 2 is NOT decoration — it is FR-7's "past 2x cadence" rule, and without
      // it this row inherits the column default (sampled live: 3), so the alarm the PRD promises
      // at 48h would not fire until 72h.
      //
      // Found by the VALIDATION sub-agent, and the finding was sharper than the number: FR-7's
      // alarm is the COMPENSATING CONTROL for a producer that cannot write, and it degraded in
      // exactly the state this SD ships in. isSelfStale() — which implements the 2x rule — has
      // ZERO production callers; the live path is periodic-liveness-watcher.mjs reading this
      // column. A rule implemented in a function nobody calls is a rule that is not in force.
      const { error } = await supabase.from('periodic_process_registry')
        .update({ [field]: at, grace_multiplier: 2 })
        .eq('process_key', processKey);
      if (error) console.warn(`[drive-report-sweep] stamp failed: ${error.message}`);
    },
    log: (m) => console.log(`[drive-report-sweep] ${m}`),
  });

  console.log(JSON.stringify({ ...out, row: undefined }));
}
