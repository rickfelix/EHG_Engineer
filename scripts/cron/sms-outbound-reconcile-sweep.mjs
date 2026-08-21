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
 * FAIL-SOFT (mechanism, still correct): if the table were absent, reconcileOutboundSms returns
 * {ran:false, reason:'table_absent'} and this sweep exits 0.
 *
 * THE TABLE IS PRESENT. This header previously said the STAGED migration "is unapplied".
 * MEASURED 2026-08-02: 17 columns, 395 rows, to_regclass resolves (control query on a known
 * table confirms the probe works). This sweep therefore does REAL work; treating it as inert
 * is wrong. SD-LEO-INFRA-DECISION-RESURFACE-GUARDS-001 FR-3.
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

  // SD-LEO-INFRA-FLEET-DEAD-MAN-001 FR-3: a twilio_not_configured outage (FR-2's
  // summary.unconfigured) needs to be visible to an off-host observer even though this sweep's
  // own console.log line above only reaches a GitHub Actions log nobody is tailing live. Written
  // every run (not just when unconfigured>0) so system_events shows this sweep is actually
  // running, not just that it once found a problem. Fail-soft: never lets an audit-write failure
  // affect the sweep's own exit code.
  try {
    // TESTING sub-agent finding (SD-LEO-INFRA-FLEET-DEAD-MAN-001): supabase-js resolves
    // {data:null, error:{...}} on a PostgREST-level rejection instead of throwing -- the
    // returned error must be checked explicitly or a rejected write silently vanishes here.
    const { error: insertErr } = await supabase.from('system_events').insert({
      event_type: 'sms_outbound_sweep_verdict',
      actor_type: 'system',
      actor_role: 'sms-outbound-sweep',
      payload: {
        ran: summary.ran, sent: summary.sent, failed: summary.failed,
        unconfigured: summary.unconfigured || 0, reason: summary.reason || null,
      },
    });
    if (insertErr) throw new Error(insertErr.message);
  } catch (err) {
    logger.warn?.(`[sms-outbound-sweep] verdict audit-write failed (non-fatal): ${err?.message || err}`);
  }

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
