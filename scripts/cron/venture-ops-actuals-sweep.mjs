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
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'node:path';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { collectProductHealth } from '../../lib/eva/services/ops-health-monitor.js';
import { collectRevenueMetrics } from '../../lib/eva/services/ops-revenue-collector.js';
import { runVentureUptimeProbe } from '../../lib/ops/venture-uptime-probe.js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { registerArmedMachinery, armedProcessKey } from '../../lib/machinery-class/armed-registration.js';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';
import { evaluateCrackGateStatus, recordCrackGateObservation, hasUnavailableSource } from '../../lib/eva/lifecycle/crack-gate-evaluator.js';
import { retroactivelyScoreVenture } from '../eva/retroactive-pbn-score.mjs';
import { emitVentureUserFeedback } from '../../lib/eva/bridge/venture-user-feedback-emitter.js';

export const SD_KEY = 'SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001';
export const ACTIVATION_TRIGGER = '.github/workflows/venture-ops-actuals-cron.yml';

const JOBS = [
  { key: 'ops-product-health-collector', owner: 'ops-product-health-collector' },
  { key: 'ops-revenue-metrics-collector', owner: 'ops-revenue-metrics-collector' },
  { key: 'venture-uptime-probe', owner: 'venture-uptime-probe' },
  { key: 'venture-crack-gate-sweep', owner: 'venture-crack-gate-sweep' },
  { key: 'venture-pbn-auto-score-sweep', owner: 'venture-pbn-auto-score-sweep' },
  { key: 'venture-zombie-report', owner: 'venture-zombie-report' },
  { key: 'venture-divergence-report', owner: 'venture-divergence-report' },
];

// SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-2/FR-4: 'terminal' is defined on ventures.status
// (cancelled/killed), NOT workflow_status -- live-measured (TESTING F3) to include TWO
// zombies (MarketLens id=ecbba50e AND CronGenius id=6e23ad2b) today, not a single specimen.
const TERMINAL_STATUSES = ['cancelled', 'killed'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(__dirname, '..', '..', 'applications', 'registry.json');

// SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-4 / TESTING F6: applications/registry.json has its
// own noise -- 8 of its 10 entries today are test/fixture registrations (test-leo-project,
// test-venture, test-cicd, four e2e-verdict-engine-178* entries) or the EHG platform's own
// repo entry ('ehg' -- not itself a venture), not real venture apps. Mirrors is_demo=false on
// the ventures side; without this filter divergence output is ~80% noise.
const FIXTURE_REGISTRY_NAME_PATTERN = /^(test-|e2e-)/i;
const PLATFORM_REGISTRY_NAMES = new Set(['ehg']);

/** .applications is an OBJECT keyed by APP id (TESTING F6) -- Object.values(), not .forEach(). */
function loadRegistryApplications(logger) {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.values(parsed.applications || {});
  } catch (err) {
    logger.warn?.(`[ops-actuals-sweep] registry.json read/parse failed (non-fatal, divergence job will report 0): ${err.message}`);
    return [];
  }
}

function isRealRegistryEntry(app) {
  const name = String(app?.name || '');
  if (PLATFORM_REGISTRY_NAMES.has(name)) return false;
  if (FIXTURE_REGISTRY_NAME_PATTERN.test(name)) return false;
  return true;
}

/** True when a query error means "the column does not exist yet" (schema-cache/42703 shape). */
function isMissingColumnError(err) {
  const message = String(err?.message || '');
  return /column .* does not exist/i.test(message) || /schema cache/i.test(message);
}

// Job 5 (adversarial review finding, /ship Deep-tier gate): retroactivelyScoreVenture's
// already-scored check (scripts/eva/retroactive-pbn-score.mjs) is a cheap pre-LLM read,
// but a genuine scoring pass calls the LLM (scorePbnBuckets) per venture. Uncapped, one
// cycle iterating the full unscored backlog risks the driving workflow's timeout killing
// the run mid-loop -- and since fetchAllVentureIds returns a stable order, the SAME early
// ventures would be re-attempted every cycle while later ones are never reached. Capping
// only the SCORED count (not attempted/checked) bounds LLM cost per cycle while still
// making forward progress: already-scored ventures stay cheap skips in later cycles, so
// the cursor effectively advances past them each run.
const MAX_SCORED_PER_CYCLE = 20;

/** True when a Supabase/PostgREST error means "the RPC does not exist yet" (PGRST202/42883). */
function isMissingFunctionError(error) {
  if (!error) return false;
  const code = error.code || '';
  const message = String(error.message || '');
  return code === 'PGRST202' || code === '42883' || /schema cache/i.test(message);
}

