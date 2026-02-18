/**
 * Retrospective Enricher
 * Fix for PAT-AUTO-fd3d81d3: RETROSPECTIVE_EXISTS gate failing with score 50/100
 *
 * Auto-generated retrospectives produce metric-only content (e.g., "Quality score: 80%")
 * that fails the RetrospectiveQualityRubric's Learning Specificity dimension (40% weight).
 * This module generates SD-specific content from the SD's description, objectives, and key_changes.
 *
 * Only applies in non-interactive (auto-generation) mode.
 * Manual retrospectives are unaffected.
 */

import { safeTruncate } from '../../../lib/utils/safe-truncate.js';

/**
 * Build SD-specific key learnings from SD context.
 * Replaces metric-only entries like "quality score: 80%" with specific insights.
 *
 * @param {Object} sd - Strategic Directive record (title, description, strategic_objectives, key_changes)
 * @param {string} handoffType - Handoff type (e.g. 'LEAD_TO_PLAN', 'PLAN_TO_EXEC')
 * @returns {Array<{learning: string, is_boilerplate: boolean}>}
 */
export function buildSDSpecificKeyLearnings(sd, handoffType) {
  const learnings = [];
  const title = sd?.title || sd?.sd_key || 'Unknown SD';
  const phase = handoffType.replace(/_/g, '-');

  // Learning 1: SD-specific context from description
  const description = sd?.description;
  if (description && description.length > 50) {
    learnings.push({
      learning: `${phase}: ${safeTruncate(description, 140)}`,
      is_boilerplate: false
    });
  } else {
    learnings.push({
      learning: `${phase} completed for "${title}" — ${sd?.sd_type || 'infrastructure'} SD targeting ${sd?.target_application || 'EHG_Engineer'}`,
      is_boilerplate: false
    });
  }

  // Learning 2: From strategic objectives
  const objectives = sd?.strategic_objectives;
  if (Array.isArray(objectives) && objectives.length > 0) {
    const obj = objectives[0];
    const objText = typeof obj === 'string' ? obj : (obj?.objective || obj?.description || '');
    if (objText) {
      learnings.push({
        learning: `Objective: ${safeTruncate(objText, 120)}`,
        is_boilerplate: false
      });
    }
  }

  // Learning 3: From key_changes
  const keyChanges = sd?.key_changes;
  if (Array.isArray(keyChanges) && keyChanges.length > 0) {
    const change = typeof keyChanges[0] === 'string' ? keyChanges[0] : (keyChanges[0]?.change || keyChanges[0]?.description || '');
    if (change) {
      learnings.push({
        learning: `Scope: ${safeTruncate(change, 120)}`,
        is_boilerplate: false
      });
    }
  }

  return learnings;
}

/**
 * Build SD-specific action items with owner and deadline.
 * Required for RETROSPECTIVE_QUALITY_GATE action_items actionability dimension.
 *
 * @param {Object} sd - Strategic Directive record
 * @param {string} handoffType - Handoff type
 * @returns {Array<{action: string, owner: string, deadline: string, is_boilerplate: boolean}>}
 */
export function buildSDSpecificActionItems(sd, handoffType) {
  const items = [];
  const sdKey = sd?.sd_key || sd?.id || 'this-SD';

  // Primary action: From success_criteria with owner/deadline
  const successCriteria = sd?.success_criteria;
  if (Array.isArray(successCriteria) && successCriteria.length > 0) {
    const criterion = typeof successCriteria[0] === 'string'
      ? successCriteria[0]
      : (successCriteria[0]?.criterion || successCriteria[0]?.criteria || '');
    if (criterion) {
      items.push({
        action: `Verify acceptance criterion: ${safeTruncate(criterion, 100)}`,
        owner: 'LEO-Session',
        deadline: 'PLAN-TO-LEAD',
        is_boilerplate: false
      });
      return items;
    }
  }

  // Fallback: SD-specific action with owner and deadline
  items.push({
    action: `Validate ${handoffType.replace(/_/g, '-')} outcomes for ${sdKey} meet defined acceptance criteria`,
    owner: 'LEO-Session',
    deadline: 'next-handoff',
    is_boilerplate: false
  });

  return items;
}

/**
 * Build improvement areas with root cause from SD context and issue patterns.
 *
 * @param {Object} sd - Strategic Directive record
 * @param {Array} issues - Issue patterns linked to this SD
 * @returns {Array<{area: string, root_cause: string, prevention: string}>}
 */
export function buildSDSpecificImprovementAreas(sd, issues = []) {
  const areas = [];

  for (const issue of issues.slice(0, 2)) {
    areas.push({
      area: `${issue.category}: ${safeTruncate(issue.issue_summary, 60)}`,
      root_cause: `Pattern ${issue.pattern_id} with ${issue.severity} severity`,
      prevention: Array.isArray(issue.prevention_checklist) && issue.prevention_checklist.length > 0
        ? safeTruncate(issue.prevention_checklist[0], 100)
        : `Monitor for recurrence of ${issue.pattern_id}`
    });
  }

  if (areas.length === 0) {
    const risks = sd?.risks;
    if (Array.isArray(risks) && risks.length > 0) {
      const risk = risks[0];
      const riskText = typeof risk === 'string' ? risk : (risk?.risk || '');
      const mitigation = typeof risk === 'object' ? (risk?.mitigation || 'Monitor proactively') : 'Monitor proactively';
      if (riskText) {
        areas.push({
          area: safeTruncate(riskText, 80),
          root_cause: `Risk identified for ${sd?.sd_key || 'this SD'}`,
          prevention: safeTruncate(mitigation, 100)
        });
      }
    }
  }

  return areas;
}
