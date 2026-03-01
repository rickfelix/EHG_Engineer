/**
 * JSONB Validation — Factory, Singleton & Utilities
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-E
 *
 * Provides:
 *  - getJsonbRegistry() — singleton access
 *  - createJsonbRegistry() — factory with all schemas loaded
 *  - validateBeforeInsert() — pre-insert validation utility
 *  - verifyWriteback() — post-write read-back verification
 */

import { JsonbSchemaRegistry } from './jsonb-schema-registry.js';
import { registerStrategicDirectivesSchemas } from './schemas/strategic-directives.js';
import { registerProductRequirementsSchemas } from './schemas/product-requirements.js';
import { registerHandoffSchemas } from './schemas/sd-phase-handoffs.js';
import { registerVisionScoreSchemas } from './schemas/eva-vision-scores.js';

// Singleton instance
let _instance = null;

/**
 * Get the singleton JsonbSchemaRegistry with all schemas loaded
 * @returns {JsonbSchemaRegistry}
 */
export function getJsonbRegistry() {
  if (!_instance) {
    _instance = createJsonbRegistry();
  }
  return _instance;
}

/**
 * Create a new JsonbSchemaRegistry with all built-in schemas
 * @returns {JsonbSchemaRegistry}
 */
export function createJsonbRegistry() {
  const registry = new JsonbSchemaRegistry();
  registerStrategicDirectivesSchemas(registry);
  registerProductRequirementsSchemas(registry);
  registerHandoffSchemas(registry);
  registerVisionScoreSchemas(registry);
  registry._loadedAt = Date.now();
  return registry;
}

/**
 * Validate data before inserting into a Supabase table
 * @param {string} table - Target table name
 * @param {object} data - Row data to validate
 * @param {object} [options]
 * @param {boolean} [options.strict=false] - If true, auto-parsed strings are errors
 * @returns {{valid: boolean, errors: string[], warnings: string[], sanitized: object}}
 */
export function validateBeforeInsert(table, data, options = {}) {
  const registry = getJsonbRegistry();

  if (!registry.has(table)) {
    return {
      valid: true,
      errors: [],
      warnings: [`No JSONB schemas registered for table: ${table}`],
      sanitized: data,
    };
  }

  const result = registry.validate(table, data);

  if (options.strict && result.warnings.length > 0) {
    // In strict mode, auto-parsed warnings become errors
    const promoted = result.warnings.filter(w => w.includes('auto-parsed'));
    result.errors.push(...promoted.map(w => w.replace('auto-parsed', 'STRICT: string-to-JSONB not allowed')));
    result.valid = result.errors.length === 0;
  }

  return result;
}

/**
 * Verify a write by reading back the row and comparing JSONB fields
 * @param {object} supabase - Supabase client
 * @param {string} table - Table name
 * @param {string} idColumn - Primary key column name
 * @param {string} idValue - Primary key value
 * @param {object} writtenData - The data that was written
 * @returns {Promise<{match: boolean, mismatches: Array<{field: string, written: *, readBack: *}>}>}
 */
export async function verifyWriteback(supabase, table, idColumn, idValue, writtenData) {
  if (!supabase) {
    return { match: false, mismatches: [{ field: '_connection', written: null, readBack: 'No supabase client' }] };
  }

  const registry = getJsonbRegistry();
  const fields = registry.getFieldsForTable(table);

  if (fields.length === 0) {
    return { match: true, mismatches: [] };
  }

  // Only select JSONB fields that were in the written data
  const relevantFields = fields.filter(f => f in writtenData);
  if (relevantFields.length === 0) {
    return { match: true, mismatches: [] };
  }

  try {
    const selectFields = [idColumn, ...relevantFields].join(', ');
    const { data, error } = await supabase
      .from(table)
      .select(selectFields)
      .eq(idColumn, idValue)
      .single();

    if (error) {
      return { match: false, mismatches: [{ field: '_query', written: null, readBack: error.message }] };
    }

    if (!data) {
      return { match: false, mismatches: [{ field: '_row', written: idValue, readBack: 'Row not found' }] };
    }

    const mismatches = [];
    for (const field of relevantFields) {
      const written = JSON.stringify(writtenData[field]);
      const readBack = JSON.stringify(data[field]);

      if (written !== readBack) {
        mismatches.push({
          field,
          written: writtenData[field],
          readBack: data[field],
        });
      }
    }

    return { match: mismatches.length === 0, mismatches };
  } catch (err) {
    return { match: false, mismatches: [{ field: '_exception', written: null, readBack: err.message }] };
  }
}

/**
 * JSONB type guard — rejects JSON.stringify'd strings passed to JSONB columns.
 * Returns { safe: true, value } for valid JSONB data (objects/arrays/null),
 * or { safe: false, error, parsed? } for string-typed data.
 *
 * @param {*} value - Value intended for a JSONB column
 * @param {string} [fieldName] - Optional field name for error messages
 * @returns {{safe: boolean, value?: *, error?: string, parsed?: *}}
 */
export function isJsonbSafe(value, fieldName = 'unknown') {
  // null/undefined are valid JSONB values
  if (value == null) {
    return { safe: true, value };
  }

  // Objects and arrays are valid JSONB
  if (typeof value === 'object') {
    return { safe: true, value };
  }

  // Strings are NOT valid — JSONB columns should receive objects/arrays
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return {
        safe: false,
        error: `${fieldName}: received string instead of object/array — value is JSON.stringify'd`,
        parsed,
      };
    } catch {
      return {
        safe: false,
        error: `${fieldName}: received non-JSON string for JSONB column`,
      };
    }
  }

  // Numbers/booleans are technically valid JSONB but unusual for our schema
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { safe: true, value };
  }

  return {
    safe: false,
    error: `${fieldName}: unexpected type ${typeof value} for JSONB column`,
  };
}

export { JsonbSchemaRegistry } from './jsonb-schema-registry.js';
