/**
 * Shared SD Quality Scoring Logic
 * SD-LEARN-FIX-ADDRESS-PAT-AUTO-069
 *
 * Single source of truth for SD field quality scoring.
 * Used by both GATE_SD_QUALITY (handoff gate) and validateSDFields (creation-time).
 */

/**
 * Per-sd_type threshold configuration.
 * Defines how many of the 8 JSONB fields must be populated per SD type.
 */
export const SD_TYPE_THRESHOLDS = {
  feature:        { requiredFields: 8, minDescriptionWords: 100, passingScore: 70 },
  security:       { requiredFields: 8, minDescriptionWords: 100, passingScore: 70 },
  infrastructure: { requiredFields: 6, minDescriptionWords: 50,  passingScore: 65 },
  enhancement:    { requiredFields: 6, minDescriptionWords: 50,  passingScore: 65 },
  refactor:       { requiredFields: 5, minDescriptionWords: 50,  passingScore: 60 },
  fix:            { requiredFields: 4, minDescriptionWords: 50,  passingScore: 60 },
  documentation:  { requiredFields: 3, minDescriptionWords: 30,  passingScore: 55 },
};

export const DEFAULT_THRESHOLD = { requiredFields: 5, minDescriptionWords: 50, passingScore: 65 };

/**
 * The 8 JSONB array fields checked for completeness.
 */
export const JSONB_FIELDS = [
  'strategic_objectives',
  'dependencies',
  'implementation_guidelines',
  'success_criteria',
  'success_metrics',
  'key_changes',
  'key_principles',
  'risks',
];

/**
 * Structural validation rules for specific JSONB fields.
 * Entries should be objects with these keys, not plain strings.
 */
export const STRUCTURAL_RULES = {
  success_criteria: { expectedKeys: ['criterion', 'measure'], label: '{criterion, measure}' },
  key_changes:      { expectedKeys: ['change', 'impact'],     label: '{change, impact}' },
};

/**
 * Check if a JSONB field is populated (non-null, non-empty array).
 */
export function isPopulated(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Count words in a string.
 */
export function wordCount(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Validate field completeness across the 8 JSONB arrays.
 * @returns {{ populatedCount: number, issues: Array, warnings: Array, score: number }}
 */
export function checkFieldCompleteness(sd, threshold) {
  const issues = [];
  const warnings = [];
  let populatedCount = 0;
  const missingFields = [];

  for (const field of JSONB_FIELDS) {
    const value = sd[field];
    if (isPopulated(value)) {
      populatedCount++;
    } else {
      const issueType = value === null || value === undefined ? 'missing' : 'empty';
      missingFields.push({ field, type: issueType });
    }
  }

  if (populatedCount < threshold.requiredFields) {
    for (const { field, type } of missingFields) {
      issues.push({
        field,
        type,
        message: `${field} is ${type} (${type === 'missing' ? 'null' : 'empty array'})`,
      });
    }
  } else if (missingFields.length > 0) {
    for (const { field, type } of missingFields) {
      warnings.push({
        field,
        type,
        message: `${field} is ${type} — not required for ${sd.sd_type || 'this'} SD type but recommended`,
      });
    }
  }

  const completenessScore = Math.round((populatedCount / threshold.requiredFields) * 40);
  const cappedScore = Math.min(completenessScore, 40);

  return { populatedCount, issues, warnings, score: cappedScore };
}

/**
 * Validate content quality: description depth and scope boundaries.
 * @returns {{ issues: Array, warnings: Array, score: number }}
 */
export function checkContentQuality(sd, threshold) {
  const issues = [];
  const warnings = [];
  let score = 0;

  const descWords = wordCount(sd.description);
  if (descWords < threshold.minDescriptionWords) {
    issues.push({
      field: 'description',
      type: 'too_short',
      message: `description is ${descWords} words (minimum ${threshold.minDescriptionWords} for ${sd.sd_type || 'unknown'} SDs)`,
    });
  } else {
    score += 20;
  }

  const scope = sd.scope || '';
  const scopeWords = wordCount(scope);
  if (scopeWords > 0) {
    const hasInScope = /in[- ]?scope/i.test(scope);
    const hasOutOfScope = /out[- ]?of[- ]?scope/i.test(scope) || /exclud/i.test(scope) || /not included/i.test(scope);
    if (hasInScope || hasOutOfScope) {
      score += 10;
    } else if (scopeWords >= 20) {
      score += 5;
      warnings.push({
        field: 'scope',
        type: 'no_boundaries',
        message: 'scope field lacks explicit in-scope/out-of-scope boundaries',
      });
    }
  } else {
    warnings.push({
      field: 'scope',
      type: 'empty',
      message: 'scope field is empty - consider defining boundaries',
    });
  }

  return { issues, warnings, score: Math.min(score, 30) };
}

/**
 * Validate structural quality of JSONB entries.
 * @returns {{ issues: Array, warnings: Array, score: number }}
 */
export function checkStructuralQuality(sd) {
  const issues = [];
  const warnings = [];
  let score = 30;

  for (const [field, rule] of Object.entries(STRUCTURAL_RULES)) {
    const value = sd[field];
    if (!isPopulated(value)) continue;

    let stringOnlyCount = 0;

    for (const entry of value) {
      if (typeof entry === 'string') {
        stringOnlyCount++;
      } else if (typeof entry === 'object' && entry !== null) {
        const hasExpectedKeys = rule.expectedKeys.some(key => key in entry);
        if (!hasExpectedKeys) {
          stringOnlyCount++;
        }
      }
    }

    if (stringOnlyCount > 0) {
      const deduction = Math.min(15, stringOnlyCount * 5);
      score -= deduction;
      warnings.push({
        field,
        type: 'wrong_structure',
        message: `${field}: ${stringOnlyCount}/${value.length} entries are plain strings instead of ${rule.label} objects`,
        example: `Expected format: ${JSON.stringify(Object.fromEntries(rule.expectedKeys.map(k => [k, '...'])))}`,
      });
    }
  }

  return { issues, warnings, score: Math.max(score, 0) };
}

/**
 * Compute the full quality score for an SD.
 * @param {Object} sd - Strategic Directive record (or SD-like data object)
 * @returns {{ pass: boolean, score: number, max_score: number, issues: string[], warnings: string[], details: Object }}
 */
export function computeQualityScore(sd) {
  const sdType = sd.sd_type || 'feature';
  const threshold = SD_TYPE_THRESHOLDS[sdType] || DEFAULT_THRESHOLD;

  const completeness = checkFieldCompleteness(sd, threshold);
  const content = checkContentQuality(sd, threshold);
  const structure = checkStructuralQuality(sd);

  const allIssues = [...completeness.issues, ...content.issues, ...structure.issues];
  const allWarnings = [...completeness.warnings, ...content.warnings, ...structure.warnings];
  const totalScore = completeness.score + content.score + structure.score;

  const pass = totalScore >= threshold.passingScore && allIssues.length === 0;

  return {
    pass,
    score: totalScore,
    max_score: 100,
    threshold: threshold.passingScore,
    issues: allIssues.map(i => i.message),
    warnings: allWarnings.map(w => w.message),
    details: {
      completeness: { populated: completeness.populatedCount, required: threshold.requiredFields, score: completeness.score },
      content: { score: content.score },
      structure: { score: structure.score },
    },
  };
}
