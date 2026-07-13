#!/usr/bin/env node
/**
 * Payment-attribution sweep — arms lib/payments/attribution-resolver.js's
 * resolveUnattributedEvents() on a registry-stamped cadence instead of the
 * manual-only scripts/backfill-payment-attribution.mjs CLI.
 *
 * SD: SD-LEO-INFRA-VENTURE-REVENUE-ATTRIBUTION-ARM-001 (FR-3)
 *
 * The resolver itself (SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002) shipped complete
 * and DB-only (no live Stripe API calls) but its own runbook explicitly deferred
 * scheduling — this script is that deferred follow-up. Registered as a G3 ARMED
 * standalone_cron (lib/machinery-class/armed-registration.js) so a zero-backlog
 * cycle (the common case — most cycles have nothing pending) is a normal, silent
 * pass, while periodic_process_registry still proves the cron is genuinely firing
 * via last_fired_at, satisfying the Operator-Contract "armed cron + witness" bar.
 *
 * Usage:
 *   node scripts/cron/payment-attribution-sweep.mjs --once
 *   node scripts/cron/payment-attribution-sweep.mjs --once --dry-run
 */
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';
import { resolveUnattributedEvents } from '../../lib/payments/attribution-resolver.js';
import { registerArmedMachinery, armedProcessKey } from '../../lib/machinery-class/armed-registration.js';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';

export const SD_KEY = 'SD-LEO-INFRA-VENTURE-REVENUE-ATTRIBUTION-ARM-001';
export const ACTIVATION_TRIGGER = '.github/workflows/payment-attribution-cron.yml';

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

/** Ensure ARMED registration exists WITHOUT wiping last_fired_at on re-run. */
export async function ensureArmedRegistration(supabase, logger) {
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
        expectedIntervalSeconds: 6 * 60 * 60, // 6h cadence — matches the sibling ops-actuals cron
        owner: 'payment-attribution-resolver',
      });
      if (!reg.ok) logger.warn?.(`[payment-attribution-sweep] ARMED registration failed (non-fatal): ${reg.error}`);
    }
  } catch (err) {
    logger.warn?.(`[payment-attribution-sweep] ARMED registration check failed (non-fatal): ${err.message}`);
  }
  return processKey;
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('payment-attribution-sweep --once [--dry-run]');
    return { exitCode: 0, action: 'help' };
  }

  const logger = deps.logger || console;
  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) {
    logger.error?.(`[payment-attribution-sweep] supabase client unavailable: ${err.message}`);
    return { exitCode: 2, action: 'no_supabase' };
  }

  if (args.dryRun) {
    logger.log?.('[payment-attribution-sweep] dry-run — skipping registration, resolution, and liveness stamp');
    return { exitCode: 0, action: 'dry_run' };
  }

  const processKey = await ensureArmedRegistration(supabase, logger);

  let result;
  try {
    result = await (deps.resolveUnattributedEvents || resolveUnattributedEvents)(supabase, { limit: 500 });
  } catch (err) {
    logger.error?.(`[payment-attribution-sweep] resolveUnattributedEvents failed: ${err.message}`);
    // Liveness is only stamped on a genuinely successful cycle — a thrown resolver
    // error must NOT read as "fired fine" to anything watching last_fired_at.
    return { exitCode: 1, action: 'resolver_error', error: err.message };
  }

  try {
    await (deps.stampLastFired || stampLastFired)(supabase, processKey);
  } catch (err) {
    logger.warn?.(`[payment-attribution-sweep] liveness stamp failed (non-fatal): ${err.message}`);
  }

  const summary = { ts: new Date().toISOString(), ...result };
  logger.log?.(`[payment-attribution-sweep] ${JSON.stringify(summary)}`);
  return { exitCode: 0, action: 'swept', summary };
}

/** Windows-safe termination (mirrors scripts/cron/venture-ops-actuals-sweep.mjs). */
export async function gracefulExit(exitCode, { backstopMs = 4000 } = {}) {
  process.exitCode = exitCode;
  try {
    const undici = await import('undici');
    await undici.getGlobalDispatcher?.()?.close?.();
  } catch { /* undici absent — natural drain still applies */ }
  setTimeout(() => process.exit(exitCode), backstopMs).unref();
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().then(({ exitCode }) => gracefulExit(exitCode))
        .catch((err) => { console.error('payment-attribution-sweep fatal:', err.message); return gracefulExit(2); });
}
