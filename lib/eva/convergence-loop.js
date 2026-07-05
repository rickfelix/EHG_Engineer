/**
 * Convergence Loop — score, remediate, rescore, bounded and monotone-terminating,
 * producing a 3-disposition escalation packet on exhaustion/non-convergence.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C. Wraps lib/eva/adherence-scorer.js
 * (FR-1/2/3/4) with the orchestration loop (FR-5), remediation router (FR-6),
 * and escalation-packet generator (FR-7). Scorer/builder/remediator role
 * separation (FR-3) is structural: every rescore is a fresh scoreVerdictTable()
 * invocation with no shared mutable state carried from the remediation step.
 *
 * @module lib/eva/convergence-loop
 */

import { scoreVerdictTable, buildDeviationLedger } from './adherence-scorer.js';
import { isTrendingDown } from '../coordinator/convergence-ledger.js';
import { withRetry } from './stage-zero/data-pollers/retry.js';

/** Chairman-ratified constants — changing these requires fresh chairman
 *  ratification (parent SD's gate-freeze), so they are function-parameter
 *  defaults, never env-configurable. */
export const DEFAULT_MAX_CYCLES = 3;
export const DEFAULT_PER_CYCLE_CAP = 5;

/** Exactly three escalation dispositions — no others are ever offered (FR-7). */
export const ESCALATION_DISPOSITIONS = Object.freeze([
  'descope-as-known-gap',
  'pivot-the-artifact',
  'hold-launch',
]);

/**
 * Convert a scoreVerdictTable() result into a single "deficit" number where 0 means
 * PASS and lower is always better/closer-to-passing — the natural direction for
 * isTrendingDown() (lower-is-converging), reused from lib/coordinator/convergence-ledger.js
 * per validation-agent's LEAD-phase finding rather than reinventing a comparator.
 * @param {{dimensionScores: object, unscoredDimensions: string[], mean: number, rubric: object}} scoreResult
 * @returns {number}
 */
export function computeDeficit(scoreResult) {
  const { dimensionScores, unscoredDimensions, mean, rubric } = scoreResult;
  const unscoredPenalty = unscoredDimensions.length * 10; // an unscored dimension always fails regardless of others
  const floorDeficit = Object.values(dimensionScores)
    .filter((v) => typeof v === 'number')
    .reduce((sum, v) => sum + Math.max(0, rubric.dimension_floor - v), 0);
  const meanDeficit = Math.max(0, rubric.mean_floor - mean);
  return unscoredPenalty + floorDeficit + meanDeficit;
}

/**
 * Classify each below-floor/unscored dimension as a completeness gap (no verdict
 * rows at all — the artifact itself is missing) or an adherence gap (verdict rows
 * exist but scored below the dimension floor).
 * @param {{dimensionScores: object, unscoredDimensions: string[], rubric: object}} scoreResult
 * @returns {Array<{dimension: string, kind: 'completeness'|'adherence', score: number|null}>}
 */
export function classifyGaps(scoreResult) {
  const { dimensionScores, unscoredDimensions, rubric } = scoreResult;
  const gaps = [];
  for (const [dimension, score] of Object.entries(dimensionScores)) {
    if (unscoredDimensions.includes(dimension)) {
      gaps.push({ dimension, kind: 'completeness', score: null });
    } else if (typeof score === 'number' && score < rubric.dimension_floor) {
      gaps.push({ dimension, kind: 'adherence', score });
    }
  }
  return gaps;
}

/**
 * Backfill a completeness gap. REQUIRES an injected upstream source function —
 * there is deliberately no default implementation, because any default would
 * either (a) read from the venture's own build/repo (the circularity this guard
 * exists to prevent) or (b) silently no-op, both worse than a loud failure.
 * The circularity guard rejects any sourceFn result whose declared `source` is
 * 'build' or 'repo'.
 * @param {{dimension: string, ventureId: string}} gap
 * @param {Function} sourceFn - async ({dimension, ventureId}) => {source: string, artifact: object}
 * @returns {Promise<{retroactive: true, confidence: 'low', artifact: object}>}
 */
