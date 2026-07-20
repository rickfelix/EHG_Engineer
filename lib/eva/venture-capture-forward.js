/**
 * Venture Capture-Forward (collect-without-promote)
 * SD-LEO-INFRA-CAPTURE-FORWARD-GATE-001 (FR-1, FR-2)
 *
 * Chairman-ratified decision 1c1771d9 (2026-07-04): un-gate first-run signal
 * extraction from the S26 template-extraction gate for venture-1, NOW,
 * retroactively over already-completed stages and forward as future stages
 * complete -- WITHOUT writing to venture_templates (the application surface,
 * which remains chairman-deferred to first-revenue exactly as ratified).
 *
 * This module reuses ONLY the pure, side-effect-free sub-extractor functions
 * already exported by template-extractor.js. It NEVER imports or calls
 * extractTemplate() or updateEffectivenessScore(), and it writes exclusively
 * to venture_capture_snapshots -- never venture_templates. This is the
 * FR-2 hard fence: collect-only, no promotion, no funnel recalibration.
 */

import {
  extractScoringThresholds,
  extractArchitecturePatterns,
  extractDFECalibrations,
  extractPricingParams,
  extractGTMEffectiveness,
  resolveMinExtractStage,
} from './template-extractor.js';
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const MODULE_VERSION = '1.0.0';

/**
 * Capture a single stage's signal for a venture into venture_capture_snapshots.
 * Idempotent: re-running for the same (venture_id, lifecycle_stage) upserts.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @param {number} stage
 * @returns {Promise<{id: string, venture_id: string, lifecycle_stage: number}>}
 */
