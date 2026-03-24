/**
 * Stage 19 Template - Sprint Planning
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Sprint planning with backlog items and Lifecycle-to-SD Bridge
 * that generates SD draft payloads for each sprint item.
 *
 * Note: Visual convergence moved to Stage 15 (wireframe preview) and
 * Stage 21 (build validation). Not run at Sprint Planning.
 *
 * @module lib/eva/stage-templates/stage-19
 */

import { validateString, validateNumber, validateArray, validateEnum, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage18 } from './analysis-steps/stage-19-sprint-planning.js';

const PRIORITY_VALUES = ['critical', 'high', 'medium', 'low'];
const SD_TYPES = ['feature', 'bugfix', 'enhancement', 'refactor', 'infra'];
const MIN_SPRINT_ITEMS = 1;
const MIN_SPRINT_DURATION_DAYS = 1;
const MAX_SPRINT_DURATION_DAYS = 30;

const SD_BRIDGE_REQUIRED_FIELDS = [
  'title', 'description', 'priority', 'type', 'scope',
  'success_criteria', 'dependencies', 'risks', 'target_application',
];

const TEMPLATE = {
  id: 'stage-18',
  slug: 'sprint-planning',
  title: 'Sprint Planning',
  version: '2.0.0',
  schema: {
    sprint_name: { type: 'string', required: true },
    sprint_duration_days: { type: 'number', min: MIN_SPRINT_DURATION_DAYS, max: MAX_SPRINT_DURATION_DAYS, required: true },
    sprint_goal: { type: 'string', minLength: 10, required: true },
    items: {
      type: 'array',
      minItems: MIN_SPRINT_ITEMS,
      items: {
        title: { type: 'string', required: true },
        description: { type: 'string', required: true },
        priority: { type: 'enum', values: PRIORITY_VALUES, required: true },
        type: { type: 'enum', values: SD_TYPES, required: true },
        scope: { type: 'string', required: true },
        success_criteria: { type: 'string', required: true },
        dependencies: { type: 'array' },
        risks: { type: 'array' },
        target_application: { type: 'string', required: true },
        story_points: { type: 'number', min: 1 },
        architectureLayer: { type: 'string' },
        milestoneRef: { type: 'string' },
      },
    },
    // Derived
    total_items: { type: 'number', derived: true },
    total_story_points: { type: 'number', derived: true },
    sd_bridge_payloads: { type: 'array', derived: true },
  },
  defaultData: {
    sprint_name: null,
    sprint_duration_days: null,
    sprint_goal: null,
    items: [],
    total_items: 0,
    total_story_points: 0,
    sd_bridge_payloads: [],
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    const nameCheck = validateString(data?.sprint_name, 'sprint_name', 1);
    if (!nameCheck.valid) errors.push(nameCheck.error);

    const durationCheck = validateNumber(data?.sprint_duration_days, 'sprint_duration_days', MIN_SPRINT_DURATION_DAYS);
    if (!durationCheck.valid) {
      errors.push(durationCheck.error);
    } else if (data.sprint_duration_days > MAX_SPRINT_DURATION_DAYS) {
      errors.push(`sprint_duration_days must be <= ${MAX_SPRINT_DURATION_DAYS} (got ${data.sprint_duration_days})`);
    }

    const goalCheck = validateString(data?.sprint_goal, 'sprint_goal', 10);
    if (!goalCheck.valid) errors.push(goalCheck.error);

    const itemsCheck = validateArray(data?.items, 'items', MIN_SPRINT_ITEMS);
    if (!itemsCheck.valid) {
      errors.push(itemsCheck.error);
    } else {
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const prefix = `items[${i}]`;
        const results = [
          validateString(item?.title, `${prefix}.title`, 1),
          validateString(item?.description, `${prefix}.description`, 1),
          validateEnum(item?.priority, `${prefix}.priority`, PRIORITY_VALUES),
          validateEnum(item?.type, `${prefix}.type`, SD_TYPES),
          validateString(item?.scope, `${prefix}.scope`, 1),
          validateString(item?.success_criteria, `${prefix}.success_criteria`, 1),
          validateString(item?.target_application, `${prefix}.target_application`, 1),
        ];
        if (item?.architectureLayer != null) {
          results.push(validateString(item.architectureLayer, `${prefix}.architectureLayer`, 1));
        }
        if (item?.milestoneRef != null) {
          results.push(validateString(item.milestoneRef, `${prefix}.milestoneRef`, 1));
        }
        errors.push(...collectErrors(results));
      }
    }

    if (errors.length > 0) { logger.warn('[Stage18] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, { logger: _logger = console } = {}) {
    // Dead code: all derivations handled by analysisStep.
    return { ...data };
  },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);

TEMPLATE.analysisStep = analyzeStage18;

ensureOutputSchema(TEMPLATE);

export { PRIORITY_VALUES, SD_TYPES, MIN_SPRINT_ITEMS, SD_BRIDGE_REQUIRED_FIELDS, MIN_SPRINT_DURATION_DAYS, MAX_SPRINT_DURATION_DAYS };
export default TEMPLATE;
