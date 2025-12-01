/**
 * ResultBuilder - Unified response factory for handoff operations
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Consolidates 21 duplicate error response patterns into a single factory.
 * Ensures consistent response structure across all handoff operations.
 */

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
   * Get default remediation for known reason codes
   * @param {string} reasonCode - Reason code
   * @returns {string|null} Default remediation or null
   */
  static getDefaultRemediation(reasonCode) {
    const remediations = {
      // BMAD validations
      'BMAD_VALIDATION_FAILED': 'Run STORIES sub-agent to generate user stories with proper acceptance criteria.',
      'BMAD_PLAN_TO_EXEC_FAILED': 'Run STORIES sub-agent: node lib/sub-agent-executor.js STORIES <SD-ID>',
      'BMAD_EXEC_TO_PLAN_FAILED': 'Ensure all test plans are complete and E2E test coverage is 100%.',

      // Gate validations
      'GATE1_VALIDATION_FAILED': [
        'Execute DESIGN and DATABASE sub-agents:',
        '1. Run DESIGN sub-agent: node lib/sub-agent-executor.js DESIGN <SD-ID>',
        '2. Run DATABASE sub-agent: node lib/sub-agent-executor.js DATABASE <SD-ID>',
        '3. Run STORIES sub-agent: node lib/sub-agent-executor.js STORIES <SD-ID>',
        '4. Re-run this handoff'
      ].join('\n'),
      'GATE2_VALIDATION_FAILED': 'Review implementation fidelity. Ensure code matches PRD requirements.',
      'GATE3_VALIDATION_FAILED': 'Verify traceability from requirements to implementation to tests.',
      'GATE4_VALIDATION_FAILED': 'Review workflow ROI. Ensure deliverables justify process overhead.',
      'GATE6_VALIDATION_FAILED': 'Create feature branch before starting EXEC work.',

      // Branch enforcement
      'BRANCH_ENFORCEMENT_FAILED': [
        'Create a feature branch before EXEC work begins:',
        '1. git checkout main',
        '2. git pull origin main',
        '3. git checkout -b feature/<SD-ID>-short-description',
        '4. Re-run this handoff'
      ].join('\n'),

      // Git commit
      'GIT_COMMIT_VERIFICATION_FAILED': 'Commit all changes with proper commit messages before handoff.',

      // E2E coverage
      'E2E_COVERAGE_INCOMPLETE': 'All user stories must have corresponding E2E tests. Run TESTING sub-agent.',

      // RCA/CAPA
      'RCA_BLOCKING_ISSUES': 'Resolve all blocking RCA issues before proceeding with handoff.',

      // Not found
      'SD_NOT_FOUND': 'Create SD in database using LEO Protocol dashboard or create-strategic-directive.js script.',
      'PRD_NOT_FOUND': 'Create PRD using add-prd-to-database.js script.',
      'TEMPLATE_NOT_FOUND': 'Contact administrator to create handoff template.'
    };

    return remediations[reasonCode] || null;
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
