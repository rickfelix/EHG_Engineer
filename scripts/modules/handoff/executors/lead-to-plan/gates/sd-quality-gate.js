/**
 * SD Quality Gate for LEAD-TO-PLAN
 * SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001-A
 *
 * BLOCKING gate that validates SD field completeness, content quality,
 * and structural correctness before proceeding to PLAN phase.
 *
 * Ensures SDs entering PLAN have sufficient substance for meaningful PRD creation.
 *
 * SD-LEARN-FIX-ADDRESS-PAT-AUTO-069: Refactored to use shared scoring module.
 * Scoring logic now lives in scripts/modules/sd-quality-scoring.js.
 */

import {
  SD_TYPE_THRESHOLDS,
  DEFAULT_THRESHOLD,
  JSONB_FIELDS,
  computeQualityScore,
  wordCount,
} from '../../../../sd-quality-scoring.js';

/**
 * Build an actionable remediation report from collected issues and warnings.
 */
function buildRemediationReport(issues, warnings) {
  const lines = [];

  if (issues.length > 0) {
    lines.push('ISSUES (must fix):');
    for (const issue of issues) {
      lines.push(`  - ${issue}`);
    }
  }

  if (warnings.length > 0) {
    lines.push('WARNINGS (recommended):');
    for (const warning of warnings) {
      lines.push(`  - ${warning}`);
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

  // Use shared scoring logic
  const result = computeQualityScore(sd);

  // Log results
  console.log(`   Field completeness: ${result.details.completeness.populated}/${JSONB_FIELDS.length} populated (${result.details.completeness.score}/40 pts)`);
  console.log(`   Content quality: ${result.details.content.score}/30 pts`);
  console.log(`   Structural quality: ${result.details.structure.score}/30 pts`);
  console.log(`   Total: ${result.score}/100`);

  if (result.issues.length > 0) {
    console.log(`\n   ❌ ${result.issues.length} blocking issue(s):`);
    for (const issue of result.issues) {
      console.log(`      - ${issue}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log(`   ⚠️  ${result.warnings.length} warning(s):`);
    for (const warning of result.warnings) {
      console.log(`      - ${warning}`);
    }
  }

  // PAT-AUTO-bcc45c54: Near-threshold diagnostics
  const deficit = threshold.passingScore - result.score;
  if (deficit > 0 && deficit <= 10) {
    console.log(`\n   📊 NEAR-THRESHOLD DIAGNOSTIC (${deficit} point(s) below passing score of ${threshold.passingScore}):`);
    const improvements = [];
    if (result.details.completeness.score < 40) {
      const fieldDeficit = threshold.requiredFields - result.details.completeness.populated;
      if (fieldDeficit > 0) improvements.push(`Populate ${fieldDeficit} more JSONB field(s) for up to +${Math.min(fieldDeficit * 5, 40 - result.details.completeness.score)} completeness points`);
    }
    if (result.details.content.score < 30) {
      const descWords = wordCount(sd.description);
      if (descWords < threshold.minDescriptionWords) {
        improvements.push(`Add ${threshold.minDescriptionWords - descWords} more words to description for up to +20 content points`);
      }
      if (result.details.content.score < 20) {
        improvements.push('Add scope with in-scope/out-of-scope boundaries for up to +10 content points');
      }
    }
    if (result.details.structure.score < 30) {
      improvements.push(`Convert plain string entries in success_criteria/key_changes to structured objects for up to +${30 - result.details.structure.score} structure points`);
    }
    for (const imp of improvements) {
      console.log(`      → ${imp}`);
    }
  }

  if (!result.pass && (result.issues.length > 0 || result.warnings.length > 0)) {
    console.log('\n   Remediation Report:');
    console.log(buildRemediationReport(result.issues, result.warnings));
  }

  return {
    pass: result.pass,
    score: result.score,
    max_score: result.max_score,
    issues: result.issues,
    warnings: result.warnings,
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
