#!/usr/bin/env node

/**
 * ValidationGuard - Security validation module for protocol improvements
 * Part of LEO Protocol self-improvement security layer
 *
 * This module prevents:
 * - Direct file writes to protected CLAUDE*.md files
 * - Invalid payloads that don't match target table schemas
 * - Attempts to target unauthorized tables
 * - Potentially dangerous content injection
 *
 * Security Principle: All protocol improvements must flow through the database,
 * never directly to markdown files. The generate-claude-md-from-db.js script
 * is the ONLY authorized way to update CLAUDE*.md files.
 */

import { randomUUID } from 'crypto';

/**
 * Tables that can be targets for protocol improvements
 * Any attempt to target other tables will be rejected
 */
const ALLOWED_TARGET_TABLES = [
  'leo_protocol_sections',
  'leo_sub_agents',
  'leo_skills',
  'handoff_validation_rules',
  'validation_gate_configs'
];

/**
 * Protected files that cannot be directly edited
 * These are generated from the database and should never be manually modified
 */
const PROTECTED_FILES = [
  'CLAUDE.md',
  'CLAUDE_CORE.md',
  'CLAUDE_LEAD.md',
  'CLAUDE_PLAN.md',
  'CLAUDE_EXEC.md'
];

/**
 * Patterns that indicate potentially dangerous content
 * These are blocked from payload content
 */
