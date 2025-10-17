#!/usr/bin/env node

/**
 * Safe Insert Module
 *
 * Type-safe wrapper for Supabase inserts with pre-insert schema validation
 * and post-insert verification.
 *
 * Created to prevent SD-KNOWLEDGE-001 Issue #1: UUID type mismatch causing silent failures
 *
 * @see docs/retrospectives/SD-KNOWLEDGE-001-completion-issues-and-prevention.md
 */

import { validateInsertSchema, generateUUID } from './schema-validator.js';

/**
 * Configuration options for safe insert
 */
const DEFAULT_OPTIONS = {
  validate: true,              // Perform schema validation before insert
  verify: true,                // Verify insert succeeded by reading back
  skipColumns: [],             // Columns to skip during validation
  throwOnWarning: false,       // Throw error if warnings exist
  returnWarnings: true,        // Include warnings in return object
  autoGenerateId: false        // Auto-generate UUID for 'id' column if missing
};

/**
 * Safely insert a single record with schema validation
 *
 * @param {object} supabase - Supabase client
 * @param {string} tableName - Table name
 * @param {object} data - Data to insert
 * @param {object} options - Insert options (validate, verify, skipColumns, etc.)
 * @returns {Promise<object>} - { success: boolean, data: object, warnings: [], error: null }
 *
 * @example
 * const result = await safeInsert(supabase, 'leo_handoff_executions', {
 *   id: generateUUID(),
 *   from_agent: 'EXEC',
 *   to_agent: 'PLAN',
 *   sd_id: 'SD-KNOWLEDGE-001',
 *   // ...
 * });
 *
 * if (!result.success) {
 *   console.error('Insert failed:', result.error);
 *   throw new Error(result.error);
 * }
 */
export async function safeInsert(supabase, tableName, data, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings = [];

  try {
    // Auto-generate UUID for id column if enabled and missing
    let insertData = { ...data };
    if (opts.autoGenerateId && !insertData.id) {
      insertData.id = generateUUID();
      warnings.push(`Auto-generated UUID for 'id' column: ${insertData.id}`);
    }

    // Step 1: Validate schema if enabled
    if (opts.validate) {
      const validation = await validateInsertSchema(supabase, tableName, insertData, {
        skipColumns: opts.skipColumns
      });

      // Add validation warnings
      if (validation.warnings.length > 0) {
        warnings.push(...validation.warnings);
      }

      // If validation failed, throw with descriptive error
      if (!validation.valid) {
        const errorMessage = validation.errors.join('\n\n');
        return {
          success: false,
          data: null,
          warnings,
          error: errorMessage
        };
      }

      // If throwOnWarning enabled and warnings exist, throw
      if (opts.throwOnWarning && warnings.length > 0) {
        const warningMessage = `Warnings detected:\n${warnings.join('\n')}`;
        return {
          success: false,
          data: null,
          warnings,
          error: warningMessage
        };
      }
    }

    // Step 2: Perform insert with .select() to get result
    const { data: insertedData, error } = await supabase
      .from(tableName)
      .insert(insertData)
      .select()
      .single();

    // Step 3: Handle insert error
    if (error) {
      const enhancedError = enhanceSupabaseError(error, tableName, insertData);
      return {
        success: false,
        data: null,
        warnings,
        error: enhancedError
      };
    }

    // Step 4: Verify insert succeeded if enabled
    if (opts.verify) {
      if (!insertedData) {
        return {
          success: false,
          data: null,
          warnings,
          error: `Insert appeared to succeed but no data returned. Table: ${tableName}`
        };
      }

      // Verify key fields match
      const keyFields = ['id', 'sd_id', 'from_agent', 'to_agent'];
      for (const field of keyFields) {
        if (insertData[field] && insertedData[field] !== insertData[field]) {
          warnings.push(`Verification: ${field} mismatch (expected: ${insertData[field]}, got: ${insertedData[field]})`);
        }
      }
    }

    // Step 5: Return success
    return {
      success: true,
      data: insertedData,
      warnings: opts.returnWarnings ? warnings : [],
      error: null
    };

  } catch (err) {
    return {
      success: false,
      data: null,
      warnings,
      error: `Unexpected error during safe insert: ${err.message}\nStack: ${err.stack}`
    };
  }
}

/**
 * Safely insert multiple records with schema validation
 *
 * @param {object} supabase - Supabase client
 * @param {string} tableName - Table name
 * @param {array} dataArray - Array of data objects to insert
 * @param {object} options - Insert options
 * @returns {Promise<object>} - { success: boolean, data: array, warnings: [], error: null, failedRecords: [] }
 *
 * @example
 * const result = await safeBulkInsert(supabase, 'sub_agent_execution_results', [
 *   { id: generateUUID(), sd_id: 'SD-001', agent_name: 'GITHUB', ... },
 *   { id: generateUUID(), sd_id: 'SD-001', agent_name: 'TESTING', ... }
 * ]);
 */
