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
   * SD-LEO-STREAMS-001 Retrospective: Enhanced with exact field paths
   * @param {string} reasonCode - Reason code
   * @returns {string|null} Default remediation or null
   */
  static getDefaultRemediation(reasonCode) {
    const remediations = {
      // BMAD validations
      'BMAD_VALIDATION_FAILED': 'Run STORIES sub-agent to generate user stories with proper acceptance criteria.',
      'BMAD_PLAN_TO_EXEC_FAILED': 'Run STORIES sub-agent: node scripts/execute-subagent.js --code STORIES --sd-id <SD-ID>',
      'BMAD_EXEC_TO_PLAN_FAILED': 'Ensure all test plans are complete and E2E test coverage is 100%.',

      // Gate validations with field path hints
      'GATE1_VALIDATION_FAILED': [
        'Execute DESIGN and DATABASE sub-agents:',
        '1. Run DESIGN sub-agent: node scripts/execute-subagent.js --code DESIGN --sd-id <SD-ID>',
        '2. Run DATABASE sub-agent: node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>',
        '3. Run STORIES sub-agent: node scripts/execute-subagent.js --code STORIES --sd-id <SD-ID>',
        '4. Re-run this handoff',
        '',
        'Field reference: sd_phase_handoffs.metadata.gate1_validation'
      ].join('\n'),
      'GATE2_VALIDATION_FAILED': [
        'Review implementation fidelity. Ensure code matches PRD requirements.',
        '',
        'Field reference: sd_phase_handoffs.metadata.gate2_validation',
        'See: docs/reference/schema/handoff-field-reference.md'
      ].join('\n'),
      'GATE3_VALIDATION_FAILED': [
        'Verify traceability from requirements to implementation to tests.',
        '',
        'This gate reads: EXEC-TO-PLAN.metadata.gate2_validation',
        'If missing, update the EXEC-TO-PLAN handoff metadata first.',
        'See: docs/reference/schema/handoff-field-reference.md'
      ].join('\n'),
      'GATE4_VALIDATION_FAILED': 'Review workflow ROI. Ensure deliverables justify process overhead.',
      'GATE5_VALIDATION_FAILED': [
        'Git commit verification failed.',
        '',
        'Common issues:',
        '1. Uncommitted changes - run: git add . && git commit -m "message"',
        '2. Unpushed commits - run: git push',
        '',
        'Run: node scripts/check-git-state.js for details'
      ].join('\n'),
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
      'GIT_COMMIT_VERIFICATION_FAILED': [
        'Commit all changes with proper commit messages before handoff.',
        '',
        'Run: node scripts/check-git-state.js for details'
      ].join('\n'),

      // E2E coverage
      'E2E_COVERAGE_INCOMPLETE': 'All user stories must have corresponding E2E tests. Run TESTING sub-agent.',

      // RCA/CAPA
      'RCA_BLOCKING_ISSUES': 'Resolve all blocking RCA issues before proceeding with handoff.',

      // Not found with table references
      'SD_NOT_FOUND': [
        'Create SD in database using LEO Protocol dashboard or create-strategic-directive.js script.',
        '',
        'Table: strategic_directives_v2',
        'Lookup fields: id (UUID), legacy_id, sd_key'
      ].join('\n'),
      'PRD_NOT_FOUND': [
        'Create PRD using add-prd-to-database.js script.',
        '',
        'Table: product_requirements_v2',
        'Link field: sd_id (references strategic_directives_v2.id)'
      ].join('\n'),
      'TEMPLATE_NOT_FOUND': 'Contact administrator to create handoff template.',

      // Deliverables (SD-LEO-STREAMS-001)
      'DELIVERABLES_INCOMPLETE': [
        'Not all deliverables are marked complete.',
        '',
        'Table: sd_scope_deliverables',
        'Columns: deliverable_name, deliverable_type, completion_status',
        'Valid completion_status: pending, in_progress, completed, blocked',
        '',
        'Query: SELECT * FROM sd_scope_deliverables WHERE sd_id = <UUID>'
      ].join('\n'),

      // Fidelity data missing (SD-LEO-STREAMS-001)
      'FIDELITY_DATA_MISSING': [
        'Gate 2 fidelity data not found in EXEC-TO-PLAN handoff.',
        '',
        'The PLAN-TO-LEAD Gate 3 (Traceability) requires fidelity data.',
        '',
        'Expected field: sd_phase_handoffs.metadata.gate2_validation',
        'Must contain: { score, passed, gate_scores: { design_fidelity, database_fidelity, ... } }',
        '',
        'Fix: Update the EXEC-TO-PLAN handoff metadata',
        'See: docs/reference/schema/handoff-field-reference.md'
      ].join('\n')
    };

    return remediations[reasonCode] || null;
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
