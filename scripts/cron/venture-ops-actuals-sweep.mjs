#!/usr/bin/env node
/**
 * Venture ops-actuals sweep — the scheduled production runner that activates the
 * previously dormant ops_product_health / ops_revenue_metrics collectors + the
 * external uptime probe (dormant-machinery class: schemas + collectors fully BUILT,
 * zero rows, nothing invoked them).
 *
 * SD: SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001 (FR-2, FR-3, FR-4, FR-6)
 *
 * Three jobs per invocation, each independently registered in periodic_process_registry
 * with its own owner-agent (TR-3: distinct owner-agent per collector, not a shared/
 * anonymous cron) and its own liveness stamp — one job failing never blocks the others:
 *
 *   1. ops-product-health-collector  — collectProductHealth() for every venture with a
 *      live deployment (deployment_url set). Depends on the FR-1 producer-contract fix
 *      (lib/services/telemetry.js, lib/services/branding-service.js) already landing.
 *   2. ops-revenue-metrics-collector — collectRevenueMetrics() for the same venture set.
 *      Independent of the service_telemetry contract (reads capital_transactions).
 *   3. venture-uptime-probe          — runVentureUptimeProbe() (lib/ops/venture-uptime-probe.js).
 *
 * FR-6 (verify-then-schedule, NC-7): the first live cycle after the contract fix is not
 * silently trusted — this script logs a per-job row-count summary every run so a
 * zero-rows-written result is visible in the cron log, not swallowed as a normal pass.
 *
 * "Live venture deployment" selection (all three jobs, consistent set): ventures WHERE
 * deployment_url IS NOT NULL. ventures.status is deliberately NOT used as a filter — both
 * currently-deployed ventures (MarketLens, CronGenius) carry status='cancelled' post the
 * 2026-07-08 pivot, so a status filter would silently probe/collect nothing (see
 * lib/ops/venture-uptime-probe.js header for the full ground-truth note).
 *
 * Usage:
 *   node scripts/cron/venture-ops-actuals-sweep.mjs --once
 *   node scripts/cron/venture-ops-actuals-sweep.mjs --once --dry-run
 */
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';
import { collectProductHealth } from '../../lib/eva/services/ops-health-monitor.js';
import { collectRevenueMetrics } from '../../lib/eva/services/ops-revenue-collector.js';
import { runVentureUptimeProbe } from '../../lib/ops/venture-uptime-probe.js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { registerArmedMachinery, armedProcessKey } from '../../lib/machinery-class/armed-registration.js';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';

export const SD_KEY = 'SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001';
export const ACTIVATION_TRIGGER = '.github/workflows/venture-ops-actuals-cron.yml';

const JOBS = [
  { key: 'ops-product-health-collector', owner: 'ops-product-health-collector' },
  { key: 'ops-revenue-metrics-collector', owner: 'ops-revenue-metrics-collector' },
  { key: 'venture-uptime-probe', owner: 'venture-uptime-probe' },
];

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

/** Ensure ARMED registration exists for a job WITHOUT wiping last_fired_at on re-run. */
async function ensureArmedRegistration(supabase, job, logger) {
  const processKey = armedProcessKey(`${SD_KEY}-${job.key}`);
  try {
    const { data } = await supabase
      .from('periodic_process_registry')
      .select('process_key')
      .eq('process_key', processKey)
      .maybeSingle();
    if (!data) {
      const reg = await registerArmedMachinery(supabase, { sd_key: `${SD_KEY}-${job.key}` }, {
        activationTrigger: ACTIVATION_TRIGGER,
        expectedIntervalSeconds: 6 * 60 * 60, // 6h cadence with headroom
        owner: job.owner,
      });
      if (!reg.ok) logger.warn?.(`[ops-actuals-sweep] ARMED registration failed for ${job.key} (non-fatal): ${reg.error}`);
    }
  } catch (err) {
    logger.warn?.(`[ops-actuals-sweep] ARMED registration check failed for ${job.key} (non-fatal): ${err.message}`);
  }
  return processKey;
}

