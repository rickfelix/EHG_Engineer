/**
 * Genesis Virtual Bunker - Pattern Assembler
 *
 * Slot-based pattern composition without regex.
 * Part of SD-GENESIS-V31-MASON-P2
 *
 * @module lib/genesis/pattern-assembler
 */

import { getPatternByName, getPatternById, getPatternByType } from './pattern-library.js';

/**
 * Slot delimiter used for variable substitution.
 * Using double curly braces to avoid conflicts with JSX.
 */
export const SLOT_PREFIX = '{{';
export const SLOT_SUFFIX = '}}';

/**
 * Substitute slot values in a template string without using regex.
 *
 * @param {string} template - Template string with {{variable}} slots
 * @param {Object} values - Key-value pairs for substitution
 * @returns {string} - Template with values substituted
 */
export function substituteSlots(template, values = {}) {
  let result = template;

  for (const [key, value] of Object.entries(values)) {
    const slot = SLOT_PREFIX + key + SLOT_SUFFIX;
    // Use split/join for substitution (no regex)
    result = result.split(slot).join(String(value));
  }

  return result;
}

/**
 * Check if a template has any unresolved slots.
 *
 * @param {string} template - Template string to check
 * @returns {{ hasUnresolved: boolean, slots: string[] }}
 */
export function checkUnresolvedSlots(template) {
  const slots = [];
  let searchStart = 0;

  while (true) {
    const startIdx = template.indexOf(SLOT_PREFIX, searchStart);
    if (startIdx === -1) break;

    const endIdx = template.indexOf(SLOT_SUFFIX, startIdx + SLOT_PREFIX.length);
    if (endIdx === -1) break;

    const slotName = template.slice(startIdx + SLOT_PREFIX.length, endIdx);
    if (!slots.includes(slotName)) {
      slots.push(slotName);
    }
    searchStart = endIdx + SLOT_SUFFIX.length;
  }

  return {
    hasUnresolved: slots.length > 0,
    slots,
  };
}

/**
 * Assemble a pattern with provided values.
 *
 * @param {string} patternName - Name of the pattern to assemble
 * @param {Object} values - Values for slot substitution
 * @returns {Promise<{ code: string, error: Error|null }>}
 */
export async function assemblePattern(patternName, values = {}) {
  const { data: pattern, error } = await getPatternByName(patternName);

  if (error || !pattern) {
    return {
      code: null,
      error: error || new Error(`Pattern not found: ${patternName}`),
    };
  }

  const code = substituteSlots(pattern.template_code, values);
  const { hasUnresolved, slots } = checkUnresolvedSlots(code);

  if (hasUnresolved) {
    return {
      code,
      warning: `Unresolved slots: ${slots.join(', ')}`,
      error: null,
    };
  }

  return { code, error: null };
}

/**
 * Assemble a pattern by ID.
 *
 * @param {string} patternId - UUID of the pattern
 * @param {Object} values - Values for slot substitution
 * @returns {Promise<{ code: string, error: Error|null }>}
 */
export async function assemblePatternById(patternId, values = {}) {
  const { data: pattern, error } = await getPatternById(patternId);

  if (error || !pattern) {
    return {
      code: null,
      error: error || new Error(`Pattern not found: ${patternId}`),
    };
  }

  const code = substituteSlots(pattern.template_code, values);
  return { code, error: null };
}

/**
 * Compose multiple patterns into a single output.
 *
 * @param {Array<{ pattern: string, values: Object, separator?: string }>} compositions
 * @returns {Promise<{ code: string, errors: Error[] }>}
 */
export async function composePatterns(compositions) {
  const results = [];
  const errors = [];

  for (const { pattern, values, separator: _separator = '\n\n' } of compositions) {
    const { code, error } = await assemblePattern(pattern, values);

    if (error) {
      errors.push(error);
    } else if (code) {
      results.push(code);
    }
  }

  return {
    code: results.join('\n\n'),
    errors,
  };
}

/**
 * Create a pattern template with slot markers.
 * Helper for creating new patterns with proper slot syntax.
 *
 * @param {string} code - Base code with variable names
 * @param {string[]} variables - Variable names to convert to slots
 * @returns {string} - Template code with {{variable}} slots
 */
export function createTemplate(code, variables) {
  let template = code;

  for (const variable of variables) {
    // Replace variable occurrences with slot syntax
    // Uses split/join (no regex)
    template = template.split(variable).join(SLOT_PREFIX + variable + SLOT_SUFFIX);
  }

  return template;
}

/**
 * Extract slot names from a template.
 *
 * @param {string} template - Template string
 * @returns {string[]} - Array of slot names
 */
export function extractSlots(template) {
  return checkUnresolvedSlots(template).slots;
}

/**
 * Validate that all required slots have values.
 *
 * @param {string} template - Template string
 * @param {Object} values - Provided values
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateSlotValues(template, values) {
  const requiredSlots = extractSlots(template);
  const providedKeys = Object.keys(values);
  const missing = requiredSlots.filter(slot => !providedKeys.includes(slot));

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Assemble all patterns of a given type with the same values.
 * Useful for generating multiple related files.
 *
 * @param {string} patternType - Type of patterns to assemble
 * @param {Object} values - Values for all patterns
 * @returns {Promise<{ results: Array<{ name: string, code: string }>, errors: Error[] }>}
 */
export async function assembleByType(patternType, values = {}) {
  const { data: patterns, error } = await getPatternByType(patternType);

  if (error) {
    return { results: [], errors: [error] };
  }

  const results = [];
  const errors = [];

  for (const pattern of patterns) {
    const code = substituteSlots(pattern.template_code, values);
    results.push({
      name: pattern.pattern_name,
      code,
      type: pattern.pattern_type,
    });
  }

  return { results, errors };
}

export default {
  substituteSlots,
  checkUnresolvedSlots,
  assemblePattern,
  assemblePatternById,
  composePatterns,
  createTemplate,
  extractSlots,
  validateSlotValues,
  assembleByType,
  SLOT_PREFIX,
  SLOT_SUFFIX,
};
