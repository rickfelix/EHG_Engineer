#!/usr/bin/env node
/**
 * build-completion-forecast CLI — self-correcting infra-build completion forecast
 * (SD-LEO-INFRA-BUILD-COMPLETION-FORECAST-001).
 *
 * Gathers VDR build_pct + buildable-remaining + completion velocity + sourcing rate + queue depth,
 * computes the 100%-completion ETA (or an honest plateau), scores the PRIOR forecast vs reality
 * (FR-3), EWMA-adjusts the learned caps-per-completion, and persists the run to the dormant
 * build_completion_forecast_log (fail-soft dry-run when the table is unapplied).
 *
 *   node scripts/vision/build-completion-forecast.mjs [--window-days N] [--apply]
 *   (--apply persists the run; default dry-run prints only)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { computeBuildGauge } from '../../lib/vision/vdr-registry.js';
import { isExcludedFromBelt } from '../../lib/coordinator/sd-exclusion.mjs';
import { createRequire } from 'node:module';
import {
  computeForecast, scoreForecastError, adjustLearnedRate, formatForecastLine,
} from '../../lib/vision/build-completion-forecast.mjs';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the "live" SD read below is
// iterated/filtered to derive sourcing rate + queue depth; a PostgREST-capped read would
// silently under-report both. Paginate to completion; the completed-count read stays an
// exact head-count (only .length feeds the rate math, never iterated).
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const require = createRequire(import.meta.url);
const { parseSdDependencies } = require('../../lib/utils/parse-sd-dependencies.cjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const wdIdx = args.indexOf('--window-days');
const windowDays = wdIdx !== -1 ? parseInt(args[wdIdx + 1], 10) || 14 : 14;

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = url && key ? createClient(url, key) : null;
const nowMs = Date.now();
const sinceIso = new Date(nowMs - windowDays * DAY()).toISOString();
function DAY() { return 24 * 60 * 60 * 1000; }

const grep = (pattern, opts = {}) => {
  try { return execSync(`git grep -l "${pattern}"`, { encoding: 'utf8', cwd: opts.cwd || process.cwd() }).trim().split('\n').filter(Boolean); }
  catch { return []; }
};

async function gatherInputs() {
  // VDR gauge → build_pct + buildable-remaining (buildable components not 'built').
  let buildPct = null, buildableRemaining = 0;
  try {
    const gauge = await computeBuildGauge({ io: { supabase: sb, grep }, visionSource: true });
    buildPct = gauge?.build_pct ?? null;
    const comps = Array.isArray(gauge?.components) ? gauge.components : [];
    buildableRemaining = comps.filter(c => c.nature === 'buildable' && c.status !== 'built').length;
  } catch (e) { console.warn('[forecast] gauge unavailable: ' + (e?.message || e)); }

  // SD-derived rates (fail-soft).
  let velocityPerDay = 0, sourcingPerDay = 0, queueDepth = 0;
  try {
    const { count: completedCount, error: completedErr } = await sb.from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('updated_at', sinceIso);
    velocityPerDay = (!completedErr && typeof completedCount === 'number' ? completedCount : 0) / windowDays;

    // SD-REFILL-00306WTS: + target_application so isExcludedFromBelt drops un-actionable
    // auto-filed venture remediation SDs from sourcing-rate + queue depth.
    let rows;
    try {
      rows = await fetchAllPaginated(() => sb.from('strategic_directives_v2')
        .select('sd_key, title, description, status, sd_type, created_at, claiming_session_id, dependencies, metadata, target_application')
        .not('status', 'in', '("completed","cancelled","deferred")')
        .order('id', { ascending: true }));
    } catch { rows = []; }

    const sourced = rows.filter(d => d.created_at && d.created_at >= sinceIso && d.sd_type !== 'orchestrator' && !isExcludedFromBelt(d));
    sourcingPerDay = sourced.length / windowDays;

    // claimable buildable queue: unclaimed, non-orchestrator, non-excluded, deps met.
    const depKeys = new Set();
    rows.forEach(d => parseSdDependencies(d.dependencies).forEach(k => depKeys.add(k)));
    const depStatus = {};
    if (depKeys.size) {
      const { data: deps } = await sb.from('strategic_directives_v2').select('sd_key,status').in('sd_key', [...depKeys]);
      (deps || []).forEach(d => { depStatus[d.sd_key] = d.status; });
    }
    queueDepth = rows.filter(d => !d.claiming_session_id && d.sd_type !== 'orchestrator' && !isExcludedFromBelt(d)
      && parseSdDependencies(d.dependencies).filter(k => depStatus[k] !== 'completed').length === 0).length;
  } catch (e) { console.warn('[forecast] SD rates unavailable: ' + (e?.message || e)); }

  return { buildPct, buildableRemaining, velocityPerDay, sourcingPerDay, queueDepth };
}

// Fail-soft: load the most recent prior forecast (null if table dormant/empty).
async function loadPriorForecast() {
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('build_completion_forecast_log')
      .select('*').order('measured_at', { ascending: false }).limit(1);
    if (error) return null;
    return (Array.isArray(data) && data[0]) || null;
  } catch { return null; }
}

// Fail-soft: persist the run (no-op dry-run when the table is dormant).
async function persistForecast(row) {
  if (!sb || !APPLY) return { written: false, reason: APPLY ? 'no_client' : 'dry_run' };
  try {
    const { error } = await sb.from('build_completion_forecast_log').insert(row); // schema-lint-disable-line: extractor false-match (nearby written/reason return-value object literal misattributed as insert columns), unrelated to FR-6 pagination edits in this file
    if (error) return { written: false, reason: error.code === '42P01' || /does not exist|schema cache/i.test(error.message) ? 'table_dormant' : error.message };
    return { written: true };
  } catch (e) { return { written: false, reason: (e?.message || String(e)) }; }
}

(async () => {
  const inputs = await gatherInputs();
  const prior = await loadPriorForecast();

  // FR-3: learn caps-per-completion from the prior run + observed reality, then forecast.
  let learnedCapsPerCompletion = prior?.caps_per_completion ?? 1;
  let errorScore = null;
  if (prior) {
    errorScore = scoreForecastError(
      { etaDays: prior.eta_days, buildPct: prior.build_pct, measuredAtMs: Date.parse(prior.measured_at) },
      { nowMs, buildPct: inputs.buildPct },
    );
    // Observed caps/day this window ≈ buildPctDelta mapped back through the gauge denominator is noisy;
    // proxy the observed caps-per-completion by nudging toward faster/slower-than-forecast reality.
    if (errorScore.kind === 'scored' && Number.isFinite(errorScore.signedErrorDays)) {
      const observed = learnedCapsPerCompletion * (errorScore.signedErrorDays > 0 ? 1.1 : 0.9);
      learnedCapsPerCompletion = adjustLearnedRate(learnedCapsPerCompletion, observed, 0.3);
    }
  }

  const f = computeForecast({ ...inputs, capsPerCompletion: learnedCapsPerCompletion, velocityWindowDays: windowDays, sourcingWindowDays: windowDays, nowMs });

  const prevForFmt = prior ? { plateau: prior.plateau, etaDays: prior.eta_days } : null;
  console.log(`[BUILD-FORECAST] ${formatForecastLine(f, prevForFmt)}`);
  console.log(`  ${f.note}`);
  if (errorScore && errorScore.kind === 'scored') console.log(`  self-correction: prior ETA ${errorScore.priorEtaDays}d, signed error ${errorScore.signedErrorDays} (+=faster), learned caps/completion ${learnedCapsPerCompletion}`);
  console.log(`  GAUGE forecast plateau=${f.plateau} binding=${f.bindingConstraint} eta_days=${f.etaDays} confidence=${f.confidence} build_pct=${f.buildPct} buildable_remaining=${f.buildableRemaining} velocity=${round2(inputs.velocityPerDay)} sourcing=${round2(inputs.sourcingPerDay)} queue=${inputs.queueDepth}`);

  const res = await persistForecast({
    build_pct: f.buildPct, buildable_remaining: f.buildableRemaining,
    velocity_per_day: inputs.velocityPerDay, sourcing_per_day: inputs.sourcingPerDay, queue_depth: inputs.queueDepth,
    caps_per_completion: learnedCapsPerCompletion, assumptions: f.assumptions,
    plateau: f.plateau, binding_constraint: f.bindingConstraint, eta_days: f.etaDays,
    eta_date: f.etaDateIso, confidence: f.confidence, note: f.note,
    prior_forecast_id: prior?.id ?? null,
    signed_error_days: errorScore?.signedErrorDays ?? null, abs_error_days: errorScore?.absErrorDays ?? null,
    forecast_run_id: `bcf-${nowMs}`, recorded_by: process.env.CLAUDE_SESSION_ID || 'cron',
  });
  console.log(`  persist: ${res.written ? 'written' : 'skipped (' + res.reason + ')'}`);
})();

function round2(v) { return v == null ? null : Math.round(v * 100) / 100; }