export async function safeBulkInsert(supabase, tableName, dataArray, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings = [];
  const failedRecords = [];

  try {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return {
        success: false,
        data: [],
        warnings,
        error: 'dataArray must be a non-empty array',
        failedRecords: []
      };
    }

    // Auto-generate UUIDs if enabled
    let insertDataArray = dataArray.map((data, idx) => {
      let item = { ...data };
      if (opts.autoGenerateId && !item.id) {
        item.id = generateUUID();
        warnings.push(`[Record ${idx + 1}] Auto-generated UUID: ${item.id}`);
      }
      return item;
    });

    // Step 1: Validate each record if enabled
    if (opts.validate) {
      for (let i = 0; i < insertDataArray.length; i++) {
        const validation = await validateInsertSchema(supabase, tableName, insertDataArray[i], {
          skipColumns: opts.skipColumns
        });

        if (validation.warnings.length > 0) {
          validation.warnings.forEach(w => warnings.push(`[Record ${i + 1}] ${w}`));
        }

        if (!validation.valid) {
          const errorMessage = `[Record ${i + 1}] ${validation.errors.join('\n')}`;
          failedRecords.push({
            index: i,
            data: insertDataArray[i],
            error: errorMessage
          });
        }
      }

      // If any validation failed, return error
      if (failedRecords.length > 0) {
        const errorSummary = `${failedRecords.length}/${dataArray.length} records failed validation`;
        return {
          success: false,
          data: [],
          warnings,
          error: errorSummary,
          failedRecords
        };
      }

      // If throwOnWarning enabled and warnings exist
      if (opts.throwOnWarning && warnings.length > 0) {
        return {
          success: false,
          data: [],
          warnings,
          error: `Warnings detected during bulk validation`,
          failedRecords: []
        };
      }
    }

    // Step 2: Perform bulk insert
    const { data: insertedData, error } = await supabase
      .from(tableName)
      .insert(insertDataArray)
      .select();

    // Step 3: Handle insert error
    if (error) {
      const enhancedError = enhanceBulkSupabaseError(error, tableName, dataArray.length);
      return {
        success: false,
        data: [],
        warnings,
        error: enhancedError,
        failedRecords: []
      };
    }

    // Step 4: Verify insert succeeded if enabled
    if (opts.verify) {
      if (!insertedData || insertedData.length === 0) {
        return {
          success: false,
          data: [],
          warnings,
          error: `Bulk insert appeared to succeed but no data returned`,
          failedRecords: []
        };
      }

      if (insertedData.length !== dataArray.length) {
        warnings.push(`Inserted ${insertedData.length} records but expected ${dataArray.length}`);
      }
    }

    // Step 5: Return success
    return {
      success: true,
      data: insertedData,
      warnings: opts.returnWarnings ? warnings : [],
      error: null,
      failedRecords: []
    };

  } catch (err) {
    return {
      success: false,
      data: [],
      warnings,
      error: `Unexpected error during bulk insert: ${err.message}\nStack: ${err.stack}`,
      failedRecords
    };
  }
}

/**
 * Enhance Supabase error with helpful context
 * @param {object} error - Supabase error object
 * @param {string} tableName - Table name
 * @param {object} data - Data that failed to insert
 * @returns {string} - Enhanced error message
 */
function enhanceSupabaseError(error, tableName, data) {
  let message = `Insert failed for table "${tableName}":\n`;
  message += `Error: ${error.message}\n`;
  message += `Code: ${error.code || 'N/A'}\n`;

  // Add specific guidance for common errors
  if (error.message.includes('invalid input syntax for type uuid')) {
    message += `\n💡 UUID Type Mismatch Detected!\n`;
    message += `This is the exact issue from SD-KNOWLEDGE-001.\n`;
    message += `Fix: Import randomUUID and use it for ID generation:\n`;
    message += `  import { randomUUID } from 'crypto';\n`;
    message += `  const id = randomUUID();\n`;
  }

  if (error.message.includes('column') && error.message.includes('does not exist')) {
    message += `\n💡 Column Not Found!\n`;
    message += `The column name in your data doesn't match the database schema.\n`;
    message += `Check for typos or use schema-validator to see available columns.\n`;
  }

  if (error.message.includes('violates foreign key constraint')) {
    message += `\n💡 Foreign Key Violation!\n`;
    message += `The referenced record doesn't exist in the parent table.\n`;
    message += `Ensure the referenced ID exists before inserting.\n`;
  }

  if (error.message.includes('violates not-null constraint')) {
    message += `\n💡 NOT NULL Constraint Violation!\n`;
    message += `A required field is missing or null.\n`;
    message += `Check schema for required fields.\n`;
  }

  // Add data preview (limit to avoid huge logs)
  const dataPreview = JSON.stringify(data, null, 2);
  if (dataPreview.length < 500) {
    message += `\nData attempted:\n${dataPreview}`;
  } else {
    message += `\nData attempted (truncated):\n${dataPreview.substring(0, 500)}...`;
  }

  return message;
}

/**
 * Enhance Supabase error for bulk inserts
 * @param {object} error - Supabase error object
 * @param {string} tableName - Table name
 * @param {number} recordCount - Number of records attempted
 * @returns {string} - Enhanced error message
 */
function enhanceBulkSupabaseError(error, tableName, recordCount) {
  let message = `Bulk insert failed for table "${tableName}" (${recordCount} records):\n`;
  message += `Error: ${error.message}\n`;
  message += `Code: ${error.code || 'N/A'}\n`;

  message += `\n💡 Tip: Use safeInsert() on each record individually to identify the problematic record.\n`;

  return message;
}

/**
 * Helper: Export generateUUID for convenience
 */
export { generateUUID };
