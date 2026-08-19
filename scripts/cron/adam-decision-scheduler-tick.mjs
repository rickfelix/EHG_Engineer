#!/usr/bin/env node
/**
 * Adam decision-scheduler tick — the durable production runner for the away-bridge
 * (lib/comms/adam-outbound/away-bridge/index.js, SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-E),
 * wired to real seams via lib/comms/adam-outbound/decision-scheduler/index.js.
 *
 * SD: SD-LEO-INFRA-ADAM-DECISION-SCHEDULER-001 (FR-2)
 *
 * THE MIGRATION IS APPLIED. THIS RUNNER DOES REAL WORK ON EVERY TICK.
 * This header previously said "sms_outbound_obligations is a STAGED migration, not yet applied
 * live … this sweep exits 0", which invited every reader of the ENTRY POINT to conclude the whole
 * path was inert. MEASURED 2026-08-02T00:47Z: the table resolves, 395 rows, 17 columns, and NINE
 * rows match getOwedDecisions' predicate. This workflow runs ~15x/day.
 *
 * FAIL-SOFT (mechanism, still correct): were the table absent, runDecisionSchedulerTick() would
 * return {ran:true, results:[]} and this sweep would exit 0. That branch is defensive, not the
 * normal case.
 *
 * WHAT ACTUALLY RESTRAINS THIS PATH is the durability refusal in away-bridge, NOT absence of the
 * table: sms_outbound_obligations has no answered/resurface_count/resurfaced_this_window columns
 * (42703 each, against a clean control on id/kind/decision_id), so the window-skip and K-cap
 * cannot fire, and buildOwedStore stamps durabilityUnavailable so the bridge refuses to send.
 * Without that refusal the loop is SELF-AMPLIFYING, not merely repetitive: each re-surface
 * enqueues a row that itself matches the unfiltered predicate (9 -> 18 -> 36 per tick).
 * SD-LEO-INFRA-DECISION-RESURFACE-GUARDS-001 FR-3.
 *
 * Liveness: registers ARMED machinery once (periodic_process_registry, named activation
 * trigger = this cron workflow) and stamps last_fired_at on every real run, mirroring
 * scripts/cron/chairman-decision-sla-sweep.mjs. Static wiring pinned by
 * tests/unit/cron/adam-decision-scheduler-wiring.test.js.
 *
 * Usage:
 *   node scripts/cron/adam-decision-scheduler-tick.mjs --once             # one tick (canonical cron)
 *   node scripts/cron/adam-decision-scheduler-tick.mjs --once --dry-run   # report intent, no writes
 *
 * Env: SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (required)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { runDecisionSchedulerTick } from '../../lib/comms/adam-outbound/decision-scheduler/index.js';
import { registerArmedMachinery, armedProcessKey } from '../../lib/machinery-class/armed-registration.js';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';
import { isSmsQuietHour } from '../../lib/time/chairman-et-wall-clock.js';
import { resolveChairmanZone } from '../../lib/comms/adam-outbound/quiet-hours-extension.js';

export const SD_KEY = 'SD-LEO-INFRA-ADAM-DECISION-SCHEDULER-001';
export const ACTIVATION_TRIGGER = 'sms_outbound_obligations STAGED migration applied by chairman ceremony';

/**
 * DST-aware chairman SMS sleep-window check — 22:00-06:00 in the chairman's zone (a DIFFERENT,
 * SMS-specific window from the general 23:00-05:00 chairman/email quiet window guarded by
 * isWithinChairmanQuietWindow in lib/notifications/resend-adapter.js). Delegates to the
 * canonical lib/time/chairman-et-wall-clock.js boundary (zone-aware since SD-LEO-INFRA-
 * CHAIRMAN-QUIET-WINDOW-001 FR-4) rather than re-deriving the arithmetic here — kept as a
 * named export (not inlined into main()) so this file's existing behavioral test coverage
 * (tests/unit/cron/adam-decision-scheduler-wiring.test.js) keeps importing and calling it
 * directly (FR-5).
 *
 * This RUNTIME check is authoritative. The GHA cron schedule (adam-decision-scheduler-cron.yml)
 * is only a coarse UTC cadence limiter and cannot itself be DST-precise for the window.
 * @param {Date} [now]
 * @param {string} [zone] IANA zone, default 'America/New_York' (FR-5)
 * @returns {boolean}
 */
export function isWithinAdamSmsQuietWindow(now = new Date(), zone) {
  return isSmsQuietHour(now, zone);
}

