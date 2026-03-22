/**
 * Stage 17 Template - Blueprint Review Gate
 * Phase: THE BLUEPRINT (Stages 13-17)
 * Part of SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001
 *
 * Aggregates all artifacts from stages 1-16, computes per-phase
 * quality scores, identifies gaps, and produces a promotion gate
 * recommendation (PASS/FAIL/REVIEW_NEEDED) before entering BUILD.
 *
 * @module lib/eva/stage-templates/stage-17
 */

import { validateArray, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';

const PHASE_GROUPINGS = {
  THE_TRUTH:     { start: 1, end: 5,  label: 'The Truth' },
  THE_ENGINE:    { start: 6, end: 9,  label: 'The Engine' },
  THE_IDENTITY:  { start: 10, end: 12, label: 'The Identity' },
  THE_BLUEPRINT: { start: 13, end: 16, label: 'The Blueprint' },
};

const PROMOTION_THRESHOLDS = { pass: 70, review: 50, completeness_pass: 80, completeness_review: 60 };
const GATE_DECISIONS = ['PASS', 'FAIL', 'REVIEW_NEEDED'];

const TEMPLATE = {
  id: 'stage-17',
  slug: 'blueprint-review',
  title: 'Blueprint Review Gate',
  version: '1.0.0',
  schema: {
    phase_summaries: {
      type: 'array',
      required: true,
      items: {
        phase: { type: 'string', required: true },
        stages: { type: 'array', required: true },
        artifact_count: { type: 'number', min: 0, required: true },
        expected_count: { type: 'number', min: 0, required: true },
        completeness_pct: { type: 'number', min: 0, max: 100, required: true },
        avg_quality_score: { type: 'number', min: 0, max: 100, required: true },
        gaps: { type: 'array' },
      },
    },
    overall_quality_score: { type: 'number', min: 0, max: 100, derived: true },
    overall_completeness_pct: { type: 'number', min: 0, max: 100, derived: true },
    critical_gaps: { type: 'array', derived: true },
    gate_recommendation: { type: 'string', enum: GATE_DECISIONS, derived: true },
    gate_rationale: { type: 'string', derived: true },
  },
  defaultData: {
    phase_summaries: [],
    overall_quality_score: 0,
    overall_completeness_pct: 0,
    critical_gaps: [],
    gate_recommendation: 'FAIL',
    gate_rationale: '',
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    const summaries = validateArray(data?.phase_summaries, 'phase_summaries', 1);
    if (!summaries.valid) errors.push(summaries.error);

    if (errors.length > 0) {
      logger.warn('[Stage17] Validation failed', { errorCount: errors.length, errors });
    }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, _prerequisites, { logger: _logger = console } = {}) {
    // Derivations handled by analysisStep
    return { ...data };
  },
};

/**
 * Evaluate Phase 4→5 Promotion Gate (Blueprint → Build).
 *
 * Aggregates quality scores across all phases to determine if
 * the venture is ready to enter the BUILD phase.
 *
 * @param {{ phase_summaries: Object[], overall_quality_score: number }} reviewData
 * @param {{ chairmanOverride?: { approved: boolean, justification: string } }} [options]
 * @returns {{ pass: boolean, rationale: string, blockers: string[], decision: string }}
 */
export function evaluatePromotionGate(reviewData, options = {}) {
  const thresholds = options.thresholds || PROMOTION_THRESHOLDS;

  if (options.chairmanOverride?.approved) {
    return {
      pass: true,
      rationale: `Chairman override: ${options.chairmanOverride.justification || 'No justification provided'}`,
      blockers: [],
      decision: 'OVERRIDE',
    };
  }

  const score = reviewData?.overall_quality_score ?? 0;
  const completeness = reviewData?.overall_completeness_pct ?? 0;
  const criticalGaps = (reviewData?.critical_gaps ?? []).filter(g => g.severity === 'critical');

  if (score >= thresholds.pass && completeness >= (thresholds.completeness_pass || 80) && criticalGaps.length === 0) {
    return {
      pass: true,
      rationale: `Blueprint review score ${score}/100, completeness ${completeness}%. All phases complete.`,
      blockers: [],
      decision: 'PASS',
    };
  }

  if (score >= thresholds.review && criticalGaps.length <= 2) {
    return {
      pass: false,
      rationale: `Blueprint review score ${score}/100, completeness ${completeness}%. ${criticalGaps.length} critical gap(s) require attention.`,
      blockers: criticalGaps.map(g => `${g.phase} stage ${g.stage}: missing ${g.artifact_type}`),
      decision: 'REVIEW_NEEDED',
    };
  }

  return {
    pass: false,
    rationale: `Blueprint review score ${score}/100, completeness ${completeness}% below threshold (${thresholds.pass}/${thresholds.completeness_pass || 80}).`,
    blockers: (reviewData?.critical_gaps ?? []).map(g => `${g.phase} stage ${g.stage}: missing ${g.artifact_type}`),
    decision: 'FAIL',
  };
}

export { PHASE_GROUPINGS, PROMOTION_THRESHOLDS };
export default TEMPLATE;
