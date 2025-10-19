/**
 * PRD Schema Validator
 *
 * Validates PRD objects against the actual database schema for product_requirements_v2 table.
 * Prevents silent failures from using non-existent fields.
 *
 * Usage:
 *   import { validatePRDSchema, sanitizePRDData } from '../lib/prd-schema-validator.js';
 *
 *   const validation = validatePRDSchema(prdData);
 *   if (!validation.valid) {
 *     console.error('Schema validation errors:', validation.errors);
 *   }
 *
 *   const cleanData = sanitizePRDData(prdData); // Returns only valid fields
 */

/**
 * Official schema for product_requirements_v2 table
 * Generated from database audit on 2025-10-19
 *
 * Field Types:
 * - VARCHAR: String
 * - TEXT: String (longer)
 * - JSONB: Object/Array (stored as JSON)
 * - TIMESTAMP: Date/ISO string
 * - INTEGER: Number (whole)
 * - NUMERIC: Number (decimal)
 * - UUID: UUID string
 */
export const PRD_SCHEMA = {
  // Primary Key & Foreign Keys
  id: { type: 'VARCHAR', required: true, maxLength: 100 },
  directive_id: { type: 'VARCHAR', required: false, maxLength: 50, deprecated: true, note: 'Use sd_uuid instead' },
  sd_uuid: { type: 'UUID', required: true, note: 'Foreign key to strategic_directives_v2.uuid_id - CRITICAL for handoffs' },
  sd_id: { type: 'VARCHAR', required: false, maxLength: 50, note: 'Mirrors directive_id for pipeline compatibility' },

  // Core Metadata
  title: { type: 'VARCHAR', required: true, maxLength: 500 },
  version: { type: 'VARCHAR', required: false, maxLength: 20, default: '1.0' },
  status: { type: 'VARCHAR', required: true, maxLength: 50, enum: ['draft', 'planning', 'in_progress', 'testing', 'approved', 'completed', 'archived'] },
  category: { type: 'VARCHAR', required: true, maxLength: 50 },
  priority: { type: 'VARCHAR', required: true, maxLength: 20, enum: ['critical', 'high', 'medium', 'low'] },

  // Executive & Context
  executive_summary: { type: 'TEXT', required: false },
  business_context: { type: 'TEXT', required: false },
  technical_context: { type: 'TEXT', required: false },

  // Requirements (JSONB)
  functional_requirements: { type: 'JSONB', required: false, default: '[]' },
  non_functional_requirements: { type: 'JSONB', required: false, default: '[]' },
  technical_requirements: { type: 'JSONB', required: false, default: '[]' },

  // Architecture & Design
  system_architecture: { type: 'TEXT', required: false },
  data_model: { type: 'JSONB', required: false, default: '{}' },
  api_specifications: { type: 'JSONB', required: false, default: '[]' },
  ui_ux_requirements: { type: 'JSONB', required: false, default: '[]' },

  // Implementation
  implementation_approach: { type: 'TEXT', required: false },
  technology_stack: { type: 'JSONB', required: false, default: '[]' },
  dependencies: { type: 'JSONB', required: false, default: '[]' },

  // Testing & Validation
  test_scenarios: { type: 'JSONB', required: false, default: '[]' },
  acceptance_criteria: { type: 'JSONB', required: false, default: '[]' },
  performance_requirements: { type: 'JSONB', required: false, default: '{}' },

  // Checklists
  plan_checklist: { type: 'JSONB', required: false, default: '[]' },
  exec_checklist: { type: 'JSONB', required: false, default: '[]' },
  validation_checklist: { type: 'JSONB', required: false, default: '[]' },

  // Progress Tracking
  progress: { type: 'INTEGER', required: false, default: 0, min: 0, max: 100 },
  phase: { type: 'VARCHAR', required: false, maxLength: 50, enum: ['planning', 'design', 'implementation', 'verification', 'approval'] },
  phase_progress: { type: 'JSONB', required: false, default: '{}' },

  // Risks & Constraints
  risks: { type: 'JSONB', required: false, default: '[]' },
  constraints: { type: 'JSONB', required: false, default: '[]' },
  assumptions: { type: 'JSONB', required: false, default: '[]' },

  // Stakeholders & Approvals
  stakeholders: { type: 'JSONB', required: false, default: '[]' },
  approved_by: { type: 'VARCHAR', required: false, maxLength: 100 },
  approval_date: { type: 'TIMESTAMP', required: false },

  // Timeline
  planned_start: { type: 'TIMESTAMP', required: false },
  planned_end: { type: 'TIMESTAMP', required: false },
  actual_start: { type: 'TIMESTAMP', required: false },
  actual_end: { type: 'TIMESTAMP', required: false },

  // Audit Trail
  created_at: { type: 'TIMESTAMP', required: false, default: 'CURRENT_TIMESTAMP' },
  updated_at: { type: 'TIMESTAMP', required: false, default: 'CURRENT_TIMESTAMP' },
  created_by: { type: 'VARCHAR', required: false, maxLength: 100 },
  updated_by: { type: 'VARCHAR', required: false, maxLength: 100 },

  // Extended Content
  metadata: { type: 'JSONB', required: false, default: '{}', note: 'Flexible storage for custom fields' },
  content: { type: 'TEXT', required: false },
  evidence_appendix: { type: 'TEXT', required: false },

  // Backlog Integration
  backlog_items: { type: 'JSONB', required: false, default: '[]' },

  // AI-Enhanced Planning
  planning_section: { type: 'TEXT', required: false },
  reasoning_analysis: { type: 'TEXT', required: false },
  complexity_analysis: { type: 'TEXT', required: false },
  reasoning_depth: { type: 'VARCHAR', required: false },
  confidence_score: { type: 'NUMERIC', required: false },
  research_confidence_score: { type: 'NUMERIC', required: false }
};

