/**
 * PRD Readiness Validation
 * Validates SD has everything PLAN needs to create a PRD
 *
 * Extracted from verify-handoff-lead-to-plan.js for modularity
 * SD-LEO-REFACTOR-VERIFY-L2P-001
 */

import fs from 'fs';
import path from 'path';
import { PRD_READINESS_CHECKS } from './constants.js';

/**
 * PRD-Readiness Pre-Check
 * Validates SD has minimum content PLAN needs to create a PRD
 * @param {Object} sd - Strategic Directive data
 * @returns {Object} Result with score and warnings
 */
export function validatePRDReadiness(sd) {
  const result = { score: 0, maxScore: 100, warnings: [] };
  const checks = PRD_READINESS_CHECKS;

  // Check description length
  const descLength = (sd.description || '').length;
  if (descLength >= checks.description.minLength) {
    result.score += checks.description.weight;
  } else {
    result.warnings.push(
      `PRD-Readiness: description is ${descLength} chars (recommend ≥${checks.description.minLength}). ` +
      'PLAN may need to gather additional context.'
    );
  }

  // Check scope length
  const scopeLength = (sd.scope || '').length;
  if (scopeLength >= checks.scope.minLength) {
    result.score += checks.scope.weight;
  } else {
    result.warnings.push(
      `PRD-Readiness: scope is ${scopeLength} chars (recommend ≥${checks.scope.minLength}). ` +
      'PLAN may struggle to define boundaries.'
    );
  }

  // Check rationale length
  const rationaleLength = (sd.rationale || '').length;
  if (rationaleLength >= checks.rationale.minLength) {
    result.score += checks.rationale.weight;
  } else {
    result.warnings.push(
      `PRD-Readiness: rationale is ${rationaleLength} chars (recommend ≥${checks.rationale.minLength}). ` +
      'PLAN benefits from understanding "why" behind the SD.'
    );
  }

  // Check strategic_objectives count
  const objectives = Array.isArray(sd.strategic_objectives) ? sd.strategic_objectives : [];
  if (objectives.length >= checks.strategic_objectives.minItems) {
    result.score += checks.strategic_objectives.weight;
  } else {
    result.warnings.push(
      `PRD-Readiness: ${objectives.length} strategic_objectives (recommend ≥${checks.strategic_objectives.minItems}). ` +
      'More objectives help PLAN prioritize features.'
    );
  }

  // Check success_criteria count
  let criteria = [];
  try {
    criteria = Array.isArray(sd.success_criteria) ? sd.success_criteria :
      (typeof sd.success_criteria === 'string' ? JSON.parse(sd.success_criteria || '[]') : []);
  } catch (_parseErr) {
    criteria = sd.success_criteria ? [sd.success_criteria] : [];
  }
  if (criteria.length >= checks.success_criteria.minItems) {
    result.score += checks.success_criteria.weight;
  } else {
    result.warnings.push(
      `PRD-Readiness: ${criteria.length} success_criteria (recommend ≥${checks.success_criteria.minItems}). ` +
      'More criteria help PLAN define acceptance tests.'
    );
  }

  return result;
}

/**
 * Vision Document Reference Validation
 * Validates that referenced vision documents actually exist
 * @param {Object} sd - Strategic Directive data
 * @param {string} projectRoot - Project root path
 * @returns {Object} Result with warnings
 */
