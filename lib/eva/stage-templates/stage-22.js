/**
 * Stage 22 Template - Release Readiness
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Release readiness checklist with approval tracking and
 * Phase 5→6 Promotion Gate evaluation.
 *
 * Promotion gate pass requires:
 *   - Stage 17: all checklist categories present, readiness >= 80%
 *   - Stage 18: >= 1 sprint item with valid SD bridge payload
 *   - Stage 19: completion_pct >= 80%, no blocked tasks
 *   - Stage 20: quality gate passed (100% pass rate, >= 60% coverage)
 *   - Stage 21: all integrations passing
 *   - Stage 22: all release items approved
 *
 * @module lib/eva/stage-templates/stage-22
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';
import { CHECKLIST_CATEGORIES } from './stage-17.js';
import { MIN_COVERAGE_PCT } from './stage-20.js';

const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
const MIN_RELEASE_ITEMS = 1;
const MIN_READINESS_PCT = 80;
const MIN_BUILD_COMPLETION_PCT = 80;

const TEMPLATE = {
  id: 'stage-22',
  slug: 'release-readiness',
  title: 'Release Readiness',
  version: '1.0.0',
  schema: {
    release_items: {
      type: 'array',
      minItems: MIN_RELEASE_ITEMS,
      items: {
        name: { type: 'string', required: true },
        category: { type: 'string', required: true },
        status: { type: 'enum', values: APPROVAL_STATUSES, required: true },
        approver: { type: 'string' },
      },
    },
    release_notes: { type: 'string', minLength: 10, required: true },
    target_date: { type: 'string', required: true },
    // Derived
    total_items: { type: 'number', derived: true },
    approved_items: { type: 'number', derived: true },
    all_approved: { type: 'boolean', derived: true },
    promotion_gate: { type: 'object', derived: true },
  },
  defaultData: {
    release_items: [],
    release_notes: null,
    target_date: null,
    total_items: 0,
    approved_items: 0,
    all_approved: false,
    promotion_gate: null,
  },

  validate(data) {
    const errors = [];

    const itemsCheck = validateArray(data?.release_items, 'release_items', MIN_RELEASE_ITEMS);
    if (!itemsCheck.valid) {
      errors.push(itemsCheck.error);
    } else {
      for (let i = 0; i < data.release_items.length; i++) {
        const ri = data.release_items[i];
        const prefix = `release_items[${i}]`;
        const results = [
          validateString(ri?.name, `${prefix}.name`, 1),
          validateString(ri?.category, `${prefix}.category`, 1),
          validateEnum(ri?.status, `${prefix}.status`, APPROVAL_STATUSES),
        ];
        errors.push(...collectErrors(results));
      }
    }

    const notesCheck = validateString(data?.release_notes, 'release_notes', 10);
    if (!notesCheck.valid) errors.push(notesCheck.error);

    const dateCheck = validateString(data?.target_date, 'target_date', 1);
    if (!dateCheck.valid) errors.push(dateCheck.error);

    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, prerequisites) {
    const total_items = data.release_items.length;
    const approved_items = data.release_items.filter(ri => ri.status === 'approved').length;
    const all_approved = total_items > 0 && approved_items === total_items;

    const promotion_gate = prerequisites
      ? evaluatePromotionGate({ ...prerequisites, stage22: data })
      : { pass: false, rationale: 'Prerequisites not provided', blockers: ['Stage 17-21 data required'], required_next_actions: ['Complete stages 17-21 before evaluating promotion gate'] };

    return {
      ...data,
      total_items,
      approved_items,
      all_approved,
      promotion_gate,
    };
  },
};

/**
 * Pure function: evaluate Phase 5→6 Promotion Gate.
 *
 * @param {{ stage17: Object, stage18: Object, stage19: Object, stage20: Object, stage21: Object, stage22: Object }} prerequisites
 * @returns {{ pass: boolean, rationale: string, blockers: string[], required_next_actions: string[] }}
 */
export function evaluatePromotionGate({ stage17, stage18, stage19, stage20, stage21, stage22 }) {
  const blockers = [];
  const required_next_actions = [];

  // Stage 17: all categories present, readiness >= 80%
  let categoriesPresent = 0;
  for (const cat of CHECKLIST_CATEGORIES) {
    if (stage17?.checklist?.[cat]?.length > 0) categoriesPresent++;
  }
  if (categoriesPresent < CHECKLIST_CATEGORIES.length) {
    blockers.push(`Pre-build checklist missing ${CHECKLIST_CATEGORIES.length - categoriesPresent} category(ies)`);
    required_next_actions.push('Complete all pre-build checklist categories');
  }
  const readinessPct = stage17?.readiness_pct ?? 0;
  if (readinessPct < MIN_READINESS_PCT) {
    blockers.push(`Pre-build readiness at ${readinessPct}%, minimum ${MIN_READINESS_PCT}% required`);
    required_next_actions.push('Complete more checklist items to reach readiness threshold');
  }

  // Stage 18: >= 1 sprint item
  const sprintItems = stage18?.items?.length || 0;
  if (sprintItems < 1) {
    blockers.push('No sprint items defined');
    required_next_actions.push('Define at least 1 sprint item with SD bridge payload');
  }

  // Stage 19: completion >= 80%, no blocked tasks
  const completionPct = stage19?.completion_pct ?? 0;
  if (completionPct < MIN_BUILD_COMPLETION_PCT) {
    blockers.push(`Build completion at ${completionPct}%, minimum ${MIN_BUILD_COMPLETION_PCT}% required`);
    required_next_actions.push('Complete more build tasks');
  }
  const blockedTasks = stage19?.blocked_tasks ?? 0;
  if (blockedTasks > 0) {
    blockers.push(`${blockedTasks} build task(s) are blocked`);
    required_next_actions.push('Resolve blocked build tasks');
  }

  // Stage 20: quality gate passed
  if (!stage20?.quality_gate_passed) {
    const passRate = stage20?.overall_pass_rate ?? 0;
    const coverage = stage20?.coverage_pct ?? 0;
    if (passRate < 100) {
      blockers.push(`Test pass rate at ${passRate}%, must be 100%`);
      required_next_actions.push('Fix all failing tests');
    }
    if (coverage < MIN_COVERAGE_PCT) {
      blockers.push(`Test coverage at ${coverage}%, minimum ${MIN_COVERAGE_PCT}% required`);
      required_next_actions.push(`Increase test coverage to at least ${MIN_COVERAGE_PCT}%`);
    }
  }

  // Stage 21: all integrations passing
  if (!stage21?.all_passing) {
    const failCount = stage21?.failing_integrations?.length || 0;
    blockers.push(`${failCount} integration(s) failing`);
    required_next_actions.push('Fix all failing integration tests');
  }

  // Stage 22: all release items approved
  const releaseItems = stage22?.release_items || [];
  const unapproved = releaseItems.filter(ri => ri.status !== 'approved').length;
  if (unapproved > 0) {
    blockers.push(`${unapproved} release item(s) not yet approved`);
    required_next_actions.push('Get approval for all release items');
  }

  const pass = blockers.length === 0;
  const rationale = pass
    ? 'All Phase 5 prerequisites met. Build loop is complete with quality and integration gates passed.'
    : `Phase 5 is incomplete: ${blockers.length} blocker(s) found.`;

  return { pass, rationale, blockers, required_next_actions };
}

export { APPROVAL_STATUSES, MIN_RELEASE_ITEMS, MIN_READINESS_PCT, MIN_BUILD_COMPLETION_PCT };
export default TEMPLATE;