/**
 * Common field mapping for scripts using legacy/custom field names
 */
export const FIELD_MAPPING = {
  // Legacy FK field names
  strategic_directive_id: 'sd_uuid',

  // Custom fields that should map to metadata
  ui_components: 'metadata.ui_components',
  ui_components_summary: 'metadata.ui_components_summary',
  problem_statement: 'business_context',
  objectives: 'metadata.objectives',
  database_changes: 'metadata.database_changes',
  deployment_plan: 'metadata.deployment_plan',
  success_metrics: 'metadata.success_metrics',
  estimated_effort_hours: 'metadata.estimated_hours',
  target_completion_date: 'planned_end',
  risks_and_mitigations: 'risks',
  documentation_requirements: 'metadata.documentation_requirements',

  // Fields that should be converted to TEXT
  technical_architecture: 'system_architecture',

  // Fields that don't belong in PRD table
  user_stories: null, // Use separate user_stories table
  prd_id: 'id' // No separate prd_id field
};

/**
 * Validate PRD object against schema
 * @param {object} prdData - PRD object to validate
 * @returns {object} - { valid: boolean, errors: string[], warnings: string[], suggestions: object }
 */
export function validatePRDSchema(prdData) {
  const errors = [];
  const warnings = [];
  const suggestions = {};

  // Check for required fields
  Object.entries(PRD_SCHEMA).forEach(([field, spec]) => {
    if (spec.required && !(field in prdData)) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  // Check for unknown fields
  Object.keys(prdData).forEach(fieldName => {
    if (!(fieldName in PRD_SCHEMA)) {
      errors.push(`Unknown field: ${fieldName} (not in schema)`);

      // Suggest mapping if available
      if (fieldName in FIELD_MAPPING) {
        const targetField = FIELD_MAPPING[fieldName];
        if (targetField === null) {
          suggestions[fieldName] = `Remove this field (belongs in separate table)`;
        } else if (targetField.includes('.')) {
          suggestions[fieldName] = `Move to ${targetField}`;
        } else {
          suggestions[fieldName] = `Rename to ${targetField}`;
        }
      } else {
        suggestions[fieldName] = `Consider storing in metadata.${fieldName}`;
      }
    }
  });

  // Check for deprecated fields
  Object.entries(prdData).forEach(([field, value]) => {
    const spec = PRD_SCHEMA[field];
    if (spec?.deprecated) {
      warnings.push(`Deprecated field: ${field} - ${spec.note || 'Use alternative'}`);
    }
  });

  // Check field types
  Object.entries(prdData).forEach(([field, value]) => {
    const spec = PRD_SCHEMA[field];
    if (!spec) return; // Already flagged as unknown

    // Type checking
    if (spec.type === 'JSONB' && typeof value !== 'object') {
      errors.push(`Invalid type for ${field}: expected object/array, got ${typeof value}`);
    }
    if (spec.type === 'TEXT' && typeof value === 'object') {
      warnings.push(`Type mismatch for ${field}: expected string (TEXT), got object (consider JSON.stringify())`);
    }
    if (spec.type === 'INTEGER' && !Number.isInteger(value) && value !== null) {
      errors.push(`Invalid type for ${field}: expected integer, got ${typeof value}`);
    }

    // Enum checking
    if (spec.enum && value && !spec.enum.includes(value)) {
      errors.push(`Invalid value for ${field}: "${value}" not in allowed values [${spec.enum.join(', ')}]`);
    }

    // Range checking
    if (spec.min !== undefined && value < spec.min) {
      errors.push(`Value out of range for ${field}: ${value} < ${spec.min}`);
    }
    if (spec.max !== undefined && value > spec.max) {
      errors.push(`Value out of range for ${field}: ${value} > ${spec.max}`);
    }

    // Length checking
    if (spec.maxLength && typeof value === 'string' && value.length > spec.maxLength) {
      warnings.push(`Value too long for ${field}: ${value.length} > ${spec.maxLength} chars (may be truncated)`);
    }
  });

  // Critical check: sd_uuid must be present (required for handoffs)
  if (!prdData.sd_uuid && !prdData.strategic_directive_id) {
    errors.push('CRITICAL: Missing sd_uuid field (required for handoff validation)');
    suggestions.sd_uuid = 'Fetch from strategic_directives_v2.uuid_id using SD ID';
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions: Object.keys(suggestions).length > 0 ? suggestions : null
  };
}

/**
 * Sanitize PRD data by removing unknown fields and applying mappings
 * @param {object} prdData - Raw PRD object
 * @param {object} options - { strict: boolean, applyMappings: boolean, preserveInMetadata: boolean }
 * @returns {object} - Sanitized PRD object with only valid fields
 */
export function sanitizePRDData(prdData, options = {}) {
  const {
    strict = false,           // If true, throw errors on validation failures
    applyMappings = true,     // If true, automatically apply field mappings
    preserveInMetadata = true // If true, move unknown fields to metadata instead of dropping
  } = options;

  const sanitized = {};
  const metadata = { ...(prdData.metadata || {}) };

  Object.entries(prdData).forEach(([field, value]) => {
    // Known field - copy directly
    if (field in PRD_SCHEMA) {
      sanitized[field] = value;
      return;
    }

    // Apply mapping if available
    if (applyMappings && field in FIELD_MAPPING) {
      const targetField = FIELD_MAPPING[field];

      if (targetField === null) {
        // Field doesn't belong in PRD table
        console.warn(`⚠️  Dropping field ${field} (belongs in separate table)`);
        return;
      }

      if (targetField.includes('.')) {
        // Store in metadata
        const metaKey = targetField.split('.')[1];
        metadata[metaKey] = value;
        console.log(`ℹ️  Moved ${field} → ${targetField}`);
        return;
      }

      // Direct mapping
      sanitized[targetField] = value;
      console.log(`ℹ️  Renamed ${field} → ${targetField}`);
      return;
    }

    // Unknown field - preserve in metadata or drop
    if (preserveInMetadata) {
      metadata[field] = value;
      console.warn(`⚠️  Unknown field ${field} moved to metadata`);
    } else {
      console.warn(`⚠️  Dropping unknown field: ${field}`);
    }
  });

  // Add metadata back if we added anything
  if (Object.keys(metadata).length > 0) {
    sanitized.metadata = metadata;
  }

  // Validate sanitized data
  if (strict) {
    const validation = validatePRDSchema(sanitized);
    if (!validation.valid) {
      throw new Error(`PRD validation failed:\n${validation.errors.join('\n')}`);
    }
  }

  return sanitized;
}

/**
 * Pretty-print validation results
 * @param {object} validation - Result from validatePRDSchema()
 */
export function printValidationReport(validation) {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📋 PRD SCHEMA VALIDATION REPORT');
  console.log('═══════════════════════════════════════════════════\n');

  if (validation.valid) {
    console.log('✅ Validation PASSED - All fields match schema\n');
  } else {
    console.log('❌ Validation FAILED\n');
  }

  if (validation.errors.length > 0) {
    console.log(`🚨 ERRORS (${validation.errors.length}):`);
    validation.errors.forEach((error, idx) => {
      console.log(`   ${idx + 1}. ${error}`);
    });
    console.log('');
  }

  if (validation.warnings.length > 0) {
    console.log(`⚠️  WARNINGS (${validation.warnings.length}):`);
    validation.warnings.forEach((warning, idx) => {
      console.log(`   ${idx + 1}. ${warning}`);
    });
    console.log('');
  }

  if (validation.suggestions) {
    console.log('💡 SUGGESTIONS:');
    Object.entries(validation.suggestions).forEach(([field, suggestion]) => {
      console.log(`   ${field}: ${suggestion}`);
    });
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════\n');
}

/**
 * Example usage
 */
export function exampleUsage() {
  // Example 1: Validate PRD with errors
  const badPRD = {
    id: 'PRD-TEST-001',
    strategic_directive_id: 'SD-TEST-001', // Should be sd_uuid
    title: 'Test PRD',
    ui_components: ['Button', 'Card'], // Field doesn't exist
    status: 'invalid_status', // Not in enum
    priority: 'high'
  };

  console.log('Example 1: Validation with errors');
  const validation = validatePRDSchema(badPRD);
  printValidationReport(validation);

  // Example 2: Sanitize data
  console.log('Example 2: Sanitize data');
  const sanitized = sanitizePRDData(badPRD, {
    applyMappings: true,
    preserveInMetadata: true
  });
  console.log('Sanitized PRD:', JSON.stringify(sanitized, null, 2));
}

// Run example if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleUsage();
}
