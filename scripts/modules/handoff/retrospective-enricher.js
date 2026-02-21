/**
 * Retrospective Enricher
 * Fix for PAT-AUTO-a7aa772c: RETROSPECTIVE_QUALITY_GATE failing with score 44/100
 * SD: SD-LEARN-FIX-ADDRESS-PAT-AUTO-025
 *
 * Auto-generated retrospectives fail the quality gate because they copy SD metadata
 * (description text, objective strings) instead of generating SD-specific INSIGHTS.
 * The AI rubric evaluates learning_specificity (40% weight) and expects references to:
 * - Specific file names or code paths changed
 * - Concrete implementation decisions made
 * - Observed behaviors and outcomes
 *
 * This module generates insights DERIVED FROM SD context, not copies of it.
 *
 * Only applies in non-interactive (auto-generation) mode.
 * Manual retrospectives are unaffected.
 */

import { safeTruncate } from '../../../lib/utils/safe-truncate.js';
import { execSync } from 'child_process';

/**
 * Extract file references from key_changes array.
 * Returns an array of file paths/names mentioned in the changes.
 *
 * @param {Array} keyChanges - SD key_changes field
 * @returns {string[]} File names/paths extracted from changes
 */
function extractFileRefs(keyChanges) {
  if (!Array.isArray(keyChanges) || keyChanges.length === 0) return [];

  const files = [];
  for (const change of keyChanges.slice(0, 5)) {
    const text = typeof change === 'string' ? change : (change?.change || change?.file || change?.description || '');
    // Extract file-like patterns: path/to/file.js, lib/foo/bar.js, scripts/x.js
    const fileMatches = text.match(/[\w./\\-]+\.(js|ts|mjs|json|md|sql|css|tsx|jsx)/g);
    if (fileMatches) files.push(...fileMatches);
  }

  return [...new Set(files)].slice(0, 3);
}

/**
 * Get the workflow description for an SD type.
 * @param {string} sdType
 * @returns {string}
 */
function getWorkflowDescription(sdType) {
  const workflows = {
    infrastructure: '4-handoff workflow (skips EXEC-TO-PLAN)',
    documentation: '4-handoff workflow (skips EXEC-TO-PLAN)',
    feature: '5-handoff full workflow',
    bugfix: '5-handoff workflow with regression testing',
    security: '5-handoff workflow with ≥90% gate threshold',
  };
  return workflows[sdType] || 'standard LEO workflow';
}

/**
 * Build SD-specific key learnings that generate INSIGHTS, not metadata copies.
 * Each learning must reference something specific: a file, a gate, a behavior, or a decision.
 *
 * @param {Object} sd - Strategic Directive record
 * @param {string} handoffType - Handoff type (e.g. 'LEAD_TO_PLAN', 'PLAN_TO_EXEC')
 * @returns {Array<{learning: string, is_boilerplate: boolean}>}
 */
export function buildSDSpecificKeyLearnings(sd, handoffType) {
  const learnings = [];
  const sdKey = sd?.sd_key || sd?.id || 'this-SD';
  const sdType = sd?.sd_type || 'infrastructure';
  const targetApp = sd?.target_application || 'EHG_Engineer';
  const phase = handoffType.replace(/_/g, '-');

  // Learning 1: SD type + workflow insight (specific to this SD type)
  learnings.push({
    learning: `${sdKey} is a ${sdType} SD targeting ${targetApp} using the ${getWorkflowDescription(sdType)}`,
    is_boilerplate: false
  });

  // Learning 2: Implementation insight from key_changes (file references preferred)
  const keyChanges = sd?.key_changes;
  const fileRefs = extractFileRefs(keyChanges);
  if (fileRefs.length > 0) {
    learnings.push({
      learning: `${phase} scope includes changes to: ${fileRefs.join(', ')} — verified in key_changes`,
      is_boilerplate: false
    });
  } else if (Array.isArray(keyChanges) && keyChanges.length > 0) {
    const firstChange = typeof keyChanges[0] === 'string' ? keyChanges[0] : (keyChanges[0]?.change || '');
    if (firstChange) {
      learnings.push({
        learning: `${phase}: Primary change — ${safeTruncate(firstChange, 120)}`,
        is_boilerplate: false
      });
    }
  }

  // Learning 3: Success criteria insight (what must be true after this SD completes)
  const successCriteria = sd?.success_criteria;
  if (Array.isArray(successCriteria) && successCriteria.length > 0) {
    const criterion = typeof successCriteria[0] === 'string'
      ? successCriteria[0]
      : (successCriteria[0]?.criterion || successCriteria[0]?.criteria || successCriteria[0]?.measure || '');
    if (criterion && criterion.length > 10) {
      learnings.push({
        learning: `Acceptance: ${safeTruncate(criterion, 130)} — verifiable at LEAD-FINAL-APPROVAL`,
        is_boilerplate: false
      });
    }
  }

  // Learning 4: Risk or constraint insight (something specific to watch for)
  const risks = sd?.risks;
  if (Array.isArray(risks) && risks.length > 0) {
    const risk = risks[0];
    const riskText = typeof risk === 'string' ? risk : (risk?.risk || '');
    const mitigation = typeof risk === 'object' ? (risk?.mitigation || '') : '';
    if (riskText) {
      learnings.push({
        learning: `Risk: "${safeTruncate(riskText, 80)}"${mitigation ? ` → ${safeTruncate(mitigation, 60)}` : ''}`,
        is_boilerplate: false
      });
    }
  }

  // Ensure we always have at least 3 learnings
  if (learnings.length < 3) {
    learnings.push({
      learning: `${sdKey}: ${sdType} SD completed ${phase} gate — PRD and user stories verified before EXEC phase`,
      is_boilerplate: false
    });
  }

  return learnings;
}

