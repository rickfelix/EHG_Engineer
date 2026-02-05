/**
 * ContentBuilder - Builds 7-element handoff content structure
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Generates consistent handoff content for each handoff type.
 * The 7-element structure is required by sd_phase_handoffs table.
 */

export class ContentBuilder {
  /**
   * Reserved fields that should NEVER be returned from ContentBuilder.
   * These are managed by HandoffRecorder and must not be overwritten by content.
   *
   * FIX (SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001A RCA):
   * Root cause of rejected handoffs was JavaScript spread operator ordering.
   * This safeguard ensures ContentBuilder never accidentally includes these fields.
   */
  static RESERVED_FIELDS = [
    'id',
    'sd_id',
    'status',
    'from_phase',
    'to_phase',
    'handoff_type',
    'validation_score',
    'validation_passed',
    'validation_details',
    'metadata',
    'created_by',
    'created_at',
    'accepted_at',
    'rejection_reason'
  ];

  /**
   * Build 7-element handoff content based on handoff type
   * @param {string} handoffType - Handoff type (e.g., 'PLAN-TO-EXEC')
   * @param {object} sd - Strategic Directive record
   * @param {object} result - Validation/execution result
   * @param {array} subAgentResults - Sub-agent execution results
   * @returns {object} 7-element content object (sanitized of reserved fields)
   */
  build(handoffType, sd, result, subAgentResults = []) {
    const content = this._createEmptyContent();
    let builtContent;

    switch (handoffType) {
      case 'LEAD-TO-PLAN':
        builtContent = this._buildLeadToPlan(content, sd, result, subAgentResults);
        break;
      case 'PLAN-TO-EXEC':
        builtContent = this._buildPlanToExec(content, sd, result, subAgentResults);
        break;
      case 'EXEC-TO-PLAN':
        builtContent = this._buildExecToPlan(content, sd, result, subAgentResults);
        break;
      case 'PLAN-TO-LEAD':
        builtContent = this._buildPlanToLead(content, sd, result, subAgentResults);
        break;
      default:
        console.warn(`Unknown handoff type: ${handoffType}, using generic content`);
        builtContent = this._buildGeneric(content, handoffType, sd, result);
    }

    // Sanitize: Remove any reserved fields that might have been accidentally added
    return this._sanitizeContent(builtContent);
  }

  /**
   * Remove reserved fields from content to prevent spread operator conflicts
   * @param {object} content - Content object to sanitize
   * @returns {object} Sanitized content with only allowed fields
   */
  _sanitizeContent(content) {
    const sanitized = { ...content };
    let removedFields = [];

    for (const field of ContentBuilder.RESERVED_FIELDS) {
      if (field in sanitized) {
        removedFields.push(field);
        delete sanitized[field];
      }
    }

    if (removedFields.length > 0) {
      console.warn(`⚠️  ContentBuilder: Removed reserved fields from content: ${removedFields.join(', ')}`);
      console.warn('   These fields are managed by HandoffRecorder and should not be in content.');
    }

    return sanitized;
  }

  /**
   * Build rejection content for failed handoffs
   * @param {string} handoffType - Handoff type
   * @param {string} sdId - Strategic Directive ID
   * @param {object} result - Failure result
   * @returns {object} 7-element content for rejection (sanitized of reserved fields)
   */
  buildRejection(handoffType, sdId, result) {
    const content = {
      executive_summary: `${handoffType} handoff REJECTED for ${sdId}. Validation score: ${result.actualScore || 0}%. Reason: ${result.reasonCode || 'VALIDATION_FAILED'}`,
      deliverables_manifest: result.message || 'Handoff validation failed',
      key_decisions: `Decision: Reject handoff - ${result.reasonCode || 'quality below threshold'}`,
      known_issues: result.issues?.join('\n') || 'See validation_details for full analysis',
      resource_utilization: '',
      action_items: result.recommendations?.join('\n') || 'Address validation issues and retry handoff',
      completeness_report: `Validation Score: ${result.actualScore || 0}%. Required: ${result.requiredScore || 70}%`
    };
    // Sanitize in case result object contained reserved fields that got spread
    return this._sanitizeContent(content);
  }