export async function backfillCompletenessGap(gap, sourceFn) {
  if (typeof sourceFn !== 'function') {
    throw new Error('[convergence-loop] backfillCompletenessGap requires an upstream sourceFn (no default — circularity guard by omission)');
  }
  const result = await withRetry(() => sourceFn(gap), { label: `backfill:${gap.dimension}`, maxRetries: 1 });
  if (!result || result.source === 'build' || result.source === 'repo') {
    throw new Error(`[convergence-loop] circularity guard: completeness backfill for dimension=${gap.dimension} rejected a build/repo-sourced result — must originate upstream`);
  }
  return { retroactive: true, confidence: 'low', artifact: result.artifact ?? result };
}

/**
 * Classify an adherence gap's remediation tier. Tier 3 (full SD, LEAD path) when
 * the gap has any critical-weight deviation attached (per the deviation ledger) —
 * otherwise tier 1/2 (quick-fix, auto-dispatch). Injectable for override in tests;
 * the default reads the ledger passed in by the caller.
 * @param {{dimension: string}} gap
 * @param {Array<{dimension?: string, weight: string}>} ledger
 * @returns {1|2|3}
 */
export function classifyRemediationTier(gap, ledger) {
  const hasCritical = (ledger || []).some((entry) => entry.dimension === gap.dimension && entry.weight === 'critical');
  return hasCritical ? 3 : 2;
}

/**
 * File a fix for an adherence gap via the existing SD/QF creation paths.
 * Tier-1/2 -> create-quick-fix.js (auto-file+auto-dispatch); tier-3 ->
 * leo-create-sd.js (auto-file-draft into the standard LEAD path).
 * @param {{dimension: string, score: number|null}} gap
 * @param {{tier: 1|2|3, createQuickFixFn: Function, createSdFn: Function}} opts
 * @returns {Promise<{filed: string, id: string}>}
 */
export async function fileAdherenceFix(gap, { tier, createQuickFixFn, createSdFn }) {
  const title = `Adherence gap: ${gap.dimension} scored ${gap.score ?? 'unscored'} (post-build reconciliation)`;
  if (tier === 3) {
    if (typeof createSdFn !== 'function') {
      throw new Error('[convergence-loop] fileAdherenceFix requires createSdFn for tier-3 gaps');
    }
    const id = await withRetry(() => createSdFn({ title, dimension: gap.dimension }), { label: `file-sd:${gap.dimension}`, maxRetries: 1 });
    return { filed: 'sd', id };
  }
  if (typeof createQuickFixFn !== 'function') {
    throw new Error('[convergence-loop] fileAdherenceFix requires createQuickFixFn for tier-1/2 gaps');
  }
  const id = await withRetry(() => createQuickFixFn({ title, dimension: gap.dimension }), { label: `file-qf:${gap.dimension}`, maxRetries: 1 });
  return { filed: 'quick_fix', id };
}

/**
 * Route one cycle's below-threshold gaps to remediation, capped at perCycleCap.
 * Overflow items are returned as `deferred`, never silently dropped or auto-filed.
 * @param {Array} gaps
 * @param {{ventureId: string, perCycleCap: number, ledger: Array, backfillFn?: Function, createQuickFixFn?: Function, createSdFn?: Function}} opts
 * @returns {Promise<{routed: Array, deferred: Array, errors: Array}>}
 */
export async function routeRemediation(gaps, { ventureId, perCycleCap = DEFAULT_PER_CYCLE_CAP, ledger = [], backfillFn, createQuickFixFn, createSdFn }) {
  const routed = [];
  const deferred = [];
  const errors = [];

  const toRoute = gaps.slice(0, perCycleCap);
  const overflow = gaps.slice(perCycleCap);
  deferred.push(...overflow);

  for (const gap of toRoute) {
    try {
      if (gap.kind === 'completeness') {
        const result = await backfillCompletenessGap({ ...gap, ventureId }, backfillFn);
        routed.push({ ...gap, remediation: 'completeness-backfill', result });
      } else {
        const tier = classifyRemediationTier(gap, ledger);
        const result = await fileAdherenceFix(gap, { tier, createQuickFixFn, createSdFn });
        routed.push({ ...gap, remediation: 'adherence-fix', tier, result });
      }
    } catch (err) {
      errors.push({ ...gap, error: err.message });
      deferred.push(gap);
    }
  }

  return { routed, deferred, errors };
}

/**
 * Build the escalation packet on cap exhaustion or non-convergence — exactly the
 * three chairman-specified disposition options (FR-7), never more or fewer.
 * @param {{scoreResult: object, ledger: Array, deferredItems: Array, isArtifactChairmanApproved?: boolean}} opts
 * @returns {object}
 */
