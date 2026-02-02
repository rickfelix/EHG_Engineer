/**
 * EvidencePack Validation (Contract A2)
 * SD-LEO-SELF-IMPROVE-002B: Phase 2 - Self-Discovery Infrastructure
 *
 * Validates evidence packs per Contract A2 requirements:
 * 1. Path must exist in the repository
 * 2. Line ranges must be valid (start <= end, positive integers)
 * 3. At least one implementation-level evidence required (docs/tests insufficient)
 *
 * Evidence hierarchy: implementation > test > doc
 */

import { existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';

/**
 * Evidence types ordered by priority (highest first)
 */
export const EVIDENCE_TYPES = {
  IMPLEMENTATION: 'implementation',
  TEST: 'test',
  DOC: 'doc'
};

/**
 * Evidence type priority (higher = more authoritative)
 */
export const EVIDENCE_PRIORITY = {
  [EVIDENCE_TYPES.IMPLEMENTATION]: 3,
  [EVIDENCE_TYPES.TEST]: 2,
  [EVIDENCE_TYPES.DOC]: 1
};

/**
 * Validation result structure
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the evidence pack is valid
 * @property {string[]} errors - List of validation errors
 * @property {string[]} warnings - List of validation warnings
 * @property {Object} summary - Summary of evidence types found
 */

/**
 * Single evidence item structure
 * @typedef {Object} EvidenceItem
 * @property {string} path - File path relative to repo root
 * @property {number} line_start - Starting line number (1-indexed)
 * @property {number} line_end - Ending line number (1-indexed)
 * @property {string} snippet - Code/text snippet
 * @property {string} evidence_type - 'implementation' | 'test' | 'doc'
 */

/**
 * Validate a single evidence item
 *
 * @param {EvidenceItem} item - Evidence item to validate
 * @param {string} repoRoot - Repository root directory
 * @param {number} index - Index of item in pack (for error messages)
 * @returns {Object} Validation result for this item
 */
function validateEvidenceItem(item, repoRoot, index) {
  const errors = [];
  const warnings = [];

  // Check required fields
  if (!item.path) {
    errors.push(`Item ${index}: Missing required field 'path'`);
  }

  if (item.line_start === undefined || item.line_start === null) {
    errors.push(`Item ${index}: Missing required field 'line_start'`);
  }

  if (item.line_end === undefined || item.line_end === null) {
    errors.push(`Item ${index}: Missing required field 'line_end'`);
  }

  if (!item.evidence_type) {
    errors.push(`Item ${index}: Missing required field 'evidence_type'`);
  }

  // If required fields missing, return early
  if (errors.length > 0) {
    return { errors, warnings, type: null };
  }

  // Rule 1: Path must exist
  const fullPath = isAbsolute(item.path)
    ? item.path
    : resolve(repoRoot, item.path);

  if (!existsSync(fullPath)) {
    errors.push(`Item ${index}: Path does not exist: ${item.path}`);
  }

  // Security check: Prevent path traversal
  const normalizedPath = resolve(repoRoot, item.path);
  if (!normalizedPath.startsWith(resolve(repoRoot))) {
    errors.push(`Item ${index}: Path traversal detected: ${item.path}`);
  }

  // Rule 2: Line ranges must be valid
  if (typeof item.line_start !== 'number' || !Number.isInteger(item.line_start)) {
    errors.push(`Item ${index}: line_start must be a positive integer`);
  } else if (item.line_start < 1) {
    errors.push(`Item ${index}: line_start must be >= 1 (got ${item.line_start})`);
  }

  if (typeof item.line_end !== 'number' || !Number.isInteger(item.line_end)) {
    errors.push(`Item ${index}: line_end must be a positive integer`);
  } else if (item.line_end < 1) {
    errors.push(`Item ${index}: line_end must be >= 1 (got ${item.line_end})`);
  }

  if (typeof item.line_start === 'number' && typeof item.line_end === 'number') {
    if (item.line_start > item.line_end) {
      errors.push(`Item ${index}: line_start (${item.line_start}) > line_end (${item.line_end})`);
    }
  }

  // Validate evidence_type
  const validTypes = Object.values(EVIDENCE_TYPES);
  if (!validTypes.includes(item.evidence_type)) {
    errors.push(`Item ${index}: Invalid evidence_type '${item.evidence_type}'. Must be one of: ${validTypes.join(', ')}`);
  }

  // Warnings for missing optional fields
  if (!item.snippet) {
    warnings.push(`Item ${index}: Missing 'snippet' field (recommended for context)`);
  }

  return {
    errors,
    warnings,
    type: item.evidence_type
  };
}

/**
 * Validate an evidence pack per Contract A2
 *
 * @param {EvidenceItem[]} evidencePack - Array of evidence items
 * @param {Object} options - Validation options
 * @param {string} [options.repoRoot=process.cwd()] - Repository root directory
 * @param {boolean} [options.requireImplementation=true] - Require at least one implementation evidence
 * @returns {ValidationResult} Validation result
 */
export function validateEvidencePack(evidencePack, options = {}) {
  const {
    repoRoot = process.cwd(),
    requireImplementation = true
  } = options;

  const result = {
    valid: true,
    errors: [],
    warnings: [],
    summary: {
      total: 0,
      byType: {
        [EVIDENCE_TYPES.IMPLEMENTATION]: 0,
        [EVIDENCE_TYPES.TEST]: 0,
        [EVIDENCE_TYPES.DOC]: 0
      },
      hasImplementation: false,
      highestPriority: null
    }
  };

  // Check if evidence pack is an array
  if (!Array.isArray(evidencePack)) {
    result.valid = false;
    result.errors.push('Evidence pack must be an array');
    return result;
  }

  // Check if evidence pack is empty
  if (evidencePack.length === 0) {
    result.valid = false;
    result.errors.push('Evidence pack cannot be empty');
    return result;
  }

  result.summary.total = evidencePack.length;

  // Validate each item
  for (let i = 0; i < evidencePack.length; i++) {
    const item = evidencePack[i];
    const itemResult = validateEvidenceItem(item, repoRoot, i);

    result.errors.push(...itemResult.errors);
    result.warnings.push(...itemResult.warnings);

    // Count evidence types
    if (itemResult.type && !itemResult.errors.length) {
      result.summary.byType[itemResult.type] = (result.summary.byType[itemResult.type] || 0) + 1;

      // Track highest priority
      const priority = EVIDENCE_PRIORITY[itemResult.type];
      if (!result.summary.highestPriority || priority > EVIDENCE_PRIORITY[result.summary.highestPriority]) {
        result.summary.highestPriority = itemResult.type;
      }
    }
  }

  // Rule 3: At least one implementation-level evidence required
  result.summary.hasImplementation = result.summary.byType[EVIDENCE_TYPES.IMPLEMENTATION] > 0;

  if (requireImplementation && !result.summary.hasImplementation) {
    result.errors.push(
      'Contract A2 violation: At least one implementation-level evidence required. ' +
      `Found: ${result.summary.byType[EVIDENCE_TYPES.DOC]} doc, ` +
      `${result.summary.byType[EVIDENCE_TYPES.TEST]} test, ` +
      `${result.summary.byType[EVIDENCE_TYPES.IMPLEMENTATION]} implementation`
    );
  }

  // Set final validity
  result.valid = result.errors.length === 0;

  return result;
}

/**
 * Create a valid evidence item (helper for routine authors)
 *
 * @param {Object} params - Evidence item parameters
 * @param {string} params.path - File path relative to repo root
 * @param {number} params.line_start - Starting line number (1-indexed)
 * @param {number} params.line_end - Ending line number (1-indexed)
 * @param {string} params.snippet - Code/text snippet
 * @param {string} params.evidence_type - 'implementation' | 'test' | 'doc'
 * @returns {EvidenceItem} Formatted evidence item
 */
export function createEvidenceItem({ path, line_start, line_end, snippet, evidence_type }) {
  return {
    path,
    line_start,
    line_end,
    snippet: snippet || '',
    evidence_type: evidence_type || EVIDENCE_TYPES.IMPLEMENTATION
  };
}

export default validateEvidencePack;
