/**
 * Stage 13 Template - Product Roadmap
 * Phase: THE BLUEPRINT (Stages 13-16)
 * Part of SD-LEO-FEAT-TMPL-BLUEPRINT-001
 *
 * Product roadmap with milestones, dependencies, and timeline.
 * Deterministic KILL GATE enforces roadmap completeness:
 *   - Kill if < 3 milestones
 *   - Kill if any milestone missing name, date, or deliverables
 *   - Kill if timeline_months < 3
 *   - Kill if no milestone has priority='now' (Blueprint #8)
 *
 * @module lib/eva/stage-templates/stage-13
 */

import { validateString, validateArray, collectErrors } from './validation.js';
import { analyzeStage13 } from './analysis-steps/stage-13-product-roadmap.js';

const MIN_MILESTONES = 3;
const MIN_TIMELINE_MONTHS = 3;
const MIN_DELIVERABLES_PER_MILESTONE = 1;

const TEMPLATE = {
  id: 'stage-13',
  slug: 'product-roadmap',
  title: 'Product Roadmap',
  version: '2.0.0',
  schema: {
    vision_statement: { type: 'string', minLength: 20, required: true },
    milestones: {
      type: 'array',
      minItems: MIN_MILESTONES,
      items: {
        name: { type: 'string', required: true },
        date: { type: 'string', required: true },
        deliverables: { type: 'array', minItems: MIN_DELIVERABLES_PER_MILESTONE },
        dependencies: { type: 'array' },
        priority: { type: 'string' },
      },
    },
    phases: {
      type: 'array',
      minItems: 1,
      items: {
        name: { type: 'string', required: true },
        start_date: { type: 'string', required: true },
        end_date: { type: 'string', required: true },
      },
    },
    // Derived
    timeline_months: { type: 'number', derived: true },
    milestone_count: { type: 'number', derived: true },
    decision: { type: 'enum', values: ['pass', 'kill'], derived: true },
    blockProgression: { type: 'boolean', derived: true },
    reasons: { type: 'array', derived: true },
  },
  defaultData: {
    vision_statement: null,
    milestones: [],
    phases: [],
    timeline_months: null,
    milestone_count: 0,
    decision: null,
    blockProgression: false,
    reasons: [],
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, { logger = console } = {}) {
    const errors = [];

    const visionCheck = validateString(data?.vision_statement, 'vision_statement', 20);
    if (!visionCheck.valid) errors.push(visionCheck.error);

    // Milestones
    const msCheck = validateArray(data?.milestones, 'milestones', MIN_MILESTONES);
    if (!msCheck.valid) {
      errors.push(msCheck.error);
    } else {
      for (let i = 0; i < data.milestones.length; i++) {
        const m = data.milestones[i];
        const prefix = `milestones[${i}]`;
        const results = [
          validateString(m?.name, `${prefix}.name`, 1),
          validateString(m?.date, `${prefix}.date`, 1),
        ];
        errors.push(...collectErrors(results));
        // Deliverables
        const delCheck = validateArray(m?.deliverables, `${prefix}.deliverables`, MIN_DELIVERABLES_PER_MILESTONE);
        if (!delCheck.valid) errors.push(delCheck.error);
      }
    }

    // Phases
    const phasesCheck = validateArray(data?.phases, 'phases', 1);
    if (!phasesCheck.valid) {
      errors.push(phasesCheck.error);
    } else {
      for (let i = 0; i < data.phases.length; i++) {
        const p = data.phases[i];
        const prefix = `phases[${i}]`;
        const results = [
          validateString(p?.name, `${prefix}.name`, 1),
          validateString(p?.start_date, `${prefix}.start_date`, 1),
          validateString(p?.end_date, `${prefix}.end_date`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    if (errors.length > 0) { logger.warn('[Stage13] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: timeline, milestone count, kill gate.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with derived fields
   */
  computeDerived(data, { logger = console } = {}) {
    const milestone_count = data.milestones.length;

    // Compute timeline from milestone dates
    const dates = data.milestones
      .map(m => new Date(m.date))
      .filter(d => !isNaN(d.getTime()));

    let timeline_months = 0;
    if (dates.length >= 2) {
      const earliest = new Date(Math.min(...dates));
      const latest = new Date(Math.max(...dates));
      timeline_months = Math.round(
        (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
      );
    }

    const { decision, blockProgression, reasons } = evaluateKillGate({
      milestone_count,
      milestones: data.milestones,
      timeline_months,
    });

    return {
      ...data,
      timeline_months,
      milestone_count,
      decision,
      blockProgression,
      reasons,
    };
  },
};

/**
 * Pure function: evaluate kill gate for Stage 13.
 * Kill if < 3 milestones, any milestone missing deliverables, timeline < 3 months,
 * or no milestone has priority='now'.
 *
 * @param {{ milestone_count: number, milestones: Object[], timeline_months: number }} params
 * @returns {{ decision: 'pass'|'kill', blockProgression: boolean, reasons: Object[] }}
 */
export function evaluateKillGate({ milestone_count, milestones, timeline_months }) {
  const reasons = [];

  if (milestone_count < MIN_MILESTONES) {
    reasons.push({
      type: 'insufficient_milestones',
      message: `Only ${milestone_count} milestone(s) defined, minimum ${MIN_MILESTONES} required`,
      threshold: MIN_MILESTONES,
      actual: milestone_count,
    });
  }

  // Check each milestone has deliverables
  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i];
    if (!m.deliverables || m.deliverables.length < MIN_DELIVERABLES_PER_MILESTONE) {
      reasons.push({
        type: 'milestone_missing_deliverables',
        message: `Milestone "${m.name || i}" has no deliverables`,
        milestone_index: i,
      });
    }
  }

  if (timeline_months < MIN_TIMELINE_MONTHS) {
    reasons.push({
      type: 'timeline_too_short',
      message: `Timeline of ${timeline_months} month(s) is below minimum ${MIN_TIMELINE_MONTHS} months`,
      threshold: MIN_TIMELINE_MONTHS,
      actual: timeline_months,
    });
  }

  // Blueprint #8: At least one milestone must have priority='now'
  const hasNowPriority = milestones.some(m => m.priority === 'now');
  if (milestones.length > 0 && !hasNowPriority) {
    reasons.push({
      type: 'no_now_priority_milestone',
      message: 'No milestone has priority="now" — roadmap must identify immediate execution priority',
    });
  }

  const decision = reasons.length > 0 ? 'kill' : 'pass';
  return {
    decision,
    blockProgression: decision === 'kill',
    reasons,
  };
}

TEMPLATE.analysisStep = analyzeStage13;

export { MIN_MILESTONES, MIN_TIMELINE_MONTHS, MIN_DELIVERABLES_PER_MILESTONE };
export default TEMPLATE;
