/**
 * Schema Pre-Flight Validation Module
 * SD-LEO-ORCH-SELF-HEALING-DATABASE-001-B
 *
 * Validates database operation parameters against live schema
 * before execution. Fail-open: returns valid=true on any error.
 */

'use strict';

const { getTableSchema } = require('./schema-cache.cjs');

/**
 * Maps JavaScript typeof values to compatible PostgreSQL types.
 * Key: JS typeof result, Value: array of compatible PG udt_name values.
 */
const JS_TO_PG_TYPE_MAP = {
  string: ['varchar', 'text', 'uuid', 'char', 'bpchar', 'name', 'citext', 'timestamptz', 'timestamp', 'date', 'time', 'timetz', 'interval', 'inet', 'jsonb', 'json'],
  number: ['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'money', 'oid'],
  boolean: ['bool'],
  object: ['jsonb', 'json', 'timestamptz', 'timestamp', 'date'], // objects include Date, arrays, plain objects
};

/**
 * Check if a JS value type is compatible with a PG column type.
 * @param {*} value - The JS value
 * @param {object} columnMeta - Column metadata from schema cache
 * @returns {{compatible: boolean, reason?: string}}
 */
function checkTypeCompatibility(value, columnMeta) {
  if (value === null || value === undefined) {
    if (columnMeta.is_nullable === 'NO' && columnMeta.column_default === null) {
      return { compatible: false, reason: `Column is NOT NULL with no default` };
    }
    return { compatible: true };
  }

  const jsType = typeof value;
  const pgType = columnMeta.udt_name;

  // Arrays are typeof 'object' but may target jsonb
  if (Array.isArray(value)) {
    if (pgType === 'jsonb' || pgType === 'json') {
      return { compatible: true };
    }
    return { compatible: false, reason: `Array value incompatible with ${pgType}` };
  }

  // Date objects
  if (value instanceof Date) {
    if (['timestamptz', 'timestamp', 'date'].includes(pgType)) {
      return { compatible: true };
    }
    return { compatible: false, reason: `Date value incompatible with ${pgType}` };
  }

  const compatibleTypes = JS_TO_PG_TYPE_MAP[jsType];
  if (!compatibleTypes) {
    // Unknown JS type — pass through (fail-open for edge cases)
    return { compatible: true };
  }

  if (compatibleTypes.includes(pgType)) {
    return { compatible: true };
  }

  return {
    compatible: false,
    reason: `JS ${jsType} incompatible with PG ${columnMeta.data_type} (${pgType})`,
  };
}

/**
 * Detect JSONB double-stringification.
 * @param {*} value
 * @param {object} columnMeta
 * @returns {string|null} Warning message or null
 */
function detectDoubleStringification(value, columnMeta) {
  if (typeof value !== 'string') return null;
  if (columnMeta.udt_name !== 'jsonb' && columnMeta.udt_name !== 'json') return null;

  // Check if the string looks like JSON (starts with [ or {)
  const trimmed = value.trim();
  if ((trimmed.startsWith('[') || trimmed.startsWith('{')) && (trimmed.endsWith(']') || trimmed.endsWith('}'))) {
    try {
      JSON.parse(trimmed);
      return `JSONB column "${columnMeta.column_name || 'unknown'}" received a JSON string instead of a native object/array — likely double-stringified via JSON.stringify()`;
    } catch {
      // Not valid JSON string, no issue
    }
  }
  return null;
}

/**
 * Validate a database operation's parameters against the live schema.
 *
 * @param {string} tableName - Target table name
 * @param {string} operation - Operation type: 'select', 'insert', 'update', 'delete', 'upsert'
 * @param {object} params - Key-value pairs of column names to values
 * @param {object} [options]
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabaseClient]
 * @returns {Promise<{valid: boolean, errors: string[], warnings: string[]}>}
 */
async function validateOperation(tableName, operation, params, options = {}) {
  try {
    const columns = await getTableSchema(tableName, options.supabaseClient);

    if (columns === null) {
      return {
        valid: false,
        errors: [`Table not found: ${tableName}`],
        warnings: [],
      };
    }

    const errors = [];
    const warnings = [];

    if (!params || typeof params !== 'object') {
      return { valid: true, errors: [], warnings: ['No params to validate'] };
    }

    for (const [paramName, paramValue] of Object.entries(params)) {
      const columnMeta = columns.get(paramName);

      // Unknown column check
      if (!columnMeta) {
        errors.push(`Unknown column: ${paramName}`);
        continue;
      }

      // Type compatibility check
      const typeCheck = checkTypeCompatibility(paramValue, columnMeta);
      if (!typeCheck.compatible) {
        errors.push(`Type mismatch on "${paramName}": ${typeCheck.reason}`);
      }

      // JSONB double-stringification detection
      const doubleStringWarning = detectDoubleStringification(paramValue, {
        ...columnMeta,
        column_name: paramName,
      });
      if (doubleStringWarning) {
        warnings.push(doubleStringWarning);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (err) {
    // Fail-open: on any unexpected error, allow the operation
    return {
      valid: true,
      errors: [],
      warnings: [`schema validation skipped: ${err.message}`],
    };
  }
}

module.exports = { validateOperation };