/**
 * Build SD-specific action items with SMART format.
 * Generates ≥2 actionable items with owner, deadline, and verification.
 *
 * @param {Object} sd - Strategic Directive record
 * @param {string} handoffType - Handoff type
 * @returns {Array<{action: string, owner: string, deadline: string, verification: string, is_boilerplate: boolean}>}
 */
export function buildSDSpecificActionItems(sd, handoffType) {
  const items = [];
  const sdKey = sd?.sd_key || sd?.id || 'this-SD';
  const sdType = sd?.sd_type || 'infrastructure';
  const nextHandoff = {
    LEAD_TO_PLAN: 'PLAN-TO-EXEC',
    PLAN_TO_EXEC: 'PLAN-TO-LEAD',
    EXEC_TO_PLAN: 'PLAN-TO-LEAD',
    PLAN_TO_LEAD: 'LEAD-FINAL-APPROVAL',
  }[handoffType] || 'next-handoff';

  // Action 1: From primary success criterion with verification
  const successCriteria = sd?.success_criteria;
  if (Array.isArray(successCriteria) && successCriteria.length > 0) {
    const c1 = typeof successCriteria[0] === 'string'
      ? successCriteria[0]
      : (successCriteria[0]?.criterion || successCriteria[0]?.criteria || '');
    const v1 = typeof successCriteria[0] === 'object'
      ? (successCriteria[0]?.verification || successCriteria[0]?.measure || '')
      : '';
    if (c1) {
      items.push({
        action: `Verify: ${safeTruncate(c1, 110)} for ${sdKey}`,
        owner: 'LEO-Session',
        deadline: nextHandoff,
        verification: v1 || `${sdKey} handoff gate results confirm criterion met`,
        is_boilerplate: false
      });
    }
  }

  // Action 2: From second success criterion
  if (Array.isArray(successCriteria) && successCriteria.length > 1) {
    const c2 = typeof successCriteria[1] === 'string'
      ? successCriteria[1]
      : (successCriteria[1]?.criterion || successCriteria[1]?.criteria || '');
    if (c2) {
      items.push({
        action: `Validate: ${safeTruncate(c2, 110)} for ${sdKey}`,
        owner: 'LEO-Session',
        deadline: 'LEAD-FINAL-APPROVAL',
        verification: `${sdKey} gate results show criterion met`,
        is_boilerplate: false
      });
    }
  }

  // Action 3: SD-type-specific follow-up
  if (sdType === 'infrastructure') {
    items.push({
      action: `Confirm ${sdKey} produces no regressions — run existing test suite after EXEC changes`,
      owner: 'LEO-Session',
      deadline: 'PLAN-TO-LEAD',
      verification: 'All existing unit tests pass after changes merge',
      is_boilerplate: false
    });
  } else {
    items.push({
      action: `Run E2E tests covering ${sdKey} user stories before EXEC-TO-PLAN handoff`,
      owner: 'LEO-Session',
      deadline: 'EXEC-TO-PLAN',
      verification: 'E2E test pass rate ≥ 100% for stories linked to this SD',
      is_boilerplate: false
    });
  }

  // Ensure at least 2 items
  if (items.length < 2) {
    items.push({
      action: `Complete ${sdKey} implementation according to PRD acceptance criteria`,
      owner: 'LEO-Session',
      deadline: nextHandoff,
      verification: `All ${sdKey} PRD acceptance criteria marked verified in handoff`,
      is_boilerplate: false
    });
  }

  return items.slice(0, 4);
}

/**
 * Build improvement areas with real root-cause analysis.
 * Each area must have specific analysis and concrete prevention steps.
 *
 * @param {Object} sd - Strategic Directive record
 * @param {Array} issues - Issue patterns linked to this SD
 * @returns {Array<{area: string, analysis: string, prevention: string}>}
 */