async function captureVentureStage(supabase, ventureId, stage) {
  const [
    scoring_thresholds,
    architecture_patterns,
    dfe_calibrations,
    pricing_params,
    gtm_effectiveness,
  ] = await Promise.all([
    extractScoringThresholds(supabase, ventureId),
    extractArchitecturePatterns(supabase, ventureId),
    extractDFECalibrations(supabase, ventureId),
    extractPricingParams(supabase, ventureId),
    extractGTMEffectiveness(supabase, ventureId),
  ]);

  const snapshot = {
    scoring_thresholds,
    architecture_patterns,
    dfe_calibrations,
    pricing_params,
    gtm_effectiveness,
    extractor_version: MODULE_VERSION,
    extracted_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('venture_capture_snapshots')
    .upsert(
      { venture_id: ventureId, lifecycle_stage: stage, snapshot },
      { onConflict: 'venture_id,lifecycle_stage' }
    )
    .select('id, venture_id, lifecycle_stage')
    .single();

  if (error) throw new Error(`Failed to upsert venture_capture_snapshots: ${error.message}`);
  return data;
}

/**
 * Retroactively capture a range of already-completed stages for a venture.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @param {number} fromStage
 * @param {number} toStage
 * @returns {Promise<Array<{id: string, venture_id: string, lifecycle_stage: number}>>}
 */
async function captureVentureRetroactive(supabase, ventureId, fromStage, toStage) {
  const results = [];
  for (let stage = fromStage; stage <= toStage; stage += 1) {
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential, small stage ranges
    results.push(await captureVentureStage(supabase, ventureId, stage));
  }
  return results;
}

/**
 * Per-venture capture-completeness reading: how many of a venture's completed
 * stages (from resolveMinExtractStage() forward) already have a
 * venture_capture_snapshots row. Feeds FR-3's gauge-runner detector.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{id: string, current_lifecycle_stage: number}} venture
 * @param {{minStage?: number}} [opts]
 * @returns {Promise<{ventureId: string, expected: number, captured: number, missing: number, coveragePct: number}>}
 */
async function getCaptureCompleteness(supabase, venture, opts = {}) {
  const minStage = resolveMinExtractStage(opts);
  const expected = Math.max(0, venture.current_lifecycle_stage - minStage + 1);

  if (expected === 0) {
    return { ventureId: venture.id, expected: 0, captured: 0, missing: 0, coveragePct: 100 };
  }

  const { data: rows, error } = await supabase
    .from('venture_capture_snapshots')
    .select('lifecycle_stage')
    .eq('venture_id', venture.id)
    .gte('lifecycle_stage', minStage)
    .lte('lifecycle_stage', venture.current_lifecycle_stage);

  if (error) throw new Error(`Failed to query venture_capture_snapshots: ${error.message}`);

  const captured = new Set((rows || []).map((r) => r.lifecycle_stage)).size;
  const missing = Math.max(0, expected - captured);
  const coveragePct = expected > 0 ? Math.round((captured / expected) * 10000) / 100 : 100;

  return { ventureId: venture.id, expected, captured, missing, coveragePct };
}

/**
 * QF-20260704-609: which specific stage numbers (from minStage forward) are
 * missing a venture_capture_snapshots row for this venture. Reuses the exact
 * query shape getCaptureCompleteness() uses, just returning the stage list
 * instead of a count, so drainCaptureBacklog() knows exactly what to capture.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{id: string, current_lifecycle_stage: number}} venture
 * @param {{minStage?: number}} [opts]
 * @returns {Promise<number[]>}
 */
async function getMissingStages(supabase, venture, opts = {}) {
  const minStage = resolveMinExtractStage(opts);
  if (venture.current_lifecycle_stage < minStage) return [];

  const { data: rows, error } = await supabase
    .from('venture_capture_snapshots')
    .select('lifecycle_stage')
    .eq('venture_id', venture.id)
    .gte('lifecycle_stage', minStage)
    .lte('lifecycle_stage', venture.current_lifecycle_stage);

  if (error) throw new Error(`Failed to query venture_capture_snapshots: ${error.message}`);

  const captured = new Set((rows || []).map((r) => r.lifecycle_stage));
  const missing = [];
  for (let stage = minStage; stage <= venture.current_lifecycle_stage; stage += 1) {
    if (!captured.has(stage)) missing.push(stage);
  }
  return missing;
}

/**
 * QF-20260704-609: drain the retroactive capture backlog across ALL active
 * ventures, through the EXACT shipped per-stage capture path
 * (captureVentureStage) -- no second extraction implementation. Idempotent:
 * captureVentureStage upserts on (venture_id, lifecycle_stage), so re-running
 * this against an already-drained backlog finds zero missing stages and is a
 * pure no-op (proves the forward path stays unbroken).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{minStage?: number}} [opts]
 * @returns {Promise<{attempted: number, captured: number, errors: Array<{ventureId: string, stage: number, error: string}>}>}
 */
async function drainCaptureBacklog(supabase, opts = {}) {
  const minStage = resolveMinExtractStage(opts);
  // Paginated (FR-6 batch 7): the backlog drain must see every active venture.
  const ventures = await fetchAllPaginated(() => supabase
    .from('ventures')
    .select('id, name, current_lifecycle_stage')
    .eq('status', 'active')
    .gte('current_lifecycle_stage', minStage)
    .order('id', { ascending: true }))
    .catch((e) => { throw new Error(`Failed to query ventures: ${e.message}`); });

  let attempted = 0;
  let captured = 0;
  const errors = [];

  for (const venture of ventures || []) {
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential, small backlog
    const missingStages = await getMissingStages(supabase, venture, { minStage });
    for (const stage of missingStages) {
      attempted += 1;
      try {
        // eslint-disable-next-line no-await-in-loop -- intentionally sequential, small backlog
        await captureVentureStage(supabase, venture.id, stage);
        captured += 1;
        console.log(`[drain-capture-backlog] captured ${venture.name || venture.id} stage ${stage}`);
      } catch (err) {
        errors.push({ ventureId: venture.id, stage, error: err.message });
        console.log(`[drain-capture-backlog] FAILED ${venture.name || venture.id} stage ${stage}: ${err.message}`);
      }
    }
  }

  return { attempted, captured, errors };
}

export {
  captureVentureStage,
  captureVentureRetroactive,
  getCaptureCompleteness,
  getMissingStages,
  drainCaptureBacklog,
  MODULE_VERSION,
};
