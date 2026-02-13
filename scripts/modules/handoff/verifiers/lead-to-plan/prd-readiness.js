/**
 * PRD-Readiness Validation for LEAD-TO-PLAN Verifier
 *
 * Validates SD has everything PLAN needs to create a PRD.
 * Based on Foundation V3 analysis.
 *
 * Extracted from scripts/verify-handoff-lead-to-plan.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

import fs from 'fs';
import path from 'path';
import { safeTruncate } from '../../../../../lib/utils/safe-truncate.js';

/**
 * PRD-Readiness Pre-Check (Improvement #1)
 * Validates SD has minimum content PLAN needs to create a PRD
 * Based on CLAUDE_PLAN.md requirements
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} - Result with score, maxScore, warnings
 */
export function validatePRDReadiness(sd) {
  const result = { score: 0, maxScore: 100, warnings: [] };
  const checks = {
    description: { minLength: 100, weight: 25 },
    scope: { minLength: 50, weight: 25 },
    rationale: { minLength: 30, weight: 20 },
    strategic_objectives: { minItems: 2, weight: 15 },
    success_criteria: { minItems: 3, weight: 15 }
  };

  // Check description length
  const descLength = (sd.description || '').length;
  if (descLength >= checks.description.minLength) {
    result.score += checks.description.weight;
  } else {
    result.warnings.push(
      `PRD-Readiness: description is ${descLength} chars (recommend >=${checks.description.minLength}). ` +
      'PLAN may need to gather additional context.'
    );
  }

  // Check scope length
  const scopeLength = (sd.scope || '').length;
  if (scopeLength >= checks.scope.minLength) {
    result.score += checks.scope.weight;
  } else {
    result.warnings.push(
      `PRD-Readiness: scope is ${scopeLength} chars (recommend >=${checks.scope.minLength}). ` +
      'PLAN may struggle to define boundaries.'
    );
  }

  // Check rationale length
  const rationaleLength = (sd.rationale || '').length;
  if (rationaleLength >= checks.rationale.minLength) {
    result.score += checks.rationale.weight;
  } else {
    result.warnings.push(
      `PRD-Readiness: rationale is ${rationaleLength} chars (recommend >=${checks.rationale.minLength}). ` +
      'PLAN benefits from understanding "why" behind the SD.'
    );
  }

  // Check strategic_objectives count
  const objectives = Array.isArray(sd.strategic_objectives) ? sd.strategic_objectives : [];
  if (objectives.length >= checks.strategic_objectives.minItems) {
    result.score += checks.strategic_objectives.weight;
  } else {
    result.warnings.push(
      `PRD-Readiness: ${objectives.length} strategic_objectives (recommend >=${checks.strategic_objectives.minItems}). ` +
      'More objectives help PLAN prioritize features.'
    );
  }

  // Check success_criteria count
  let criteria = [];
  try {
    criteria = Array.isArray(sd.success_criteria) ? sd.success_criteria :
      (typeof sd.success_criteria === 'string' ? JSON.parse(sd.success_criteria || '[]') : []);
  } catch {
    // success_criteria is a plain text string, treat as 1 item
    criteria = sd.success_criteria ? [sd.success_criteria] : [];
  }
  if (criteria.length >= checks.success_criteria.minItems) {
    result.score += checks.success_criteria.weight;
  } else {
    result.warnings.push(
      `PRD-Readiness: ${criteria.length} success_criteria (recommend >=${checks.success_criteria.minItems}). ` +
      'More criteria help PLAN define acceptance tests.'
    );
  }

  return result;
}

/**
 * Vision Document Reference Validation (Improvement #2)
 * Validates that referenced vision documents actually exist
 *
 * @param {Object} sd - Strategic Directive object
 * @param {string} projectRoot - Project root path
 * @returns {Object} - Result with warnings array
 */
export function validateVisionDocumentReferences(sd, projectRoot) {
  const result = { warnings: [] };

  // Check if SD references vision documents
  const visionRefs = sd.metadata?.vision_document_references || [];

  // For Vision V2 SDs or SDs with vision refs, validate they exist
  if (sd.id?.includes('VISION') || visionRefs.length > 0) {
    if (visionRefs.length === 0) {
      result.warnings.push(
        'PRD-Readiness: No vision_document_references in metadata. ' +
        'Vision-related SDs should reference authoritative spec documents.'
      );
    } else {
      // Check each referenced file exists
      const missingDocs = [];
      for (const docPath of visionRefs) {
        const fullPath = path.join(projectRoot, docPath);
        if (!fs.existsSync(fullPath)) {
          missingDocs.push(docPath);
        }
      }

      if (missingDocs.length > 0) {
        result.warnings.push(
          `PRD-Readiness: ${missingDocs.length} vision document(s) not found: ` +
          `${missingDocs.slice(0, 3).join(', ')}${missingDocs.length > 3 ? '...' : ''}. ` +
          'Verify paths are correct.'
        );
      }
    }
  }

  // Also check for sparse references (less than 2 for complex SDs)
  if (visionRefs.length === 1 && (sd.description || '').length > 500) {
    result.warnings.push(
      'PRD-Readiness: Only 1 vision_document_reference for a complex SD. ' +
      'Consider adding related specs to help PLAN understand full context.'
    );
  }

  return result;
}

/**
 * Scope Structure Validation (Improvement #4)
 * Checks for clear IN SCOPE / OUT OF SCOPE sections
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} - Result with warnings array
 */
