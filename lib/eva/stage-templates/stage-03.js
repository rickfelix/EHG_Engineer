/**
 * Stage 03 Template - Individual Validation (KILL GATE)
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Hybrid scoring (50% deterministic + 50% AI calibration) with a 3-way SOFT gate
 * (SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001 — S3 is advisory/triage; S5 is the first
 * AUTHORITATIVE kill). No per-metric OR-kill; a strong composite compensates a weak metric:
 *   PASS:   overallScore ≥ 70 (strong composite)
 *   KILL:   overallScore < 35 AND no metric ≥ 55  (catastrophic-only — no redeeming dimension)
 *   REVISE: everything else → advisory, re-route to Stage 2, scores enrich the S5 gate
 *
 * Cross-stage contracts:
 *   ← Stage 2: 7 pre-scores, evidence packs, composite analysis
 *   ← Stage 1: archetype (scoring weights), problemStatement, keyAssumptions
 *   → Stage 4: competitorEntities (name, positioning, threat_level)
 *   → Stage 5: market validation result, archetype-driven weighting
 *
 * @module lib/eva/stage-templates/stage-03
 */

import { validateInteger, validateString, validateEnum, collectErrors, validateCrossStageContract } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage03 } from './analysis-steps/stage-03-hybrid-scoring.js';
import { buildAgenticFitAdvisory } from '../stage-zero/synthesis/agentic-fit.js';

const METRICS = [
  'marketFit',
  'customerNeed',
  'momentum',
  'revenuePotential',
  'competitiveBarrier',
  'executionFeasibility',
  'designQuality',
];

const PASS_THRESHOLD = 70;
const REVISE_THRESHOLD = 50;   // advisory band floor (legacy export)
const METRIC_THRESHOLD = 50;   // per-metric ADVISORY threshold (no longer a kill trigger — FR-1)

// PRE-CALIBRATION defaults (SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001, research Option B,
// docs/reports/kill-calibration-triangulation-2026-06-25.md). S3 is the noisiest stage
// (50% ungrounded LLM, no web data); a true-55 idea scores <50 ~35-40% of the time from
// variance alone, so S3 only kills CATASTROPHIC ideas and defers authoritative kill to the
// web-grounded S5 financial gate. DO NOT empirically tighten these before >=~50
// outcome-resolved ventures (below that, tightening overfits noise).
const S3_CATASTROPHIC_OVERALL = 35;      // kill only when overall is below this...
const S3_CATASTROPHIC_METRIC_FLOOR = 55; // ...AND no single metric reaches this (no redeeming dimension)

const THREAT_LEVELS = ['H', 'M', 'L'];

