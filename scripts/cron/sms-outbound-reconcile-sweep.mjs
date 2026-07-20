#!/usr/bin/env node
/**
 * SMS outbound reconcile sweep — the DURABLE runner for reconcileOutboundSms.
 * SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B (FR-3).
 *
 * This is the durable, session-independent driver the FR-3 acceptance criteria require: it holds
 * NO session-local setTimeout/setInterval (a cron / periodic-process-registry entry invokes it
 * with --once), so a fresh cold process picks up owed rows left behind by a session that died
 * mid-send (the F1 failure mode). reconcileOutboundSms itself is claim-serialized + idempotent,
 * so overlapping invocations are safe.
 *
 * FAIL-SOFT: while the STAGED sms_outbound_obligations migration is unapplied, reconcileOutboundSms
 * returns {ran:false, reason:'table_absent'} and this sweep exits 0 (nothing to do).
 *
 * Usage:
 *   node scripts/cron/sms-outbound-reconcile-sweep.mjs --once       # one reconcile pass
 *   node scripts/cron/sms-outbound-reconcile-sweep.mjs --once --dry-run
 *
 * Env: SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (required),
 *      TWILIO_STATUS_CALLBACK_URL (so sends request a delivery callback — FR-2).
 */
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';
import { reconcileOutboundSms } from '../../lib/chairman/sms-outbound-worker.js';

export const SD_KEY = 'SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B';

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

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  if (args.help) {
    logger.log?.('sms-outbound-reconcile-sweep --once [--dry-run]');
    return { exitCode: 0, action: 'help' };
  }

  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) {
    logger.error?.(`[sms-outbound-sweep] supabase client unavailable: ${err.message}`);
    return { exitCode: 2, action: 'no_supabase' };
  }

  if (args.dryRun) {
    logger.log?.('[sms-outbound-sweep] dry-run: no reconcile performed');
    return { exitCode: 0, action: 'dry_run' };
  }

  const reconcile = deps.reconcile || reconcileOutboundSms;
  const summary = await reconcile(supabase, {});
  logger.log?.(`[sms-outbound-sweep] ${JSON.stringify({ ts: new Date().toISOString(), ...summary })}`);

  // SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-B: run-side operator layer, all fail-soft —
  // FR-1 governed cadence (register + witness the fire), FR-2 degradation alarm,
  // FR-3 carrier-filter email-fallback escalation. deps.channelHealth is the test seam.
  try {
    const health = deps.channelHealth || await import('../../lib/chairman/sms-channel-health.js');
    await health.ensureSweepSchedule(supabase, { logger });
    await health.witnessSweepFired(supabase, { logger });
    const degradation = await health.detectChannelDegradation(supabase, { logger });
    const escalation = await health.escalateCarrierFiltered(supabase, { logger });
    logger.log?.(`[sms-outbound-sweep] channel-health ${JSON.stringify({ degradation, escalation })}`);
  } catch (err) {
    logger.warn?.(`[sms-outbound-sweep] channel-health layer failed soft: ${err?.message || err}`);
  }

  return { exitCode: 0, action: summary.ran ? 'reconciled' : 'inert', summary };
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

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then(({ exitCode }) => gracefulExit(exitCode))
        .catch((err) => { console.error('sms-outbound-reconcile-sweep fatal:', err.message); return gracefulExit(2); });
}
