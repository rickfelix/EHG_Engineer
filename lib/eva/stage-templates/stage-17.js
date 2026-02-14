/**
 * Stage 17 Template - Pre-Build Checklist
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Pre-build readiness checklist covering architecture, team,
 * tooling, and environment prerequisites.
 *
 * @module lib/eva/stage-templates/stage-17
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';
import { analyzeStage17 } from './analysis-steps/stage-17-build-readiness.js';

const CHECKLIST_CATEGORIES = [
  'architecture',
  'team_readiness',
  'tooling',
  'environment',
  'dependencies',
];
const ITEM_STATUSES = ['not_started', 'in_progress', 'complete', 'blocked'];
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const MIN_ITEMS_PER_CATEGORY = 1;

const TEMPLATE = {
  id: 'stage-17',
  slug: 'pre-build-checklist',
  title: 'Pre-Build Checklist',
  version: '2.0.0',
  schema: {
    checklist: {
      type: 'object',
      required: true,
      properties: Object.fromEntries(CHECKLIST_CATEGORIES.map(cat => [cat, {
        type: 'array',
        minItems: MIN_ITEMS_PER_CATEGORY,
        items: {
          name: { type: 'string', required: true },
          status: { type: 'enum', values: ITEM_STATUSES, required: true },
          owner: { type: 'string' },
          notes: { type: 'string' },
        },
      }])),
    },
    blockers: {
      type: 'array',
      items: {
        description: { type: 'string', required: true },
        severity: { type: 'enum', values: SEVERITY_LEVELS, required: true },
        mitigation: { type: 'string', required: true },
      },
    },
    // Derived
    total_items: { type: 'number', derived: true },
    completed_items: { type: 'number', derived: true },
    readiness_pct: { type: 'number', derived: true },
    all_categories_present: { type: 'boolean', derived: true },
    blocker_count: { type: 'number', derived: true },
  },
  defaultData: {
    checklist: {},
    blockers: [],
    total_items: 0,
    completed_items: 0,
    readiness_pct: 0,
    all_categories_present: false,
    blocker_count: 0,
  },

  validate(data) {
    const errors = [];

    if (!data?.checklist || typeof data.checklist !== 'object') {
      errors.push('checklist is required and must be an object');
      return { valid: false, errors };
    }

    for (const cat of CHECKLIST_CATEGORIES) {
      const items = data.checklist[cat];
      const arrCheck = validateArray(items, `checklist.${cat}`, MIN_ITEMS_PER_CATEGORY);
      if (!arrCheck.valid) {
        errors.push(arrCheck.error);
        continue;
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const prefix = `checklist.${cat}[${i}]`;
        const results = [
          validateString(item?.name, `${prefix}.name`, 1),
          validateEnum(item?.status, `${prefix}.status`, ITEM_STATUSES),
        ];
        errors.push(...collectErrors(results));
      }
    }

    if (data?.blockers && Array.isArray(data.blockers)) {
      for (let i = 0; i < data.blockers.length; i++) {
        const b = data.blockers[i];
        const prefix = `blockers[${i}]`;
        const results = [
          validateString(b?.description, `${prefix}.description`, 1),
          validateEnum(b?.severity, `${prefix}.severity`, SEVERITY_LEVELS),
          validateString(b?.mitigation, `${prefix}.mitigation`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    return { valid: errors.length === 0, errors };
  },

  computeDerived(data) {
    let total_items = 0;
    let completed_items = 0;
    let categoriesPresent = 0;

    for (const cat of CHECKLIST_CATEGORIES) {
      const items = data.checklist[cat] || [];
      if (items.length > 0) categoriesPresent++;
      total_items += items.length;
      completed_items += items.filter(item => item.status === 'complete').length;
    }

    const readiness_pct = total_items > 0
      ? Math.round((completed_items / total_items) * 10000) / 100
      : 0;
    const all_categories_present = categoriesPresent === CHECKLIST_CATEGORIES.length;
    const blocker_count = (data.blockers || []).length;

    return {
      ...data,
      total_items,
      completed_items,
      readiness_pct,
      all_categories_present,
      blocker_count,
    };
  },
};

TEMPLATE.analysisStep = analyzeStage17;

export { CHECKLIST_CATEGORIES, ITEM_STATUSES, SEVERITY_LEVELS, MIN_ITEMS_PER_CATEGORY };
export default TEMPLATE;
