/**
 * ResultBuilder - Unified response factory for handoff operations
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Consolidates 21 duplicate error response patterns into a single factory.
 * Ensures consistent response structure across all handoff operations.
 */

import { getRemediation as getMappedRemediation } from './rejection-subagent-mapping.js';

export class ResultBuilder {
  /**
   * Create a success response
   * @param {object} data - Additional data to include
   * @returns {object} Success response
   */
  static success(data = {}) {
    return {
      success: true,
      ...data
    };
  }

  /**
   * Create a rejection response (validation failed but not system error)
   * @param {string} reasonCode - Machine-readable reason code
   * @param {string} message - Human-readable message
   * @param {object} details - Validation details
   * @param {string} remediation - Remediation instructions
   * @returns {object} Rejection response
   */
  static rejected(reasonCode, message, details = {}, remediation = null) {
    return {
      success: false,
      rejected: true,
      reasonCode,
      message,
      details,
      remediation: remediation || this.getDefaultRemediation(reasonCode)
    };
  }

  /**
   * Create a gate failure response
   * @param {string} gateName - Name of the failed gate
   * @param {object} gateResult - Gate validation result
   * @param {string} remediation - Optional remediation override
   * @returns {object} Gate failure response
   */
  static gateFailure(gateName, gateResult, remediation = null) {
    const issues = gateResult.issues || [];
    return this.rejected(
      `${gateName}_FAILED`,
      `${gateName} validation failed - ${issues.join('; ') || 'Check details'}`,
      gateResult,
      remediation
    );
  }

  /**
   * Create a system error response
   * @param {Error|string} error - Error object or message
   * @returns {object} System error response
   */
  static systemError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
      reasonCode: 'SYSTEM_ERROR',
      systemError: true
    };
  }

  /**
   * Create a "not found" response
   * @param {string} entityType - Type of entity (e.g., 'SD', 'PRD')
   * @param {string} id - Entity ID
   * @returns {object} Not found response
   */
  static notFound(entityType, id) {
    return this.rejected(
      `${entityType.toUpperCase()}_NOT_FOUND`,
      `${entityType} not found: ${id}`,
      { entityType, id }
    );
  }

  /**
   * Create an "unsupported type" response
   * @param {string} handoffType - Unsupported handoff type
   * @param {array} supportedTypes - List of supported types
   * @returns {object} Unsupported type response
   */
  static unsupportedType(handoffType, supportedTypes) {
    return this.rejected(
      'UNSUPPORTED_HANDOFF_TYPE',
      `Unsupported handoff type: ${handoffType}. Supported: ${supportedTypes.join(', ')}`,
      { handoffType, supportedTypes }
    );
  }

  /**
   * Get default remediation for known reason codes.
   * Delegates to centralized rejection-subagent-mapping for Task tool invocations.
   * SD-LEO-INFRA-ACTIONABLE-REJECTION-TEMPLATES-001
   *
   * @param {string} reasonCode - Reason code
   * @param {Object} context - Optional { sdId, gateName, details, score } for richer prompts
   * @returns {string|null} Default remediation or null
   */
  static getDefaultRemediation(reasonCode, context = {}) {
    // Try centralized mapping first (includes Task tool invocations)
    const mapped = getMappedRemediation(reasonCode, context);
    if (mapped) return mapped.message;

    // Fallback: legacy static remediations for any unmapped codes
    return null;
  }

  /**
   * Create a database field error response with exact path
   * SD-LEO-STREAMS-001 Retrospective: Faster resolution with field paths
   * @param {string} table - Table name
   * @param {string} field - Field path (e.g., 'metadata.gate2_validation')
   * @param {string} issue - What's wrong
   * @param {string} fix - How to fix
   * @returns {object} Field error response
   */
  static fieldError(table, field, issue, fix = null) {
    return this.rejected(
      'DATABASE_FIELD_ERROR',
      `Field error: ${table}.${field} - ${issue}`,
      {
        table,
        field,
        fullPath: `${table}.${field}`,
        issue
      },
      fix || `Update the ${field} field in ${table}. See: docs/reference/schema/handoff-field-reference.md`
    );
  }

  /**
   * Log a gate result with consistent formatting
   * @param {string} gateName - Gate name
   * @param {object} result - Gate result
   * @param {boolean} failed - Whether gate failed
   */
  static logGateResult(gateName, result, failed = false) {
    if (failed) {
      console.error(`\n❌ ${gateName} VALIDATION FAILED`);
      console.error(`   Score: ${result.score}/${result.max_score || result.maxScore}`);
      if (result.issues && result.issues.length > 0) {
        console.error(`   Issues: ${result.issues.join(', ')}`);
      }
    } else {
      console.log(`✅ ${gateName} validation passed`);
      if (result.score !== undefined) {
        console.log(`   Score: ${result.score}/${result.max_score || result.maxScore}`);
      }
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log(`\n⚠️  ${gateName} WARNINGS:`);
      result.warnings.forEach(w => console.log(`   • ${w}`));
    }
  }
}

export default ResultBuilder;