const DANGEROUS_PATTERNS = [
  /<script\b[^>]*>/i,                    // Script tags
  /javascript:/i,                         // JavaScript protocol
  /on\w+\s*=/i,                          // Event handlers (onclick, onerror, etc.)
  /eval\s*\(/i,                          // eval() calls
  /exec\s*\(/i,                          // exec() calls
  /require\s*\(\s*['"]child_process/i,   // Child process requires
  /spawn\s*\(/i,                         // Process spawning
  /\bfs\.unlink/i,                       // File deletion
  /\bfs\.rmdir/i,                        // Directory deletion
  /\bfs\.rm\b/i,                         // rm calls
  /DROP\s+TABLE/i,                       // SQL DROP TABLE
  /DELETE\s+FROM.*WHERE\s+1\s*=\s*1/i,  // SQL mass delete
  /;\s*--/,                              // SQL comment injection
  /TRUNCATE\s+TABLE/i,                   // SQL truncate
];

/**
 * Expected schema shapes for allowed target tables
 * Used for basic structural validation
 */
const TABLE_SCHEMAS = {
  leo_protocol_sections: {
    required: ['section_key', 'content'],
    optional: ['title', 'section_order', 'is_active', 'protocol_version_id']
  },
  leo_sub_agents: {
    required: ['name', 'purpose'],
    optional: ['triggers', 'outputs', 'when_to_invoke', 'is_active']
  },
  leo_skills: {
    required: ['skill_name', 'purpose'],
    optional: ['skill_type', 'when_to_use', 'content', 'is_active']
  },
  handoff_validation_rules: {
    required: ['rule_name', 'validation_function'],
    optional: ['severity', 'is_active', 'error_message']
  },
  validation_gate_configs: {
    required: ['gate_name', 'gate_order'],
    optional: ['is_required', 'threshold_score', 'is_active']
  }
};

/**
 * Validate that an improvement payload matches the target table schema
 * @param {object} payload - The improvement payload data
 * @param {string} targetTable - The target table name
 * @returns {object} - { valid: boolean, errors: [], warnings: [] }
 */
export function validateImprovementPayload(payload, targetTable) {
  const result = {
    valid: true,
    errors: [],
    warnings: []
  };

  // Check if payload is valid object
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    result.valid = false;
    result.errors.push('Payload must be a non-null object');
    return result;
  }

  // Check if target table is allowed
  if (!ALLOWED_TARGET_TABLES.includes(targetTable)) {
    result.valid = false;
    result.errors.push(`Target table '${targetTable}' is not in the allowed list`);
    return result;
  }

  // Get schema for target table
  const schema = TABLE_SCHEMAS[targetTable];
  if (!schema) {
    result.warnings.push(`No schema definition found for '${targetTable}', skipping field validation`);
    return result;
  }

  // Check required fields
  for (const field of schema.required) {
    if (payload[field] === undefined || payload[field] === null) {
      result.valid = false;
      result.errors.push(`Missing required field '${field}' for table '${targetTable}'`);
    }
  }

  // Warn about unknown fields
  const allKnownFields = [...schema.required, ...schema.optional];
  const systemFields = ['id', 'created_at', 'updated_at', 'created_by'];

  for (const field of Object.keys(payload)) {
    if (!allKnownFields.includes(field) && !systemFields.includes(field)) {
      result.warnings.push(`Unknown field '${field}' for table '${targetTable}'`);
    }
  }

  return result;
}

/**
 * Validate that an improvement does NOT attempt direct markdown file edits
 * @param {object} improvement - The improvement object
 * @returns {object} - { valid: boolean, errors: [], reason: string }
 */
export function validateNoDirectMarkdownEdit(improvement) {
  const result = {
    valid: true,
    errors: [],
    reason: null
  };

  if (!improvement || typeof improvement !== 'object') {
    result.valid = false;
    result.errors.push('Improvement must be a valid object');
    return result;
  }

  // Check for file_path or similar fields that suggest direct file writes
  const filePathFields = ['file_path', 'filePath', 'target_file', 'targetFile', 'path'];

  for (const field of filePathFields) {
    if (improvement[field]) {
      const filePath = String(improvement[field]);

      // Check if any protected file is in the path
      for (const protectedFile of PROTECTED_FILES) {
        if (filePath.includes(protectedFile)) {
          result.valid = false;
          result.errors.push(
            `SECURITY VIOLATION: Direct edit to protected file '${protectedFile}' is not allowed`
          );
          result.reason = 'direct_file_edit_blocked';
        }
      }
    }
  }

  // Check if improvement_type suggests file writing
  const blockedTypes = ['file_write', 'direct_edit', 'markdown_update', 'file_update'];
  if (blockedTypes.includes(improvement.improvement_type)) {
    result.valid = false;
    result.errors.push(
      `SECURITY VIOLATION: Improvement type '${improvement.improvement_type}' suggests direct file editing, which is not allowed`
    );
    result.reason = 'blocked_improvement_type';
  }

  // Check if content contains file write operations
  const contentFields = ['content', 'payload', 'data', 'change'];
  for (const field of contentFields) {
    if (improvement[field] && typeof improvement[field] === 'string') {
      const content = improvement[field];

      // Check for fs.writeFile patterns
      if (/fs\.writeFile|fs\.writeSync|fs\.appendFile/.test(content)) {
        result.valid = false;
        result.errors.push(
          'SECURITY VIOLATION: Content contains file write operations'
        );
        result.reason = 'file_write_in_content';
      }

      // Check for CLAUDE*.md references in code-like content
      for (const protectedFile of PROTECTED_FILES) {
        if (content.includes(protectedFile) && /write|update|edit|modify/i.test(content)) {
          result.valid = false;
          result.errors.push(
            `SECURITY VIOLATION: Content references protected file '${protectedFile}' with write intent`
          );
          result.reason = 'protected_file_reference';
        }
      }
    }
  }

  if (result.valid) {
    result.reason = 'passed';
  }

  return result;
}

/**
 * Validate that target table name is in the allowed list
 * @param {string} tableName - The target table name
 * @returns {object} - { valid: boolean, error: string|null, allowedTables: string[] }
 */
export function validateTargetTableExists(tableName) {
  const result = {
    valid: false,
    error: null,
    allowedTables: [...ALLOWED_TARGET_TABLES]
  };

  if (!tableName || typeof tableName !== 'string') {
    result.error = 'Table name must be a non-empty string';
    return result;
  }

  const normalizedName = tableName.trim().toLowerCase();

  if (ALLOWED_TARGET_TABLES.includes(normalizedName)) {
    result.valid = true;
  } else {
    result.error = `Table '${tableName}' is not in the allowed target tables list. ` +
                   `Allowed tables: ${ALLOWED_TARGET_TABLES.join(', ')}`;
  }

  return result;
}

/**
 * Sanitize payload by removing potentially dangerous content
 * @param {object} payload - The payload to sanitize
 * @returns {object} - { sanitized: object, removed: string[], warnings: string[] }
 */
export function sanitizePayload(payload) {
  const result = {
    sanitized: {},
    removed: [],
    warnings: []
  };

  if (!payload || typeof payload !== 'object') {
    result.warnings.push('Payload is not a valid object, returning empty');
    return result;
  }

  for (const [key, value] of Object.entries(payload)) {
    // Skip null/undefined
    if (value === null || value === undefined) {
      result.sanitized[key] = value;
      continue;
    }

    // Handle strings
    if (typeof value === 'string') {
      let sanitizedValue = value;
      let wasModified = false;

      // Check for dangerous patterns
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(sanitizedValue)) {
          const match = sanitizedValue.match(pattern);
          result.removed.push(`${key}: removed pattern "${match[0]}"`);
          sanitizedValue = sanitizedValue.replace(pattern, '[REMOVED]');
          wasModified = true;
        }
      }

      // Basic HTML entity encoding for special characters
      sanitizedValue = sanitizedValue
        .replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      if (wasModified) {
        result.warnings.push(`Field '${key}' contained potentially dangerous content that was sanitized`);
      }

      result.sanitized[key] = sanitizedValue;
    }
    // Handle nested objects
    else if (typeof value === 'object' && !Array.isArray(value)) {
      const nestedResult = sanitizePayload(value);
      result.sanitized[key] = nestedResult.sanitized;
      result.removed.push(...nestedResult.removed.map(r => `${key}.${r}`));
      result.warnings.push(...nestedResult.warnings);
    }
    // Handle arrays
    else if (Array.isArray(value)) {
      result.sanitized[key] = value.map((item, idx) => {
        if (typeof item === 'string') {
          let sanitizedItem = item;
          for (const pattern of DANGEROUS_PATTERNS) {
            if (pattern.test(sanitizedItem)) {
              result.removed.push(`${key}[${idx}]: removed dangerous pattern`);
              sanitizedItem = sanitizedItem.replace(pattern, '[REMOVED]');
            }
          }
          return sanitizedItem;
        }
        if (typeof item === 'object' && item !== null) {
          const nestedResult = sanitizePayload(item);
          result.removed.push(...nestedResult.removed.map(r => `${key}[${idx}].${r}`));
          result.warnings.push(...nestedResult.warnings);
          return nestedResult.sanitized;
        }
        return item;
      });
    }
    // Pass through primitives
    else {
      result.sanitized[key] = value;
    }
  }

  return result;
}

/**
 * Comprehensive validation of a protocol improvement
 * Runs all validation checks in sequence
 * @param {object} improvement - The complete improvement object
 * @returns {object} - { valid: boolean, errors: [], warnings: [], sanitizedPayload: object }
 */
export function validateImprovement(improvement) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    sanitizedPayload: null,
    checks: {}
  };

  // 1. Validate no direct markdown edits
  const markdownCheck = validateNoDirectMarkdownEdit(improvement);
  result.checks.noDirectEdit = markdownCheck;
  if (!markdownCheck.valid) {
    result.valid = false;
    result.errors.push(...markdownCheck.errors);
  }

  // 2. Validate target table
  const targetTable = improvement.target_table || improvement.targetTable;
  if (targetTable) {
    const tableCheck = validateTargetTableExists(targetTable);
    result.checks.targetTable = tableCheck;
    if (!tableCheck.valid) {
      result.valid = false;
      result.errors.push(tableCheck.error);
    }
  } else {
    result.valid = false;
    result.errors.push('No target_table specified in improvement');
    result.checks.targetTable = { valid: false, error: 'Missing target_table' };
  }

  // 3. Validate payload against schema
  const payload = improvement.payload || improvement.data || improvement.change;
  if (payload && targetTable) {
    const payloadCheck = validateImprovementPayload(payload, targetTable);
    result.checks.payloadSchema = payloadCheck;
    if (!payloadCheck.valid) {
      result.valid = false;
      result.errors.push(...payloadCheck.errors);
    }
    result.warnings.push(...payloadCheck.warnings);
  }

  // 4. Sanitize payload
  if (payload) {
    const sanitizeResult = sanitizePayload(payload);
    result.sanitizedPayload = sanitizeResult.sanitized;
    result.warnings.push(...sanitizeResult.warnings);
    if (sanitizeResult.removed.length > 0) {
      result.warnings.push(`Removed ${sanitizeResult.removed.length} potentially dangerous patterns`);
    }
  }

  return result;
}

