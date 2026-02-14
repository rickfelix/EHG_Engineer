/**
 * Stage 22 Template - Release Readiness
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Release readiness checklist with approval tracking and
 * Phase 5→6 Promotion Gate evaluation.
 *
 * v2.0.0 Promotion Gate uses decision objects from v2.0 analysis steps:
 *   - Stage 17: buildReadiness.decision ∈ {go, conditional_go}
 *   - Stage 18: >= 1 sprint item
 *   - Stage 19: sprintCompletion.decision ∈ {complete, continue} AND no critical blockers
 *   - Stage 20: qualityDecision.decision ∈ {pass, conditional_pass}
 *   - Stage 21: reviewDecision.decision ∈ {approve, conditional}
 *   - Stage 22: releaseDecision.decision = 'release'
 *
 * Backward-compatible: also checks legacy boolean fields if decision objects missing.
 *
 * @module lib/eva/stage-templates/stage-22
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';
import { analyzeStage22 } from './analysis-steps/stage-22-release-readiness.js';
import { CHECKLIST_CATEGORIES } from './stage-17.js';
import { MIN_COVERAGE_PCT } from './stage-20.js';
import { createOrReusePendingDecision } from '../chairman-decision-watcher.js';

const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
const RELEASE_CATEGORIES = ['feature', 'bugfix', 'infrastructure', 'documentation', 'security', 'performance'];
const MIN_RELEASE_ITEMS = 1;
const MIN_READINESS_PCT = 80;
const MIN_BUILD_COMPLETION_PCT = 80;

const TEMPLATE = {
  id: 'stage-22',
  slug: 'release-readiness',
  title: 'Release Readiness',
  version: '2.0.0',
  schema: {
    release_items: {
      type: 'array',
      minItems: MIN_RELEASE_ITEMS,
      items: {
        name: { type: 'string', required: true },
        category: { type: 'enum', values: RELEASE_CATEGORIES, required: true },
        status: { type: 'enum', values: APPROVAL_STATUSES, required: true },
        approver: { type: 'string' },
      },
    },
    release_notes: { type: 'string', minLength: 10, required: true },
    target_date: { type: 'string', required: true },
    // Chairman governance gate (SD-EVA-FIX-CHAIRMAN-GATES-001)
    chairmanGate: {
      type: 'object',
      fields: {
        status: { type: 'string' },
        rationale: { type: 'string' },
        decision_id: { type: 'string' },
      },
    },
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
    chairmanGate: { status: 'pending', rationale: null, decision_id: null },
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
          validateEnum(ri?.category, `${prefix}.category`, RELEASE_CATEGORIES),
          validateEnum(ri?.status, `${prefix}.status`, APPROVAL_STATUSES),
        ];
        errors.push(...collectErrors(results));
      }
    }

    const notesCheck = validateString(data?.release_notes, 'release_notes', 10);
    if (!notesCheck.valid) errors.push(notesCheck.error);

    const dateCheck = validateString(data?.target_date, 'target_date', 1);
    if (!dateCheck.valid) errors.push(dateCheck.error);

    // Chairman governance gate check
    const gateStatus = data?.chairmanGate?.status;
    if (gateStatus === 'rejected') {
      errors.push(`Chairman gate rejected: ${data.chairmanGate.rationale || 'No rationale provided'}`);
    } else if (gateStatus !== 'approved') {
      errors.push('Chairman release readiness gate is pending — awaiting chairman decision');
    }

    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, prerequisites) {
    const total_items = data.release_items.length;
    const approved_items = data.release_items.filter(ri => ri.status === 'approved').length;
    const all_approved = total_items > 0 && approved_items === total_items;

    const promotion_gate = prerequisites
      ? evaluatePromotionGate({ ...prerequisites, stage22: data })
      : { pass: false, rationale: 'Prerequisites not provided', blockers: ['Stage 17-21 data required'], warnings: [], required_next_actions: ['Complete stages 17-21 before evaluating promotion gate'] };

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
 * Pure function: evaluate Phase 5→6 Promotion Gate (v2.0).
 *
 * Uses decision objects from v2.0 analysis steps with backward-compatible
 * fallback to legacy boolean fields.
 *
 * @param {{ stage17: Object, stage18: Object, stage19: Object, stage20: Object, stage21: Object, stage22: Object }} prerequisites
 * @returns {{ pass: boolean, rationale: string, blockers: string[], warnings: string[], required_next_actions: string[] }}
 */
