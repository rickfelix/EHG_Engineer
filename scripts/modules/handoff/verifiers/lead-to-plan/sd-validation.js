/**
 * SD Validation Functions for LEAD-TO-PLAN Verifier
 *
 * Validates Strategic Directive completeness for PLAN phase handoff.
 *
 * Extracted from scripts/verify-handoff-lead-to-plan.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

/**
 * SD Quality Requirements (LEO Protocol v4.3.3)
 */
export const SD_REQUIREMENTS = {
  minimumScore: 90, // Required fields (30) + objectives (20) + metrics (20) + principles (10) + risks (10) = 90
  requiredFields: [
    'title',
    'description',
    'scope',                 // What the SD will implement
    'strategic_objectives',  // Updated from business_objectives
    // Note: success_metrics OR success_criteria accepted (checked separately)
    'key_principles',        // Updated from constraints
    // Note: risks checked separately (can be empty array for low-risk SDs)
    'priority'
  ],
  // Alternate field names (accept either)
  alternateFields: {
    success_metrics: 'success_criteria',  // Accept success_criteria as alternative
  },
  minimumObjectives: 2,
  minimumMetrics: 3,  // Applies to success_metrics OR success_criteria
  minimumConstraints: 1
};

/**
 * Validate Strategic Directive completeness
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} - Validation result with valid, score, errors, warnings
 */
export function validateStrategicDirective(sd) {
  const validation = {
    valid: true,
    score: 0,
    maxScore: 100,
    errors: [],
    warnings: []
  };

  // Check required fields (40 points)
  SD_REQUIREMENTS.requiredFields.forEach(field => {
    if (!sd[field] || !sd[field].toString().trim()) {
      validation.valid = false;
      validation.errors.push(`Missing required field: ${field}`);
    } else {
      validation.score += 5;
    }
  });

  // Validate strategic objectives (20 points)
  if (sd.strategic_objectives) {
    const objectivesText = sd.strategic_objectives.toString();

    // Accept either JSON array or markdown text (minimum 100 chars for quality)
    if (typeof sd.strategic_objectives === 'string' && objectivesText.length >= 100) {
      validation.score += 20;
    } else if (Array.isArray(sd.strategic_objectives)) {
      if (sd.strategic_objectives.length >= SD_REQUIREMENTS.minimumObjectives) {
        validation.score += 20;

        // Check objective quality
        sd.strategic_objectives.forEach(obj => {
          if (obj.description && obj.description.length < 20) {
            validation.warnings.push(`Objective "${obj.title || 'unnamed'}" description is too brief`);
          }
        });
      } else {
        validation.errors.push(`Insufficient strategic objectives: ${sd.strategic_objectives.length}/${SD_REQUIREMENTS.minimumObjectives}`);
        validation.valid = false;
      }
    } else if (objectivesText.length < 100) {
      validation.errors.push('Strategic objectives text is too brief (minimum 100 characters)');
      validation.valid = false;
    }
  }

  // Validate success metrics OR success_criteria (20 points)
  const hasSuccessMetrics = sd.success_metrics &&
    (Array.isArray(sd.success_metrics) ? sd.success_metrics.length > 0 : sd.success_metrics);
  const hasSuccessCriteria = sd.success_criteria &&
    (typeof sd.success_criteria === 'string' ? sd.success_criteria.length > 0 :
     Array.isArray(sd.success_criteria) ? sd.success_criteria.length > 0 : sd.success_criteria);
  const metricsSource = hasSuccessMetrics ? sd.success_metrics :
                        hasSuccessCriteria ? sd.success_criteria : null;
  if (metricsSource) {
    let metrics = [];
    try {
      metrics = Array.isArray(metricsSource)
        ? metricsSource
        : (typeof metricsSource === 'string' ? JSON.parse(metricsSource) : []);
    } catch {
      // If parsing fails, treat as single item
      metrics = [metricsSource];
    }

    if (Array.isArray(metrics) && metrics.length >= SD_REQUIREMENTS.minimumMetrics) {
      validation.score += 20;

      // Check for measurable metrics (only if objects with target/goal)
      if (metrics.length > 0 && typeof metrics[0] === 'object') {
        let measurableCount = 0;
        metrics.forEach(metric => {
          if (metric.target || metric.goal) {
            measurableCount++;
          }
        });

        if (measurableCount < metrics.length * 0.8) {
          validation.warnings.push('Some success metrics lack measurable targets');
        }
      }
    } else {
      validation.errors.push(`Insufficient success metrics/criteria: ${metrics?.length || 0}/${SD_REQUIREMENTS.minimumMetrics}`);
      validation.valid = false;
    }
  } else {
    validation.errors.push('Missing success_metrics or success_criteria');
    validation.valid = false;
  }

  // Validate key principles (10 points)
  if (sd.key_principles) {
    validation.score += 10;
  } else {
    validation.errors.push('Missing key principles');
    validation.valid = false;
  }

  // Validate risks (10 points) - allow empty array for low-risk SDs
  if (sd.risks !== undefined && sd.risks !== null) {
    validation.score += 10;

    // Warn if empty but SD seems high-risk based on keywords
    const riskKeywords = ['migration', 'security', 'auth', 'production', 'data', 'schema'];
    const textToCheck = `${sd.title || ''} ${sd.scope || ''}`.toLowerCase();
    const seemsHighRisk = riskKeywords.some(kw => textToCheck.includes(kw));
    const risksArray = Array.isArray(sd.risks) ? sd.risks : [];

    if (seemsHighRisk && risksArray.length === 0) {
      validation.warnings.push('risks array is empty but SD keywords suggest potential risks. Consider documenting risks.');
    }
  } else {
    validation.errors.push('Missing risk assessment (risks field)');
    validation.valid = false;
  }

  validation.percentage = Math.round(validation.score);
  return validation;
}

