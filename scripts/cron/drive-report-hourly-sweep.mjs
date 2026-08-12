#!/usr/bin/env node
/**
 * SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 — the hourly-cadence sibling of drive-report-sweep.mjs.
 *
 * Chairman-directed (SMS 2026-08-12 19:16Z): "I think hourly makes sense, especially if it helps
 * make any adjustments towards improved drive performance". This adds an hourly reading beside
 * the existing daily one WITHOUT touching the daily sweep's own logic, tests, or registry
 * identity (PRD TR-1) — reusing the EXACT SAME buildGather()/produceDriveReport() the daily
 * sweep uses, so the 3-leg score computed here is not a second representation.
 *
 * ── WHY A NEW SIBLING FILE, NOT A PARAMETER ON THE DAILY SWEEP ────────────────────────────────
 * runDriveReportSweep hardcodes cadence:'scheduled' and derives its idempotence key from the
 * ET-calendar-day windowKey() — both wrong for an hourly cadence, and the established precedent
 * in this codebase for a second cadence-like leg (drive-report-sms-sweep.mjs) already chose a
 * sibling script over parameterizing the daily one, specifically so each job's own registry
 * identity, run-id scheme and failure isolation stay independent. Followed here for the same
 * reason: sharing runDriveReportSweep itself would either mutate its cadence contract (breaking
 * the daily sweep) or require threading cadence/runId-fn through it as new parameters no other
 * caller needs.
 *
 * ── THE WINDOW KEY IS UTC-DERIVED, DELIBERATELY NOT ET-WALL-CLOCK-HOUR ────────────────────────
 * The daily sweep's windowKey() uses the ET calendar day, which is correct for a once-daily
 * report aligned to a business day. An HOURLY key has no such alignment need, and using the ET
 * WALL-CLOCK HOUR specifically would be a real hazard: during the DST fall-back transition,
 * 01:00 ET occurs on two genuinely different real instants one hour apart, and a naive
 * hour-string key would collide across them — the second tick would read as "already produced"
 * and silently skip a row. A UTC-derived key sidesteps this by construction: every real instant
 * maps to exactly one UTC hour, and UTC has no DST at all. This is a stronger guarantee than
 * "correctly disambiguate ET DST", so it is used instead of attempting that disambiguation.
 *
 * ── OWN REGISTRY IDENTITY, OWN CAPACITY-VERDICT IDEMPOTENCE KEY (PRD FR-6) ────────────────────
 * Reusing the daily sweep's SD_KEY/PROCESS_KEY would let the two jobs' liveness stamps overwrite
 * each other — this workflow family has NO OTHER failure alarm by design (periodic-liveness-watcher.mjs
 * is it), so a collision does not merely degrade the alarm, it removes it. Reusing the daily
 * sweep's capacityRunId (its own windowKey()) for the leg4 capacity-verdict write would silently
 * accumulate ~24 duplicate rows/day in belt_capacity_verdicts, which carries no unique constraint
 * on run_id. Both use their own hourly-scheme keys instead.
 *
 * ── GATED BEHIND HOURLY_SWEEP_ENABLED, DELIBERATELY NOT DRIVE_CADENCE (PRD TR-2) ──────────────
 * DRIVE_CADENCE already exists in this codebase (scripts/drive-report-produce.mjs's dead
 * isMainModule CLI block) and is read as the cadence VALUE itself
 * (`cadence: process.env.DRIVE_CADENCE || 'scheduled'`), not a boolean switch. Reusing it as an
 * on/off gate here would risk exactly the confusion that variable's existing (if unused) contract
 * invites. HOURLY_SWEEP_ENABLED is new and unambiguous: this workflow can merge and deploy before
 * the chairman-gated cadence-widening migration is applied, and stays inert until the flag is set
 * to the literal string 'true' — decoupling code deploy from schema-apply timing (the CHECK
 * violation code, 23514, is not in this family's TABLE_ABSENT graceful-degradation list, so an
 * unguarded hourly job would hard-fail in the merge-to-apply window).
 *
 * ── NO WITHIN-WINDOW GATE ──────────────────────────────────────────────────────────────────────
 * Unlike the daily sweep (a single self-healing 05:00-08:59 ET window for one report/day), the
 * hourly sweep is meant to fire on every scheduled tick, all day. There is no ET-hour admission
 * gate here — the workflow's own cron schedule is the only cadence control.
 */

import { isMainModule } from '../../lib/utils/is-main-module.js';
import { buildGather } from './drive-report-sweep.mjs';
import { produceDriveReport } from '../drive-report-produce.mjs';
import { registerArmedMachinery, armedProcessKey } from '../../lib/machinery-class/armed-registration.js';
import { LAST_RUN_FIELD } from '../../lib/drive-loop/report-posture.js';

// Suffixed, matching the existing SMS_SD_KEY precedent in drive-report-sms-sweep.mjs — a sibling
// leg's own identity, never the producer's, so the two liveness alarms cannot mask each other.
export const HOURLY_SD_KEY = 'SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001-sweep';
export const HOURLY_ACTIVATION_TRIGGER = '.github/workflows/drive-report-hourly-cron.yml';
export const HOURLY_EXPECTED_INTERVAL_SECONDS = 60 * 60;
export const HOURLY_PROCESS_KEY = armedProcessKey(HOURLY_SD_KEY);

/**
 * UTC-derived, DST-immune hour-granular idempotence key. See file header for why this is UTC
 * rather than ET-wall-clock-hour. Format: `drive-hourly-YYYY-MM-DDTHH`, e.g.
 * `drive-hourly-2026-08-13T05` — provably disjoint from the daily windowKey()'s
 * `drive-YYYY-MM-DD` format (contains 'hourly' and 'T', which the daily key never does) and from
 * itself across any two distinct UTC hours.
 *
 * @param {number} nowMs
 */
