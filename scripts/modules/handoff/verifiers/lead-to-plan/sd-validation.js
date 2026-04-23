/**
 * SD Validation Functions for LEAD-TO-PLAN Verifier
 *
 * Validates Strategic Directive completeness for PLAN phase handoff.
 *
 * Extracted from the legacy verify-handoff-lead-to-plan script (now removed) for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

/**
 * Deduplicate metrics array by identity fields before counting.
 *
 * SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-D Fix 3:
 *   literal-duplicate entries in success_metrics (common in auto-generated
 *   SDs) inflate the minimumMetrics count.  Two entries with the same
 *   identity subset (metric name + target + measurement) are considered
 *   the same unique metric and collapsed.
 *
 * Non-object entries dedup by their full JSON form.
 * Object entries dedup only by identity fields; irrelevant fields like
 * `owner` do not participate in uniqueness.
 *
 * Gated by env var FLEET_METRICS_DEDUP — set to 'false' to disable.
 *
 * @param {Array} metrics - Input metrics array (possibly with duplicates)
 * @returns {Array} - Array of unique metrics in first-seen order
 */
export function dedupMetrics(metrics) {
  if (!Array.isArray(metrics)) return metrics;
  if (process.env.FLEET_METRICS_DEDUP === 'false') return metrics;

  const seen = new Set();
  const unique = [];
  for (const m of metrics) {
    let key;
    if (!m || typeof m !== 'object') {
      key = JSON.stringify(m);
    } else {
      // Use only identity fields (metric name, target/goal, measurement).
      // Accepts both success_metrics shape (metric/target/measurement) and
      // success_criteria shape (criterion/measure/goal).
      key = JSON.stringify({
        metric: m.metric ?? m.criterion ?? null,
        target: m.target ?? m.goal ?? null,
        measurement: m.measurement ?? m.measure ?? null
      });
    }
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }
  return unique;
}

/**
 * Shared metrics-sufficiency check.
 *
 * SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-D Fix 1:
 *   Canonical implementation of the minimumMetrics + measurability +
 *   dedup (Fix 3) check.  Both the LEAD-TO-PLAN verifier AND the
 *   GATE_SD_METRICS_SUFFICIENCY gate call this function so precheck
 *   (gates only) and execute (gates + verifier) agree.
 *
 * @param {Object} sd - Strategic Directive
 * @returns {{ pass: boolean, uniqueCount: number, originalCount: number,
 *            collapsedCount: number, issues: string[], warnings: string[] }}
 */
export function validateMetricsSufficiency(sd) {
  const hasSuccessMetrics = sd.success_metrics &&
    (Array.isArray(sd.success_metrics) ? sd.success_metrics.length > 0 : sd.success_metrics);
  const hasSuccessCriteria = sd.success_criteria &&
    (typeof sd.success_criteria === 'string' ? sd.success_criteria.length > 0 :
     Array.isArray(sd.success_criteria) ? sd.success_criteria.length > 0 : sd.success_criteria);
  const metricsSource = hasSuccessMetrics ? sd.success_metrics :
                        hasSuccessCriteria ? sd.success_criteria : null;

  if (!metricsSource) {
    return {
      pass: false,
      uniqueCount: 0, originalCount: 0, collapsedCount: 0,
      issues: ['Missing success_metrics or success_criteria'],
      warnings: []
    };
  }

  let metrics = [];
  try {
    metrics = Array.isArray(metricsSource)
      ? metricsSource
      : (typeof metricsSource === 'string' ? JSON.parse(metricsSource) : []);
  } catch (e) {
    console.debug('[SDValidation] metrics parse suppressed:', e?.message || e);
    metrics = [metricsSource];
  }

  // Fix 3: dedup before comparison
  const uniqueMetrics = dedupMetrics(metrics);
  const originalCount = Array.isArray(metrics) ? metrics.length : 0;
  const uniqueCount = Array.isArray(uniqueMetrics) ? uniqueMetrics.length : 0;
  const collapsedCount = originalCount - uniqueCount;
  const warnings = [];

  if (!Array.isArray(uniqueMetrics) || uniqueCount < SD_REQUIREMENTS.minimumMetrics) {
    const dupNote = collapsedCount > 0
      ? ` (${originalCount} entries collapsed to ${uniqueCount} unique after dedup — add distinct metrics rather than copies)`
      : '';
    return {
      pass: false,
      uniqueCount, originalCount, collapsedCount,
      issues: [`Insufficient success_metrics/criteria: ${uniqueCount}/${SD_REQUIREMENTS.minimumMetrics}${dupNote}`],
      warnings
    };
  }

  // Measurable-target warning
  if (uniqueMetrics.length > 0 && typeof uniqueMetrics[0] === 'object') {
    const measurableCount = uniqueMetrics.filter(m => m.target || m.goal).length;
    if (measurableCount < uniqueMetrics.length * 0.8) {
      warnings.push('Some success metrics lack measurable targets');
    }
  }
  if (collapsedCount > 0) {
    warnings.push(`Dedup collapsed ${collapsedCount} duplicate metric(s) — SD still meets minimumMetrics with ${uniqueCount} unique.`);
  }

  return {
    pass: true,
    uniqueCount, originalCount, collapsedCount,
    issues: [], warnings
  };
}

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
  // SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-D Fix 1:
  //   delegated to validateMetricsSufficiency() so the same logic runs in
  //   both the verifier (here) and the GATE_SD_METRICS_SUFFICIENCY gate
  //   (called during precheck).  This eliminates precheck/execute drift.
  const metricsResult = validateMetricsSufficiency(sd);
  if (metricsResult.pass) {
    validation.score += 20;
    validation.warnings.push(...metricsResult.warnings);
  } else {
    validation.errors.push(...metricsResult.issues);
    validation.warnings.push(...metricsResult.warnings);
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
