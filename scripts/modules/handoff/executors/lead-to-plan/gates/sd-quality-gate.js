/**
 * SD Quality Gate for LEAD-TO-PLAN
 * SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001-A
 *
 * BLOCKING gate that validates SD field completeness, content quality,
 * and structural correctness before proceeding to PLAN phase.
 *
 * Ensures SDs entering PLAN have sufficient substance for meaningful PRD creation.
 */

/**
 * Per-sd_type threshold configuration.
 * Defines how many of the 8 JSONB fields must be populated per SD type.
 */
const SD_TYPE_THRESHOLDS = {
  feature:        { requiredFields: 8, minDescriptionWords: 100, passingScore: 70 },
  security:       { requiredFields: 8, minDescriptionWords: 100, passingScore: 70 },
  infrastructure: { requiredFields: 6, minDescriptionWords: 50,  passingScore: 65 },
  enhancement:    { requiredFields: 6, minDescriptionWords: 50,  passingScore: 65 },
  refactor:       { requiredFields: 5, minDescriptionWords: 50,  passingScore: 60 },
  fix:            { requiredFields: 4, minDescriptionWords: 50,  passingScore: 60 },
  documentation:  { requiredFields: 3, minDescriptionWords: 30,  passingScore: 55 },
};

const DEFAULT_THRESHOLD = { requiredFields: 5, minDescriptionWords: 50, passingScore: 65 };

/**
 * The 8 JSONB array fields checked for completeness.
 */