export function validateVisionDocumentReferences(sd, projectRoot) {
  const result = { warnings: [] };

  const visionRefs = sd.metadata?.vision_document_references || [];

  if (sd.id?.includes('VISION') || visionRefs.length > 0) {
    if (visionRefs.length === 0) {
      result.warnings.push(
        'PRD-Readiness: No vision_document_references in metadata. ' +
        'Vision-related SDs should reference authoritative spec documents.'
      );
    } else {
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

  if (visionRefs.length === 1 && (sd.description || '').length > 500) {
    result.warnings.push(
      'PRD-Readiness: Only 1 vision_document_reference for a complex SD. ' +
      'Consider adding related specs to help PLAN understand full context.'
    );
  }

  return result;
}

/**
 * Dependency Structure Validation
 * Validates dependencies array is properly structured
 * @param {Object} sd - Strategic Directive data
 * @returns {Object} Result with warnings
 */
export function validateDependencyStructure(sd) {
  const result = { warnings: [] };
  const deps = sd.dependencies;

  if (deps === undefined || deps === null) {
    const phase = sd.metadata?.phase;
    if (phase && phase > 1) {
      result.warnings.push(
        `PRD-Readiness: dependencies array is empty but SD is Phase ${phase}. ` +
        'Non-Phase-1 SDs typically depend on earlier work. Verify execution order.'
      );
    }
  } else if (Array.isArray(deps) && deps.length > 0) {
    const invalidDeps = deps.filter(d =>
      typeof d !== 'string' || !d.startsWith('SD-')
    );

    if (invalidDeps.length > 0) {
      result.warnings.push(
        `PRD-Readiness: ${invalidDeps.length} invalid dependency format(s). ` +
        'Dependencies should be SD IDs like "SD-FOUNDATION-V3-001".'
      );
    }
  }

  if (Array.isArray(deps) && deps.length > 0 && sd.id) {
    const selfRef = deps.find(d => d === sd.id);
    if (selfRef) {
      result.warnings.push(
        'PRD-Readiness: SD references itself in dependencies (circular). Remove self-reference.'
      );
    }
  }

  return result;
}

/**
 * Scope Structure Validation
 * Checks for clear IN SCOPE / OUT OF SCOPE sections
 * @param {Object} sd - Strategic Directive data
 * @returns {Object} Result with warnings
 */
export function validateScopeStructure(sd) {
  const result = { warnings: [] };
  const scopeText = (sd.scope || '').toLowerCase();

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
 * Success Criteria Actionability Check
 * Verifies criteria are specific and verifiable
 * @param {Object} sd - Strategic Directive data
 * @returns {Object} Result with warnings
 */
export function validateSuccessCriteriaActionability(sd) {
  const result = { warnings: [] };

  let criteria = [];
  try {
    criteria = Array.isArray(sd.success_criteria) ? sd.success_criteria :
      (typeof sd.success_criteria === 'string' ? JSON.parse(sd.success_criteria || '[]') : []);
  } catch (_e) {
    return result;
  }

  if (criteria.length === 0) return result;

  const actionablePatterns = [
    /\bpass(es)?\b/i,
    /\bcompile[sd]?\b/i,
    /\bno\s+\w+\s+errors?\b/i,
    /\d+%/,
    /\breturns?\b/i,
    /\bexists?\b/i,
    /\bvisible\b/i,
    /\bworks?\b/i,
    /\bcan\s+\w+/i,
    /\bshows?\b/i,
    /\bdisplays?\b/i,
    /\bcomplete[sd]?\b/i,
    /\bfunctional\b/i,
    /\bsuccessful(ly)?\b/i
  ];

  const vaguePatterns = [
    /\bimproved?\b/i,
    /\bbetter\b/i,
    /\bnice(r)?\b/i,
    /\bgood\b/i,
    /\bclean(er)?\b/i,
    /\boptimized?\b/i
  ];

  let vagueCriteria = [];

  criteria.forEach((criterion, index) => {
    const text = typeof criterion === 'string' ? criterion :
      (criterion.description || criterion.criterion || '');

    const isActionable = actionablePatterns.some(p => p.test(text));
    const isVague = vaguePatterns.some(p => p.test(text)) && !isActionable;

    if (isVague) {
      vagueCriteria.push({ index: index + 1, text: text.substring(0, 50) });
    }
  });

  const vagueRatio = vagueCriteria.length / criteria.length;
  if (vagueRatio > 0.3) {
    result.warnings.push(
      `PRD-Readiness: ${vagueCriteria.length}/${criteria.length} success criteria may be hard to verify. ` +
      `Examples: "${vagueCriteria[0]?.text}...". ` +
      'Consider adding measurable targets (e.g., "≥80% coverage", "loads in <2s").'
    );
  }

  return result;
}

/**
 * Implementation Context Metadata Check
 * Validates that helpful implementation hints exist in metadata
 * @param {Object} sd - Strategic Directive data
 * @returns {Object} Result with warnings
 */
export function validateImplementationContext(sd) {
  const result = { warnings: [] };

  if (sd.sd_type === 'documentation') return result;

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

/**
 * Async Dependency Validation
 * Validates that referenced SDs actually exist in the database
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive data
 * @returns {Promise<Object>} Result with warnings
 */
export async function validateDependenciesExist(supabase, sd) {
  const result = { warnings: [] };
  let deps = sd.dependencies;

  // Parse dependencies if it's a string
  if (typeof deps === 'string') {
    try {
      deps = JSON.parse(deps);
    } catch {
      return result; // Invalid JSON, skip validation
    }
  }

  if (!Array.isArray(deps) || deps.length === 0) {
    return result;
  }

  // Extract SD IDs from dependencies (handle both string and object formats)
  const depIds = deps
    .map(d => typeof d === 'string' ? d.match(/^(SD-[A-Z0-9-]+)/)?.[1] : d?.sd_id)
    .filter(Boolean);

  if (depIds.length === 0) {
    return result;
  }

  try {
    const { data: existingDeps, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, title')
      .or(depIds.map(d => `id.eq.${d},sd_key.eq.${d}`).join(','));

    if (error) {
      result.warnings.push(
        `PRD-Readiness: Could not verify dependencies exist (DB error: ${error.message})`
      );
      return result;
    }

    const existingIds = new Set([
      ...(existingDeps || []).map(d => d.id),
      ...(existingDeps || []).map(d => d.sd_key)
    ]);

    const missingDeps = depIds.filter(d => !existingIds.has(d));

    if (missingDeps.length > 0) {
      result.warnings.push(
        `PRD-Readiness: ${missingDeps.length} dependency SD(s) not found in database: ` +
        `${missingDeps.join(', ')}. Verify SD IDs are correct.`
      );
    }

    const incompleteDeps = (existingDeps || []).filter(d =>
      d.status !== 'completed' && d.status !== 'done'
    );

    if (incompleteDeps.length > 0 && incompleteDeps.length === depIds.length) {
      result.warnings.push(
        `PRD-Readiness: All ${incompleteDeps.length} dependencies are not yet completed. ` +
        'PLAN should verify dependency work is sufficiently complete before starting.'
      );
    }

  } catch (depError) {
    result.warnings.push(
      `PRD-Readiness: Dependency validation error: ${depError.message}`
    );
  }

  return result;
}
