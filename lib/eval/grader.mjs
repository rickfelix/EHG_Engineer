/**
 * FR-2 scoring engine — split-verb, fresh-context grader for the model-capability
 * EVAL harness.
 * SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-B (child B of SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002,
 * Solomon Part-4 spec).
 *
 * Consumes child A's contract (lib/eval/golden-task-loader.js): loadGoldenTaskSets()
 * for candidate runs, getAnswerKey() for the DB-side reality key. Reuses the scoring
 * primitives in lib/eval/capability-scorer.mjs (costNorm/pairwise/toReferenceRow) —
 * never a second copy. This module IS the grading path that A's populateReference()
 * seam left as GRADING_NOT_IMPLEMENTED_IN_CHILD_A.
 *
 * FR-2 contract:
 *   - PAIRWISE + COST-NORMALIZED scoring (via capability-scorer, reused).
 *   - FRESH-CONTEXT grading: the grader's authority is the answer key + the candidate's
 *     FINAL OUTPUT — NEVER the candidate's own reasoning/chain-of-thought (grading inside
 *     the frame that produced the answer is exactly the contamination this guards).
 *   - SPLIT-VERB: cheap Sonnet-floor seats grade the BULK first-pass; a first-pass grade
 *     that lands BORDERLINE (quality near the clears-bar) is ESCALATED to the DEEP tier
 *     (Fable/Opus-class, xhigh) for an authoritative re-grade.
 *   - CONTAMINATION GUARD (inherited absolute): keys stay DB-side; nothing here persists a
 *     key value or task_text; emitted rows are results-only.
 *   - trusted_for_routing is ALWAYS false (toReferenceRow hardcodes it); only child C's
 *     ground-truth gate may flip it true. B never binds routing.
 *
 * The table write stays fail-closed (CEREMONY_PENDING) while the model_capability_reference
 * migration is STAGED/chairman-gated — this module ships the grading logic, not DDL.
 */
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { costNorm, pairwise, toReferenceRow } from './capability-scorer.mjs';
import { loadGoldenTaskSets, getAnswerKey, MIRROR_SUITE } from './golden-task-loader.js';

const require = createRequire(import.meta.url);
// tier-ladder is CJS; capabilityScore quantifies model×effort strength so "deep grader vs
// cheap seat" derives from the canonical ladder, not a hand-rolled model ranking.
const { capabilityScore } = require('../fleet/tier-ladder.cjs');

/** Quality at/above this clears the bar (the "does this model pass on this shape" threshold). */
export const CLEARS_BAR_THRESHOLD = 0.70;
/** A first-pass quality within this margin of the bar is BORDERLINE → escalate to deep tier. */
export const BORDERLINE_MARGIN = 0.10;
/** Deep grader: strongest model at max effort (borderline-case authority). */
export const DEEP_TIER = Object.freeze({ model: 'fable', effort: 'xhigh' });
/** Cheap seat: Sonnet-floor, runs the bulk. */
export const CHEAP_TIER = Object.freeze({ model: 'sonnet', effort: 'medium' });

/**
 * FRESH-CONTEXT grading request (pure). Carries ONLY the task, the candidate's final
 * OUTPUT, and the DB-side answer key — deliberately NOT the candidate's reasoning /
 * chain-of-thought, so the grader can never treat the candidate's self-justification as
 * authority (the fresh-context contamination guard).
 * @param {{task_text:string, output:string, answerKey:string|null}} args
 */
export function buildFreshContextRequest({ task_text, output, answerKey }) {
  return Object.freeze({
    task_text,
    candidate_output: output,
    answer_key: answerKey,
    // NO candidate reasoning / chain-of-thought by construction (fresh-context authority).
  });
}

/**
 * Split-verb routing (pure): decide the grading verb's tier from a first-pass grade.
 * Borderline (quality within `margin` of the bar) → 'deep'; clear-cut → 'cheap'.
 * @param {{quality_score:number}|null} grade
 */
export function classifyGradingTier(grade, { bar = CLEARS_BAR_THRESHOLD, margin = BORDERLINE_MARGIN } = {}) {
  const q = grade && typeof grade.quality_score === 'number' ? grade.quality_score : 0;
  return Math.abs(q - bar) <= margin ? 'deep' : 'cheap';
}