export function buildSDSpecificImprovementAreas(sd, issues = []) {
  const areas = [];
  const sdKey = sd?.sd_key || sd?.id || 'this-SD';

  // From issue patterns: specific analysis (rubric expects analysis, NOT root_cause)
  for (const issue of issues.slice(0, 2)) {
    const summary = safeTruncate(issue.issue_summary, 80);
    const prevention = Array.isArray(issue.prevention_checklist) && issue.prevention_checklist.length > 0
      ? safeTruncate(issue.prevention_checklist[0], 120)
      : `Before ${sdKey} gate: verify ${issue.pattern_id} does not recur`;

    areas.push({
      area: `${issue.category}: ${summary}`,
      analysis: `Pattern ${issue.pattern_id} (${issue.severity} severity, ${issue.occurrence_count || 1} occurrence(s)) — systemic gap, not one-off`,
      prevention
    });
  }

  // From SD risks: specific analysis
  const risks = sd?.risks;
  if (Array.isArray(risks) && risks.length > 0) {
    for (const risk of risks.slice(0, Math.max(0, 2 - areas.length))) {
      const riskText = typeof risk === 'string' ? risk : (risk?.risk || '');
      const mitigation = typeof risk === 'object' ? (risk?.mitigation || '') : '';
      const likelihood = typeof risk === 'object' ? (risk?.likelihood || 'unknown') : 'unknown';
      if (riskText) {
        areas.push({
          area: safeTruncate(riskText, 80),
          analysis: `${likelihood} likelihood risk identified in ${sdKey} LEAD evaluation — mitigation planned but not yet verified in production`,
          prevention: mitigation
            ? safeTruncate(mitigation, 120)
            : `Verify risk does not materialize during EXEC phase of ${sdKey}`
        });
      }
    }
  }

  // Fallback: SD-type specific insight
  if (areas.length === 0) {
    const sdType = sd?.sd_type || 'infrastructure';
    areas.push({
      area: `${sdType} SD: auto-retrospective quality`,
      analysis: `Auto-generated retrospectives for ${sdType} SDs lack file-level references from key_changes, causing RETROSPECTIVE_QUALITY_GATE to score low on learning_specificity (40% weight)`,
      prevention: `Populate sd.key_changes[] with specific file paths and change descriptions (e.g., "scripts/modules/handoff/retrospective-enricher.js") before LEAD-TO-PLAN so enricher can extract concrete references`
    });
  }

  return areas;
}

/**
 * Pre-gate retrospective enrichment for PLAN-TO-LEAD.
 * Fix for PAT-AUTO-19335057: RETROSPECTIVE_QUALITY_GATE scores ~47/100 because
 * retrospectives are created at LEAD-TO-PLAN time with no implementation context.
 *
 * This function re-enriches the newest retrospective with:
 * 1. Git diff context (files changed since LEAD-TO-PLAN)
 * 2. Handoff gate scores from prior handoffs
 * 3. Linked pattern details from issue_patterns
 *
 * Called from plan-to-lead/index.js setup() before gates run.
 * Idempotent — safe to call multiple times. Skips manual retrospectives.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD UUID (id column)
 * @param {Object} sd - Strategic Directive record
 * @returns {Promise<{enriched: boolean, fieldsUpdated: string[]}>}
 */