const JSONB_FIELDS = [
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
const STRUCTURAL_RULES = {
  success_criteria: { expectedKeys: ['criterion', 'measure'], label: '{criterion, measure}' },
  key_changes:      { expectedKeys: ['change', 'impact'],     label: '{change, impact}' },
};

/**
 * Check if a JSONB field is populated (non-null, non-empty array).
 */
function isPopulated(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Count words in a string.
 */
function wordCount(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Validate field completeness across the 8 JSONB arrays.
 */
function checkFieldCompleteness(sd, threshold) {
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

  // Only flag missing fields as issues if total populated is below threshold
  if (populatedCount < threshold.requiredFields) {
    for (const { field, type } of missingFields) {
      issues.push({
        field,
        type,
        message: `${field} is ${type} (${type === 'missing' ? 'null' : 'empty array'})`,
      });
    }
  } else if (missingFields.length > 0) {
    // Enough fields populated but some still missing — warn only
    for (const { field, type } of missingFields) {
      warnings.push({
        field,
        type,
        message: `${field} is ${type} — not required for ${sd.sd_type || 'this'} SD type but recommended`,
      });
    }
  }

  // Score: proportion of populated fields relative to requirement
  const completenessScore = Math.round((populatedCount / threshold.requiredFields) * 40);
  const cappedScore = Math.min(completenessScore, 40); // max 40 points from completeness

  return { populatedCount, issues, warnings, score: cappedScore };
}

/**
 * Validate content quality: description depth and scope boundaries.
 */
function checkContentQuality(sd, threshold) {
  const issues = [];
  const warnings = [];
  let score = 0;

  // Description word count
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

  // Scope field check for boundary markers
  const scope = sd.scope || '';
  const scopeWords = wordCount(scope);
  if (scopeWords > 0) {
    const hasInScope = /in[- ]?scope/i.test(scope);
    const hasOutOfScope = /out[- ]?of[- ]?scope/i.test(scope) || /exclud/i.test(scope) || /not included/i.test(scope);
    if (hasInScope || hasOutOfScope) {
      score += 10;
    } else if (scopeWords >= 20) {
      score += 5; // Has substance but no explicit boundaries
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

  return { issues, warnings, score: Math.min(score, 30) }; // max 30 points from content
}

/**
 * Validate structural quality of JSONB entries.
 * Checks that entries use proper object structure rather than plain strings.
 */
function checkStructuralQuality(sd) {
  const issues = [];
  const warnings = [];
  let score = 30; // Start with full structural score, deduct for issues

  for (const [field, rule] of Object.entries(STRUCTURAL_RULES)) {
    const value = sd[field];
    if (!isPopulated(value)) continue;

    let stringOnlyCount = 0;
    let wellStructuredCount = 0;

    for (const entry of value) {
      if (typeof entry === 'string') {
        stringOnlyCount++;
      } else if (typeof entry === 'object' && entry !== null) {
        const hasExpectedKeys = rule.expectedKeys.some(key => key in entry);
        if (hasExpectedKeys) {
          wellStructuredCount++;
        } else {
          stringOnlyCount++; // Object but missing expected keys
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

  return { issues, warnings, score: Math.max(score, 0) }; // max 30 points from structure
}

/**
 * Build an actionable remediation report from collected issues and warnings.
 */
function buildRemediationReport(issues, warnings) {
  const lines = [];

  if (issues.length > 0) {
    lines.push('ISSUES (must fix):');
    for (const issue of issues) {
      lines.push(`  - [${issue.type}] ${issue.field}: ${issue.message}`);
      if (issue.example) {
        lines.push(`    Example: ${issue.example}`);
      }
    }
  }

  if (warnings.length > 0) {
    lines.push('WARNINGS (recommended):');
    for (const warning of warnings) {
      lines.push(`  - [${warning.type}] ${warning.field}: ${warning.message}`);
      if (warning.example) {
        lines.push(`    Example: ${warning.example}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Validate SD quality for LEAD-TO-PLAN handoff.
 *
 * Checks:
 * 1. Field completeness (8 JSONB arrays) - 40 points
 * 2. Content quality (description depth, scope) - 30 points
 * 3. Structural quality (object shape) - 30 points
 *
 * @param {Object} sd - Strategic Directive record
 * @returns {Object} Validation result {pass, score, max_score, issues, warnings}
 */
export async function validateSdQuality(sd) {
  const sdType = sd.sd_type || 'feature';
  const threshold = SD_TYPE_THRESHOLDS[sdType] || DEFAULT_THRESHOLD;

  console.log(`   SD type: ${sdType} (requires ${threshold.requiredFields}/8 fields, ${threshold.minDescriptionWords}+ word description)`);

  // Run all three checks
  const completeness = checkFieldCompleteness(sd, threshold);
  const content = checkContentQuality(sd, threshold);
  const structure = checkStructuralQuality(sd);

  // Combine results
  const allIssues = [...completeness.issues, ...content.issues, ...structure.issues];
  const allWarnings = [...completeness.warnings, ...content.warnings, ...structure.warnings];
  const totalScore = completeness.score + content.score + structure.score;

  // Log results
  console.log(`   Field completeness: ${completeness.populatedCount}/${JSONB_FIELDS.length} populated (${completeness.score}/40 pts)`);
  console.log(`   Content quality: ${content.score}/30 pts`);
  console.log(`   Structural quality: ${structure.score}/30 pts`);
  console.log(`   Total: ${totalScore}/100`);

  if (allIssues.length > 0) {
    console.log(`\n   ❌ ${allIssues.length} blocking issue(s):`);
    for (const issue of allIssues) {
      console.log(`      - ${issue.field}: ${issue.message}`);
    }
  }

  if (allWarnings.length > 0) {
    console.log(`   ⚠️  ${allWarnings.length} warning(s):`);
    for (const warning of allWarnings) {
      console.log(`      - ${warning.field}: ${warning.message}`);
    }
  }

  const pass = totalScore >= threshold.passingScore && allIssues.length === 0;

  // PAT-AUTO-bcc45c54: Near-threshold diagnostics — show actionable guidance
  // when score is within 10 points of passing to help orchestrators enrich SDs
  const deficit = threshold.passingScore - totalScore;
  if (deficit > 0 && deficit <= 10) {
    console.log(`\n   📊 NEAR-THRESHOLD DIAGNOSTIC (${deficit} point(s) below passing score of ${threshold.passingScore}):`);
    const improvements = [];
    if (completeness.score < 40) {
      const fieldDeficit = threshold.requiredFields - completeness.populatedCount;
      if (fieldDeficit > 0) improvements.push(`Populate ${fieldDeficit} more JSONB field(s) for up to +${Math.min(fieldDeficit * 5, 40 - completeness.score)} completeness points`);
    }
    if (content.score < 30) {
      const descWords = wordCount(sd.description);
      if (descWords < threshold.minDescriptionWords) {
        improvements.push(`Add ${threshold.minDescriptionWords - descWords} more words to description for up to +20 content points`);
      }
      if (content.score < 20) {
        improvements.push(`Add scope with in-scope/out-of-scope boundaries for up to +10 content points`);
      }
    }
    if (structure.score < 30) {
      improvements.push(`Convert plain string entries in success_criteria/key_changes to structured objects for up to +${30 - structure.score} structure points`);
    }
    for (const imp of improvements) {
      console.log(`      → ${imp}`);
    }
  }

  if (!pass && (allIssues.length > 0 || allWarnings.length > 0)) {
    console.log(`\n   Remediation Report:`);
    console.log(buildRemediationReport(allIssues, allWarnings));
  }

  return {
    pass,
    score: totalScore,
    max_score: 100,
    issues: allIssues.map(i => i.message),
    warnings: allWarnings.map(w => w.message),
  };
}

/**
 * Create the SD quality gate for LEAD-TO-PLAN pipeline.
 *
 * @returns {Object} Gate configuration
 */
export function createSdQualityGate() {
  return {
    name: 'GATE_SD_QUALITY',
    validator: async (ctx) => {
      console.log('\n📊 GATE: SD Quality Validation');
      console.log('-'.repeat(50));
      return validateSdQuality(ctx.sd);
    },
    required: true, // BLOCKING gate
    remediation: 'Enrich the SD with populated JSONB fields (strategic_objectives, dependencies, success_criteria, key_changes, risks), a detailed description meeting the word count minimum for this SD type, and proper object structures ({criterion, measure} for success_criteria, {change, impact} for key_changes).',
  };
}
