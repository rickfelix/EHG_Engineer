#!/usr/bin/env node
/**
 * Adam decision-scheduler tick — the durable production runner for the away-bridge
 * (lib/comms/adam-outbound/away-bridge/index.js, SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-E),
 * wired to real seams via lib/comms/adam-outbound/decision-scheduler/index.js.
 *
 * SD: SD-LEO-INFRA-ADAM-DECISION-SCHEDULER-001 (FR-2)
 *
 * FAIL-SOFT: sms_outbound_obligations is a STAGED migration, not yet applied live. While
 * absent, runDecisionSchedulerTick() returns {ran:true, results:[]} (owedStore.getOwedDecisions
 * returns [] fail-soft) and this sweep exits 0. Once the migration is applied, the SAME code
 * path processes real owed decision rows -- see the decision-scheduler module header for the
 * documented column-mapping caveat (no answered/resurfaceCount/resurfacedThisWindow columns).
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

export const SD_KEY = 'SD-LEO-INFRA-ADAM-DECISION-SCHEDULER-001';
export const ACTIVATION_TRIGGER = 'sms_outbound_obligations STAGED migration applied by chairman ceremony';

/**
 * DST-aware chairman SMS sleep-window check — 22:00-06:00 America/New_York (a DIFFERENT,
 * SMS-specific window from the general 23:00-05:00 chairman/email quiet window guarded by
 * isWithinChairmanQuietWindow in lib/notifications/resend-adapter.js). No shared helper for
 * this exact boundary exists repo-wide (confirmed by search), so it is inlined here, scoped
 * to this cron only, mirroring the same Intl/toLocaleTimeString pattern.
 *
 * This RUNTIME check is authoritative. The GHA cron schedule (adam-decision-scheduler-cron.yml)
 * is only a coarse UTC cadence limiter and cannot itself be DST-precise for an ET window.
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isWithinAdamSmsQuietWindow(now = new Date()) {
  const hour = Number(now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit' }));
  return hour >= 22 || hour < 6;
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

/** Ensure the ARMED registration exists WITHOUT wiping last_fired_at (registerArmedMachinery upserts null). */
async function ensureArmedRegistration(supabase, logger) {
  const processKey = armedProcessKey(SD_KEY);
  try {
    const { data } = await supabase
      .from('periodic_process_registry')
      .select('process_key')
      .eq('process_key', processKey)
      .maybeSingle();
    if (!data) {
      const reg = await registerArmedMachinery(supabase, { sd_key: SD_KEY }, {
        activationTrigger: ACTIVATION_TRIGGER,
        expectedIntervalSeconds: 2 * 60 * 60, // hourly cron with headroom
        owner: 'adam-decision-scheduler-tick',
      });
      if (!reg.ok) logger.warn?.(`[decision-scheduler-tick] ARMED registration failed (non-fatal): ${reg.error}`);
    }
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
  // limiter and cannot itself be DST-precise for the 22:00-06:00 America/New_York window.
  const now = deps.now || new Date();
  const quietCheck = deps.isWithinAdamSmsQuietWindow || isWithinAdamSmsQuietWindow;
  if (quietCheck(now)) {
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