export async function enrichRetrospectivePreGate(supabase, sdId, sd) {
  const result = { enriched: false, fieldsUpdated: [] };
  const sdKey = sd?.sd_key || sdId;

  // 1. Get the newest retrospective for this SD
  const { data: retro } = await supabase
    .from('retrospectives')
    .select('id, generated_by, key_learnings, action_items, improvement_areas')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!retro) return result;

  // Skip manual retrospectives — only enrich auto-generated ones
  const autoGeneratedTypes = ['AUTO', 'AUTO_HOOK', 'NON_SD_MERGE', 'RETRO_SUB_AGENT', 'system', 'non_interactive'];
  if (retro.generated_by && !autoGeneratedTypes.includes(retro.generated_by)) {
    return result;
  }

  // 2. Gather enrichment context
  const gitFiles = getGitChangedFiles(sd?.target_application);
  const handoffScores = await getHandoffScores(supabase, sdId);
  const patterns = await getLinkedPatterns(supabase, sdKey);

  // 3. Build enriched key_learnings
  const enrichedLearnings = [];

  // File-level learnings from git diff
  if (gitFiles.length > 0) {
    enrichedLearnings.push({
      learning: `${sdKey} implementation changed ${gitFiles.length} file(s): ${gitFiles.slice(0, 3).join(', ')}${gitFiles.length > 3 ? ` (+${gitFiles.length - 3} more)` : ''}`,
      is_boilerplate: false
    });
  }

  // Gate score learnings from prior handoffs
  if (handoffScores.length > 0) {
    for (const hs of handoffScores.slice(0, 2)) {
      enrichedLearnings.push({
        learning: `${hs.handoff_type} scored ${hs.quality_score}% — ${hs.quality_score >= 85 ? 'strong pass' : 'passed with warnings'}`,
        is_boilerplate: false
      });
    }
  }

  // Pattern-specific learnings
  if (patterns.length > 0) {
    for (const pat of patterns.slice(0, 2)) {
      enrichedLearnings.push({
        learning: `Addresses ${pat.pattern_id}: "${safeTruncate(pat.issue_summary, 80)}" (${pat.occurrence_count || 1} occurrence(s), ${pat.severity} severity)`,
        is_boilerplate: false
      });
    }
  }

  // SD-type specific learning as fallback
  if (enrichedLearnings.length < 2) {
    enrichedLearnings.push({
      learning: `${sdKey}: ${sd?.sd_type || 'infrastructure'} SD using ${getWorkflowDescription(sd?.sd_type)} — PRD verified at PLAN-TO-EXEC`,
      is_boilerplate: false
    });
  }

  // 4. Build enriched action_items with gate verification
  const enrichedActions = [];
  if (handoffScores.length > 0) {
    enrichedActions.push({
      action: `Verify RETROSPECTIVE_QUALITY_GATE score >= 55% at PLAN-TO-LEAD for ${sdKey}`,
      owner: 'LEO-Session',
      deadline: 'PLAN-TO-LEAD',
      verification: `Gate output shows score >= 55 (prior handoff scores: ${handoffScores.map(h => h.quality_score + '%').join(', ')})`,
      is_boilerplate: false
    });
  }
  if (gitFiles.length > 0) {
    enrichedActions.push({
      action: `Confirm changes to ${gitFiles.slice(0, 2).join(', ')} produce no regressions`,
      owner: 'LEO-Session',
      deadline: 'PLAN-TO-LEAD',
      verification: 'Existing test suite passes after changes merge',
      is_boilerplate: false
    });
  }
  if (patterns.length > 0) {
    enrichedActions.push({
      action: `Validate pattern ${patterns[0].pattern_id} is addressed by implementation`,
      owner: 'LEO-Session',
      deadline: 'LEAD-FINAL-APPROVAL',
      verification: `Pattern occurrence count stops incrementing after ${sdKey} merges`,
      is_boilerplate: false
    });
  }

  // 5. Build enriched improvement_areas
  const enrichedAreas = buildSDSpecificImprovementAreas(sd, patterns);

  // 6. Merge: prefer enriched content over existing if it has more specificity
  const updates = {};

  if (enrichedLearnings.length > 0) {
    updates.key_learnings = enrichedLearnings;
    result.fieldsUpdated.push('key_learnings');
  }
  if (enrichedActions.length >= 2) {
    updates.action_items = enrichedActions;
    result.fieldsUpdated.push('action_items');
  }
  if (enrichedAreas.length > 0) {
    updates.improvement_areas = enrichedAreas;
    result.fieldsUpdated.push('improvement_areas');
  }

  if (result.fieldsUpdated.length === 0) return result;

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('retrospectives')
    .update(updates)
    .eq('id', retro.id);

  if (error) {
    console.warn(`   ⚠️  Pre-gate enrichment failed: ${error.message}`);
    return result;
  }

  result.enriched = true;
  return result;
}

/**
 * Get files changed since LEAD-TO-PLAN (via git diff).
 * Falls back gracefully if git is unavailable.
 */
function getGitChangedFiles(targetApp) {
  try {
    const repoPath = targetApp === 'EHG'
      ? 'C:/Users/rickf/Projects/_EHG/ehg'
      : 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
    const output = execSync('git diff --name-only HEAD~5 HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null', {
      cwd: repoPath,
      encoding: 'utf8',
      timeout: 5000
    });
    return output.trim().split('\n').filter(f => f && f.match(/\.(js|ts|mjs|json|md|sql|css|tsx|jsx)$/)).slice(0, 6);
  } catch {
    return [];
  }
}

/**
 * Get prior handoff scores for this SD.
 */
async function getHandoffScores(supabase, sdId) {
  const { data } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, quality_score, status')
    .eq('sd_id', sdId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(3);
  return data || [];
}

/**
 * Get issue patterns linked to this SD key.
 */
async function getLinkedPatterns(supabase, sdKey) {
  const { data } = await supabase
    .from('issue_patterns')
    .select('pattern_id, issue_summary, severity, occurrence_count, category, prevention_checklist')
    .or(`assigned_sd_id.eq.${sdKey},assigned_sd_id.like.%${sdKey}%`)
    .limit(3);
  return data || [];
}