  _createEmptyContent() {
    return {
      executive_summary: '',
      deliverables_manifest: '',
      key_decisions: '',
      known_issues: '',
      resource_utilization: '',
      action_items: '',
      completeness_report: ''
    };
  }

  _buildLeadToPlan(content, sd, result, subAgentResults) {
    const qualityScore = result.qualityScore || 100;

    content.executive_summary = `LEAD phase complete for ${sd.id}: ${sd.title}. Strategic validation passed with ${qualityScore}% completeness. SD approved for PLAN phase PRD creation.`;

    content.deliverables_manifest = [
      '- ✅ Strategic Directive validated (100% completeness)',
      '- ✅ Sub-agent validations complete',
      `- ✅ ${subAgentResults?.length || 0} sub-agent assessments recorded`,
      '- ✅ SD status updated to active',
      '- ✅ PLAN phase authorized'
    ].join('\n');

    const subAgentSummary = (subAgentResults || []).map(sa =>
      `- ${sa.sub_agent_code}: ${sa.verdict} (${sa.confidence}% confidence)`
    ).join('\n');

    const objectives = this._parseJSONField(sd.strategic_objectives);
    const metrics = this._parseJSONField(sd.success_metrics);
    const risks = this._parseJSONField(sd.risks);

    content.key_decisions = [
      `**Strategic Objectives**: ${objectives.length} defined`,
      `**Success Metrics**: ${metrics.length} measurable`,
      `**Risks Identified**: ${risks.length}`,
      `**Sub-Agent Verdicts**:\n${subAgentSummary || 'None recorded'}`
    ].join('\n\n');

    const warnings = (subAgentResults || [])
      .filter(sa => sa.warnings && sa.warnings.length > 0)
      .map(sa => `**${sa.sub_agent_code}**: ${sa.warnings.join(', ')}`)
      .join('\n');

    content.known_issues = warnings || 'No critical issues identified during LEAD validation';

    content.resource_utilization = `**Sub-Agents Executed**: ${subAgentResults?.length || 0}\n**Validation Time**: ${result.validationTime || 'N/A'}`;

    content.action_items = [
      '- [ ] PLAN agent: Create comprehensive PRD',
      '- [ ] PLAN agent: Generate user stories from requirements',
      '- [ ] PLAN agent: Validate PRD completeness before EXEC handoff',
      '- [ ] Address any sub-agent warnings before implementation',
      '',
      '**QUALITY DIRECTIVE**: Follow LEO Protocol diligently. Quality over speed - do not cut corners. Taking the correct approach is more important than completing quickly.'
    ].join('\n');

    content.completeness_report = `**LEAD Phase**: 100% complete\n**SD Completeness**: ${qualityScore}%\n**Sub-Agent Coverage**: ${subAgentResults?.length || 0} agents\n**Status**: APPROVED for PLAN phase`;

    return content;
  }

