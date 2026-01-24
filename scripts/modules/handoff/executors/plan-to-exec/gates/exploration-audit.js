/**
 * Exploration Audit Gate
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * SD-LEO-GEMINI-001 (US-002): Validates that PRD has exploration_summary with documented file references
 */

import { isLightweightSDType } from '../../../validation/sd-type-applicability-policy.js';

// Thresholds for exploration rating
const MINIMUM_FILES = 3;
const ADEQUATE_FILES = 5;
const COMPREHENSIVE_FILES = 10;

/**
 * Create the GATE_EXPLORATION_AUDIT gate validator
 *
 * @param {Object} prdRepo - PRD repository instance
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} Gate configuration
 */
export function createExplorationAuditGate(prdRepo, sd) {
  return {
    name: 'GATE_EXPLORATION_AUDIT',
    validator: async () => {
      console.log('\n📚 GATE: Exploration Audit');
      console.log('-'.repeat(50));
      return validateExplorationAudit(prdRepo, sd);
    },
    required: false // Warning-only, doesn't block handoff
  };
}

/**
 * Validate exploration audit for a Strategic Directive
 *
 * @param {Object} prdRepo - PRD repository instance
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} Audit result with rating and details
 */
export async function validateExplorationAudit(prdRepo, sd) {
  try {
    // SD-LEO-FIX-COMPLETION-WORKFLOW-001: Use centralized SD type policy
    const sdType = (sd?.sd_type || '').toLowerCase();
    if (isLightweightSDType(sdType)) {
      console.log(`   ℹ️  Exploration audit skipped for ${sdType} SD type`);
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [`Exploration audit skipped for ${sdType} SD type`],
        details: { skipped: true, reason: `${sdType} SD type` }
      };
    }

    // Get PRD with exploration_summary
    // SD ID Schema Cleanup: Use sd.id directly (uuid_id deprecated)
    const prd = await prdRepo?.getBySdId(sd.id);

    if (!prd) {
      console.log('   ⚠️  No PRD found - skipping exploration audit');
      return {
        passed: true,
        score: 50,
        max_score: 100,
        issues: [],
        warnings: ['No PRD found for exploration audit'],
        details: { skipped: true, reason: 'No PRD' }
      };
    }

    // Check for exploration_summary in multiple locations (backward compatibility)
    // Priority: top-level > metadata.exploration_summary > metadata.files_explored
    let filesExplored = [];
    let source = 'none';

    if (prd.exploration_summary && Array.isArray(prd.exploration_summary)) {
      filesExplored = prd.exploration_summary;
      source = 'exploration_summary';
    } else if (prd.metadata?.exploration_summary && Array.isArray(prd.metadata.exploration_summary)) {
      // SYSTEMIC FIX: Also check metadata.exploration_summary (common storage location)
      filesExplored = prd.metadata.exploration_summary;
      source = 'metadata.exploration_summary';
    } else if (prd.metadata?.files_explored && Array.isArray(prd.metadata.files_explored)) {
      filesExplored = prd.metadata.files_explored;
      source = 'metadata.files_explored';
    } else if (sd?.metadata?.exploration_summary?.files_explored && Array.isArray(sd.metadata.exploration_summary.files_explored)) {
      // ROOT CAUSE FIX: Also check SD metadata (common storage location from update-sd-exploration.js)
      filesExplored = sd.metadata.exploration_summary.files_explored;
      source = 'sd.metadata.exploration_summary.files_explored';
    }

    const fileCount = filesExplored.length;

    console.log('   📊 Exploration Audit:');
    console.log(`      Files documented: ${fileCount}`);
    console.log(`      Source: ${source}`);

    // Determine rating
    let rating, passed, score;
    const issues = [];
    const warnings = [];

    if (fileCount >= COMPREHENSIVE_FILES) {
      rating = 'COMPREHENSIVE';
      passed = true;
      score = 100;
      console.log(`   ✅ ${rating}: Excellent exploration (${fileCount} files)`);
    } else if (fileCount >= ADEQUATE_FILES) {
      rating = 'ADEQUATE';
      passed = true;
      score = 80;
      console.log(`   ✅ ${rating}: Good exploration (${fileCount} files)`);
    } else if (fileCount >= MINIMUM_FILES) {
      rating = 'MINIMAL';
      passed = true;
      score = 60;
      warnings.push(`Exploration is minimal (${fileCount} files). EXEC may need additional context.`);
      console.log(`   ⚠️  ${rating}: Exploration is minimal (${fileCount} files)`);
      console.log('      Consider exploring more files for complex implementations');
    } else if (fileCount > 0) {
      rating = 'INSUFFICIENT';
      passed = false;
      score = 30;
      issues.push(`Exploration audit failed: Only ${fileCount} files documented, minimum ${MINIMUM_FILES} required.`);
      console.log(`   ❌ ${rating}: Only ${fileCount} files documented`);
      console.log(`      Minimum ${MINIMUM_FILES} files required. Update exploration_summary in PRD.`);
    } else {
      rating = 'NONE';
      passed = false;
      score = 0;
      issues.push('No exploration documented. Add exploration_summary to PRD with file references.');
      console.log(`   ❌ ${rating}: No exploration documented`);
      console.log('      Add exploration_summary JSONB array to PRD');
    }

    // Validate findings quality (if files exist)
    if (fileCount > 0) {
      const filesWithFindings = filesExplored.filter(f => {
        if (typeof f === 'string') return false; // Just a path, no findings
        return f.key_findings || f.findings || f.purpose;
      });

      const findingsRate = (filesWithFindings.length / fileCount) * 100;
      console.log(`      Files with findings: ${filesWithFindings.length}/${fileCount} (${findingsRate.toFixed(0)}%)`);

      if (findingsRate < 50) {
        warnings.push(`Low findings documentation rate (${findingsRate.toFixed(0)}%). Add key_findings for each file.`);
      }
    }

    // Show first few files explored
    if (fileCount > 0 && fileCount <= 10) {
      console.log('\n   📁 Files Explored:');
      filesExplored.slice(0, 10).forEach((f, i) => {
        const filePath = typeof f === 'string' ? f : (f.file_path || f.path);
        const hasFindings = typeof f === 'object' && (f.key_findings || f.findings);
        console.log(`      ${i + 1}. ${filePath} ${hasFindings ? '✓' : ''}`);
      });
    }

    return {
      passed,
      score,
      max_score: 100,
      issues,
      warnings,
      details: {
        rating,
        fileCount,
        minimumRequired: MINIMUM_FILES,
        source,
        filesExplored: filesExplored.map(f => typeof f === 'string' ? f : (f.file_path || f.path))
      }
    };

  } catch (error) {
    console.log(`   ⚠️  Exploration audit error: ${error.message}`);
    return {
      passed: true,
      score: 50,
      max_score: 100,
      issues: [],
      warnings: [`Exploration audit error: ${error.message}`],
      details: { error: error.message }
    };
  }
}

export { MINIMUM_FILES, ADEQUATE_FILES, COMPREHENSIVE_FILES };
