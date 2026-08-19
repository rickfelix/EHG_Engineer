#!/usr/bin/env node
/**
 * Chairman-decision SLA sweep — the scheduled production runner for the previously
 * never-dispatched SLA machinery (registered-verifier-never-dispatched class).
 *
 * SD: SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001 (FR-2/FR-5)
 *
 * Two passes per invocation, both producer-agnostic (the ALL-PATHS backstop — most of the
 * ~16 chairman_decisions producers insert directly, bypassing recordPendingDecision's
 * on-creation escalation):
 *
 *   1. SLA notify pass — enforceDecisionSLAs (lib/eva/chairman-sla-enforcer.js) in
 *      NOTIFY-ONLY mode (blockOnViolation:false — this sweep NEVER mutates a decision's
 *      blocking/status columns), scan filtered to the chairman-actionable predicate and a
 *      go-live cutoff so machine telemetry and historical backlog are never processed.
 *      chairman-decision-timeout.js is NOT wired here — the enforcer is its documented
 *      consolidation; arming both would double-escalate (LEAD scope reduction).
 *
 *   2. Blocking-row pass — the enforcer deliberately exempts blocking rows ("Chairman has
 *      absolute authority" = no auto-resolution), so a ready venture's PAUSE would never
 *      surface through pass 1 alone. This pass NOTIFIES (never resolves): pending blocking
 *      chairman-actionable rows past a grace period whose escalation email has not been
 *      confirmed-sent are escalated through the single escalateChairmanDecision seam, which
 *      owns dedup, the 3/hr rate cap + digest fold, and the quiet-window guard (FR-3: the
 *      marker is only stamped outside the 23:00-05:00 ET window, so quiet-window skips are
 *      retried by the next sweep).
 *
 * Liveness: registers ARMED machinery once (periodic_process_registry, named activation
 * trigger = the cron workflow) and stamps last_fired_at on every real run. The static
 * wiring is pinned by tests/unit/cron/chairman-decision-sla-wiring.test.js.
 *
 * Usage:
 *   node scripts/cron/chairman-decision-sla-sweep.mjs --once      # one pass (canonical cron)
 *   node scripts/cron/chairman-decision-sla-sweep.mjs --once --dry-run  # report intent, no writes
 *
 * Env:
 *   ESCALATION_GO_LIVE_CUTOFF   ISO date; rows created before it are ignored (default 2026-07-10)
 *   CHAIRMAN_BLOCKING_GRACE_MS  blocking-row grace period before sweep escalation (default 30 min)
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (required)
 */
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';
import { enforceDecisionSLAs } from '../../lib/eva/chairman-sla-enforcer.js';
import { escalateChairmanDecision } from '../../lib/chairman/record-pending-decision.mjs';
import { isEscalationActionable, isFixtureVenture } from '../../lib/chairman/chairman-actionable.mjs';
import { registerArmedMachinery, armedProcessKey } from '../../lib/machinery-class/armed-registration.js';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

export const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001';
export const ACTIVATION_TRIGGER = '.github/workflows/chairman-decision-sla-cron.yml';
export const DEFAULT_GO_LIVE_CUTOFF = '2026-07-10T00:00:00Z';
export const DEFAULT_BLOCKING_GRACE_MS = 30 * 60 * 1000;

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

function cutoffFromEnv(env) {
  const raw = env.ESCALATION_GO_LIVE_CUTOFF;
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : DEFAULT_GO_LIVE_CUTOFF;
}

