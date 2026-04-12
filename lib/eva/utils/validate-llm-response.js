/**
 * Validate parsed LLM response against a stage-specific schema.
 *
 * Called AFTER parseJSON succeeds — validates structure, not syntax.
 * Pure JS, zero dependencies, deterministic.
 *
 * SD-LLM-CONTRACT-PIPELINE-TEST-ORCH-001-A
 *
 * @param {Object} parsed - Parsed JSON from LLM response
 * @param {Object} schema - Schema definition (see stage-response-schemas.js)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateLLMResponse(parsed, schema) {
  const errors = [];

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, errors: ['Response is null or not an object'] };
  }

  if (!schema || typeof schema !== 'object') {
    return { valid: true, errors: [] };
  }

  for (const [field, rule] of Object.entries(schema)) {
    if (!rule.required) continue;

    const value = parsed[field];

    // Check presence
    if (value === undefined || value === null) {
      errors.push(`Missing required field: ${field}`);
      continue;
    }

    // Check type
    if (rule.type === 'array' && !Array.isArray(value)) {
      errors.push(`Field "${field}" must be an array, got ${typeof value}`);
      continue;
    }
    if (rule.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      errors.push(`Field "${field}" must be an object, got ${Array.isArray(value) ? 'array' : typeof value}`);
      continue;
    }
    if (rule.type === 'string' && typeof value !== 'string') {
      errors.push(`Field "${field}" must be a string, got ${typeof value}`);
      continue;
    }
    if (rule.type === 'number' && typeof value !== 'number') {
      errors.push(`Field "${field}" must be a number, got ${typeof value}`);
      continue;
    }

    // Check minLength for arrays
    if (rule.type === 'array' && rule.minLength && value.length < rule.minLength) {
      errors.push(`Field "${field}" must have at least ${rule.minLength} items, got ${value.length}`);
    }

    // Check nested fields (items schema for arrays)
    if (rule.type === 'array' && rule.items && Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (!item || typeof item !== 'object') continue;
        for (const [nestedField, nestedRule] of Object.entries(rule.items)) {
          if (nestedRule.required && (item[nestedField] === undefined || item[nestedField] === null)) {
            errors.push(`${field}[${i}] missing required field: ${nestedField}`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