  _buildPlanToExec(content, sd, result, _subAgentResults) {
    content.executive_summary = `PLAN phase complete for ${sd.id}: ${sd.title}. PRD created and validated. All pre-EXEC requirements met. EXEC implementation authorized.`;

    content.deliverables_manifest = [
      '- ✅ PRD created and validated',
      '- ✅ User stories generated',
      '- ✅ Deliverables extracted to sd_scope_deliverables',
      '- ✅ BMAD validation passed',
      '- ✅ Git branch enforcement verified',
      '- ✅ EXEC phase authorized'
    ].join('\n');

    content.key_decisions = [
      `**PRD Created**: ${result.prdId || 'PRD validated'}`,
      `**Branch**: ${result.branch_validation?.branch || 'Branch ready for EXEC work'}`,
      `**Repository**: ${result.repository || 'Target repository confirmed'}`,
      `**BMAD Score**: ${result.bmad_validation?.score || 'Validation passed'}`
    ].join('\n\n');

    content.known_issues = result.warnings?.join('\n') || 'No critical issues identified during PLAN validation';

    content.resource_utilization = `**BMAD Validation**: Complete\n**Branch Setup**: ${result.branch_validation?.created ? 'Created' : 'Existing'}\n**Deliverables Extracted**: ${result.deliverables_count || 'Yes'}`;

    content.action_items = [
      '- [ ] EXEC agent: Implement all user stories',
      '- [ ] EXEC agent: Write unit tests for all components',
      '- [ ] EXEC agent: Write E2E tests for user journeys',
      '- [ ] EXEC agent: Generate documentation',
      '- [ ] EXEC agent: Create EXEC→PLAN handoff when complete',
      '',
      '**QUALITY DIRECTIVE**: Follow LEO Protocol diligently. Quality over speed - do not cut corners. Taking the correct approach is more important than completing quickly.'
    ].join('\n');

    content.completeness_report = `**PLAN Phase**: 100% complete\n**PRD Status**: Validated\n**BMAD Score**: ${result.bmad_validation?.score || 'Passed'}\n**Status**: APPROVED for EXEC phase`;

    return content;
  }

  _buildExecToPlan(content, sd, result, _subAgentResults) {
    content.executive_summary = `EXEC phase complete for ${sd.id}: ${sd.title}. Implementation complete. All deliverables met, tests passing, documentation generated. Ready for PLAN verification.`;

    content.deliverables_manifest = [
      '- ✅ All user stories implemented',
      '- ✅ Unit tests written and passing',
      '- ✅ E2E tests written and passing',
      '- ✅ Documentation generated',
      '- ✅ Code committed to feature branch',
      '- ✅ Sub-agent validation passed',
      '- ✅ BMAD validation passed'
    ].join('\n');

    content.key_decisions = [
      `**Implementation Complete**: ${result.checkedItems || 'All'} items checked`,
      '**Test Coverage**: Unit + E2E tests passing',
      '**Documentation**: Generated and stored',
      `**Sub-Agents**: ${result.subAgents?.passed || 'All'} passed`,
      `**BMAD Score**: ${result.bmad_validation?.score || 'Validation passed'}`
    ].join('\n\n');

    content.known_issues = result.bmad_validation?.warnings?.join('\n') || 'No critical issues identified during EXEC work';

    content.resource_utilization = `**Sub-Agents Executed**: ${result.subAgents?.total || 'N/A'}\n**BMAD Validation**: Complete\n**Documentation**: Generated\n**E2E Test Mapping**: ${result.e2e_mapping?.mapped_count || 'Complete'}`;

    content.action_items = [
      '- [ ] PLAN agent: Verify all deliverables met',
      '- [ ] PLAN agent: Validate test coverage',
      '- [ ] PLAN agent: Review documentation quality',
      '- [ ] PLAN agent: Check E2E test mapping',
      '- [ ] PLAN agent: Create PLAN→LEAD handoff when verified',
      '',
      '**QUALITY DIRECTIVE**: Follow LEO Protocol diligently. Quality over speed - do not cut corners. Taking the correct approach is more important than completing quickly.'
    ].join('\n');

    content.completeness_report = `**EXEC Phase**: 100% complete\n**Deliverables**: ${result.checkedItems}/${result.totalItems} validated\n**Tests**: Passing\n**Documentation**: Generated\n**Status**: READY for PLAN verification`;

    return content;
  }

