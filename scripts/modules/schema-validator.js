#!/usr/bin/env node

/**
 * Schema Validation Module
 *
 * Prevents type mismatches (especially UUID vs TEXT) by validating data
 * against actual database schema before inserts.
 *
 * Created to prevent SD-KNOWLEDGE-001 Issue #1: UUID type mismatch causing silent failures
 *
 * @see docs/retrospectives/SD-KNOWLEDGE-001-completion-issues-and-prevention.md
 */

import { randomUUID } from 'crypto';

/**
 * Cache for table schemas to avoid repeated database queries
 * Format: { tableName: { columns: {...}, fetchedAt: timestamp } }
 */
const schemaCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch table schema from database
 * @param {object} supabase - Supabase client
 * @param {string} tableName - Name of the table
 * @returns {Promise<object>} - Schema object with column definitions
 */
export async function getTableSchema(supabase, tableName) {
  // Check cache first
  const cached = schemaCache.get(tableName);
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL) {
    return cached.columns;
  }

  // Query information_schema for actual column types
  const { data, error } = await supabase.rpc('get_table_schema', {
    table_name: tableName
  });

  if (error) {
    // Fallback: try direct query if RPC doesn't exist
    const _query = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = $1
      AND table_schema = 'public'
    `;

    // Use raw query since RPC failed
    throw new Error(`Schema fetch failed for ${tableName}: ${error.message}. Please create get_table_schema() RPC function.`);
  }

  // Build schema object
  const schema = {};
  if (data && data.length > 0) {
    data.forEach(col => {
      schema[col.column_name] = {
        type: col.data_type,
        nullable: col.is_nullable === 'YES',
        default: col.column_default
      };
    });
  }

  // Cache the schema
  schemaCache.set(tableName, {
    columns: schema,
    fetchedAt: Date.now()
  });

  return schema;
}

/**
 * Compare provided data type with expected schema type
 * @param {any} value - The value to validate
 * @param {object} schemaCol - Schema column definition
 * @returns {object} - { valid: boolean, expectedType: string, actualType: string, message: string }
 */
export function compareTypes(value, schemaCol) {
  if (value === null || value === undefined) {
    if (!schemaCol.nullable && !schemaCol.default) {
      return {
        valid: false,
        expectedType: schemaCol.type,
        actualType: 'null',
        message: 'Column is NOT NULL but value is null/undefined'
      };
    }
    return { valid: true };
  }

  const providedType = typeof value;
  const schemaType = schemaCol.type.toLowerCase();

  // UUID validation (most common issue from SD-KNOWLEDGE-001)
  if (schemaType === 'uuid') {
    if (providedType !== 'string') {
      return {
        valid: false,
        expectedType: 'uuid',
        actualType: providedType,
        message: `UUID column requires string, got ${providedType}`
      };
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      return {
        valid: false,
        expectedType: 'uuid',
        actualType: 'string (invalid format)',
        message: `Invalid UUID format: "${value}". Use randomUUID() from 'crypto' module.`
      };
    }

    return { valid: true };
  }

  // Text/varchar validation
  if (schemaType.includes('character') || schemaType === 'text') {
    if (providedType !== 'string') {
      return {
        valid: false,
        expectedType: 'text',
        actualType: providedType,
        message: `Text column requires string, got ${providedType}`
      };
    }
    return { valid: true };
  }

  // Integer validation
  if (schemaType.includes('integer') || schemaType.includes('int')) {
    if (providedType !== 'number' || !Number.isInteger(value)) {
      return {
        valid: false,
        expectedType: 'integer',
        actualType: providedType,
        message: `Integer column requires whole number, got ${providedType}`
      };
    }
    return { valid: true };
  }

  // Numeric/decimal validation
  if (schemaType.includes('numeric') || schemaType.includes('decimal') || schemaType.includes('real') || schemaType.includes('double')) {
    if (providedType !== 'number') {
      return {
        valid: false,
        expectedType: 'numeric',
        actualType: providedType,
        message: `Numeric column requires number, got ${providedType}`
      };
    }
    return { valid: true };
  }

  // Boolean validation
  if (schemaType === 'boolean') {
    if (providedType !== 'boolean') {
      return {
        valid: false,
        expectedType: 'boolean',
        actualType: providedType,
        message: `Boolean column requires true/false, got ${providedType}`
      };
    }
    return { valid: true };
  }

  // JSONB/JSON validation
  if (schemaType === 'jsonb' || schemaType === 'json') {
    if (providedType !== 'object' && providedType !== 'string') {
      return {
        valid: false,
        expectedType: 'jsonb',
        actualType: providedType,
        message: `JSON column requires object or string, got ${providedType}`
      };
    }
    return { valid: true };
  }

  // Timestamp validation
  if (schemaType.includes('timestamp')) {
    const isValidDate = value instanceof Date ||
                       (providedType === 'string' && !isNaN(Date.parse(value)));

    if (!isValidDate) {
      return {
        valid: false,
        expectedType: 'timestamp',
        actualType: providedType,
        message: `Timestamp column requires Date object or ISO string, got ${providedType}`
      };
    }
    return { valid: true };
  }

  // Date validation
  if (schemaType === 'date') {
    const isValidDate = value instanceof Date ||
                       (providedType === 'string' && !isNaN(Date.parse(value)));

    if (!isValidDate) {
      return {
        valid: false,
        expectedType: 'date',
        actualType: providedType,
        message: `Date column requires Date object or date string, got ${providedType}`
      };
    }
    return { valid: true };
  }

  // Array validation
  if (schemaType === 'array' || schemaType.startsWith('_')) {
    if (!Array.isArray(value)) {
      return {
        valid: false,
        expectedType: 'array',
        actualType: providedType,
        message: `Array column requires array, got ${providedType}`
      };
    }
    return { valid: true };
  }

  // Default: allow if type is reasonable
  return { valid: true };
}

/**
 * Format validation errors into descriptive message
 * @param {string} tableName - Table name
 * @param {array} mismatches - Array of mismatch objects
 * @returns {string} - Formatted error message
 */
export function formatValidationError(tableName, mismatches) {
  const header = `❌ Schema Validation Failed for table "${tableName}"`;
  const separator = '='.repeat(60);

  const details = mismatches.map((m, idx) => {
    return `
${idx + 1}. Column: "${m.column}"
   Expected: ${m.expectedType}
   Got: ${m.actualType}
   Value: ${JSON.stringify(m.value)}
   ${m.message}

   💡 Fix: ${getSuggestion(m)}`;
  }).join('\n');

  return `${header}\n${separator}\n${details}\n${separator}`;
}

/**
 * Get helpful suggestion for fixing validation error
 * @param {object} mismatch - Mismatch object
 * @returns {string} - Suggestion text
 */
function getSuggestion(mismatch) {
  if (mismatch.expectedType === 'uuid') {
    return `Import randomUUID: import { randomUUID } from 'crypto'; then use: ${mismatch.column}: randomUUID()`;
  }

  if (mismatch.expectedType === 'integer') {
    return `Convert to integer: ${mismatch.column}: parseInt(value)`;
  }

  if (mismatch.expectedType === 'numeric') {
    return `Convert to number: ${mismatch.column}: parseFloat(value)`;
  }

  if (mismatch.expectedType === 'boolean') {
    return `Use boolean: ${mismatch.column}: true or false`;
  }

  if (mismatch.expectedType === 'timestamp') {
    return `Use ISO string: ${mismatch.column}: new Date().toISOString()`;
  }

  if (mismatch.message.includes('NOT NULL')) {
    return `Provide a value for ${mismatch.column} or check if column should allow NULL`;
  }

  return `Check your data type for ${mismatch.column}`;
}

/**
 * Validate data against table schema before insert
 * @param {object} supabase - Supabase client
 * @param {string} tableName - Table name
 * @param {object} data - Data to validate
 * @param {object} options - Options { skipColumns: [] }
 * @returns {Promise<object>} - { valid: boolean, errors: [], warnings: [] }
 */
export async function validateInsertSchema(supabase, tableName, data, options = {}) {
  const { skipColumns = [] } = options;

  // Get table schema
  const schema = await getTableSchema(supabase, tableName);

  if (Object.keys(schema).length === 0) {
    return {
      valid: false,
      errors: [`Could not fetch schema for table "${tableName}"`],
      warnings: []
    };
  }

  const errors = [];
  const warnings = [];
  const mismatches = [];

  // Check each data field against schema
  for (const [column, value] of Object.entries(data)) {
    // Skip if in skipColumns
    if (skipColumns.includes(column)) {
      continue;
    }

    // Check if column exists in schema
    if (!schema[column]) {
      warnings.push(`Column "${column}" not found in schema for table "${tableName}". May be ignored by database.`);
      continue;
    }

    // Validate type
    const validation = compareTypes(value, schema[column]);

    if (!validation.valid) {
      mismatches.push({
        column,
        value,
        expectedType: validation.expectedType,
        actualType: validation.actualType,
        message: validation.message
      });
    }
  }

  // Check for missing required columns
  for (const [column, colSchema] of Object.entries(schema)) {
    if (!colSchema.nullable && !colSchema.default && !(column in data)) {
      // Common columns that are auto-filled
      const autoColumns = ['id', 'created_at', 'updated_at'];
      if (!autoColumns.includes(column)) {
        warnings.push(`Required column "${column}" not provided (no default value)`);
      }
    }
  }

  if (mismatches.length > 0) {
    errors.push(formatValidationError(tableName, mismatches));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Clear schema cache (useful for testing or after migrations)
 */
export function clearSchemaCache() {
  schemaCache.clear();
}

/**
 * Helper: Generate a valid UUID (for convenience)
 */
export function generateUUID() {
  return randomUUID();
}