/**
 * Validate target_application vs scope alignment
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {string[]} - Array of warnings
 */
export function validateTargetApplicationAlignment(sd) {
  const warnings = [];

  if (sd.target_application && sd.scope) {
    const scope = (sd.scope || '').toLowerCase();
    const targetApp = sd.target_application;

    // Patterns that suggest EHG app (frontend/UI work)
    const ehgPatterns = ['ui', 'component', 'form', 'page', 'dialog', 'dashboard', 'stage', 'frontend', 'react'];
    // Patterns that suggest EHG_Engineer (tooling/infrastructure)
    const engineerPatterns = ['script', 'tooling', 'migration', 'protocol', 'handoff', 'agent', 'cli', 'database migration'];

    const suggestsEHG = ehgPatterns.some(p => scope.includes(p));
    const suggestsEngineer = engineerPatterns.some(p => scope.includes(p));

    if (suggestsEHG && !suggestsEngineer && targetApp === 'EHG_Engineer') {
      warnings.push('target_application is \'EHG_Engineer\' but scope suggests UI/frontend work (EHG app). Verify target_application is correct.');
    } else if (suggestsEngineer && !suggestsEHG && targetApp === 'EHG') {
      warnings.push('target_application is \'EHG\' but scope suggests tooling/infrastructure work (EHG_Engineer). Verify target_application is correct.');
    }
  }

  return warnings;
}

/**
 * Validate strategic objectives SMART criteria
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {string[]} - Array of warnings
 */
export function validateSmartObjectives(sd) {
  const warnings = [];

  if (sd.strategic_objectives && Array.isArray(sd.strategic_objectives)) {
    const smartKeywords = ['owner:', 'target:', 'baseline:', 'deadline:', 'due:'];
    let smartObjectiveCount = 0;

    sd.strategic_objectives.forEach((obj) => {
      const objText = (typeof obj === 'string' ? obj : obj.description || '').toLowerCase();
      const hasSmart = smartKeywords.some(kw => objText.includes(kw));

      if (hasSmart) {
        smartObjectiveCount++;
      }
    });

    const smartRatio = smartObjectiveCount / sd.strategic_objectives.length;

    if (smartRatio < 0.5) {
      warnings.push(`Only ${Math.round(smartRatio * 100)}% of strategic_objectives have SMART criteria (Owner/Target/Baseline/Deadline). Consider enhancing objectives for measurability.`);
    }
  }

  return warnings;
}
