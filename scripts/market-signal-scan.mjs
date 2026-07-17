#!/usr/bin/env node
/**
 * Market Signal Scanner -- CLI entry point (FR-3: source/scoring wiring; FR-4:
 * registry + cron wiring). SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001.
 *
 * One weekly scan cycle:
 *   1. Check the FR-5 FinOps budget guard BEFORE any fetch work begins -- an
 *      exceeded monthly cap skips the cycle entirely (no fetches, no writes).
 *   2. For each candidate niche query term, call all 3 FR-1 source fetchers
 *      (wordpress_plugins, reddit, google_trends) and combine their family
 *      readings.
 *   3. Score the combined readings with the FR-2 scoring engine (scoreNiche)
 *      and run the hard-screen denylist (isHardScreenFailed) against the
 *      niche's category/keyword metadata.
 *   4. A niche that clears BOTH triangulation and the hard screen is
 *      nominated into venture_nursery via the proven parkVenture() insert
 *      path (lib/eva/stage-zero/venture-nursery.js) -- never a hand-rolled
 *      duplicate insert. source_type='discovery_mode' / maturity_level='seed'
 *      come from parkVenture's own brief.origin_type/brief.maturity mappers;
 *      the scanner's own attribution (source, run_id, sd_key, niche_score,
 *      family_scores, raw_observation_refs) rides brief.metadata.synthesis,
 *      which parkVenture stores verbatim at source_ref.synthesis_snapshot --
 *      the same "rich synthesis data" carrier every other parkVenture() caller
 *      uses (see lib/eva/stage-zero/chairman-review.js), not a new field.
 *   5. A cycle that nominates ZERO candidates writes NOTHING to venture_nursery
 *      and logs the honest-idle NO_DATA_MARKER (lib/market-signal-scanner/
 *      honest-idle.js) -- never fabricates a nomination to fill the gap.
 *
 * v1 candidate list (CANDIDATE_NICHES below) is a hardcoded starter array of
 * plausible SaaS/tooling niche query terms. A smarter, data-driven candidate-
 * generation step (trending-topic mining, competitor-teardown feed, etc.) is
 * an explicitly OUT-OF-SCOPE, documented future increment for this thin
 * slice -- not a silent omission.
 *
 * Registry/liveness wiring (FR-4) copies the ensureRegistryAndStamp() pattern
 * from scripts/vision/rung-progress-rollup.mjs:26-50 verbatim (self_stamped /
 * standalone_cron), adapted to this scanner's process_key and workflow file.
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';
import { checkBudget } from '../lib/market-signal-scanner/budget-guard.js';
import { reportIdleCycle } from '../lib/market-signal-scanner/honest-idle.js';
import { scoreNiche, isHardScreenFailed } from '../lib/market-signal-scanner/scoring.js';
import { fetchSignal as fetchWordpressPlugins } from '../lib/market-signal-scanner/sources/wordpress-plugins.js';
import { fetchSignal as fetchReddit } from '../lib/market-signal-scanner/sources/reddit.js';
import { fetchSignal as fetchGoogleTrends } from '../lib/market-signal-scanner/sources/google-trends.js';
import { parkVenture } from '../lib/eva/stage-zero/venture-nursery.js';

export const SD_KEY = 'SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001';
export const PROCESS_KEY = 'market-signal-scan';
const EXPECTED_INTERVAL_SECONDS = 7 * 24 * 60 * 60; // weekly cadence (market-signal-scan.yml)

/**
 * v1 starter candidate niches (hardcoded, documented simplification). Each
 * entry is a plausible SaaS/tooling query term plus the hard-screen metadata
 * (category/keywords/description) fed to isHardScreenFailed(). Replacing this
 * with a real candidate-generation pipeline is a future increment.
 */
export const CANDIDATE_NICHES = Object.freeze([
  Object.freeze({ term: 'ai meeting notes', category: '', keywords: [], description: '' }),
  Object.freeze({ term: 'invoice reminder automation', category: '', keywords: [], description: '' }),
  Object.freeze({ term: 'shopify inventory sync', category: '', keywords: [], description: '' }),
  Object.freeze({ term: 'podcast transcription', category: '', keywords: [], description: '' }),
  Object.freeze({ term: 'contract redline review', category: '', keywords: [], description: '' }),
  Object.freeze({ term: 'field service scheduling', category: '', keywords: [], description: '' }),
]);