/** Ventures with a live deployment — the shared selection set for all three jobs. */
async function fetchLiveDeploymentVentures(supabase) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — every venture returned here is
  // acted on by all three collector jobs; the ventures table grows with the factory's output,
  // so an unranged read could silently skip ventures past the cap. Paginate; error policy
  // mirrors the prior throw.
  try {
    return await fetchAllPaginated(() => supabase
      .from('ventures')
      .select('id, deployment_url')
      .not('deployment_url', 'is', null)
      .neq('deployment_url', '')
      .order('id', { ascending: true }));
  } catch (err) {
    throw new Error(`ventures query failed: ${err.message}`);
  }
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('venture-ops-actuals-sweep --once [--dry-run]');
    return { exitCode: 0, action: 'help' };
  }

  const logger = deps.logger || console;
  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) {
    logger.error?.(`[ops-actuals-sweep] supabase client unavailable: ${err.message}`);
    return { exitCode: 2, action: 'no_supabase' };
  }

  // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): self-stamp the standing GHA-cron
  // process_key BEFORE any per-job logic so a genuine invocation is always recorded, even
  // if the ventures query or a downstream job errors (distinct from the three per-job
  // ARMED-machinery keys below; mirrors chairman-decision-sla-sweep.mjs's own convention).
  if (!args.dryRun) {
    try { await (deps.stampLastFired || stampLastFired)(supabase, 'cron_script:venture-ops-actuals-sweep.mjs'); }
    catch (err) { logger.warn?.(`[ops-actuals-sweep] cron liveness stamp failed (non-fatal): ${err.message}`); }
  }

  const ventures = await fetchLiveDeploymentVentures(supabase);
  const summary = { ts: new Date().toISOString(), dry_run: args.dryRun, ventures_scanned: ventures.length, jobs: {} };

  // Job 1: ops_product_health collector
  {
    const processKey = args.dryRun ? null : await ensureArmedRegistration(supabase, JOBS[0], logger);
    let written = 0;
    const errors = [];
    if (!args.dryRun) {
      for (const v of ventures) {
        try {
          const row = await (deps.collectProductHealth || collectProductHealth)({ ventureId: v.id, supabase });
          if (row) written++;
        } catch (err) { errors.push(`${v.id}: ${err.message}`); }
      }
      try { await (deps.stampLastFired || stampLastFired)(supabase, processKey); }
      catch (err) { logger.warn?.(`[ops-actuals-sweep] liveness stamp failed for ${JOBS[0].key} (non-fatal): ${err.message}`); }
    }
    summary.jobs[JOBS[0].key] = { attempted: ventures.length, written, errors };
    // FR-6 / NC-7: a live cycle over a non-empty venture set that writes zero rows is an
    // escalation-worthy signal (collector code never ran live before this SD), not a quiet pass.
    if (!args.dryRun && ventures.length > 0 && written === 0) {
      logger.error?.(`[ops-actuals-sweep] NC-7 ESCALATION: ${JOBS[0].key} wrote 0 rows across ${ventures.length} venture(s) — investigate before trusting future silent passes.`);
    }
  }

  // Job 2: ops_revenue_metrics collector
  {
    const processKey = args.dryRun ? null : await ensureArmedRegistration(supabase, JOBS[1], logger);
    let written = 0;
    const errors = [];
    if (!args.dryRun) {
      for (const v of ventures) {
        try {
          const row = await (deps.collectRevenueMetrics || collectRevenueMetrics)({ ventureId: v.id, supabase });
          if (row) written++;
        } catch (err) { errors.push(`${v.id}: ${err.message}`); }
      }
      try { await (deps.stampLastFired || stampLastFired)(supabase, processKey); }
      catch (err) { logger.warn?.(`[ops-actuals-sweep] liveness stamp failed for ${JOBS[1].key} (non-fatal): ${err.message}`); }
    }
    summary.jobs[JOBS[1].key] = { attempted: ventures.length, written, errors };
    if (!args.dryRun && ventures.length > 0 && written === 0) {
      logger.error?.(`[ops-actuals-sweep] NC-7 ESCALATION: ${JOBS[1].key} wrote 0 rows across ${ventures.length} venture(s) — investigate before trusting future silent passes.`);
    }
  }

  // Job 3: uptime probe
  {
    const processKey = args.dryRun ? null : await ensureArmedRegistration(supabase, JOBS[2], logger);
    let probeSummary = { ventures_seedable: 0, checked: 0, reachable: 0, unreachable: 0, newly_surfaced: 0, errors: [] };
    if (!args.dryRun) {
      probeSummary = await (deps.runVentureUptimeProbe || runVentureUptimeProbe)({ supabase });
      try { await (deps.stampLastFired || stampLastFired)(supabase, processKey); }
      catch (err) { logger.warn?.(`[ops-actuals-sweep] liveness stamp failed for ${JOBS[2].key} (non-fatal): ${err.message}`); }
    }
    summary.jobs[JOBS[2].key] = probeSummary;
    if (probeSummary.newly_surfaced > 0) {
      logger.warn?.(`[ops-actuals-sweep] ${probeSummary.newly_surfaced} venture(s) newly surfaced UNREACHABLE this cycle.`);
    }
    // NC-7 parity with jobs 1/2 (adversarial-review finding): ensureDeploymentRows failures
    // used to be swallowed with no signal the caller could act on, which would let this job
    // report checked=0/errors=[] — a silent green pass — even if every venture failed to seed.
    if (!args.dryRun && ventures.length > 0 && probeSummary.checked === 0) {
      logger.error?.(`[ops-actuals-sweep] NC-7 ESCALATION: ${JOBS[2].key} checked 0 deployments across ${ventures.length} venture(s) — investigate before trusting future silent passes.`);
    }
  }

  logger.log?.(`[ops-actuals-sweep] ${JSON.stringify(summary)}`);
  const anyErrors = Object.values(summary.jobs).some((j) => (j.errors || []).length > 0);
  return { exitCode: anyErrors ? 1 : 0, action: args.dryRun ? 'dry_run' : 'swept', summary };
}

/** Windows-safe termination (mirrors scripts/cron/chairman-decision-sla-sweep.mjs). */
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
        .catch((err) => { console.error('venture-ops-actuals-sweep fatal:', err.message); return gracefulExit(2); });
}