export function parseArgs(argv) {
  const args = { once: false, dryRun: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') args.once = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

/**
 * Ensure the ARMED registration exists / stays calibrated. Called unconditionally on every tick --
 * registerArmedMachinery is a safe read-before-upsert (SD-LEO-INFRA-STAMP-ARMING-TIME-001 FR-1): it
 * preserves armed_at and never wipes a real last_fired_at on re-registration, but DOES re-assert
 * expected_interval_seconds/workflow_cron/grace_multiplier from these opts every call. A prior
 * `if (!data)` guard here (added when registerArmedMachinery unconditionally wiped last_fired_at,
 * before that FR-1 fix) meant this SD's FR-4 calibration correction below could never reach the
 * already-registered live row -- confirmed via adversarial review of PR #7304 -- so the guard is gone.
 */
async function ensureArmedRegistration(supabase, logger) {
  const processKey = armedProcessKey(SD_KEY);
  try {
    const reg = await registerArmedMachinery(supabase, { sd_key: SD_KEY }, {
      activationTrigger: ACTIVATION_TRIGGER,
      // FR-4 (SD-FDBK-ENH-PERIODIC-LIVENESS-WATCHER-001): corrected from a blind 2h guess to the
      // real active-window cadence (this cron fires hourly during 00-01,11-23 UTC) plus the
      // workflow's own cron string, so FR-1's gap-subtraction can subtract the declared 02:00-
      // 10:59 UTC chairman SMS quiet window instead of that guess relying on padding alone.
      expectedIntervalSeconds: 60 * 60,
      workflowCron: '20 0-1,11-23 * * *',
      owner: 'adam-decision-scheduler-tick',
    });
    if (!reg.ok) logger.warn?.(`[decision-scheduler-tick] ARMED registration failed (non-fatal): ${reg.error}`);
  } catch (err) {
    logger.warn?.(`[decision-scheduler-tick] ARMED registration check failed (non-fatal): ${err.message}`);
  }
  return processKey;
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  if (args.help) {
    logger.log?.('adam-decision-scheduler-tick --once [--dry-run]');
    return { exitCode: 0, action: 'help' };
  }

  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) {
    logger.error?.(`[decision-scheduler-tick] supabase client unavailable: ${err.message}`);
    return { exitCode: 2, action: 'no_supabase' };
  }

  if (args.dryRun) {
    logger.log?.('[decision-scheduler-tick] dry-run: no tick performed');
    return { exitCode: 0, action: 'dry_run' };
  }

  // Liveness first — a genuine invocation is always recorded even if the tick errors below.
  const processKey = await ensureArmedRegistration(supabase, logger);
  try { await (deps.stampLastFired || stampLastFired)(supabase, processKey); }
  catch (err) { logger.warn?.(`[decision-scheduler-tick] liveness stamp failed (non-fatal): ${err.message}`); }

  // Authoritative runtime guard (FR-2 AC) — the GHA schedule is only a coarse cadence
  // limiter and cannot itself be DST-precise for the 22:00-06:00 chairman-zone window.
  const now = deps.now || new Date();
  // SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (FR-5): resolve the chairman's zone the same way
  // as the other callers before invoking the (now zone-aware) quiet-window guard.
  const { zone: chairmanZone } = await (deps.resolveChairmanZone || resolveChairmanZone)(now);
  const quietCheck = deps.isWithinAdamSmsQuietWindow || isWithinAdamSmsQuietWindow;
  if (quietCheck(now, chairmanZone)) {
    logger.log?.(`[decision-scheduler-tick] ${JSON.stringify({ ts: now.toISOString(), action: 'quiet_window_skip' })}`);
    return { exitCode: 0, action: 'quiet_window_skip' };
  }

  const tick = deps.runDecisionSchedulerTick || runDecisionSchedulerTick;
  const result = await tick(supabase, {});
  const summary = {
    ts: new Date().toISOString(),
    ran: result.ran,
    processed: (result.results || []).length,
    error: result.error || null,
  };
  logger.log?.(`[decision-scheduler-tick] ${JSON.stringify(summary)}`);
  return { exitCode: result.ran ? 0 : 1, action: result.ran ? 'ticked' : 'error', summary };
}

/** Windows-safe termination (mirrors scripts/cron/chairman-decision-sla-sweep.mjs::gracefulExit). */
export async function gracefulExit(exitCode, { backstopMs = 4000 } = {}) {
  process.exitCode = exitCode;
  try {
    const undici = await import('undici');
    await undici.getGlobalDispatcher?.()?.close?.();
  } catch { /* undici absent — natural drain still applies */ }
  setTimeout(() => process.exit(exitCode), backstopMs).unref();
}

if (isMainModule(import.meta.url)) {
  main().then(({ exitCode }) => gracefulExit(exitCode))
        .catch((err) => { console.error('adam-decision-scheduler-tick fatal:', err.message); return gracefulExit(2); });
}