function monthKeyFor(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Diagnostic-only mirror of scoring.js's internal family grouping, used
 * solely to attach a human-legible family_scores breakdown to the nursery
 * source_ref. scoreNiche() remains the single source of truth for the
 * pass/fail verdict and the authoritative nicheScore -- this never
 * re-derives or overrides that verdict, only reports its per-family inputs.
 */
function summarizeFamilyScores(allReadings) {
  const byFamily = new Map();
  for (const r of allReadings) {
    if (!r || typeof r.family !== 'string') continue;
    const slope = r.slope_90d_vs_baseline;
    if (typeof slope !== 'number' || !Number.isFinite(slope)) continue;
    if (!byFamily.has(r.family)) byFamily.set(r.family, []);
    byFamily.get(r.family).push(slope);
  }
  const out = {};
  for (const [family, slopes] of byFamily.entries()) {
    out[family] = slopes.reduce((a, b) => a + b, 0) / slopes.length;
  }
  return out;
}

/** Collects content_hash refs from every observation across all readings, per
 * the attested-provenance rule (a score must be recomputable from stored raw
 * observations). */
function collectObservationRefs(allReadings) {
  const refs = [];
  for (const r of allReadings) {
    for (const obs of r?.observations || []) {
      if (obs?.content_hash) refs.push(obs.content_hash);
    }
  }
  return refs;
}

/**
 * Runs one full scan cycle: budget check -> per-niche fetch+score -> nominate
 * triangulated/hard-screen-clean candidates, or report honest-idle when none
 * clear. Dependency-injected (fetchers/parkVentureFn/reportIdleCycleFn) so
 * tests can substitute fakes without mocking ESM modules.
 *
 * @param {object} deps
 * @param {object} deps.supabase - required Supabase client
 * @param {{ wordpressPlugins: Function, reddit: Function, googleTrends: Function }} [deps.fetchers]
 * @param {Function} [deps.parkVentureFn]
 * @param {Function} [deps.reportIdleCycleFn]
 * @param {Array<{term:string, category?:string, keywords?:string[], description?:string}>} [deps.candidates]
 * @param {{ log: Function, warn: Function, error?: Function }} [deps.logger]
 * @param {string} [deps.runId]
 * @returns {Promise<{ ranFetch: boolean, budgetAllowed: boolean, nominations: number, niches: number }>}
 */
export async function runScan(deps = {}) {
  const {
    supabase,
    fetchers = { wordpressPlugins: fetchWordpressPlugins, reddit: fetchReddit, googleTrends: fetchGoogleTrends },
    parkVentureFn = parkVenture,
    reportIdleCycleFn = reportIdleCycle,
    candidates = CANDIDATE_NICHES,
    logger = console,
    runId = crypto.randomUUID(),
  } = deps;

  if (!supabase) throw new Error('runScan: supabase client is required');

  // (1) Budget guard -- checked BEFORE any fetch work begins. An exceeded cap
  // skips the entire cycle: no fetches, no writes.
  const budget = await checkBudget({ supabase, monthKey: monthKeyFor() });
  if (!budget.allowed) {
    logger.warn(`[market-signal-scan] budget cap reached, skipping cycle: ${budget.reason}`);
    return { ranFetch: false, budgetAllowed: false, nominations: 0, niches: candidates.length };
  }

  let nominations = 0;

  for (const niche of candidates) {
    const [wp, rd, gt] = await Promise.all([
      fetchers.wordpressPlugins({ query: { term: niche.term }, supabase }),
      fetchers.reddit({ query: { term: niche.term }, supabase }),
      fetchers.googleTrends({ query: { term: niche.term }, supabase }),
    ]);

    for (const { errors } of [wp, rd, gt]) {
      for (const e of errors || []) logger.warn(`[market-signal-scan] "${niche.term}": ${e}`);
    }

    const allReadings = [...(wp.readings || []), ...(rd.readings || []), ...(gt.readings || [])];
    const score = scoreNiche(allReadings);

    if (!score.triangulationPassed) {
      logger.log(`[market-signal-scan] "${niche.term}": ${score.reasoning}`);
      continue;
    }

    const hardScreenFailed = isHardScreenFailed({
      category: niche.category,
      keywords: niche.keywords,
      description: niche.description,
    });
    if (hardScreenFailed) {
      logger.log(`[market-signal-scan] "${niche.term}": hard-screened out (${hardScreenFailed})`);
      continue;
    }

    const familyScores = summarizeFamilyScores(allReadings);
    const rawObservationRefs = collectObservationRefs(allReadings);

    const brief = {
      name: `Market signal: ${niche.term}`,
      problem_statement: `Market-signal-scanner nomination for niche "${niche.term}" -- ${score.reasoning}`,
      solution: null,
      target_market: null,
      origin_type: 'discovery', // -> parkVenture's toNurserySourceType -> 'discovery_mode'
      maturity: 'seed', // -> parkVenture's toNurseryMaturityLevel -> 'seed'
      composite_score: score.nicheScore,
      metadata: {
        synthesis: {
          source: 'market-signal-scanner',
          run_id: runId,
          sd_key: SD_KEY,
          niche_score: score.nicheScore,
          family_scores: familyScores,
          raw_observation_refs: rawObservationRefs,
        },
      },
    };

    // Proven insert path -- never a hand-rolled duplicate of parkVenture's insert logic.
    // Wrapped: a single niche's insert failure (e.g. a future scoring regression
    // producing an out-of-range current_score) must not abort the remaining
    // candidates in this cycle, nor skip the registry liveness stamp that runs
    // after the loop (adversarial-review fix, PR #6142).
    try {
      await parkVentureFn(
        brief,
        {
          reason: `market-signal-scan triangulated nomination (families: ${score.families.join('+')})`,
          reviewSchedule: '90d',
        },
        { supabase, logger }
      );
      nominations += 1;
      logger.log(`[market-signal-scan] NOMINATED "${niche.term}" -- nicheScore=${score.nicheScore.toFixed(4)}`);
    } catch (err) {
      logger.warn(`[market-signal-scan] "${niche.term}": parkVenture insert failed (non-fatal, continuing cycle): ${err?.message || err}`);
    }
  }

  // Honest-idle: zero nominations this cycle -> log the marker, write nothing.
  if (nominations === 0) {
    reportIdleCycleFn(logger);
  }

  return { ranFetch: true, budgetAllowed: true, nominations, niches: candidates.length };
}

// Registry self-registration + liveness stamp -- pattern copied from
// scripts/vision/rung-progress-rollup.mjs:26-50 (ensureRegistryAndStamp), adapted to
// this scanner's process_key/display_name/workflow (FR-4).
async function ensureRegistryAndStamp(supabase) {
  try {
    const { error } = await supabase.from('periodic_process_registry').upsert({
      process_key: PROCESS_KEY,
      display_name: 'Market signal scanner (weekly niche triangulation scan)',
      owner: 'market-signal-scanner',
      process_type: 'standalone_cron',
      expected_interval_seconds: EXPECTED_INTERVAL_SECONDS,
      liveness_source: 'self_stamped',
      liveness_source_ref: { workflow: '.github/workflows/market-signal-scan.yml', sd_key: SD_KEY },
      session_bound: false,
      currently_expected_active: true,
    }, { onConflict: 'process_key' });
    if (error) throw new Error(error.message);
    await stampLastFired(supabase, PROCESS_KEY);
    console.log(`  [liveness] ${PROCESS_KEY} registered + last_fired_at stamped`);
  } catch (err) {
    // Loud but non-fatal: the scan itself succeeded; a missing stamp surfaces as
    // UNVERIFIED/OVERDUE on the liveness watcher rather than a lost run.
    console.error(`  [liveness] WARN: registry stamp failed for ${PROCESS_KEY}: ${err.message}`);
  }
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[market-signal-scan] missing Supabase creds');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const result = await runScan({ supabase, logger: console });
  await ensureRegistryAndStamp(supabase);

  console.log(
    `[market-signal-scan] cycle complete: budgetAllowed=${result.budgetAllowed} ` +
    `niches=${result.niches} nominations=${result.nominations}`
  );
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('[market-signal-scan] fatal:', e?.message || e);
    process.exit(1);
  });
}
