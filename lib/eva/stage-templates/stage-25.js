/**
 * Stage 25 Template - Venture Review
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-LEO-FEAT-TMPL-LAUNCH-001
 *
 * Final venture review with 5-category initiatives,
 * drift detection against Stage 1 vision/constraints,
 * and drift justification requirement.
 *
 * @module lib/eva/stage-templates/stage-25
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';
import { analyzeStage25 } from './analysis-steps/stage-25-venture-review.js';
import { extractTemplate } from '../template-extractor.js';
import { createOrReusePendingDecision } from '../chairman-decision-watcher.js';

const REVIEW_CATEGORIES = ['product', 'market', 'technical', 'financial', 'team'];
const INITIATIVE_STATUSES = ['planned', 'in_progress', 'completed', 'abandoned', 'deferred'];
const VENTURE_DECISIONS = ['continue', 'pivot', 'expand', 'sunset', 'exit'];
const CONFIDENCE_LEVELS = ['high', 'medium', 'low'];
const NEXT_STEP_PRIORITIES = ['critical', 'high', 'medium', 'low'];
const SEMANTIC_DRIFT_LEVELS = ['aligned', 'moderate_drift', 'major_drift'];
const HEALTH_BANDS = ['critical', 'fragile', 'viable', 'strong'];
const MIN_INITIATIVES_PER_CATEGORY = 1;

const TEMPLATE = {
  id: 'stage-25',
  slug: 'venture-review',
  title: 'Venture Review',
  version: '1.0.0',
  schema: {
    review_summary: { type: 'string', minLength: 20, required: true },
    initiatives: {
      type: 'object',
      required: true,
      properties: Object.fromEntries(REVIEW_CATEGORIES.map(cat => [cat, {
        type: 'array',
        minItems: MIN_INITIATIVES_PER_CATEGORY,
        items: {
          title: { type: 'string', required: true },
          status: { type: 'enum', values: INITIATIVE_STATUSES, required: true },
          outcome: { type: 'string', required: true },
        },
      }])),
    },
    current_vision: { type: 'string', minLength: 10, required: true },
    drift_justification: { type: 'string' },
    next_steps: {
      type: 'array',
      minItems: 1,
      items: {
        action: { type: 'string', required: true },
        owner: { type: 'string', required: true },
        timeline: { type: 'string', required: true },
        priority: { type: 'enum', values: NEXT_STEP_PRIORITIES },
        category: { type: 'string' },
      },
    },
    // Chairman governance gate (SD-EVA-FIX-CHAIRMAN-GATES-001)
    chairmanGate: {
      type: 'object',
      fields: {
        status: { type: 'string' },
        rationale: { type: 'string' },
        decision_id: { type: 'string' },
      },
    },
    financialComparison: {
      type: 'object',
      fields: {
        projectedRevenue: { type: 'string' },
        actualRevenue: { type: 'string' },
        projectedCosts: { type: 'string' },
        actualCosts: { type: 'string' },
        revenueVariancePct: { type: 'number' },
        financialTrajectory: { type: 'enum', values: ['above_plan', 'on_plan', 'below_plan', 'critical'] },
        variance: { type: 'string' },
        assessment: { type: 'string' },
      },
    },
    ventureHealth: {
      type: 'object',
      fields: {
        overallRating: { type: 'enum', values: HEALTH_BANDS },
        dimensions: {
          type: 'object',
          properties: Object.fromEntries(REVIEW_CATEGORIES.map(cat => [cat, {
            type: 'object',
            fields: {
              score: { type: 'number', min: 0, max: 100 },
              rationale: { type: 'string' },
            },
          }])),
        },
      },
    },
    // Derived
    total_initiatives: { type: 'number', derived: true },
    all_categories_reviewed: { type: 'boolean', derived: true },
    drift_detected: { type: 'boolean', derived: true },
    drift_check: { type: 'object', derived: true },
    ventureDecision: { type: 'object', derived: true },
  },
  defaultData: {
    review_summary: null,
    initiatives: {},
    current_vision: null,
    drift_justification: null,
    next_steps: [],
    financialComparison: { projectedRevenue: null, actualRevenue: null, projectedCosts: null, actualCosts: null, revenueVariancePct: null, financialTrajectory: null, variance: null, assessment: null },
    ventureHealth: { overallRating: null, dimensions: {} },
    chairmanGate: { status: 'pending', rationale: null, decision_id: null },
    total_initiatives: 0,
    all_categories_reviewed: false,
    drift_detected: false,
    drift_check: null,
    ventureDecision: null,
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    const summaryCheck = validateString(data?.review_summary, 'review_summary', 20);
    if (!summaryCheck.valid) errors.push(summaryCheck.error);

    if (!data?.initiatives || typeof data.initiatives !== 'object') {
      errors.push('initiatives is required and must be an object');
    } else {
      for (const cat of REVIEW_CATEGORIES) {
        const items = data.initiatives[cat];
        const arrCheck = validateArray(items, `initiatives.${cat}`, MIN_INITIATIVES_PER_CATEGORY);
        if (!arrCheck.valid) {
          errors.push(arrCheck.error);
          continue;
        }
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const prefix = `initiatives.${cat}[${i}]`;
          const results = [
            validateString(item?.title, `${prefix}.title`, 1),
            validateEnum(item?.status, `${prefix}.status`, INITIATIVE_STATUSES),
            validateString(item?.outcome, `${prefix}.outcome`, 1),
          ];
          errors.push(...collectErrors(results));
        }
      }
    }

    const visionCheck = validateString(data?.current_vision, 'current_vision', 10);
    if (!visionCheck.valid) errors.push(visionCheck.error);

    const stepsCheck = validateArray(data?.next_steps, 'next_steps', 1);
    if (!stepsCheck.valid) {
      errors.push(stepsCheck.error);
    } else {
      for (let i = 0; i < data.next_steps.length; i++) {
        const ns = data.next_steps[i];
        const prefix = `next_steps[${i}]`;
        const results = [
          validateString(ns?.action, `${prefix}.action`, 1),
          validateString(ns?.owner, `${prefix}.owner`, 1),
          validateString(ns?.timeline, `${prefix}.timeline`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    // Chairman governance gate check
    const gateStatus = data?.chairmanGate?.status;
    if (gateStatus === 'rejected') {
      errors.push(`Chairman gate rejected: ${data.chairmanGate.rationale || 'No rationale provided'}`);
    } else if (gateStatus !== 'approved') {
      errors.push('Chairman venture review gate is pending — awaiting chairman decision');
    }

    if (errors.length > 0) { logger.warn('[Stage25] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields including drift detection.
   * @param {Object} data - Validated input data
   * @param {Object} [prerequisites] - Optional: { stage01 } for drift detection
   * @returns {Object} Data with derived fields
   */
  computeDerived(data, prerequisites, { logger = console } = {}) {
    let total_initiatives = 0;
    let categoriesPresent = 0;

    for (const cat of REVIEW_CATEGORIES) {
      const items = data.initiatives[cat] || [];
      if (items.length > 0) categoriesPresent++;
      total_initiatives += items.length;
    }

    const all_categories_reviewed = categoriesPresent === REVIEW_CATEGORIES.length;

    // Drift detection against Stage 1 vision
    const drift_check = prerequisites?.stage01
      ? detectDrift({
          original_vision: prerequisites.stage01.venture_name
            ? `${prerequisites.stage01.venture_name}: ${prerequisites.stage01.elevator_pitch || ''}`
            : null,
          current_vision: data.current_vision,
        })
      : { drift_detected: false, rationale: 'Stage 1 data not provided - drift check skipped', original_vision: null, current_vision: data.current_vision };

    const drift_detected = drift_check.drift_detected;

    // Semantic drift level classification (spec: aligned, moderate_drift, major_drift)
    let semanticDrift = 'aligned';
    if (drift_check.drift_detected) {
      const overlapMatch = drift_check.rationale?.match(/(\d+)%/);
      const overlap = overlapMatch ? parseInt(overlapMatch[1]) : 0;
      if (overlap < 15) semanticDrift = 'major_drift';
      else semanticDrift = 'moderate_drift';
    }

    // Venture decision object (spec: continue, pivot, expand, sunset, exit)
    const completedInitiatives = Object.values(data.initiatives)
      .flat()
      .filter(i => i.status === 'completed').length;
    const ventureDecision = {
      decision: all_categories_reviewed && !drift_detected ? 'continue' : (drift_detected ? 'pivot' : 'continue'),
      rationale: all_categories_reviewed
        ? (drift_detected
          ? `Drift detected (${semanticDrift}): review and pivot recommended`
          : `All ${REVIEW_CATEGORIES.length} categories reviewed, ${completedInitiatives} initiative(s) completed`)
        : `${categoriesPresent}/${REVIEW_CATEGORIES.length} categories reviewed`,
      confidence: all_categories_reviewed ? 'high' : 'low',
      keyFactors: [],
    };

    return {
      ...data,
      total_initiatives,
      all_categories_reviewed,
      drift_detected,
      drift_check: { ...drift_check, semanticDrift },
      ventureDecision,
    };
  },
};