const TEMPLATE = {
  id: 'stage-03',
  slug: 'validation',
  title: 'Kill Gate',
  version: '2.0.0',
  schema: {
    // 7 core metrics (0-100 integer)
    marketFit: { type: 'integer', min: 0, max: 100, required: true },
    customerNeed: { type: 'integer', min: 0, max: 100, required: true },
    momentum: { type: 'integer', min: 0, max: 100, required: true },
    revenuePotential: { type: 'integer', min: 0, max: 100, required: true },
    competitiveBarrier: { type: 'integer', min: 0, max: 100, required: true },
    executionFeasibility: { type: 'integer', min: 0, max: 100, required: true },
    designQuality: { type: 'integer', min: 0, max: 100, required: true },
    // Competitor entities for Stage 4 handoff
    competitorEntities: {
      type: 'array',
      required: false,
      items: {
        name: { type: 'string', required: true },
        positioning: { type: 'string', required: true },
        threat_level: { type: 'enum', values: THREAT_LEVELS, required: true },
      },
    },
    // Per-metric confidence levels
    confidenceScores: {
      type: 'object',
      required: false,
    },
    // Narrative fields (from LLM assessment)
    risk_factors: { type: 'array', required: false, items: { type: 'string' } },
    go_conditions: { type: 'array', required: false, items: { type: 'string' } },
    market_fit_assessment: { type: 'string', required: false },
    rationale: { type: 'string', required: false },
    // Derived fields
    overallScore: { type: 'integer', min: 0, max: 100, derived: true },
    rollupDimensions: { type: 'object', derived: true },
    decision: { type: 'enum', values: ['pass', 'revise', 'kill'], derived: true },
    blockProgression: { type: 'boolean', derived: true },
    reasons: { type: 'array', derived: true },
  },
  defaultData: {
    marketFit: null,
    customerNeed: null,
    momentum: null,
    revenuePotential: null,
    competitiveBarrier: null,
    executionFeasibility: null,
    designQuality: null,
    competitorEntities: [],
    confidenceScores: {},
    risk_factors: [],
    go_conditions: [],
    market_fit_assessment: null,
    rationale: null,
    overallScore: null,
    rollupDimensions: null,
    decision: null,
    blockProgression: false,
    reasons: [],
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, prerequisites, { logger = console } = {}) {
    const results = METRICS.map(m => validateInteger(data?.[m], m, 0, 100));

    // Cross-stage contract: validate stage-02 outputs if provided
    if (prerequisites?.stage02) {
      const s02Contract = {
        metrics: { type: 'object' },
        evidence: { type: 'object' },
      };
      const s02Check = validateCrossStageContract(prerequisites.stage02, s02Contract, 'stage-02');
      results.push(...s02Check.errors.map(e => ({ valid: false, error: e })));
    }
    // Cross-stage contract: validate stage-01 outputs if provided
    if (prerequisites?.stage01) {
      const s01Contract = {
        archetype: { type: 'string' },
        problemStatement: { type: 'string', minLength: 20 },
      };
      const s01Check = validateCrossStageContract(prerequisites.stage01, s01Contract, 'stage-01');
      results.push(...s01Check.errors.map(e => ({ valid: false, error: e })));
    }

    // Validate competitor entities if present
    if (data?.competitorEntities && Array.isArray(data.competitorEntities)) {
      for (let i = 0; i < data.competitorEntities.length; i++) {
        const ce = data.competitorEntities[i];
        const prefix = `competitorEntities[${i}]`;
        results.push(validateString(ce?.name, `${prefix}.name`, 1));
        results.push(validateString(ce?.positioning, `${prefix}.positioning`, 1));
        results.push(validateEnum(ce?.threat_level, `${prefix}.threat_level`, THREAT_LEVELS));
      }
    }

    const errors = collectErrors(results);
    if (errors.length > 0) { logger.warn('[Stage03] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: overallScore, rollup dimensions, and 3-way gate decision.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with overallScore, rollupDimensions, decision, blockProgression, reasons
   */
  computeDerived(data, { logger: _logger = console } = {}) {
    // Dead code: all derivations handled by analysisStep.
    return { ...data };
  },
};

/**
 * Pure function: evaluate the 3-way SOFT kill gate for Stage 03.
 * (SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001 — FR-1 drop per-metric OR-kill; FR-2 catastrophic-only.)
 *
 * PASS:   overallScore >= PASS_THRESHOLD (70) — strong composite
 * KILL:   overallScore < S3_CATASTROPHIC_OVERALL (35) AND no metric >= S3_CATASTROPHIC_METRIC_FLOOR (55)
 * REVISE: everything else — advisory; re-route to Stage 2; scores enrich the authoritative S5 gate
 *
 * A single sub-threshold metric NO LONGER forces a kill (a strong dimension compensates a weak
 * one, Cooper-scorecard pattern). S5 (web-grounded financial gate) is the first AUTHORITATIVE kill.
 *
 * @param {{ overallScore: number, metrics: Object }} params
 * @returns {{ decision: 'pass'|'revise'|'kill', blockProgression: boolean, reasons: Object[] }}
 */
export function evaluateKillGate({ overallScore, metrics, agenticFit }) {
  const reasons = [];
  const metricValues = Object.values(metrics);
  const maxMetric = metricValues.length ? Math.max(...metricValues) : 0;

  // SD-EHG-FACTORY-AGENTIC-FIT-SELECTION-001 (FR-4 secondary): surface agentic_fit as an
  // ADVISORY signal at S3 — never a kill, never affects blockProgression or thresholds.
  // S5 stays the first authoritative economic kill.
  const agenticAdvisory = buildAgenticFitAdvisory(agenticFit);

  // KILL — catastrophic only: overall below the floor AND no redeeming dimension (FR-1/FR-2).
  if (overallScore < S3_CATASTROPHIC_OVERALL && maxMetric < S3_CATASTROPHIC_METRIC_FLOOR) {
    reasons.push({
      type: 'overall_catastrophic',
      message: `Overall ${overallScore} is below the catastrophic floor ${S3_CATASTROPHIC_OVERALL} and no metric reaches ${S3_CATASTROPHIC_METRIC_FLOOR} (no redeeming dimension).`,
      threshold: S3_CATASTROPHIC_OVERALL,
      actual: overallScore,
    });
    return { decision: 'kill', blockProgression: true, reasons };
  }

  // PASS — strong composite (a weak single metric is absorbed by the whole).
  if (overallScore >= PASS_THRESHOLD) {
    return { decision: 'pass', blockProgression: false, reasons: agenticAdvisory ? [agenticAdvisory] : [] };
  }

  // REVISE — advisory. Sub-threshold metrics are surfaced as ADVISORY context only (they do NOT kill, FR-1).
  for (const [metric, value] of Object.entries(metrics)) {
    if (value < METRIC_THRESHOLD) {
      reasons.push({
        type: 'metric_below_threshold_advisory',
        metric,
        message: `${metric} score ${value} is below the advisory threshold ${METRIC_THRESHOLD} (advisory only — does not kill).`,
        threshold: METRIC_THRESHOLD,
        actual: value,
      });
    }
  }
  reasons.push({
    type: 'overall_in_revise_band',
    message: `Overall ${overallScore} is advisory/REVISE (not catastrophic). Re-route to Stage 2; scores enrich the S5 gate.`,
    threshold: PASS_THRESHOLD,
    actual: overallScore,
  });
  if (agenticAdvisory) reasons.push(agenticAdvisory);
  return { decision: 'revise', blockProgression: true, reasons };
}

/**
 * SD-LEO-INFRA-KILLGATE-DETERMINISM-ALL-GATES-001: deterministic re-eval over the LOCKED persisted
 * Stage-3 artifact. Extracts the evaluator args from the persisted payload and runs the SAME pure
 * evaluateKillGate (no LLM, no verdict-logic change) so a re-gate reproduces the original verdict.
 * @param {Object} payload - the persisted Stage-3 artifact data (overallScore, metrics, agenticFit)
 * @returns {{ decision: string, blockProgression: boolean, reasons: Object[] }}
 */
export function reEvaluateKillGateFromArtifact(payload) {
  const p = payload || {};
  return evaluateKillGate({
    overallScore: Number.isFinite(Number(p.overallScore)) ? Number(p.overallScore) : 0,
    metrics: (p.metrics && typeof p.metrics === 'object') ? p.metrics : {},
    agenticFit: p.agenticFit,
  });
}

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage03;
ensureOutputSchema(TEMPLATE);

export { METRICS, PASS_THRESHOLD, REVISE_THRESHOLD, METRIC_THRESHOLD, S3_CATASTROPHIC_OVERALL, S3_CATASTROPHIC_METRIC_FLOOR, THREAT_LEVELS };
export default TEMPLATE;
