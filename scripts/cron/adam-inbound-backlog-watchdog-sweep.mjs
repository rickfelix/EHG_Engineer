#!/usr/bin/env node
/**
 * Adam inbound-backlog watchdog sweep — SD-LEO-INFRA-ADAM-INBOUND-BACKLOG-WATCHDOG-001 (FR-4).
 *
 * DURABILITY IS THE POINT. This must NOT live in a session-scoped cron: Adam's recurring loops
 * died with the prior Adam session overnight, and session CronCreate expires after 7 days and
 * dies with the window (the QF-20260719-196 / QF-20260719-997 class). It therefore follows the
 * proven GitHub Actions pattern already used by chairman-morning-brief-sweep.mjs and
 * chairman-decision-sla-sweep.mjs.
 *
 * Transport: supabase-js + service-role ONLY. There is deliberately NO pooler/pg/DATABASE_URL
 * path — SUPABASE_POOLER_URL is injected into ZERO *cron*.yml in this repo and is silently
 * undefined on a GHA runner, so a pg path would fail closed at 03:00 with nobody watching.
 *
 * Exit codes (reconciling FR-4's "0/2 only" with the SD-level "INFRA failure (1) vs BREACH (2)"
 * criterion — no exotic codes beyond these three):
 *   0 — ran clean, no breach
 *   1 — INFRA failure (could not read the lane / threshold-vs-evidence assertion tripped).
 *       Distinct from 2 so a broken watchdog can never be mistaken for a quiet lane.
 *   2 — BREACH escalated
 *
 * Usage: node scripts/cron/adam-inbound-backlog-watchdog-sweep.mjs --once [--dry-run]
 * Env:   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 */
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';
import { runInboundBacklogWatchdog } from '../../lib/adam/inbound-backlog-watchdog.js';

export const SD_KEY = 'SD-LEO-INFRA-ADAM-INBOUND-BACKLOG-WATCHDOG-001';
export const ACTIVATION_TRIGGER = '.github/workflows/adam-inbound-backlog-watchdog-cron.yml';
export const EXIT_OK = 0;
export const EXIT_INFRA = 1;
export const EXIT_BREACH = 2;

export function parseArgs(argv) {
  const args = { once: false, dryRun: false };
  for (let i = 2; i < (argv || []).length; i++) {
    const a = argv[i];
    if (a === '--once') args.once = true;
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

function buildSupabase(env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

/**
 * Dependency-injected entrypoint (FR-4): deps.{logger, env, now, supabase} so the whole sweep is
 * unit-testable with a fake supabase and an injected clock — no network, no real time.
 */
export async function main(argv = process.argv, deps = {}) {
  const logger = deps.logger || console;
  const env = deps.env || process.env;
  const nowMs = Number.isFinite(deps.now) ? deps.now : Date.now();
  const args = parseArgs(argv);

  let supabase;
  try {
    supabase = deps.supabase || buildSupabase(env);
  } catch (err) {
    logger.log?.(`[adam-inbound-backlog] ${JSON.stringify({ ts: new Date(nowMs).toISOString(), ok: false, reason: 'infra', error: err.message })}`);
    return { exitCode: EXIT_INFRA, summary: { error: err.message } };
  }

  // --dry-run runs the full read + classification path and reports the verdict, skipping only
  // the emitFeedback write (the watchdog's sole write; it never touches session_coordination).
  const result = await runInboundBacklogWatchdog(supabase, { now: nowMs, dryRun: args.dryRun });

  const summary = {
    ts: new Date(nowMs).toISOString(),
    sd: SD_KEY,
    dry_run: args.dryRun,
    breaching: result.breaching,
    breaching_count: result.breachingCount,
    raw_backlog_count: result.rawBacklogCount,
    oldest_age_ms: result.oldestAgeMs,
    undrained_kinds: result.undrainedKinds,
    escalated: result.escalated.map((e) => ({ scope: e.scope, deduped: e.deduped })),
    error: result.error,
  };
  logger.log?.(`[adam-inbound-backlog] ${JSON.stringify(summary)}`);

  if (result.error) return { exitCode: EXIT_INFRA, summary };
  if (result.breaching) return { exitCode: EXIT_BREACH, summary };
  return { exitCode: EXIT_OK, summary };
}

/**
 * Windows-safe termination (mirrors scripts/cron/chairman-decision-sla-sweep.mjs::gracefulExit —
 * a Supabase/undici query aborting on Windows trips a libuv UV_HANDLE_CLOSING assertion).
 */
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
        .catch((err) => { console.error('adam-inbound-backlog-watchdog-sweep fatal:', err.message); return gracefulExit(EXIT_INFRA); });
}