export function evaluatePromotionGate({ stage17, stage18, stage19, stage20, stage21, stage22 }) {
  const blockers = [];
  const warnings = [];
  const required_next_actions = [];

  // Stage 17: buildReadiness decision OR legacy checklist check
  const s17Decision = stage17?.buildReadiness?.decision;
  if (s17Decision) {
    if (s17Decision === 'no_go') {
      blockers.push(`Build readiness: no_go — ${stage17.buildReadiness.rationale || 'Not ready'}`);
      required_next_actions.push('Resolve build readiness blockers before proceeding');
    } else if (s17Decision === 'conditional_go') {
      warnings.push(`Build readiness: conditional_go — ${stage17.buildReadiness.rationale || 'Conditions apply'}`);
    }
  } else {
    // Legacy: check categories and readiness_pct
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
  }

  // Stage 18: >= 1 sprint item (same for v1 and v2)
  const sprintItems = stage18?.sprintItems?.length || stage18?.items?.length || 0;
  if (sprintItems < 1) {
    blockers.push('No sprint items defined');
    required_next_actions.push('Define at least 1 sprint item with SD bridge payload');
  }

  // Stage 19: sprintCompletion decision OR legacy completion_pct
  const s19Decision = stage19?.sprintCompletion?.decision;
  if (s19Decision) {
    if (s19Decision === 'blocked') {
      blockers.push(`Sprint execution: blocked — ${stage19.sprintCompletion.rationale || 'Critical blockers'}`);
      required_next_actions.push('Resolve sprint blockers');
    } else if (s19Decision === 'continue') {
      warnings.push(`Sprint execution: continue — ${stage19.sprintCompletion.rationale || 'Work in progress'}`);
    }
  } else {
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
  }

  // Stage 20: qualityDecision OR legacy quality_gate_passed
  const s20Decision = stage20?.qualityDecision?.decision;
  if (s20Decision) {
    if (s20Decision === 'fail') {
      blockers.push(`Quality gate: fail — ${stage20.qualityDecision.rationale || 'Below thresholds'}`);
      required_next_actions.push('Fix failing tests and increase coverage');
    } else if (s20Decision === 'conditional_pass') {
      warnings.push(`Quality gate: conditional_pass — ${stage20.qualityDecision.rationale || 'Near thresholds'}`);
    }
  } else if (!stage20?.quality_gate_passed) {
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

  // Stage 21: reviewDecision OR legacy all_passing
  const s21Decision = stage21?.reviewDecision?.decision;
  if (s21Decision) {
    if (s21Decision === 'reject') {
      blockers.push(`Build review: reject — ${stage21.reviewDecision.rationale || 'Review failed'}`);
      required_next_actions.push('Address review feedback and re-submit');
    } else if (s21Decision === 'conditional') {
      warnings.push(`Build review: conditional — ${stage21.reviewDecision.rationale || 'Conditions apply'}`);
    }
  } else if (!stage21?.all_passing) {
    const failCount = stage21?.failing_integrations?.length || 0;
    blockers.push(`${failCount} integration(s) failing`);
    required_next_actions.push('Fix all failing integration tests');
  }

  // Stage 22: releaseDecision (v2) OR legacy all-approved check
  const s22Decision = stage22?.releaseDecision?.decision;
  if (s22Decision) {
    if (s22Decision === 'cancel') {
      blockers.push(`Release decision: cancel — ${stage22.releaseDecision.rationale || 'Release cancelled'}`);
      required_next_actions.push('Return to planning phase for replanning');
    } else if (s22Decision === 'hold') {
      blockers.push(`Release decision: hold — ${stage22.releaseDecision.rationale || 'Release on hold'}`);
      required_next_actions.push('Address hold conditions before release');
    }
  } else {
    const releaseItems = stage22?.release_items || [];
    const unapproved = releaseItems.filter(ri => ri.status !== 'approved').length;
    if (unapproved > 0) {
      blockers.push(`${unapproved} release item(s) not yet approved`);
      required_next_actions.push('Get approval for all release items');
    }
  }

  const pass = blockers.length === 0;
  const rationale = pass
    ? warnings.length > 0
      ? `Phase 5 prerequisites met with ${warnings.length} advisory warning(s). Build loop complete.`
      : 'All Phase 5 prerequisites met. Build loop is complete with quality and integration gates passed.'
    : `Phase 5 is incomplete: ${blockers.length} blocker(s) found.`;

  return { pass, rationale, blockers, warnings, required_next_actions };
}

/**
 * Pre-analysis hook: create or reuse a PENDING chairman decision.
 * Blocks venture progression until chairman confirms release readiness.
 */
TEMPLATE.onBeforeAnalysis = async function onBeforeAnalysis(supabase, ventureId) {
  const { id, isNew } = await createOrReusePendingDecision({
    ventureId,
    stageNumber: 22,
    summary: 'Chairman release readiness approval required for Stage 22',
    supabase,
  });
  return { chairmanDecisionId: id, isNew };
};

TEMPLATE.analysisStep = analyzeStage22;

export { APPROVAL_STATUSES, RELEASE_CATEGORIES, MIN_RELEASE_ITEMS, MIN_READINESS_PCT, MIN_BUILD_COMPLETION_PCT };
export default TEMPLATE;
