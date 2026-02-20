/**
 * PRD Field Pre-Validator
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-034 / PAT-AUTO-516d5d5e, PAT-AUTO-471ca922
 *
 * Validates a PRD object has all 7 required fields with non-boilerplate content
 * before PLAN-TO-EXEC handoff attempt. Prevents "PRD quality 51/100" gate failures
 * by surfacing missing fields early.
 *
 * Usage:
 *   import { validatePRDFields } from './scripts/prd/validate-prd-fields.js';
 *   const result = validatePRDFields(prdObject);
 *   if (!result.valid) console.warn(result.warnings.join('\n'));
 */

const REQUIRED_FIELDS = [
  'executive_summary',
  'functional_requirements',
  'system_architecture',
  'acceptance_criteria',
  'test_scenarios',
  'implementation_approach',
  'risks',
];

const BOILERPLATE_PATTERNS = [
  /^(to be defined|tbd|to be determined|will be defined|pending|n\/a|not applicable)$/i,
  /^<[^>]+>$/,  // Template placeholders like <description>
  /^\[.*\]$/,   // Brackets-only content like [placeholder]
];

const MIN_ARRAY_LENGTH = 3;
const MIN_STRING_LENGTH = 50;

function isBoilerplate(value) {
  if (typeof value === 'string') {
    return BOILERPLATE_PATTERNS.some(p => p.test(value.trim()));
  }
  return false;
}

function checkField(fieldName, value) {
  if (value === null || value === undefined) {
    return `${fieldName}: MISSING (null/undefined)`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `${fieldName}: EMPTY array`;
    if (value.length < MIN_ARRAY_LENGTH) return `${fieldName}: only ${value.length} item(s), need ≥${MIN_ARRAY_LENGTH}`;
    return null;
  }
  if (typeof value === 'string') {
    if (value.trim().length === 0) return `${fieldName}: EMPTY string`;
    if (value.trim().length < MIN_STRING_LENGTH) return `${fieldName}: too short (${value.trim().length} chars, need ≥${MIN_STRING_LENGTH})`;
    if (isBoilerplate(value)) return `${fieldName}: boilerplate content detected ("${value.trim().slice(0, 40)}...")`;
    return null;
  }
  if (typeof value === 'object') {
    if (Object.keys(value).length === 0) return `${fieldName}: EMPTY object`;
    return null;
  }
  return null;
}

/**
 * Validate a PRD object for required fields and content quality.
 * @param {Object} prd - PRD object from product_requirements_v2
 * @returns {{ valid: boolean, warnings: string[], missing: string[], lowQuality: string[] }}
 */
export function validatePRDFields(prd) {
  if (!prd || typeof prd !== 'object') {
    return { valid: false, warnings: ['PRD is null or not an object'], missing: REQUIRED_FIELDS, lowQuality: [] };
  }

  const missing = [];
  const lowQuality = [];
  const warnings = [];

  for (const field of REQUIRED_FIELDS) {
    const issue = checkField(field, prd[field]);
    if (issue) {
      if (prd[field] === null || prd[field] === undefined) {
        missing.push(field);
      } else {
        lowQuality.push(field);
      }
      warnings.push(`⚠️  ${issue}`);
    }
  }

  const valid = missing.length === 0 && lowQuality.length === 0;
  return { valid, warnings, missing, lowQuality };
}

/**
 * Print a formatted validation report. Returns exit code (0=pass, 1=fail).
 * @param {Object} prd - PRD object
 * @param {string} sdId - SD identifier for display
 * @returns {number} 0 if valid, 1 if issues found
 */
export function printPRDValidationReport(prd, sdId = 'unknown') {
  const result = validatePRDFields(prd);

  if (result.valid) {
    console.log(`✅ PRD validation passed for ${sdId} — all 7 required fields present and non-boilerplate`);
    return 0;
  }

  console.log(`\n📋 PRD Pre-Validation Report for ${sdId}`);
  console.log('─'.repeat(60));
  if (result.missing.length > 0) {
    console.log(`❌ Missing fields (${result.missing.length}): ${result.missing.join(', ')}`);
  }
  if (result.lowQuality.length > 0) {
    console.log(`⚠️  Low-quality fields (${result.lowQuality.length}): ${result.lowQuality.join(', ')}`);
  }
  console.log('\nDetails:');
  result.warnings.forEach(w => console.log(`  ${w}`));
  console.log('\n💡 Fix these before running PLAN-TO-EXEC to avoid prdQualityValidation gate failure');
  return 1;
}