/** Canonical-ladder strength for a tier label ('deep'|'cheap'). */
export function tierStrength(tierLabel) {
  const t = tierLabel === 'deep' ? DEEP_TIER : CHEAP_TIER;
  return capabilityScore(t.model, t.effort);
}

function contentHashOf(output) {
  return crypto.createHash('sha256').update(String(output ?? '')).digest('hex').slice(0, 16);
}

/**
 * Rank each task's rows by PAIRWISE preference (higher cost-normalized quality wins),
 * using capability-scorer.pairwise as the comparator SSOT (never a re-derived metric).
 * @param {Array} rows reference-row-shaped objects
 * @returns {Record<string, Array>} task_id -> ranked rows (best first)
 */
export function rankPairwise(rows) {
  const byTask = new Map();
  for (const r of rows) {
    if (!byTask.has(r.task_id)) byTask.set(r.task_id, []);
    byTask.get(r.task_id).push(r);
  }
  const out = {};
  for (const [task, group] of byTask) {
    out[task] = [...group].sort((a, b) => {
      const cmp = pairwise(a, b); // same task_id within a group; throws otherwise
      return cmp.preferred === `${a.model_id}:${a.effort}` ? -1 : 1;
    });
  }
  return out;
}

/**
 * Grade every sealed candidate run across the golden task sets and emit results-only
 * reference rows (trusted_for_routing=false). Dependency-injected so it is unit-testable
 * without a live model/DB: gradeFn(request, {tier}) => {clears_bar, quality_score, grader,
 * graded_at}. In production, gradeFn wraps a FRESH model session via lib/llm/client-factory.
 *
 * @param {Object} supabase
 * @param {Object} deps
 * @param {(req:Object, ctx:{tier:string})=>Promise<{clears_bar:boolean,quality_score:number,grader:string,graded_at:string}>} deps.gradeFn required
 * @param {Function} [deps.loader] default loadGoldenTaskSets
 * @param {Function} [deps.keyAccessor] default getAnswerKey
 * @param {Function} [deps.classify] default classifyGradingTier
 * @param {number} [deps.bar]
 * @returns {Promise<{rows:Array, ranked:Object, stats:Object, integrityErrors:Array, source:string}>}
 */
export async function gradeGoldenTasks(supabase, {
  gradeFn,
  loader = loadGoldenTaskSets,
  keyAccessor = getAnswerKey,
  classify = classifyGradingTier,
  bar = CLEARS_BAR_THRESHOLD,
} = {}) {
  if (typeof gradeFn !== 'function') {
    throw new Error('gradeGoldenTasks: gradeFn (request,{tier})=>grade is required');
  }
  const { sets, integrityErrors, source } = await loader(supabase);
  const rows = [];
  const stats = { tasks: sets.length, runs: 0, cheap_grades: 0, deep_regrades: 0 };

  for (const set of sets) {
    const answerKey = await keyAccessor(supabase, set.task_id);
    for (const sr of set.sealed_runs) {
      const request = buildFreshContextRequest({ task_text: set.task_text, output: sr.output, answerKey });
      // BULK: cheap first-pass grade.
      let grade = await gradeFn(request, { tier: 'cheap' });
      stats.cheap_grades += 1;
      // SPLIT-VERB: borderline first-pass → escalate to the deep tier for an authoritative re-grade.
      if (classify(grade, { bar }) === 'deep') {
        grade = await gradeFn(request, { tier: 'deep' });
        stats.deep_regrades += 1;
      }
      const run = {
        task_id: set.task_id,
        shape: set.shape,
        model_id: sr.model_id,
        effort: sr.effort,
        tokens: sr.tokens,
        wall_clock_ms: sr.wall_clock,
        run_at: sr.run_at,
        content_hash: contentHashOf(sr.output),
        source_ref: MIRROR_SUITE,
      };
      rows.push(toReferenceRow(run, grade)); // trusted_for_routing:false, results-only
      stats.runs += 1;
    }
  }
  return { rows, ranked: rankPairwise(rows), stats, integrityErrors, source };
}