/**
 * Pure function: detect drift between original and current vision.
 * Drift is detected when current_vision differs significantly from original.
 *
 * @param {{ original_vision: string|null, current_vision: string }} params
 * @returns {{ drift_detected: boolean, rationale: string, original_vision: string|null, current_vision: string }}
 */
export function detectDrift({ original_vision, current_vision }) {
  if (!original_vision) {
    return {
      drift_detected: false,
      rationale: 'No original vision available for comparison',
      original_vision,
      current_vision,
    };
  }

  // Simple drift detection: check if visions share significant overlap
  const originalWords = new Set(original_vision.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const currentWords = new Set(current_vision.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  let overlap = 0;
  for (const word of originalWords) {
    if (currentWords.has(word)) overlap++;
  }

  const overlapRatio = originalWords.size > 0 ? overlap / originalWords.size : 1;
  const drift_detected = overlapRatio < 0.3;

  const rationale = drift_detected
    ? `Significant drift detected: only ${Math.round(overlapRatio * 100)}% overlap with original vision`
    : `Vision aligned: ${Math.round(overlapRatio * 100)}% overlap with original vision`;

  return { drift_detected, rationale, original_vision, current_vision };
}

/**
 * Pre-analysis hook: create or reuse a PENDING chairman decision.
 * Blocks venture progression until chairman reviews venture and approves continued investment.
 */
TEMPLATE.onBeforeAnalysis = async function onBeforeAnalysis(supabase, ventureId) {
  const { id, isNew } = await createOrReusePendingDecision({
    ventureId,
    stageNumber: 25,
    summary: 'Chairman venture review approval required for Stage 25',
    supabase,
  });
  return { chairmanDecisionId: id, isNew };
};

TEMPLATE.analysisStep = analyzeStage25;

/**
 * Post-completion hook: Extract a reusable template after Stage 25 finishes.
 * SD-EVA-FEAT-VENTURE-TEMPLATES-001 (FR-8)
 *
 * Called after the chairman makes a Stage 25 decision. Runs async
 * (off the critical path) to avoid blocking the review flow.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<{id: string, template_name: string, template_version: number}|null>}
 */
TEMPLATE.onComplete = async function onComplete(supabase, ventureId) {
  try {
    return await extractTemplate(supabase, ventureId);
  } catch (err) {
    console.warn(`Template extraction failed for venture ${ventureId}: ${err.message}`);
    return null;
  }
};

export { REVIEW_CATEGORIES, INITIATIVE_STATUSES, VENTURE_DECISIONS, CONFIDENCE_LEVELS, NEXT_STEP_PRIORITIES, SEMANTIC_DRIFT_LEVELS, HEALTH_BANDS, MIN_INITIATIVES_PER_CATEGORY };
export default TEMPLATE;