/**
 * SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-4: the detective/primary layer of the no-crack gate.
 * This is the real distribution choke -- it observes every venture with a live deployment_url
 * (the same set every job in this file already watches) regardless of HOW that URL went live,
 * which is why it catches the AltifyAI-shaped incident (a hand-run deploy CLI outside every
 * other in-repo chokepoint) that a marketing-publish-only check would miss.
 *
 * OBSERVE-ONLY: never blocks anything. Writes a system_events row per venture that is NOT_MET
 * (via the shared recordCrackGateObservation in crack-gate-evaluator.js, also used by the
 * preventive publish-gate layer), so a queryable dataset exists to justify a future promotion
 * to enforcing (see FR-9 / the documented promotion criterion in
 * docs/reference/venture-gate-attestations-guide.md).
 */

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
      .select('id, name, status, deployment_url, killed_at, is_demo')
      .not('deployment_url', 'is', null)
      .neq('deployment_url', '')
      .order('id', { ascending: true }));
  } catch (err) {
    throw new Error(`ventures query failed: ${err.message}`);
  }
}

/**
 * SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-1 (class a): PBN scoring applies to the WHOLE
 * portfolio, not just deployed ventures -- it is a Stage-0/thesis-level check that must happen
 * long before a venture has a deployment_url. Deliberately a SEPARATE, broader query from
 * fetchLiveDeploymentVentures above (measured live: 152 ventures total vs. 3 with a
 * deployment_url) rather than reusing that narrower set.
 */