export function buildEscalationPacket({ scoreResult, ledger, deferredItems = [], isArtifactChairmanApproved = false }) {
  return {
    finalState: scoreResult,
    deviationLedger: ledger,
    deferredThisCycle: deferredItems,
    dispositions: ESCALATION_DISPOSITIONS.map((key) => ({
      key,
      ...(key === 'pivot-the-artifact' ? { requires_chairman_ratification: isArtifactChairmanApproved === true } : {}),
    })),
  };
}

/**
 * Run the full convergence loop for one venture: score, and if below threshold,
 * route gaps to remediation, rescore, repeat up to maxCycles with monotone-
 * convergence early termination. On PASS, returns immediately. On cap exhaustion
 * or non-convergence, returns an escalation packet.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string, rubricKey?: string, maxCycles?: number, perCycleCap?: number,
 *   backfillFn?: Function, createQuickFixFn?: Function, createSdFn?: Function,
 *   isArtifactChairmanApproved?: boolean}} opts
 * @returns {Promise<{status: 'PASS'|'ESCALATED', cycles: number, scoreResult: object, escalationPacket?: object, remediationHistory: Array}>}
 */
export async function runConvergenceLoop(supabase, opts = {}) {
  const {
    ventureId,
    rubricKey = 'post_build_adherence_v1',
    maxCycles = DEFAULT_MAX_CYCLES,
    perCycleCap = DEFAULT_PER_CYCLE_CAP,
    backfillFn,
    createQuickFixFn,
    createSdFn,
    isArtifactChairmanApproved = false,
  } = opts;

  if (!ventureId) throw new Error('[convergence-loop] runConvergenceLoop requires ventureId');

  const deficitSeries = [];
  const remediationHistory = [];
  let scoreResult = await scoreVerdictTable(supabase, { ventureId, rubricKey });
  let cycle = 0;

  while (cycle < maxCycles) {
    cycle += 1;
    deficitSeries.push(computeDeficit(scoreResult));

    if (scoreResult.pass) {
      return { status: 'PASS', cycles: cycle, scoreResult, remediationHistory };
    }

    // Monotone-convergence early exit: if the deficit series is not strictly
    // trending down so far (a rescore did not improve, or regressed), stop
    // rather than burning remaining cycles. Skipped on the very first cycle
    // (nothing to compare against yet).
    if (cycle > 1 && !isTrendingDown(deficitSeries)) {
      break;
    }

    const gaps = classifyGaps(scoreResult);
    const ledger = await buildDeviationLedger(supabase, { ventureId });
    const { routed, deferred, errors } = await routeRemediation(gaps, {
      ventureId, perCycleCap, ledger, backfillFn, createQuickFixFn, createSdFn,
    });
    remediationHistory.push({ cycle, routed, deferred, errors });

    if (cycle >= maxCycles) {
      // Fresh, independent rescore (structural role separation, FR-3) before
      // deciding final PASS/ESCALATE at cap exhaustion.
      scoreResult = await scoreVerdictTable(supabase, { ventureId, rubricKey });
      deficitSeries.push(computeDeficit(scoreResult));
      break;
    }

    // Fresh rescore for the next loop iteration — a new, independent invocation,
    // never reusing the pre-remediation scoreResult (FR-3).
    scoreResult = await scoreVerdictTable(supabase, { ventureId, rubricKey });
  }

  if (scoreResult.pass) {
    return { status: 'PASS', cycles: cycle, scoreResult, remediationHistory };
  }

  const ledger = await buildDeviationLedger(supabase, { ventureId });
  const lastDeferred = remediationHistory[remediationHistory.length - 1]?.deferred ?? [];
  const escalationPacket = buildEscalationPacket({
    scoreResult, ledger, deferredItems: lastDeferred, isArtifactChairmanApproved,
  });

  return { status: 'ESCALATED', cycles: cycle, scoreResult, escalationPacket, remediationHistory };
}

export default {
  DEFAULT_MAX_CYCLES, DEFAULT_PER_CYCLE_CAP, ESCALATION_DISPOSITIONS,
  computeDeficit, classifyGaps, backfillCompletenessGap, classifyRemediationTier,
  fileAdherenceFix, routeRemediation, buildEscalationPacket, runConvergenceLoop,
};