export function validateScopeStructure(sd) {
  const result = { warnings: [] };
  const scopeText = (sd.scope || '').toLowerCase();

  // Patterns indicating explicit scope boundaries
  const inScopePatterns = [
    /\bin\s*scope\b/i,
    /\bincluded\b/i,
    /\bwill\s+(do|implement|build|create)\b/i,
    /\bscope\s*:/i,
    /##\s*in\s*scope/i
  ];

  const outScopePatterns = [
    /\bout\s*(of)?\s*scope\b/i,
    /\bexcluded\b/i,
    /\bwon'?t\s+(do|implement|build)\b/i,
    /\bnot\s+included\b/i,
    /##\s*out\s*(of)?\s*scope/i
  ];

  const hasInScope = inScopePatterns.some(p => p.test(scopeText));
  const hasOutScope = outScopePatterns.some(p => p.test(scopeText));

  if (!hasInScope && !hasOutScope) {
    result.warnings.push(
      'PRD-Readiness: Scope lacks explicit IN SCOPE / OUT OF SCOPE sections. ' +
      'Clear boundaries prevent scope creep during PLAN and EXEC phases.'
    );
  } else if (hasInScope && !hasOutScope) {
    result.warnings.push(
      'PRD-Readiness: Scope has IN SCOPE but no OUT OF SCOPE section. ' +
      'Explicitly stating what is NOT included helps prevent over-building.'
    );
  }

  return result;
}

/**
 * Success Criteria Actionability Check (Improvement #5)
 * Verifies criteria are specific and verifiable
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} - Result with warnings array
 */
export function validateSuccessCriteriaActionability(sd) {
  const result = { warnings: [] };

  // Parse success_criteria
  let criteria = [];
  try {
    criteria = Array.isArray(sd.success_criteria) ? sd.success_criteria :
      (typeof sd.success_criteria === 'string' ? JSON.parse(sd.success_criteria || '[]') : []);
  } catch {
    // If parsing fails, skip this check
    return result;
  }

  if (criteria.length === 0) return result;

  // Patterns indicating actionable/verifiable criteria
  const actionablePatterns = [
    /\bpass(es)?\b/i,           // "tests pass"
    /\bcompile[sd]?\b/i,        // "build compiles"
    /\bno\s+\w+\s+errors?\b/i,  // "no type errors"
    /\d+%/,                      // percentages like ">=85%"
    /\breturns?\b/i,            // "returns correct data"
    /\bexists?\b/i,             // "file exists"
    /\bvisible\b/i,             // "visible in UI"
    /\bworks?\b/i,              // "feature works"
    /\bcan\s+\w+/i,             // "user can login"
    /\bshows?\b/i,              // "shows data"
    /\bdisplays?\b/i,           // "displays correctly"
    /\bcomplete[sd]?\b/i,       // "task completed"
    /\bfunctional\b/i,          // "endpoint functional"
    /\bsuccessful(ly)?\b/i      // "deploys successfully"
  ];

  // Vague/non-actionable patterns
  const vaguePatterns = [
    /\bimproved?\b/i,           // "improved performance" (how much?)
    /\bbetter\b/i,              // "better UX" (subjective)
    /\bnice(r)?\b/i,            // "nicer design"
    /\bgood\b/i,                // "good quality"
    /\bclean(er)?\b/i,          // "cleaner code" (subjective)
    /\boptimized?\b/i           // "optimized" without metric
  ];

  let vagueCriteria = [];

  criteria.forEach((criterion, index) => {
    const text = typeof criterion === 'string' ? criterion :
      (criterion.description || criterion.criterion || '');

    const isActionable = actionablePatterns.some(p => p.test(text));
    const isVague = vaguePatterns.some(p => p.test(text)) && !isActionable;

    if (isVague) {
      vagueCriteria.push({ index: index + 1, text: safeTruncate(text, 50) });
    }
  });

  // Warn if more than 30% of criteria are vague
  const vagueRatio = vagueCriteria.length / criteria.length;
  if (vagueRatio > 0.3) {
    result.warnings.push(
      `PRD-Readiness: ${vagueCriteria.length}/${criteria.length} success criteria may be hard to verify. ` +
      `Examples: "${vagueCriteria[0]?.text}...". ` +
      'Consider adding measurable targets (e.g., ">=80% coverage", "loads in <2s").'
    );
  }

  return result;
}

/**
 * Implementation Context Metadata Check (Improvement #6)
 * Validates that helpful implementation hints exist in metadata
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} - Result with warnings array
 */
export function validateImplementationContext(sd) {
  const result = { warnings: [] };

  // Skip for documentation-only SDs
  if (sd.sd_type === 'documentation') return result;

  // Context fields that help PLAN understand implementation
  const contextFields = [
    'key_files',
    'affected_tables',
    'data_sources',
    'verification_steps',
    'key_tables',
    'key_components',
    'execution_pipeline'
  ];

  const metadata = sd.metadata || {};
  const presentFields = contextFields.filter(field => {
    const value = metadata[field];
    return value && (Array.isArray(value) ? value.length > 0 : true);
  });

  // For technical SDs with substantial scope, expect some context
  const scopeLength = (sd.scope || '').length;
  const isSubstantial = scopeLength > 200 || (sd.description || '').length > 500;

  if (presentFields.length === 0 && isSubstantial) {
    result.warnings.push(
      'PRD-Readiness: No implementation context in metadata (key_files, affected_tables, etc.). ' +
      'Adding context helps PLAN understand where changes will be made.'
    );
  } else if (presentFields.length === 1 && isSubstantial) {
    result.warnings.push(
      `PRD-Readiness: Only "${presentFields[0]}" in metadata for substantial SD. ` +
      'Consider adding more context (key_files, affected_tables, verification_steps).'
    );
  }

  return result;
}