async function fetchAllVentureIds(supabase) {
  try {
    // SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-4: reuse this same broad, whole-portfolio fetch
    // (already needed by job 5's PBN sweep below) for the duplicate-name + registry-divergence
    // report rather than issuing a second full-table query. Job 5 itself only reads `.id`.
    return await fetchAllPaginated(() => supabase
      .from('ventures')
      .select('id, name, status, is_demo')
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

  // Job 6 (numbered after job 3 for docstring order, runs here so it reads job 3's fresh
  // probe result): zombie report (SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-2) -- terminal-status
  // (cancelled/killed), is_demo=false ventures whose deployment_url is STILL reachable per the
  // probe job that just ran. A strict subset of `ventures` above -- no new probe infrastructure;
  // this reads venture_deployments.metadata.probe that job 3 just wrote.
  {
    const processKey = args.dryRun ? null : await ensureArmedRegistration(supabase, JOBS[5], logger);
    const zombies = [];
    const errors = [];
    let checked = 0;
    if (!args.dryRun) {
      const terminalDeployed = ventures.filter((v) => TERMINAL_STATUSES.includes(v.status) && v.is_demo === false);
      checked = terminalDeployed.length;

      // teardown_disposition is a TOLERANT, separate read: database/migrations/
      // 20260823145041_ventures_teardown_disposition.sql is still @chairman-gated as of this
      // SD, so the column may not exist on this DB yet -- never let that break jobs 1-5's
      // core `ventures` select above.
      let teardownDispositionById = new Map();
      if (terminalDeployed.length > 0) {
        try {
          const rows = await fetchAllPaginated(() => supabase
            .from('ventures')
            .select('id, teardown_disposition')
            .in('id', terminalDeployed.map((v) => v.id)));
          teardownDispositionById = new Map(rows.map((r) => [r.id, r.teardown_disposition]));
        } catch (err) {
          if (!isMissingColumnError(err)) throw err;
          logger.warn?.(`[ops-actuals-sweep] ${JOBS[5].key}: teardown_disposition column not found (migration 20260823145041 not yet applied) — zombie rows will report teardown_disposition=null this cycle.`);
        }
      }

      for (const v of terminalDeployed) {
        try {
          const { data: dep, error } = await supabase
            .from('venture_deployments')
            .select('metadata')
            .eq('venture_id', v.id)
            .eq('url', v.deployment_url)
            .maybeSingle();
          if (error) { errors.push(`${v.id}: ${error.message}`); continue; }
          if (dep?.metadata?.probe?.reachable === true) {
            const daysSinceKill = v.killed_at
              ? Math.floor((Date.now() - new Date(v.killed_at).getTime()) / 86_400_000)
              : null;
            zombies.push({
              id: v.id,
              name: v.name,
              deployment_url: v.deployment_url,
              killed_at: v.killed_at,
              days_since_kill: daysSinceKill,
              teardown_disposition: teardownDispositionById.get(v.id) ?? null,
            });
          }
        } catch (err) { errors.push(`${v.id}: ${err.message}`); }
      }
      try { await (deps.stampLastFired || stampLastFired)(supabase, processKey); }
      catch (err) { logger.warn?.(`[ops-actuals-sweep] liveness stamp failed for ${JOBS[5].key} (non-fatal): ${err.message}`); }
    }
    summary.jobs[JOBS[5].key] = { checked, zombies, errors };
    if (zombies.length > 0) {
      logger.warn?.(`[ops-actuals-sweep] ${JOBS[5].key}: ${zombies.length} zombie venture(s) found this cycle (terminal status + still-reachable deployment): ${zombies.map((z) => z.id).join(', ')}.`);
    }
  }

  // Job 4: venture crack-gate sweep (SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-4)
  {
    const processKey = args.dryRun ? null : await ensureArmedRegistration(supabase, JOBS[3], logger);
    let checked = 0;
    let wouldBlock = 0;
    let sourceUnavailable = 0;
    let feedbackEmitted = 0;
    const sourceUnavailableReasons = new Set();
    const errors = [];
    if (!args.dryRun) {
      for (const v of ventures) {
        try {
          const verdict = await (deps.evaluateCrackGateStatus || evaluateCrackGateStatus)(supabase, v.id);
          await (deps.recordCrackGateObservation || recordCrackGateObservation)(supabase, v.id, verdict, 'sweep');
          checked++;
          if (verdict.overall !== 'MEETS_CRITERION') wouldBlock++;
          // SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-8 (class h): a source-unavailable verdict
          // still counts as "checked" above and would_block=true above -- both look identical
          // to a genuinely-not-scored-yet venture unless this is tracked separately and surfaced
          // loudly. This is the exact failure mode that let the choke-gate backstop read as
          // shipped while being DB-inert for weeks.
          const unavailable = hasUnavailableSource(verdict);
          if (unavailable.unavailable) {
            sourceUnavailable++;
            for (const r of unavailable.reasons) sourceUnavailableReasons.add(r);
            // SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-9 (class i): durable, trackable feedback
            // capture for a source-unavailable finding, alongside the existing loud log line.
            // ingestSecret is always null today -- no venture has one provisioned (QF-20260817-982
            // still open) -- so this always resolves to a clean, honest "blocked" result rather
            // than a fabricated success; never throws, never affects checked/wouldBlock above.
            const fb = await (deps.emitVentureUserFeedback || emitVentureUserFeedback)(supabase, {
              ventureId: v.id,
              ingestSecret: null,
              feedbackType: 'user_other',
              title: `Crack-gate data source unavailable for venture ${v.id}`,
              description: `evaluateCrackGateStatus found an unavailable data source: ${unavailable.reasons.join('; ')}`,
            });
            if (fb.submitted) feedbackEmitted++;
          }
        } catch (err) { errors.push(`${v.id}: ${err.message}`); }
      }
      try { await (deps.stampLastFired || stampLastFired)(supabase, processKey); }
      catch (err) { logger.warn?.(`[ops-actuals-sweep] liveness stamp failed for ${JOBS[3].key} (non-fatal): ${err.message}`); }
    }
    summary.jobs[JOBS[3].key] = { attempted: ventures.length, checked, would_block: wouldBlock, source_unavailable: sourceUnavailable, feedback_emitted: feedbackEmitted, errors };
    if (!args.dryRun && ventures.length > 0 && checked === 0) {
      logger.error?.(`[ops-actuals-sweep] NC-7 ESCALATION: ${JOBS[3].key} checked 0 of ${ventures.length} venture(s) — investigate before trusting future silent passes.`);
    }
    if (sourceUnavailable > 0) {
      logger.error?.(`[ops-actuals-sweep] FR-8 ESCALATION: ${JOBS[3].key} found ${sourceUnavailable}/${checked} venture(s) with an UNAVAILABLE crack-gate data source (not "unscored" -- the underlying DB objects don't exist or an RPC errored, so this measured NOTHING): ${[...sourceUnavailableReasons].join('; ')}. would_block=true for these ventures is meaningless until the source is restored.`);
    }
    if (wouldBlock > 0) {
      logger.warn?.(`[ops-actuals-sweep] ${wouldBlock} venture(s) would be blocked by the no-crack gate (observe-only, not yet enforcing).`);
    }
  }

  // Whole-portfolio fetch, hoisted out of job 5's block so job 7 (FR-4 divergence report,
  // below) can reuse it rather than issuing a second full-table query.
  const allVentures = args.dryRun ? [] : await fetchAllVentureIds(supabase);

  // Job 5: PBN auto-score sweep (SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-1)
  {
    const processKey = args.dryRun ? null : await ensureArmedRegistration(supabase, JOBS[4], logger);
    let scored = 0;
    let alreadyScored = 0;
    let scoringErrors = 0;
    let functionMissing = 0;
    let attempted = 0;
    let capReached = false;
    const errors = [];
    if (!args.dryRun) {
      for (const v of allVentures) {
        if (scored >= MAX_SCORED_PER_CYCLE) { capReached = true; break; }
        attempted++;
        try {
          const result = await (deps.retroactivelyScoreVenture || retroactivelyScoreVenture)(supabase, v.id);
          if (result.skipped && result.reason === 'scoring_error') scoringErrors++;
          else if (result.skipped) alreadyScored++;
          else scored++;
        } catch (err) {
          // A missing RPC (migration not yet applied -- see the deployment-sequencing note in
          // docs/reference/venture-gate-attestations-guide.md) is a SCHEMA-LEVEL fact, not a
          // per-venture one: it is either missing for every venture or none. SECURITY finding
          // (EXEC-TO-PLAN review, F3): confirming it once and then continuing anyway burned a
          // real LLM completion (inside retroactivelyScoreVenture, BEFORE the RPC write is even
          // attempted) per venture per cron cycle for no benefit -- ~114 discarded completions/
          // cycle at today's portfolio size. Stop the loop on the FIRST confirmation instead.
          // Pass .code through (adversarial review finding, /ship Deep-tier gate): building a
          // message-only object here made isMissingFunctionError's code==='PGRST202'/'42883'
          // branches structurally dead at this call site, leaving detection dependent solely on
          // a /schema cache/i message-regex match -- silently missing a raw 42883 ("function ...
          // does not exist") shape, whose message doesn't contain that phrase.
          if (isMissingFunctionError({ message: err.message, code: err.code })) { functionMissing++; break; }
          errors.push(`${v.id}: ${err.message}`);
        }
      }
      try { await (deps.stampLastFired || stampLastFired)(supabase, processKey); }
      catch (err) { logger.warn?.(`[ops-actuals-sweep] liveness stamp failed for ${JOBS[4].key} (non-fatal): ${err.message}`); }
    }
    summary.jobs[JOBS[4].key] = {
      attempted: allVentures.length,
      checked: attempted,
      scored,
      already_scored: alreadyScored,
      scoring_errors: scoringErrors,
      function_missing: functionMissing,
      cap_reached: capReached,
      errors,
    };
    if (functionMissing > 0) {
      logger.error?.(`[ops-actuals-sweep] ${JOBS[4].key}: set_venture_pbn_verdict_stage_zero RPC not found (confirmed on venture ${attempted} of ${allVentures.length}, remaining ventures skipped this cycle -- a schema-level fact, not per-venture) -- the migration (database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql) has not been applied yet. Trigger code is live and will score automatically once it is.`);
    } else if (!args.dryRun && allVentures.length > 0 && scored === 0 && alreadyScored === 0 && scoringErrors === 0) {
      logger.error?.(`[ops-actuals-sweep] NC-7 ESCALATION: ${JOBS[4].key} scored 0, skipped 0, and had 0 scoring errors across ${allVentures.length} venture(s) with zero function_missing -- investigate before trusting future silent passes.`);
    }
    if (capReached) {
      logger.log?.(`[ops-actuals-sweep] ${JOBS[4].key}: reached MAX_SCORED_PER_CYCLE=${MAX_SCORED_PER_CYCLE} with ${allVentures.length - attempted} venture(s) not yet visited this cycle -- bounded by design, remainder will be picked up on subsequent cycles as already-scored ventures become cheap skips.`);
    }
    if (scoringErrors > 0) {
      logger.warn?.(`[ops-actuals-sweep] ${JOBS[4].key}: ${scoringErrors} venture(s) had a genuine scoring failure this cycle (LLM/network error) -- verdict NOT written (never a fabricated REJECT), will retry next cycle.`);
    }
    // Independent sweep finding: EVERY attempted venture failing with scoring_error (not a
    // few isolated ones) is the systemic signature of a broken scorer -- e.g. the cron
    // workflow's env missing an LLM credential entirely -- not normal per-venture noise.
    // scoring_error alone only warns (by design: isolated transient failures must stay
    // retryable, not fail the job), but this job exists BECAUSE of this SD's own "fail loud,
    // never silently green" mandate (FR-8) -- a 100%-failure cycle must flip exitCode, not
    // just log a line nobody is reading.
    if (!args.dryRun && attempted > 0 && functionMissing === 0 && scored === 0 && alreadyScored === 0 && scoringErrors === attempted) {
      const msg = `${JOBS[4].key}: ALL ${attempted} attempted venture(s) failed with scoring_error this cycle -- a systemic scorer failure (e.g. missing/invalid LLM credential in this workflow's env, or a total provider outage), not isolated noise. Zero verdicts written.`;
      logger.error?.(`[ops-actuals-sweep] SYSTEMIC ESCALATION: ${msg}`);
      errors.push(msg); // same array reference already assigned to summary.jobs[...].errors above
    }
  }

  // Job 7: duplicate-name + registry.json divergence report (SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-4)
  {
    const processKey = args.dryRun ? null : await ensureArmedRegistration(supabase, JOBS[6], logger);
    const report = {
      duplicate_names: [],
      dead_but_registered: [],
      live_unregistered_by_status: [],
      live_unregistered_by_deployment_url: [],
    };
    if (!args.dryRun) {
      const realVentures = allVentures.filter((v) => v.is_demo === false);
      const registryApps = (deps.loadRegistryApplications || loadRegistryApplications)(logger).filter(isRealRegistryEntry);
      const registeredVentureIds = new Set(registryApps.map((a) => a.venture_id).filter(Boolean));

      // (a) duplicate names with >=2 terminal-status rows among is_demo=false ventures
      // (specimen: two MarketLens rows -- id=4e710bb2 and id=ecbba50e -- both cancelled, a
      // name collision, NOT a shared deployment_url which they measurably do not have).
      const byName = new Map();
      for (const v of realVentures) {
        if (!TERMINAL_STATUSES.includes(v.status)) continue;
        if (!byName.has(v.name)) byName.set(v.name, []);
        byName.get(v.name).push({ id: v.id, status: v.status });
      }
      for (const [name, rows] of byName) {
        if (rows.length >= 2) report.duplicate_names.push({ name, ventures: rows });
      }

      // (b) dead-but-registered: a registry entry's venture_id points at a terminal-status
      // venture (specimen: APP006/MarketLens).
      const ventureById = new Map(allVentures.map((v) => [v.id, v]));
      for (const app of registryApps) {
        if (!app.venture_id) continue;
        const v = ventureById.get(app.venture_id);
        if (v && TERMINAL_STATUSES.includes(v.status)) {
          report.dead_but_registered.push({ app_id: app.id, app_name: app.name, venture_id: v.id, venture_status: v.status });
        }
      }

      // (c) live-but-unregistered, status/is_demo-based: whole-portfolio scan (TESTING F4 --
      // catches ApexNiche AI id=809ec7e7, which has deployment_url=NULL, so a deployment_url
      // join could never surface it).
      for (const v of realVentures) {
        if (TERMINAL_STATUSES.includes(v.status)) continue;
        if (registeredVentureIds.has(v.id)) continue;
        report.live_unregistered_by_status.push({ id: v.id, name: v.name, status: v.status });
      }

      // (d) live-but-unregistered, deployment-url-based: a SEPARATE, narrower scan over just
      // the deployment_url-filtered `ventures` set jobs 1-3 already use (specimen: AltifyAI
      // id=50763b6a -- "reported separately where deployment_url is the join key", per FR-4).
      for (const v of ventures) {
        if (v.is_demo !== false) continue;
        if (TERMINAL_STATUSES.includes(v.status)) continue;
        if (registeredVentureIds.has(v.id)) continue;
        report.live_unregistered_by_deployment_url.push({ id: v.id, name: v.name, deployment_url: v.deployment_url });
      }

      try { await (deps.stampLastFired || stampLastFired)(supabase, processKey); }
      catch (err) { logger.warn?.(`[ops-actuals-sweep] liveness stamp failed for ${JOBS[6].key} (non-fatal): ${err.message}`); }
    }
    summary.jobs[JOBS[6].key] = report;
    const totalFindings = report.duplicate_names.length
      + report.dead_but_registered.length
      + report.live_unregistered_by_status.length
      + report.live_unregistered_by_deployment_url.length;
    if (totalFindings > 0) {
      logger.warn?.(`[ops-actuals-sweep] ${JOBS[6].key}: ${totalFindings} divergence finding(s) this cycle (${report.duplicate_names.length} duplicate-name, ${report.dead_but_registered.length} dead-but-registered, ${report.live_unregistered_by_status.length} live-unregistered/status, ${report.live_unregistered_by_deployment_url.length} live-unregistered/deployment_url).`);
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
