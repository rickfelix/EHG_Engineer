#!/usr/bin/env node
/**
 * Chairman morning-brief sweep — the DURABLE 6:00 AM ET daily-brief runner.
 * QF-20260720-531 (chairman contract c4, leo_protocol_sections id=601).
 *
 * ROOT CAUSE this replaces: morning-brief-sms previously existed ONLY as an ADAM_LOOPS entry
 * (scripts/adam-startup-check.mjs) — a spec a live Adam agent must re-arm via the harness's
 * CronCreate tool at its own startup. Per QF-20260719-196/QF-20260719-997 (shipped hours after
 * morning-brief-sms, same day), "session CronCreate jobs die with the session and expire in 7
 * days" is the established root cause for this exact failure class; those two sibling Adam
 * duties were migrated to durable GHA crons that same night. morning-brief-sms was not, and
 * missed its very next fire (2026-07-20). This sweep is that same migration, applied here.
 *
 * RECONCILIATION BY CONSTRUCTION: rather than a separate "does today's brief exist" checker
 * (nothing in-repo does this today — verified), the workflow cron runs every 15 minutes across
 * a bounded 5:00-11:59 AM ET window (mirrors periodic-liveness-watcher-cron.yml's cadence). The
 * FIRST run past 5:00 AM ET does the real enqueue; every run after that is a dedupe-key no-op
 * (enqueueChairmanSms's upsert/ignoreDuplicates) UNLESS the first run failed for some reason, in
 * which case the next 15-minute tick sends it late — "late is better than never" without a
 * second mechanism to keep in sync with the first.
 *
 * QF-20260722-277: window start moved 6:00 → 5:00 ET to buffer GitHub Actions scheduled-workflow
 * lag, so the real enqueue reliably lands before the chairman's 6:00 AM check.
 *
 * Content mirrors chairman-morning-review-sweep.mjs's buildMorningReviewBody (roadmap position +
 * overnight shipped/in-flight) — reused directly rather than re-derived, since the two chairman
 * duties (c3 5:45 AM review, c4 6:00 AM brief) share the same underlying facts by design.
 *
 * Usage:
 *   node scripts/cron/chairman-morning-brief-sweep.mjs --once
 *   node scripts/cron/chairman-morning-brief-sweep.mjs --once --dry-run
 *
 * Env: SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (required),
 *      CHAIRMAN_PHONE (recipient — inert if unset).
 */
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';
import { enqueueChairmanSms } from '../../lib/chairman/sms-bridge.js';
import { buildMorningReviewBody } from './chairman-morning-review-sweep.mjs';
import { etLocalHour, etDateStr } from '../../lib/time/chairman-et-wall-clock.js';

export const QF_KEY = 'QF-20260720-531';
export const ACTIVATION_TRIGGER = '.github/workflows/chairman-morning-brief-cron.yml';
// Self-healing window: fires from 5:00 AM ET onward (QF-20260722-277: buffers GHA scheduled-
// workflow lag); a missed/failed first attempt is retried by the next 15-minute tick, capped at
// noon so this doesn't run unbounded all day.
const WINDOW_START_ET_HOUR = 5;
const WINDOW_END_ET_HOUR = 12;

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

export { etLocalHour, etDateStr, buildMorningReviewBody };

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  const env = deps.env || process.env;
  const now = deps.now instanceof Date ? deps.now : (Number.isFinite(deps.now) ? new Date(deps.now) : new Date());
  const enqueue = deps.enqueue || enqueueChairmanSms;
  const log = (obj) => logger.log?.(`[morning-brief] ${JSON.stringify(obj)}`);

  if (args.help) { logger.log?.('chairman-morning-brief-sweep --once [--dry-run]'); return { exitCode: 0, action: 'help' }; }

  // FR-1: self-healing ET wall-clock window (5:00-11:59 ET) — see file header for the
  // "reconciliation by construction" rationale.
  const etHour = etLocalHour(now);
  if (etHour < WINDOW_START_ET_HOUR || etHour >= WINDOW_END_ET_HOUR) {
    log({ action: 'inert', reason: 'outside_et_window', et_hour: etHour });
    return { exitCode: 0, action: 'inert', reason: 'outside_et_window' };
  }

  const recipientPhone = env.CHAIRMAN_PHONE;
  if (!recipientPhone) {
    log({ action: 'inert', reason: 'chairman_phone_unset' });
    return { exitCode: 0, action: 'inert', reason: 'chairman_phone_unset' };
  }

  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) { logger.error?.(`[morning-brief] supabase client unavailable: ${err.message}`); return { exitCode: 2, action: 'no_supabase' }; }

  const dedupeKey = `morning_brief:${etDateStr(now)}`;

  let body;
  try { body = await (deps.buildBody || buildMorningReviewBody)(supabase, { now }); }
  catch (err) { logger.warn?.(`[morning-brief] body build degraded (${err.message})`); body = 'Morning brief: status unavailable this run.'; }

  if (args.dryRun) {
    log({ action: 'dry_run', dedupe_key: dedupeKey, body_len: body.length });
    return { exitCode: 0, action: 'dry_run', summary: { dedupeKey, bodyLength: body.length } };
  }

  // Owed-state enqueue ONLY — the pre-existing sms-outbound-worker owns the provider send.
  const enq = await enqueue(supabase, { recipientPhone, kind: 'morning_brief', body, decisionId: null, dedupeKey, notBefore: null });
  const action = enq.enqueued ? 'enqueued' : (enq.deduped ? 'deduped' : 'inert');
  // PII-safe: log counts/ids/reason only — never the recipient phone or the body text.
  log({ action, obligation_id: enq.obligationId || null, reason: enq.reason || null, dedupe_key: dedupeKey, body_len: body.length });
  return {
    exitCode: 0,
    action,
    summary: { enqueued: !!enq.enqueued, deduped: !!enq.deduped, reason: enq.reason || null, dedupeKey, bodyLength: body.length, obligationId: enq.obligationId || null },
  };
}

/** Windows-safe termination (mirrors chairman-morning-review-sweep.mjs::gracefulExit). */
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
        .catch((err) => { console.error('chairman-morning-brief-sweep fatal:', err.message); return gracefulExit(2); });
}