export function hourlyWindowKey(nowMs) {
  if (!Number.isFinite(nowMs)) {
    throw new Error('hourlyWindowKey(): nowMs must be a finite number — an implicit clock makes the key unreproducible');
  }
  return `drive-hourly-${new Date(nowMs).toISOString().slice(0, 13)}`;
}

/**
 * @param {object} o
 * @param {number} o.nowMs injected — the idempotence key is a pure function of this
 * @param {Function} o.produce produceDriveReport, injected so writes are observed, never assumed
 * @param {Function} o.gather buildGather({...cadence-agnostic...})'s returned closure
 * @param {Function} o.persist the real drive_reports insert, table-absent-aware
 * @param {Function} [o.register] registerArmedMachinery, bound to THIS sweep's own identity
 * @param {Function} [o.findExisting] the run_id-equality idempotence probe
 * @param {Function} [o.log]
 */
export async function runDriveReportHourlySweep({
  nowMs, produce, gather, persist, register = null, findExisting = null, log = () => {},
} = {}) {
  if (typeof produce !== 'function' || typeof gather !== 'function' || typeof persist !== 'function') {
    throw new Error('runDriveReportHourlySweep(): produce, gather, and persist must be injected — a sweep whose write is hidden cannot be tested for whether it ran');
  }

  const runId = hourlyWindowKey(nowMs);

  if (register) {
    const r = await register({ activationTrigger: HOURLY_ACTIVATION_TRIGGER, expectedIntervalSeconds: HOURLY_EXPECTED_INTERVAL_SECONDS });
    if (r && r.ok === false) log(`registry: registration failed (${r.error}) — continuing; the report matters more than its bookkeeping`);
  }

  const result = await produce({
    gather,
    persist,
    findExisting,
    runId,
    generatedAt: new Date(nowMs).toISOString(),
    cadence: 'hourly',
  });

  const blocked = result?.row === undefined && result?.id === null && result?.written === true;
  if (blocked || result?.blocked) {
    log('BLOCKED: the hourly report could not be persisted (table absent) — registry deliberately NOT stamped');
    return { ran: true, blocked: 'table_absent', run_id: runId };
  }

  log(result.written ? `produced hourly report for ${runId}` : `${result.skipped} for ${runId}`);
  return { ran: true, run_id: runId, ...result };
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────
if (isMainModule(import.meta.url)) {
  // PRD TR-2: this gate is the whole reason the workflow can merge before the chairman-gated
  // migration is applied. A strict string-equality check, not a truthiness check — an
  // accidentally-set HOURLY_SWEEP_ENABLED='false' or '0' must not read as enabled.
  if (process.env.HOURLY_SWEEP_ENABLED !== 'true') {
    console.log('[drive-report-hourly-sweep] HOURLY_SWEEP_ENABLED is not "true" — exiting without writing. '
      + 'This gate exists so the hourly workflow can be merged and deployed before the chairman-gated '
      + 'cadence-widening migration (20260812_drive_reports_hourly_cadence.sql) is applied.');
    process.exit(0);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const { computePlanCheckStatus } = await import('../../lib/roadmap/plan-check-status.js');
  const { gatherCapacityInputs } = await import('../lib/capacity-inputs.mjs');
  const { makeCapacityVerdictPersist } = await import('../lib/capacity-verdict-store.mjs');
  const { runHardenedGit } = await import('../../lib/git/hardened-runner.cjs');
  const { readRankedTop5Cohort } = await import('../../lib/drive-loop/score/leg2-cohort-reader.js');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('drive-report-hourly-sweep: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Read the clock ONCE, matching the daily sweep's own reasoning: the run_id and leg4's
  // capacityRunId must describe the same tick.
  const cliNowMs = Date.now();
  const capacityRunId = hourlyWindowKey(cliNowMs);

  const out = await runDriveReportHourlySweep({
    nowMs: cliNowMs,
    produce: produceDriveReport,
    gather: buildGather({
      supabase,
      computePlanCheckStatus,
      gatherCapacity: () => gatherCapacityInputs(supabase),
      persistVerdict: makeCapacityVerdictPersist(supabase),
      // PRD FR-6: this sweep's OWN key, never the daily sweep's windowKey() — see file header.
      capacityRunId,
      runGitLog: (args) => runHardenedGit(args, { cwd: process.cwd() }).split('\n').filter(Boolean),
      readLeg2Cohort: (nowMsArg, windowMsArg) => readRankedTop5Cohort(supabase, nowMsArg, windowMsArg),
      nowMs: cliNowMs,
    }),
    persist: async (row) => {
      const { data, error } = await supabase.from('drive_reports').insert(row).select('id').single();
      if (error) {
        // Same table-absent handling as the daily sweep's own persist closure, duplicated
        // rather than imported (that closure is defined inline in drive-report-sweep.mjs's CLI
        // block, not exported — importing it would mean editing that file to export it, which
        // PRD TR-1 rules out). The reasoning is identical: between merge and the chairman-gated
        // apply, the migration widening the cadence CHECK has not landed yet, and a missing
        // table/relation must exit cleanly rather than throw on every tick.
        if (error.code === 'PGRST205' || error.code === '42P01') {
          console.warn(`[drive-report-hourly-sweep] drive_reports does not exist yet (${error.code}) — the migration is chairman-gated and unapplied. NOT stamping the registry.`);
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
    register: (opts) => registerArmedMachinery(supabase, { sd_key: HOURLY_SD_KEY }, opts),
    log: (m) => console.log(`[drive-report-hourly-sweep] ${m}`),
  });

  console.log(JSON.stringify({ ...out, row: undefined }));
}
