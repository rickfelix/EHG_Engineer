/**
 * SD Field Validation & Auto-Enrichment Utility
 * SD-LEARN-FIX-ADDRESS-PAT-AUTO-069
 *
 * Validates SD data against the same criteria used by GATE_SD_QUALITY.
 * Optionally auto-enriches structural issues (string→object conversion).
 *
 * Usage:
 *   import { validateSDFields } from './validate-sd-fields.js';
 *   const result = validateSDFields(sdData);
 *   // result.enriched contains auto-fixed fields (if any)
 */

import {
  computeQualityScore,
  STRUCTURAL_RULES,
  isPopulated,
} from './sd-quality-scoring.js';

/**
 * Auto-enrich structural issues in JSONB fields.
 * Converts plain strings to proper object structures where possible.
 *
 * @param {Object} sdData - The SD data object (mutated in place)
 * @returns {string[]} List of enrichment actions taken
 */
function autoEnrich(sdData) {
  const actions = [];

  for (const [field, rule] of Object.entries(STRUCTURAL_RULES)) {
    const value = sdData[field];
    if (!isPopulated(value)) continue;

    const enriched = value.map(entry => {
      if (typeof entry === 'string') {
        // Convert plain string to object with expected keys
        const obj = {};
        obj[rule.expectedKeys[0]] = entry;
        obj[rule.expectedKeys[1]] = 'See description for details';
        return obj;
      }
      if (typeof entry === 'object' && entry !== null) {
        const hasExpectedKeys = rule.expectedKeys.some(key => key in entry);
        if (!hasExpectedKeys) {
          // Object but missing expected keys — try to map existing keys
          const textContent = entry.text || entry.name || entry.title || entry.description || JSON.stringify(entry);
          const obj = {};
          obj[rule.expectedKeys[0]] = textContent;
          obj[rule.expectedKeys[1]] = entry.impact || entry.measure || entry.reason || 'See description for details';
          return obj;
        }
      }
      return entry;
    });

    const changedCount = value.filter((v, i) => v !== enriched[i]).length;
    if (changedCount > 0) {
      sdData[field] = enriched;
      actions.push(`${field}: converted ${changedCount} entries to ${rule.label} objects`);
    }
  }

  return actions;
}

/**
 * Validate SD fields against GATE_SD_QUALITY criteria.
 * Optionally auto-enriches structural issues.
 *
 * @param {Object} sdData - SD data object (will be mutated if enrich=true)
 * @param {Object} [options]
 * @param {boolean} [options.enrich=true] - Auto-enrich structural issues
 * @param {boolean} [options.quiet=false] - Suppress console output
 * @returns {{
 *   valid: boolean,
 *   score: number,
 *   threshold: number,
 *   issues: string[],
 *   warnings: string[],
 *   enrichments: string[],
 *   details: Object
 * }}
 */
export function validateSDFields(sdData, options = {}) {
  const { enrich = true, quiet = false } = options;
  const enrichments = [];

  // Auto-enrich before scoring (so enriched fields get scored correctly)
  if (enrich) {
    const actions = autoEnrich(sdData);
    enrichments.push(...actions);
  }

  // Compute quality score using shared logic
  const result = computeQualityScore(sdData);

  if (!quiet) {
    const sdType = sdData.sd_type || 'unknown';
    const prefix = '   [validateSDFields]';

    if (enrichments.length > 0) {
      console.log(`${prefix} Auto-enriched ${enrichments.length} field(s):`);
      for (const action of enrichments) {
        console.log(`${prefix}   ✓ ${action}`);
      }
    }

    if (result.issues.length > 0) {
      console.log(`${prefix} ⚠️  ${result.issues.length} quality issue(s) for ${sdType} SD (score: ${result.score}/${result.max_score}, threshold: ${result.threshold}):`);
      for (const issue of result.issues) {
        console.log(`${prefix}   - ${issue}`);
      }
    } else {
      console.log(`${prefix} ✅ Quality check passed (score: ${result.score}/${result.max_score}, threshold: ${result.threshold})`);
    }
  }

  return {
    valid: result.pass,
    score: result.score,
    threshold: result.threshold,
    issues: result.issues,
    warnings: result.warnings,
    enrichments,
    details: result.details,
  };
}