function graceMsFromEnv(env) {
  const raw = parseInt(env.CHAIRMAN_BLOCKING_GRACE_MS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BLOCKING_GRACE_MS;
}

/**
 * PURE selection for the blocking-row pass (exported for the ALL-PATHS producer tests):
 * pending + blocking + chairman-actionable (telemetry/fixture excluded) + created after the
 * go-live cutoff + older than the grace period + escalation email not confirmed-sent.
 * @param {Array<object>} rows - chairman_decisions rows (id, decision_type, status, blocking, created_at, venture_id, brief_data)
 * @param {{ fixtureVentureIds?: Set<string>, cutoffIso: string, graceMs: number, nowMs?: number }} opts
 * @returns {Array<object>} rows due for sweep escalation
 */
export function selectBlockingSweepRows(rows, { fixtureVentureIds = new Set(), cutoffIso, graceMs, nowMs = Date.now() } = {}) {
  const cutoffMs = Date.parse(cutoffIso);
  return (rows || []).filter((row) => {
    if (row.blocking !== true) return false;
    if (!isEscalationActionable(row)) return false;
    if (row.venture_id && fixtureVentureIds.has(row.venture_id)) return false;
    const createdMs = Date.parse(row.created_at);
    if (!Number.isFinite(createdMs) || createdMs < cutoffMs) return false;
    if (nowMs - createdMs < graceMs) return false;
    if (row.brief_data?.escalation_email_sent_at) return false;
    return true;
  });
}

/** Resolve which of the given venture ids are fixture ventures (demo/test), fail-include on error. */
async function fetchFixtureVentureIds(supabase, ventureIds, logger) {
  const ids = [...new Set(ventureIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  try {
    const { data, error } = await supabase.from('ventures').select('id, name, is_demo').in('id', ids);
    if (error) {
      logger.warn?.(`[sla-sweep] venture lookup failed (${error.message}) — fixture exclusion degraded to include-all`);
      return new Set();
    }
    return new Set((data || []).filter((v) => isFixtureVenture(v)).map((v) => v.id));
  } catch (err) {
    logger.warn?.(`[sla-sweep] venture lookup threw (${err.message}) — fixture exclusion degraded to include-all`);
    return new Set();
  }
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
      // real active-window cadence (this cron fires hourly during 00-02,10-23 UTC) plus the
      // workflow's own cron string, so FR-1's gap-subtraction can subtract the declared 03:00-
      // 09:59 UTC quiet window instead of that guess relying on padding alone to cover it.
      expectedIntervalSeconds: 60 * 60,
      workflowCron: '15 0-2,10-23 * * *',
      owner: 'chairman-decision-sla-sweep',
    });
    if (!reg.ok) logger.warn?.(`[sla-sweep] ARMED registration failed (non-fatal): ${reg.error}`);
  } catch (err) {
    logger.warn?.(`[sla-sweep] ARMED registration check failed (non-fatal): ${err.message}`);
  }
  return processKey;
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('chairman-decision-sla-sweep --once [--dry-run]');
    return { exitCode: 0, action: 'help' };
  }

  const logger = deps.logger || console;
  const env = deps.env || process.env;
  const nowMs = deps.nowMs ?? Date.now();
  const enforce = deps.enforce || enforceDecisionSLAs;
  const escalate = deps.escalate || escalateChairmanDecision;
  const cutoffIso = cutoffFromEnv(env);
  const graceMs = graceMsFromEnv(env);

  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) {
    logger.error?.(`[sla-sweep] supabase client unavailable: ${err.message}`);
    return { exitCode: 2, action: 'no_supabase' };
  }

  // Liveness first — a genuine invocation is always recorded even if the sweep errors below.
  if (!args.dryRun) {
    const processKey = await ensureArmedRegistration(supabase, logger);
    try { await (deps.stampLastFired || stampLastFired)(supabase, processKey); }
    catch (err) { logger.warn?.(`[sla-sweep] liveness stamp failed (non-fatal): ${err.message}`); }
    // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): also stamp the standing GHA-cron
    // process_key (distinct from the ARMED-machinery key above) so the central liveness
    // watcher can see this cron loop directly.
    try { await (deps.stampLastFired || stampLastFired)(supabase, 'cron_script:chairman-decision-sla-sweep.mjs'); }
    catch (err) { logger.warn?.(`[sla-sweep] cron liveness stamp failed (non-fatal): ${err.message}`); }
  }

  // One shared read of the pending set powers both the enforcer filter and the blocking pass.
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — a growing table filtered on
  // status='pending' is NOT bounded; every row here gates escalation. Paginate to completion.
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('chairman_decisions')
      .select('id, decision_type, status, blocking, created_at, venture_id, brief_data')
      .eq('status', 'pending')
      .order('id', { ascending: true }));
  } catch (err) {
    logger.error?.(`[sla-sweep] pending read failed: ${err.message}`);
    return { exitCode: 1, action: 'db_error' };
  }
  const fixtureVentureIds = await fetchFixtureVentureIds(supabase, rows.map((r) => r.venture_id), logger);
  const cutoffMs = Date.parse(cutoffIso);
  const actionableIds = new Set(
    rows
      .filter((r) => isEscalationActionable(r))
      .filter((r) => !(r.venture_id && fixtureVentureIds.has(r.venture_id)))
      .filter((r) => Date.parse(r.created_at) >= cutoffMs)
      .map((r) => r.id)
  );

  // Pass 1 — SLA notify (non-blocking rows; the enforcer additionally skips blocking rows itself).
  let slaResult = { checked: 0, escalated: 0, blocked: 0, skipped: 0, errors: [] };
  if (!args.dryRun) {
    slaResult = await enforce(supabase, {
      blockOnViolation: false, // notify-only invariant — never mutate blocking (TR-2)
      filter: (decision) => actionableIds.has(decision.id),
      logger,
    });
  }

  // Pass 2 — blocking-row notify sweep through the single delivery seam.
  const due = selectBlockingSweepRows(rows, { fixtureVentureIds, cutoffIso, graceMs, nowMs });
  const blockingResult = { due: due.length, escalated: 0, deduped: 0, suppressed: 0, errors: [] };
  for (const row of due) {
    if (args.dryRun) continue;
    const r = await escalate(supabase, row.id);
    if (r.escalated) blockingResult.escalated++;
    else if (r.deduped) blockingResult.deduped++;
    else if (r.suppressed) blockingResult.suppressed++;
    else if (r.error) blockingResult.errors.push(`${row.id}: ${r.error}`);
  }

  const summary = {
    ts: new Date(nowMs).toISOString(),
    dry_run: args.dryRun,
    cutoff: cutoffIso,
    grace_ms: graceMs,
    pending_scanned: rows.length,
    actionable: actionableIds.size,
    sla_checked: slaResult.checked,
    sla_escalated: slaResult.escalated,
    sla_skipped: slaResult.skipped,
    blocking_due: blockingResult.due,
    blocking_escalated: blockingResult.escalated,
    blocking_deduped: blockingResult.deduped,
    blocking_suppressed: blockingResult.suppressed,
    errors: [...slaResult.errors, ...blockingResult.errors],
  };
  logger.log?.(`[sla-sweep] ${JSON.stringify(summary)}`);
  return { exitCode: summary.errors.length > 0 ? 1 : 0, action: args.dryRun ? 'dry_run' : 'swept', summary };
}

/**
 * Windows-safe termination (mirrors scripts/cron/eva-scheduler-watcher.mjs::gracefulExit —
 * synchronous process.exit after a Supabase/undici query aborts on Windows with a libuv
 * UV_HANDLE_CLOSING assertion; set exitCode, drain undici, unref'd backstop only).
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
        .catch((err) => { console.error('chairman-decision-sla-sweep fatal:', err.message); return gracefulExit(2); });
}
