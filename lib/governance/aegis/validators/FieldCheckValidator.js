/**
 * FieldCheckValidator - Validates required fields and forbidden values
 *
 * Configuration options (in validation_config):
 * - required_fields: Array of field names that must exist and be non-empty
 * - forbidden_value: { field, value } - Field must not have this value
 * - forbidden_patterns: Array of patterns that fields must not contain
 * - min_length: { field: minLength } - Minimum length for string fields
 * - required_for_delete: Array of fields required for DELETE operations
 *
 * @module FieldCheckValidator
 * @version 1.0.0
 */

import { BaseValidator } from './BaseValidator.js';

export class FieldCheckValidator extends BaseValidator {
  /**
   * Validate required fields and forbidden values
   * @param {Object} rule - Rule with validation_config
   * @param {Object} context - Context to validate
   * @returns {Promise<Object>} Validation result
   */
  async validate(rule, context) {
    const config = rule.validation_config || {};
    const issues = [];

    // Check required fields
    if (config.required_fields) {
      for (const field of config.required_fields) {
        const value = this.getNestedValue(context, field);
        if (value === undefined || value === null || value === '') {
          issues.push(`Missing required field: ${field}`);
        }
      }
    }

    // Check forbidden value
    if (config.forbidden_value) {
      const { field, value } = config.forbidden_value;
      const actualValue = this.getNestedValue(context, field);
      if (actualValue === value) {
        issues.push(`Field '${field}' has forbidden value: ${value}`);
      }
    }

    // Check forbidden patterns
    if (config.forbidden_patterns && context.target_table) {
      for (const pattern of config.forbidden_patterns) {
        if (context.target_table.includes(pattern)) {
          issues.push(`Target '${context.target_table}' matches forbidden pattern: ${pattern}`);
        }
      }
    }

    // Check minimum lengths
    if (config.min_length) {
      for (const [field, minLen] of Object.entries(config.min_length)) {
        const value = this.getNestedValue(context, field);
        if (value && typeof value === 'string' && value.length < minLen) {
          issues.push(`Field '${field}' too short (${value.length} < ${minLen} chars)`);
        }
      }
    }

    // Check required_for_delete
    if (config.required_for_delete && context.target_operation === 'DELETE') {
      for (const field of config.required_for_delete) {
        const value = this.getNestedValue(context, field);
        if (value === undefined || value === null) {
          issues.push(`Field '${field}' required for DELETE operation`);
        }
      }
    }

    // Check valid_buckets (for output classification)
    if (config.valid_buckets && context.buckets) {
      const invalidBuckets = Object.keys(context.buckets).filter(
        b => !config.valid_buckets.includes(b)
      );
      if (invalidBuckets.length > 0) {
        issues.push(`Invalid output buckets: ${invalidBuckets.join(', ')}`);
      }
    }

    // Check mandatory escalation categories
    if (config.mandatory_escalation_categories && context.category) {
      if (config.mandatory_escalation_categories.includes(context.category) && !context.escalated) {
        issues.push(`Category '${context.category}' requires mandatory escalation`);
      }
    }

    if (issues.length > 0) {
      return this.formatResult(false, issues.join('; '), {
        issues,
        checkedFields: config.required_fields || [],
        context: {
          target_table: context.target_table,
          target_operation: context.target_operation
        }
      });
    }

    return this.formatResult(true, 'All field checks passed');
  }
}

export default FieldCheckValidator;
