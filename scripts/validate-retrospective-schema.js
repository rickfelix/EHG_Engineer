#!/usr/bin/env node
/**
 * Retrospective Schema Validator
 * 
 * Validates retrospective objects against database schema before insertion
 * Prevents the 9 schema constraint errors encountered in SD-SUBAGENT-IMPROVE-001
 * 
 * Usage:
 *   import { validateRetrospective } from './scripts/validate-retrospective-schema.js';
 *   const validation = await validateRetrospective(retrospectiveObject);
 *   if (!validation.valid) {
 *     console.error('Validation errors:', validation.errors);
 *   }
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Discover allowed values for enum-like fields by querying existing records
 */
async function discoverConstraints() {
  const { data, error } = await supabase
    .from('retrospectives')
    .select('generated_by, status, team_satisfaction')
    .not('generated_by', 'is', null)
    .not('status', 'is', null)
    .not('team_satisfaction', 'is', null)
    .limit(50);

  if (error) {
    console.warn('⚠️  Could not discover constraints:', error.message);
    return {
      allowed_generated_by: ['MANUAL'],
      allowed_status: ['PUBLISHED'],
      team_satisfaction_range: { min: 1, max: 10 }
    };
  }

  const generated_by_values = [...new Set(data.map(r => r.generated_by))];
  const status_values = [...new Set(data.map(r => r.status))];
  const satisfaction_values = data.map(r => r.team_satisfaction).filter(v => v !== null);

  return {
    allowed_generated_by: generated_by_values,
    allowed_status: status_values,
    team_satisfaction_range: {
      min: Math.min(...satisfaction_values),
      max: Math.max(...satisfaction_values)
    }
  };
}

/**
 * Validate a retrospective object against schema
 */
export async function validateRetrospective(retro) {
  const errors = [];
  const warnings = [];

  // Discover current constraints
  const constraints = await discoverConstraints();

  // ============================================================================
  // Required Fields
  // ============================================================================
  const requiredFields = [
    'sd_id', 'title', 'retro_type', 'conducted_date',
    'generated_by', 'status', 'what_went_well',
    'what_needs_improvement', 'key_learnings'
  ];

  for (const field of requiredFields) {
    if (!retro[field]) {
      errors.push({
        field,
        error: 'Required field missing',
        fix: `Add ${field} to retrospective object`
      });
    }
  }

  // ============================================================================
  // Field Name Validation (Common Mistakes)
  // ============================================================================
  const fieldMapping = {
    'key_learnings': 'key_learnings',
    'what_did_not_work_well': 'what_needs_improvement',
    'protocol_improvements': 'improvement_areas',
    'technical_innovations': 'description',
    'recommendations': 'action_items',
    'metrics_and_roi': null // This field does not exist
  };

  for (const [oldName, newName] of Object.entries(fieldMapping)) {
    if (retro[oldName]) {
      if (newName) {
        errors.push({
          field: oldName,
          error: 'Field name incorrect',
          fix: `Rename '${oldName}' to '${newName}'`
        });
      } else {
        errors.push({
          field: oldName,
          error: 'Field does not exist in schema',
          fix: `Remove '${oldName}' field or merge into other fields`
        });
      }
    }
  }

  // ============================================================================
  // Check Constraint Validation
  // Issue 4 fix: Include valid values in all enum error messages
  // ============================================================================

  // retro_type constraint (Issue 4: Added with valid values)
  // Valid values from database: retrospectives_retro_type_check constraint
  const VALID_RETRO_TYPES = ['SPRINT', 'SD_COMPLETION', 'INCIDENT', 'AUDIT'];
  if (retro.retro_type && !VALID_RETRO_TYPES.includes(retro.retro_type)) {
    errors.push({
      field: 'retro_type',
      error: `Invalid retro_type: '${retro.retro_type}'`,
      fix: `Use one of: ${VALID_RETRO_TYPES.join(', ')}`,
      constraint: 'retrospectives_retro_type_check'
    });
  }

  // generated_by constraint
  if (retro.generated_by && !constraints.allowed_generated_by.includes(retro.generated_by)) {
    errors.push({
      field: 'generated_by',
      error: `Invalid value: '${retro.generated_by}'`,
      fix: `Use one of: ${constraints.allowed_generated_by.join(', ')}`,
      constraint: 'retrospectives_generated_by_check'
    });
  }

  // status constraint
  const VALID_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
  if (retro.status && !VALID_STATUSES.includes(retro.status)) {
    errors.push({
      field: 'status',
      error: `Invalid value: '${retro.status}'`,
      fix: `Use one of: ${VALID_STATUSES.join(', ')}`,
      constraint: 'retrospectives_status_check'
    });
  }

  // outcome_type constraint (if present - handoff retrospectives)
  const VALID_OUTCOME_TYPES = ['SUCCESS', 'PARTIAL', 'FAILED', 'BLOCKED'];
  if (retro.outcome_type && !VALID_OUTCOME_TYPES.includes(retro.outcome_type)) {
    errors.push({
      field: 'outcome_type',
      error: `Invalid outcome_type: '${retro.outcome_type}'`,
      fix: `Use one of: ${VALID_OUTCOME_TYPES.join(', ')}`,
      constraint: 'retrospectives_outcome_type_check'
    });
  }

  // team_satisfaction scale (1-10, not 0-100)
  if (retro.team_satisfaction) {
    const { min, max } = constraints.team_satisfaction_range;
    if (retro.team_satisfaction < min || retro.team_satisfaction > max) {
      errors.push({
        field: 'team_satisfaction',
        error: `Value ${retro.team_satisfaction} out of range`,
        fix: `Use range ${min}-${max} (discovered from existing data)`
      });
    }
    
    if (retro.team_satisfaction > 10) {
      warnings.push({
        field: 'team_satisfaction',
        warning: `Value ${retro.team_satisfaction} suggests 0-100 scale`,
        fix: 'Use 1-10 scale instead (e.g., 95 → 9 or 10)'
      });
    }
  }

  // ============================================================================
  // Data Type Validation
  // ============================================================================

  // Boolean fields (not integers)
  const booleanFields = ['objectives_met', 'on_schedule', 'within_scope', 'auto_generated'];
  for (const field of booleanFields) {
    if (retro[field] !== undefined && typeof retro[field] !== 'boolean') {
      errors.push({
        field,
        error: `Must be boolean, got ${typeof retro[field]}`,
        fix: `Use true/false instead of ${retro[field]}`
      });
    }
  }

  // Array fields (not JSON strings)
  const arrayFields = ['success_patterns', 'failure_patterns', 'improvement_areas'];
  for (const field of arrayFields) {
    if (retro[field]) {
      if (typeof retro[field] === 'string') {
        errors.push({
          field,
          error: 'Must be array, got string',
          fix: 'Remove JSON.stringify() - use plain array: [\'item1\', \'item2\']'
        });
      } else if (!Array.isArray(retro[field])) {
        errors.push({
          field,
          error: `Must be array, got ${typeof retro[field]}`,
          fix: 'Use array format: [\'item1\', \'item2\']'
        });
      }
    }
  }

  // Numeric fields
  const numericFields = [
    'quality_score', 'velocity_achieved', 'team_satisfaction',
    'business_value_delivered', 'bugs_found', 'bugs_resolved', 'tests_added'
  ];
  for (const field of numericFields) {
    if (retro[field] !== undefined && typeof retro[field] !== 'number') {
      errors.push({
        field,
        error: `Must be number, got ${typeof retro[field]}`,
        fix: 'Use numeric value (e.g., 95 not "95")'
      });
    }
  }

  // ============================================================================
  // Return Validation Result
  // ============================================================================

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    constraints,
    summary: {
      total_errors: errors.length,
      total_warnings: warnings.length,
      can_insert: errors.length === 0
    }
  };
}