/**
 * Create an audit log entry for improvement actions
 * @param {string} action - The action taken (approved, applied, rejected)
 * @param {object} improvement - The improvement object
 * @param {string} actorId - The user/system that performed the action
 * @param {object} details - Additional details about the action
 * @returns {object} - Audit log entry object ready for insertion
 */
export function createAuditLogEntry(action, improvement, actorId, details = {}) {
  return {
    id: randomUUID(),
    action,
    improvement_id: improvement.id || null,
    improvement_summary: improvement.summary || improvement.title || 'Unknown improvement',
    target_table: improvement.target_table || improvement.targetTable || null,
    actor_id: actorId,
    actor_type: actorId === 'system' ? 'system' : 'user',
    timestamp: new Date().toISOString(),
    details: {
      ...details,
      validation_result: improvement._validationResult || null,
      payload_size: improvement.payload ? JSON.stringify(improvement.payload).length : 0
    }
  };
}

// Export constants for external use
export { ALLOWED_TARGET_TABLES, PROTECTED_FILES };

// Default export for convenience
export default {
  validateImprovementPayload,
  validateNoDirectMarkdownEdit,
  validateTargetTableExists,
  sanitizePayload,
  validateImprovement,
  createAuditLogEntry,
  ALLOWED_TARGET_TABLES,
  PROTECTED_FILES
};
