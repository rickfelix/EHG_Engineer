/**
 * ThresholdValidator - Validates numeric thresholds and bounds
 *
 * Configuration options (in validation_config):
 * - field: Field name to check
 * - min: Minimum allowed value
 * - max: Maximum allowed value
 * - authority_levels: { level: { spend_limit, ... } } - Authority-based thresholds
 * - confidence_thresholds: { level: threshold } - Confidence thresholds by level
 *
 * @module ThresholdValidator
 * @version 1.0.0
 */

import { BaseValidator } from './BaseValidator.js';

export class ThresholdValidator extends BaseValidator {
  /**
   * Validate thresholds and bounds
   * @param {Object} rule - Rule with validation_config
   * @param {Object} context - Context to validate
   * @returns {Promise<Object>} Validation result
   */
  async validate(rule, context) {
    const config = rule.validation_config || {};
    const issues = [];

    // Simple min/max threshold on a field
    if (config.field) {
      const value = this.getNestedValue(context, config.field);

      if (value !== undefined && value !== null) {
        if (config.min !== undefined && value < config.min) {
          issues.push(`${config.field} (${value}) is below minimum (${config.min})`);
        }

        if (config.max !== undefined && value > config.max) {
          issues.push(`${config.field} (${value}) exceeds maximum (${config.max})`);
        }
      }
    }

    // Authority levels (for Oath 2 - Boundaries)
    if (config.authority_levels && context.agentLevel) {
      const levelConfig = config.authority_levels[context.agentLevel];

      if (!levelConfig) {
        issues.push(`Unknown agent level: ${context.agentLevel}`);
      } else {
        // Check spend limit
        if (context.spendAmount !== undefined && levelConfig.spend_limit !== undefined) {
          if (context.spendAmount > levelConfig.spend_limit) {
            issues.push(
              `Spend amount $${context.spendAmount} exceeds limit $${levelConfig.spend_limit} for ${context.agentLevel}`
            );
          }
        }
      }
    }

    // Confidence thresholds (for Oath 3 - Escalation Integrity)
    if (config.confidence_thresholds && context.agentLevel) {
      const threshold = config.confidence_thresholds[context.agentLevel];

      if (threshold !== undefined && context.confidence !== undefined) {
        if (context.confidence < threshold && !context.escalated) {
          issues.push(
            `Confidence ${context.confidence} below threshold ${threshold} for ${context.agentLevel} - escalation required`
          );
        }
      }
    }

    // Payload size check (for complexity conservation)
    if (config.field === 'payload_size' && context.payload) {
      const payloadSize = JSON.stringify(context.payload).length;

      if (config.max !== undefined && payloadSize > config.max) {
        issues.push(`Payload size (${payloadSize}) exceeds maximum (${config.max})`);
      }
    }

    if (issues.length > 0) {
      return this.formatResult(false, issues.join('; '), {
        issues,
        checkedField: config.field,
        agentLevel: context.agentLevel
      });
    }

    return this.formatResult(true, 'All threshold checks passed');
  }
}

export default ThresholdValidator;