/**
 * Issue 4 fix: Enhanced error message formatter for database constraint violations
 * Parses Supabase/PostgreSQL error messages and adds valid values
 *
 * @param {Error|object} error - Database error from Supabase
 * @returns {string} Enhanced error message with valid values
 */
export function enhanceConstraintError(error) {
  const message = error?.message || String(error);

  // Map constraint names to valid values (Issue 4: Include valid values in error messages)
  const CONSTRAINT_VALUES = {
    'retrospectives_retro_type_check': {
      field: 'retro_type',
      values: ['SPRINT', 'SD_COMPLETION', 'INCIDENT', 'AUDIT']
    },
    'retrospectives_status_check': {
      field: 'status',
      values: ['DRAFT', 'PUBLISHED', 'ARCHIVED']
    },
    'retrospectives_generated_by_check': {
      field: 'generated_by',
      values: ['MANUAL', 'LEO_PROTOCOL', 'RETRO_AGENT', 'HANDOFF']
    },
    'retrospectives_outcome_type_check': {
      field: 'outcome_type',
      values: ['SUCCESS', 'PARTIAL', 'FAILED', 'BLOCKED']
    }
  };

  // Check if error mentions a constraint we know about
  for (const [constraint, info] of Object.entries(CONSTRAINT_VALUES)) {
    if (message.includes(constraint)) {
      return `${message}\n\n💡 FIX: Field '${info.field}' must be one of: ${info.values.join(', ')}`;
    }
  }

  // Generic check constraint error enhancement
  if (message.includes('check constraint') || message.includes('violates check')) {
    return `${message}\n\n💡 TIP: Run 'node scripts/validate-retrospective-schema.js --file <json>' to validate before insert`;
  }

  return message;
}

/**
 * CLI Usage: Validate a retrospective object passed as JSON
 */
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Retrospective Schema Validator

Usage:
  node scripts/validate-retrospective-schema.js --file <path-to-json>
  node scripts/validate-retrospective-schema.js --help

Example:
  node scripts/validate-retrospective-schema.js --file /tmp/retro.json

This will validate the retrospective object before insertion to prevent
schema constraint errors like those encountered in SD-SUBAGENT-IMPROVE-001.
`);
    process.exit(0);
  }

  if (args[0] === '--file') {
    const { readFileSync } = await import('fs');
    const retroJson = readFileSync(args[1], 'utf-8');
    const retro = JSON.parse(retroJson);
    
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  Retrospective Schema Validation                             ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    
    const validation = await validateRetrospective(retro);
    
    if (validation.valid) {
      console.log('✅ VALIDATION PASSED\n');
      console.log('All fields conform to schema requirements.');
      console.log('Retrospective can be safely inserted.\n');
      
      if (validation.warnings.length > 0) {
        console.log('⚠️  Warnings (' + validation.warnings.length + '):\n');
        validation.warnings.forEach(w => {
          console.log(`   Field: ${w.field}`);
          console.log(`   Warning: ${w.warning}`);
          console.log(`   Fix: ${w.fix}\n`);
        });
      }
    } else {
      console.log('❌ VALIDATION FAILED\n');
      console.log(`Found ${validation.errors.length} error(s):\n`);
      
      validation.errors.forEach((e, i) => {
        console.log(`${i + 1}. Field: ${e.field}`);
        console.log(`   Error: ${e.error}`);
        console.log(`   Fix: ${e.fix}\n`);
      });
      
      process.exit(1);
    }
  }
}
