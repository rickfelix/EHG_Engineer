/**
 * RoleForbiddenValidator - Validates role-based access control
 *
 * Configuration options (in validation_config):
 * - operation: The operation being performed
 * - operations: Array of operations this rule applies to
 * - forbidden_roles: Roles that cannot perform this operation
 * - allowed_roles: Only these roles can perform this operation
 * - recommend_only: Roles that can only recommend, not execute
 * - target_tables: Tables this rule applies to
 *
 * @module RoleForbiddenValidator
 * @version 1.0.0
 */

import { BaseValidator } from './BaseValidator.js';

export class RoleForbiddenValidator extends BaseValidator {
  /**
   * Validate role-based access
   * @param {Object} rule - Rule with validation_config
   * @param {Object} context - Context to validate
   * @returns {Promise<Object>} Validation result
   */
  async validate(rule, context) {
    const config = rule.validation_config || {};
    const issues = [];

    const actorRole = context.actor_role || context.agentLevel;
    const operation = context.operation_type || context.operation || context.target_operation;
    const targetTable = context.target_table;

    // Check if this rule applies to the current operation
    if (config.operation && config.operation !== operation) {
      // Rule doesn't apply to this operation
      return this.formatResult(true, 'Rule does not apply to this operation');
    }

    if (config.operations && !config.operations.includes(operation)) {
      // Rule doesn't apply to this operation
      return this.formatResult(true, 'Rule does not apply to this operation');
    }

    // Check if this rule applies to the target table
    if (config.target_tables && targetTable) {
      if (!config.target_tables.includes(targetTable)) {
        return this.formatResult(true, 'Rule does not apply to this table');
      }
    }

    // Check forbidden roles
    if (config.forbidden_roles && actorRole) {
      if (config.forbidden_roles.includes(actorRole)) {
        issues.push(`Role '${actorRole}' is forbidden from performing '${operation}'`);
      }
    }

    // Check allowed roles (inverse of forbidden)
    if (config.allowed_roles && actorRole) {
      if (!config.allowed_roles.includes(actorRole)) {
        issues.push(`Role '${actorRole}' is not authorized to perform '${operation}'. Allowed: ${config.allowed_roles.join(', ')}`);
      }
    }

    // Check recommend_only roles
    if (config.recommend_only && actorRole) {
      if (config.recommend_only.includes(actorRole)) {
        // This role can only recommend, not execute
        if (!context.is_recommendation) {
          issues.push(`Role '${actorRole}' can only recommend '${operation}', not execute it`);
        }
      }
    }

    // Special check for venture operations (Doctrine of Constraint)
    if (config.operations?.includes('DELETE') ||
        config.operations?.includes('soft_delete') ||
        config.operations?.includes('status_killed')) {
      if (config.target_tables?.includes('ventures') || config.target_tables?.includes('eva_ventures')) {
        // This is a venture deletion - apply strict checks
        if (!config.allowed_roles?.includes(actorRole)) {
          issues.push(`LAW 1 VIOLATION: '${actorRole}' cannot kill/remove ventures without Chairman approval`);
        }
      }
    }

    if (issues.length > 0) {
      return this.formatResult(false, issues.join('; '), {
        issues,
        actorRole,
        operation,
        targetTable,
        forbiddenRoles: config.forbidden_roles,
        allowedRoles: config.allowed_roles
      });
    }

    return this.formatResult(true, 'Role authorization passed');
  }
}

export default RoleForbiddenValidator;