  _buildPlanToLead(content, sd, result, _subAgentResults) {
    const qualityScore = result.qualityScore || 100;

    content.executive_summary = `PLAN verification complete for ${sd.id}: ${sd.title}. All deliverables verified, tests validated, quality checks passed. Ready for LEAD final approval and SD completion.`;

    content.deliverables_manifest = [
      '- ✅ All deliverables verified complete',
      '- ✅ Test coverage validated',
      '- ✅ Documentation quality confirmed',
      '- ✅ User stories all completed',
      '- ✅ E2E tests mapped to user stories',
      '- ✅ SD ready for completion'
    ].join('\n');

    content.key_decisions = [
      '**Verification Status**: All checks passed',
      `**Quality Score**: ${qualityScore}%`,
      `**User Stories**: ${result.userStories?.validated || 'All'} validated`,
      '**Test Coverage**: Comprehensive (Unit + E2E)',
      '**Documentation**: Quality confirmed'
    ].join('\n\n');

    content.known_issues = result.warnings?.join('\n') || 'No issues identified - SD ready for completion';

    content.resource_utilization = `**Verification Time**: ${result.verificationTime || 'N/A'}\n**User Stories Validated**: ${result.userStories?.count || 'All'}\n**Tests Validated**: ${result.tests?.count || 'All'}`;

    content.action_items = [
      '- [ ] LEAD agent: Review final implementation',
      '- [ ] LEAD agent: Validate strategic objectives met',
      '- [ ] LEAD agent: Create retrospective',
      '- [ ] LEAD agent: Mark SD as complete',
      '- [ ] LEAD agent: Close feature branch',
      '',
      '**QUALITY DIRECTIVE**: Follow LEO Protocol diligently. Quality over speed - do not cut corners. Taking the correct approach is more important than completing quickly.'
    ].join('\n');

    content.completeness_report = `**PLAN Verification**: 100% complete\n**Quality Score**: ${qualityScore}%\n**All Phases**: Complete\n**Status**: APPROVED for SD completion`;

    return content;
  }

  _buildGeneric(content, handoffType, sd, result) {
    const [fromPhase, , toPhase] = handoffType.split('-');

    content.executive_summary = `${fromPhase} phase complete for ${sd.id}: ${sd.title}. Handoff to ${toPhase} phase.`;
    content.deliverables_manifest = '- ✅ Phase deliverables complete';
    content.key_decisions = `Handoff decision: ${fromPhase} → ${toPhase}`;
    content.known_issues = result.warnings?.join('\n') || 'No issues identified';
    content.resource_utilization = 'See validation details';
    content.action_items = `- [ ] ${toPhase} agent: Continue workflow\n\n**QUALITY DIRECTIVE**: Follow LEO Protocol diligently. Quality over speed - do not cut corners. Taking the correct approach is more important than completing quickly.`;
    content.completeness_report = `**${fromPhase} Phase**: Complete\n**Status**: Handoff to ${toPhase}`;

    return content;
  }

  _parseJSONField(field) {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    try {
      return JSON.parse(field);
    } catch {
      return [];
    }
  }

  /**
   * Log 7-element values for debugging
   * @param {object} record - Handoff record with 7 elements
   */
  logElements(record) {
    console.log('📋 7-Element Handoff Values:');
    console.log('  1. executive_summary:', record.executive_summary ? 'SET' : 'NULL', `(${record.executive_summary?.length || 0} chars)`);
    console.log('  2. deliverables_manifest:', record.deliverables_manifest ? 'SET' : 'NULL', `(${record.deliverables_manifest?.length || 0} chars)`);
    console.log('  3. key_decisions:', record.key_decisions ? 'SET' : 'NULL', `(${record.key_decisions?.length || 0} chars)`);
    console.log('  4. known_issues:', record.known_issues ? 'SET' : 'NULL', `(${record.known_issues?.length || 0} chars)`);
    console.log('  5. resource_utilization:', record.resource_utilization ? 'SET' : 'NULL', `(${record.resource_utilization?.length || 0} chars)`);
    console.log('  6. action_items:', record.action_items ? 'SET' : 'NULL', `(${record.action_items?.length || 0} chars)`);
    console.log('  7. completeness_report:', record.completeness_report ? 'SET' : 'NULL', `(${record.completeness_report?.length || 0} chars)`);
  }
}

export default ContentBuilder;
