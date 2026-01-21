/**
 * Strategic Directive Validation
 * Core validation logic for SD completeness
 *
 * Extracted from verify-handoff-lead-to-plan.js for modularity
 * SD-LEO-REFACTOR-VERIFY-L2P-001
 */

import {
  SD_REQUIREMENTS,
  RISK_KEYWORDS,
  TARGET_APP_PATTERNS,
  SMART_KEYWORDS
} from './constants.js';
import { autoDetectSdType } from './type-detection.js';

/**
 * Validate Strategic Directive completeness
 * @param {Object} sd - Strategic Directive data
 * @returns {Object} Validation result with score, errors, warnings
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
  validateStrategicObjectives(sd, validation);

  // Validate success metrics OR success_criteria (20 points)
  validateSuccessMetrics(sd, validation);

  // Validate key principles (10 points)
  if (sd.key_principles) {
    validation.score += 10;
  } else {
    validation.errors.push('Missing key principles');
    validation.valid = false;
  }

  // Validate risks (10 points)
  validateRisks(sd, validation);

  // Early validation gates
  validateTargetApplication(sd, validation);
  validateSmartCriteria(sd, validation);
  validateSdTypeClassification(sd, validation);

  validation.percentage = Math.round(validation.score);
  return validation;
}

/**
 * Validate strategic objectives field
 */
function validateStrategicObjectives(sd, validation) {
  if (!sd.strategic_objectives) return;

  const objectivesText = sd.strategic_objectives.toString();

  if (typeof sd.strategic_objectives === 'string' && objectivesText.length >= 100) {
    validation.score += 20;
  } else if (Array.isArray(sd.strategic_objectives)) {
    if (sd.strategic_objectives.length >= SD_REQUIREMENTS.minimumObjectives) {
      validation.score += 20;

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

/**
 * Validate success metrics/criteria field
 */
function validateSuccessMetrics(sd, validation) {
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
    } catch (_e) {
      metrics = [metricsSource];
    }

    if (Array.isArray(metrics) && metrics.length >= SD_REQUIREMENTS.minimumMetrics) {
      validation.score += 20;

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
}

/**
 * Validate risks field
 */
function validateRisks(sd, validation) {
  if (sd.risks !== undefined && sd.risks !== null) {
    validation.score += 10;

    const textToCheck = `${sd.title || ''} ${sd.scope || ''}`.toLowerCase();
    const seemsHighRisk = RISK_KEYWORDS.some(kw => textToCheck.includes(kw));
    const risksArray = Array.isArray(sd.risks) ? sd.risks : [];

    if (seemsHighRisk && risksArray.length === 0) {
      validation.warnings.push('risks array is empty but SD keywords suggest potential risks. Consider documenting risks.');
    }
  } else {
    validation.errors.push('Missing risk assessment (risks field)');
    validation.valid = false;
  }
}

/**
 * Validate target application matches scope
 */
function validateTargetApplication(sd, validation) {
  if (!sd.target_application || !sd.scope) return;

  const scope = (sd.scope || '').toLowerCase();
  const targetApp = sd.target_application;

  const suggestsEHG = TARGET_APP_PATTERNS.ehg.some(p => scope.includes(p));
  const suggestsEngineer = TARGET_APP_PATTERNS.engineer.some(p => scope.includes(p));

  if (suggestsEHG && !suggestsEngineer && targetApp === 'EHG_Engineer') {
    validation.warnings.push('target_application is \'EHG_Engineer\' but scope suggests UI/frontend work (EHG app). Verify target_application is correct.');
  } else if (suggestsEngineer && !suggestsEHG && targetApp === 'EHG') {
    validation.warnings.push('target_application is \'EHG\' but scope suggests tooling/infrastructure work (EHG_Engineer). Verify target_application is correct.');
  }
}

/**
 * Validate SMART criteria in objectives
 */
function validateSmartCriteria(sd, validation) {
  if (!sd.strategic_objectives || !Array.isArray(sd.strategic_objectives)) return;

  let smartObjectiveCount = 0;

  sd.strategic_objectives.forEach(obj => {
    const objText = (typeof obj === 'string' ? obj : obj.description || '').toLowerCase();
    const hasSmart = SMART_KEYWORDS.some(kw => objText.includes(kw));

    if (hasSmart) {
      smartObjectiveCount++;
    }
  });

  const smartRatio = smartObjectiveCount / sd.strategic_objectives.length;

  if (smartRatio < 0.5) {
    validation.warnings.push(`Only ${Math.round(smartRatio * 100)}% of strategic_objectives have SMART criteria (Owner/Target/Baseline/Deadline). Consider enhancing objectives for measurability.`);
  }
}

/**
 * Validate SD type classification matches scope
 */
function validateSdTypeClassification(sd, validation) {
  if (!sd.sd_type || !sd.scope) return;

  const detectedType = autoDetectSdType(sd);

  if (detectedType.type !== sd.sd_type && detectedType.confidence >= 0.70) {
    const confidencePercent = Math.round(detectedType.confidence * 100);
    validation.warnings.push(
      `sd_type is '${sd.sd_type}' but scope suggests '${detectedType.type}' (${confidencePercent}% confidence). ` +
      `Matched keywords: ${detectedType.matchedKeywords.join(', ')}. ` +
      'Verify sd_type is correct - wrong classification affects validation requirements.'
    );
  }
}

/**
 * Validate strategic feasibility
 * @param {Object} sd - Strategic Directive data
 * @returns {Object} Feasibility check result
 */
export function validateFeasibility(sd) {
  const check = {
    passed: true,
    issues: []
  };

  // Check for unrealistic timelines in key principles
  if (sd.key_principles) {
    try {
      const principles = typeof sd.key_principles === 'string'
        ? JSON.parse(sd.key_principles)
        : sd.key_principles;

      const timelineConstraint = Array.isArray(principles)
        ? principles.find(c => c.type === 'timeline' || c.title?.toLowerCase().includes('time'))
        : null;

      if (timelineConstraint && timelineConstraint.value) {
        const timeline = timelineConstraint.value.toLowerCase();
        if (timeline.includes('1 day') || timeline.includes('immediate')) {
          check.issues.push('Timeline constraint may be unrealistic for comprehensive implementation');
        }
      }
    } catch (_e) {
      // Ignore JSON parsing errors
    }
  }

  // Check priority vs complexity alignment
  if (sd.priority === 'LOW' && sd.description?.length > 500) {
    check.issues.push('Low priority directive with high complexity description - consider priority adjustment');
  }

  // Validate risk mitigation
  if (sd.risks) {
    try {
      const risks = typeof sd.risks === 'string' ? JSON.parse(sd.risks) : sd.risks;
      if (Array.isArray(risks)) {
        const highRisks = risks.filter(r => r.level === 'HIGH' || r.severity === 'HIGH');
        const withMitigation = highRisks.filter(r => r.mitigation || r.response);

        if (highRisks.length > 0 && withMitigation.length < highRisks.length) {
          check.issues.push('High-risk items lack mitigation strategies');
        }
      }
    } catch (_e) {
      // Ignore JSON parsing errors
    }
  }

  // Only fail for critical feasibility issues
  if (check.issues.some(issue => issue.includes('unrealistic') || issue.includes('lack mitigation'))) {
    check.passed = false;
  }

  return check;
}
