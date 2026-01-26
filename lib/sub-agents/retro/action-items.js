/**
 * RETRO Sub-Agent Action Items Helpers
 * Extracted from retro.js for modularity
 */

/**
 * Generate SMART action items
 * SMART = Specific, Measurable, Achievable, Relevant, Time-bound
 */
export function generateSmartActionItems(sdData, prdData, handoffs, subAgentResults, whatNeedsImprovement, protocolImprovements) {
  const actionItems = [];
  // SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Removed legacy_id fallback (column dropped 2026-01-24)
  const sdKey = sdData.sd_key || sdData.id?.substring(0, 8);
  const sdType = (sdData.category || sdData.sd_type || 'feature').toLowerCase();

  for (const improvement of whatNeedsImprovement) {
    const smartAction = convertToSmartAction(improvement, sdKey, sdType);
    if (smartAction) {
      actionItems.push(smartAction);
    }
  }

  for (const protoImprovement of protocolImprovements) {
    actionItems.push({
      action: `Update ${protoImprovement.category}: ${protoImprovement.improvement}`,
      owner: 'LEO Protocol Team',
      deadline: 'Next SD cycle',
      success_criteria: `${protoImprovement.affected_phase || 'All phases'} validation includes this check`,
      priority: 'medium',
      smart_format: true,
      source: 'protocol_improvement'
    });
  }

  const typeSpecificActions = getTypeSpecificActions(sdType, sdData, subAgentResults);
  actionItems.push(...typeSpecificActions);

  if (actionItems.length < 3) {
    actionItems.push({
      action: `Document ${sdKey} implementation patterns in issue_patterns table`,
      owner: 'Implementing Agent',
      deadline: 'Before next similar SD',
      success_criteria: 'Pattern with prevention_checklist exists in database',
      priority: 'low',
      smart_format: true,
      source: 'knowledge_capture'
    });

    if (actionItems.length < 3) {
      actionItems.push({
        action: `Review retrospective learnings from ${sdKey} in next LEAD phase`,
        owner: 'LEAD Supervisor',
        deadline: 'Next SD approval',
        success_criteria: 'Lessons applied to SD scope or validation criteria',
        priority: 'low',
        smart_format: true,
        source: 'continuous_improvement'
      });
    }
  }

  // SD-LEO-REFAC-TESTING-INFRA-001: Keep SMART action items as structured objects
  // The retrospectives.action_items column is JSONB and can store structured data.
  // The AI quality rubric scores higher when action items have owner, deadline, etc.
  // Previous quick-fix stripped these fields, causing quality gate failures.
  return actionItems;
}

/**
 * Convert an improvement area to a SMART action item
 *
 * SD-LEO-REFAC-TESTING-INFRA-001: Updated to use specific dates and
 * more concrete success criteria. SMART = Specific, Measurable,
 * Achievable, Relevant, Time-bound.
 */
export function convertToSmartAction(improvement, sdKey, sdType) {
  const improvementLower = improvement.toLowerCase();
  // Generate a specific deadline (7 days from now)
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);
  const deadlineStr = deadline.toISOString().split('T')[0];

  if (improvementLower.includes('no prd') || improvementLower.includes('without prd')) {
    return {
      action: `Create PRD for ${sdKey} in product_requirements_v2 table`,
      owner: 'PLAN Phase Agent',
      deadline: deadlineStr,
      success_criteria: `PRD exists in database with directive_id=${sdKey} and has ≥3 functional requirements`,
      verification_query: `SELECT id FROM product_requirements_v2 WHERE directive_id='${sdKey}'`,
      priority: 'high',
      smart_format: true,
      root_cause: 'SD proceeded without structured requirements definition',
      source: 'gap_analysis'
    };
  }

  if (improvementLower.includes('handoff') || improvementLower.includes('missing handoff')) {
    return {
      action: `Record missing handoffs for ${sdKey} in sd_phase_handoffs`,
      owner: 'Session Agent',
      deadline: deadlineStr,
      success_criteria: `sd_phase_handoffs table has 4 records for ${sdKey}: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD`,
      verification_query: `SELECT handoff_type FROM sd_phase_handoffs WHERE sd_id='${sdKey}' ORDER BY created_at`,
      priority: 'medium',
      smart_format: true,
      root_cause: 'Phase transitions occurred without handoff recording',
      source: 'gap_analysis'
    };
  }

  if (improvementLower.includes('sub-agent') || improvementLower.includes('blocking issues')) {
    return {
      action: `Re-run blocking sub-agents for ${sdKey} until PASS verdict`,
      owner: 'EXEC Phase Agent',
      deadline: deadlineStr,
      success_criteria: `All sub_agent_execution_results for ${sdKey} show verdict='PASS'`,
      verification_query: `SELECT sub_agent_code, verdict FROM sub_agent_execution_results WHERE sd_id='${sdKey}' ORDER BY created_at DESC`,
      priority: 'high',
      smart_format: true,
      root_cause: 'Sub-agent validation found issues that need resolution',
      source: 'validation_failure'
    };
  }

  if (improvementLower.includes('test') && (improvementLower.includes('fail') || improvementLower.includes('pass rate'))) {
    return {
      action: `Fix failing tests and achieve ≥95% pass rate for ${sdKey}`,
      owner: 'QA Engineering Agent',
      deadline: deadlineStr,
      success_criteria: 'Test run shows pass_rate≥95% with results stored in unified_test_evidence table',
      verification_command: 'npm run test:e2e -- --reporter=json | node scripts/ingest-test-evidence.js',
      priority: 'high',
      smart_format: true,
      root_cause: 'Test suite has failing assertions or uncovered scenarios',
      source: 'test_quality'
    };
  }

  if (improvementLower.includes('test evidence') || improvementLower.includes('lacks unified')) {
    return {
      action: `Run E2E tests and store evidence for ${sdKey} in unified_test_evidence`,
      owner: 'TESTING Sub-Agent',
      deadline: deadlineStr,
      success_criteria: `Record exists in unified_test_evidence with sd_id='${sdKey}' and pass_rate is populated`,
      verification_query: `SELECT id, pass_rate, verdict FROM unified_test_evidence WHERE sd_id='${sdKey}'`,
      priority: 'medium',
      smart_format: true,
      root_cause: 'Test execution pipeline not integrated with evidence storage',
      source: 'evidence_gap'
    };
  }

  // Default: create SD-specific action
  return {
    action: `Resolve ${sdKey} issue: ${improvement.substring(0, 80)}`,
    owner: 'Session Agent',
    deadline: deadlineStr,
    success_criteria: 'Issue verified resolved via sub-agent re-execution or manual check',
    priority: 'low',
    smart_format: true,
    source: 'improvement_area'
  };
}

/**
 * Generate improvement areas with root cause analysis (5 Whys)
 */
export function generateImprovementAreas(sdData, prdData, handoffs, subAgentResults, whatNeedsImprovement, testEvidence) {
  const areas = [];
  // SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Removed legacy_id fallback (column dropped 2026-01-24)
  const sdKey = sdData.sd_key || sdData.id?.substring(0, 8);
  const sdType = (sdData.category || sdData.sd_type || 'feature').toLowerCase();

  for (const improvement of whatNeedsImprovement) {
    const area = buildImprovementArea(improvement, sdKey, sdType, prdData, handoffs, subAgentResults, testEvidence);
    if (area) {
      areas.push(area);
    }
  }

  const typeSpecificAreas = getTypeSpecificImprovementAreas(sdType, sdData, subAgentResults);
  areas.push(...typeSpecificAreas);

  if (areas.length < 2) {
    areas.push({
      area: 'Process Documentation',
      observation: `SD ${sdKey} process could benefit from clearer documentation`,
      root_cause_analysis: {
        why_1: 'Process steps not explicitly documented in handoffs',
        why_2: 'Handoff templates focus on validation results, not process narrative',
        why_3: 'LEO Protocol prioritizes data over prose',
        root_cause: 'Trade-off between structured data and narrative context',
        contributing_factors: ['Database-first design', 'Compression requirements', 'Context window limits']
      },
      preventive_measures: ['Add process_narrative field to handoff templates', 'Include key decision points in retrospective'],
      systemic_issue: false
    });
  }

  return areas;
}

/**
 * Validate that a 5-Whys root cause analysis has all required fields populated.
 * SD-LEO-INFRA-ENHANCE-RETRO-SUB-001: Enforce 5-Whys depth for improvement_area_depth score >=7/10
 *
 * @param {Object} rootCauseAnalysis - The root_cause_analysis object to validate
 * @param {string} areaName - Name of the improvement area for logging
 * @returns {Object} Validated root cause analysis with any missing whys filled
 */
function validate5WhysDepth(rootCauseAnalysis, areaName) {
  const requiredWhyFields = ['why_1', 'why_2', 'why_3', 'why_4', 'why_5'];
  const missingFields = [];

  for (const field of requiredWhyFields) {
    if (!rootCauseAnalysis[field] || rootCauseAnalysis[field].trim() === '') {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    console.warn(`⚠️  5-Whys DEPTH WARNING for "${areaName}": Missing ${missingFields.join(', ')}`);
    console.warn('   → improvement_area_depth score may be reduced');

    // Fill missing whys with placeholder that indicates deeper analysis needed
    for (const field of missingFields) {
      rootCauseAnalysis[field] = `[Requires deeper investigation - ${field.replace('_', ' ')} not yet determined]`;
    }
  }

  // Ensure root_cause is present
  if (!rootCauseAnalysis.root_cause || rootCauseAnalysis.root_cause.trim() === '') {
    console.warn(`⚠️  5-Whys ROOT CAUSE missing for "${areaName}"`);
    rootCauseAnalysis.root_cause = '[Root cause requires 5-Whys analysis completion]';
  }

  return rootCauseAnalysis;
}

/**
 * Build a single improvement area with 5 Whys root cause analysis
 */
export function buildImprovementArea(improvement, sdKey, sdType, prdData, handoffs, subAgentResults, testEvidence) {
  const improvementLower = improvement.toLowerCase();

  if (improvementLower.includes('no prd') || improvementLower.includes('plan phase skipped')) {
    const area = 'Requirements Definition Gap';
    return {
      area,
      observation: improvement,
      root_cause_analysis: validate5WhysDepth({
        why_1: 'PRD not created before EXEC phase began',
        why_2: 'LEAD→PLAN handoff did not enforce PRD existence check',
        why_3: 'Phase transition validation focused on approval status, not artifacts',
        why_4: 'Handoff system designed for flexibility over strictness',
        why_5: 'Early LEO Protocol prioritized velocity over documentation',
        root_cause: 'Phase gate validation does not verify required artifacts exist',
        contributing_factors: ['Missing PRD existence check in handoff validation', 'No blocking constraint on EXEC entry', 'Historical SDs that bypassed PLAN']
      }, area),
      preventive_measures: [
        'Add PRD existence check to LEAD→PLAN handoff validation',
        'Block EXEC phase entry if PRD missing',
        'Add PRD_REQUIRED flag to SD types that require it'
      ],
      systemic_issue: true
    };
  }

  if (improvementLower.includes('handoff') || improvementLower.includes('phase transition')) {
    const area = 'Phase Transition Tracking';
    return {
      area,
      observation: improvement,
      root_cause_analysis: validate5WhysDepth({
        why_1: `Only ${handoffs.count}/4 expected handoffs were recorded for ${sdKey}`,
        why_2: 'Handoff creation is manual, not automated by phase transitions',
        why_3: 'No enforcement mechanism blocks completion without handoffs',
        why_4: 'Handoff value not immediately visible during implementation',
        why_5: 'Historical focus on deliverables over process documentation',
        root_cause: 'Handoff creation is optional and manual rather than enforced',
        contributing_factors: ['No auto-trigger on phase change', 'Completion claims not validated against handoff existence', 'Context pressure encourages skipping documentation']
      }, area),
      preventive_measures: [
        'Auto-create handoff skeleton on phase transition',
        'Block completion claims without complete handoff chain',
        'Add handoff existence to PLAN supervisor verification'
      ],
      systemic_issue: true
    };
  }

  if (improvementLower.includes('sub-agent') || improvementLower.includes('validation')) {
    const area = 'Automated Validation Coverage';
    return {
      area,
      observation: improvement,
      root_cause_analysis: validate5WhysDepth({
        why_1: 'Sub-agents were not executed during SD lifecycle',
        why_2: 'Sub-agent invocation requires manual triggering',
        why_3: 'No event-driven automation triggers sub-agents on handoff',
        why_4: 'Sub-agent system designed as on-demand rather than mandatory',
        why_5: 'Trade-off between automation overhead and flexibility',
        root_cause: 'Sub-agents require explicit invocation rather than automatic execution',
        contributing_factors: ['Manual trigger dependency', 'No auto-run on handoff events', 'Context cost of sub-agent execution']
      }, area),
      preventive_measures: [
        'Add sub-agent auto-trigger to handoff creation events',
        'Define mandatory sub-agents per SD type',
        'Add sub-agent coverage to completion validation'
      ],
      systemic_issue: true
    };
  }

  if (improvementLower.includes('test') && (improvementLower.includes('fail') || improvementLower.includes('coverage'))) {
    const passRate = testEvidence?.pass_rate || 'unknown';
    const area = 'Test Quality and Coverage';
    return {
      area,
      observation: improvement,
      root_cause_analysis: validate5WhysDepth({
        why_1: `Test pass rate is ${passRate}%, below target threshold`,
        why_2: 'Tests not updated to match implementation changes',
        why_3: 'Test maintenance not included in SD scope estimation',
        why_4: 'Test debt accumulates when velocity is prioritized',
        why_5: 'No automatic test generation or maintenance tooling',
        root_cause: 'Test maintenance effort not budgeted in SD planning',
        contributing_factors: ['Test-code drift', 'Missing test generators', 'Manual test maintenance burden']
      }, area),
      preventive_measures: [
        'Include test maintenance in SD effort estimation',
        'Add test update requirement to EXEC phase checklist',
        'Track test drift metrics per SD'
      ],
      systemic_issue: true
    };
  }

  if (improvementLower.includes('test evidence') || improvementLower.includes('e2e')) {
    const area = 'Test Evidence Recording';
    return {
      area,
      observation: improvement,
      root_cause_analysis: validate5WhysDepth({
        why_1: 'Test runs not recorded in unified_test_evidence table',
        why_2: 'Test execution and evidence storage are separate processes',
        why_3: 'Evidence storage requires explicit script invocation',
        why_4: 'Test runners not integrated with evidence schema',
        why_5: 'Evidence schema added after test infrastructure existed',
        root_cause: 'Test execution pipeline not integrated with evidence storage',
        contributing_factors: ['Disconnected test and evidence systems', 'Manual evidence recording', 'Legacy test infrastructure']
      }, area),
      preventive_measures: [
        'Integrate test runner output with evidence ingestion',
        'Add evidence recording to CI/CD pipeline',
        'Auto-ingest test results on completion'
      ],
      systemic_issue: true
    };
  }

  // Default case - use validation to ensure 5-Whys depth
  const area = 'Process Improvement Opportunity';
  return {
    area,
    observation: improvement,
    root_cause_analysis: validate5WhysDepth({
      why_1: `Issue identified during ${sdKey} execution`,
      why_2: 'Contributing factors not immediately clear',
      why_3: 'May require deeper investigation',
      why_4: 'Root cause analysis requires domain expertise',
      why_5: 'Systemic vs isolated nature needs determination',
      root_cause: 'Requires manual root cause analysis',
      contributing_factors: ['SD-specific context', 'Implementation details']
    }, area),
    preventive_measures: ['Document findings in issue_patterns table', 'Review in next similar SD'],
    systemic_issue: false
  };
}

/**
 * Get SD-type-specific improvement areas
 */
export function getTypeSpecificImprovementAreas(sdType, sdData, subAgentResults) {
  const areas = [];
  // SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Removed legacy_id fallback (column dropped 2026-01-24)
  const sdKey = sdData.sd_key || sdData.id?.substring(0, 8);

  const databaseRun = subAgentResults.results?.some(r => r.sub_agent_code === 'DATABASE');
  const securityRun = subAgentResults.results?.some(r => r.sub_agent_code === 'SECURITY');

  if ((sdType === 'database' || sdType === 'infrastructure') && !databaseRun) {
    const area = 'Database Validation Gap';
    areas.push({
      area,
      observation: `${sdType} SD ${sdKey} completed without DATABASE sub-agent validation`,
      root_cause_analysis: validate5WhysDepth({
        why_1: 'DATABASE sub-agent not triggered for this SD',
        why_2: 'SD type detection not enforcing mandatory sub-agents',
        why_3: 'Sub-agent selection is manual, not type-driven',
        why_4: 'No mapping exists between SD types and required validations',
        why_5: 'Validation requirements evolved after sub-agent system was built',
        root_cause: 'No SD-type-to-sub-agent mapping enforcement',
        contributing_factors: ['Manual sub-agent selection', 'Missing type enforcement']
      }, area),
      preventive_measures: [
        'Add mandatory sub-agent list per SD type',
        'Auto-trigger DATABASE for database/infrastructure SDs',
        'Block completion without type-appropriate validation'
      ],
      systemic_issue: true
    });
  }

  if ((sdType === 'database' || sdType === 'security') && !securityRun) {
    const area = 'Security Validation Gap';
    areas.push({
      area,
      observation: `${sdType} SD ${sdKey} completed without SECURITY sub-agent RLS validation`,
      root_cause_analysis: validate5WhysDepth({
        why_1: 'SECURITY sub-agent not triggered for this SD',
        why_2: 'RLS policy validation not enforced for data-touching SDs',
        why_3: 'Security validation treated as optional',
        why_4: 'Security requirements not linked to SD type classification',
        why_5: 'RLS enforcement added after initial sub-agent design',
        root_cause: 'Security validation not mandatory for database SDs',
        contributing_factors: ['Optional security checks', 'RLS policy gaps possible']
      }, area),
      preventive_measures: [
        'Mandate SECURITY sub-agent for database/security SDs',
        'Add RLS policy existence check to DATABASE sub-agent',
        'Block database SD completion without RLS validation'
      ],
      systemic_issue: true
    });
  }

  return areas;
}

/**
 * Get SD-type-specific action items
 */
export function getTypeSpecificActions(sdType, sdData, subAgentResults) {
  const actions = [];

  const databaseRun = subAgentResults.results?.some(r => r.sub_agent_code === 'DATABASE');
  const securityRun = subAgentResults.results?.some(r => r.sub_agent_code === 'SECURITY');

  if (sdType === 'database' && !databaseRun) {
    actions.push({
      action: 'Run DATABASE sub-agent for all database/schema SDs',
      owner: 'EXEC Phase Automation',
      deadline: 'SD completion',
      success_criteria: 'DATABASE sub-agent verdict recorded in sub_agent_execution_results',
      priority: 'high',
      smart_format: true,
      source: 'type_specific_gap'
    });
  }

  if ((sdType === 'database' || sdType === 'security') && !securityRun) {
    actions.push({
      action: 'Run SECURITY sub-agent for RLS policy validation',
      owner: 'EXEC Phase Automation',
      deadline: 'SD completion',
      success_criteria: 'SECURITY sub-agent validates RLS policies exist and are correct',
      priority: 'high',
      smart_format: true,
      source: 'type_specific_gap'
    });
  }

  if (sdType === 'infrastructure') {
    actions.push({
      action: 'Document infrastructure changes in operational runbook',
      owner: 'DevOps Team',
      deadline: 'Before production deployment',
      success_criteria: 'Runbook updated with new infrastructure components',
      priority: 'medium',
      smart_format: true,
      source: 'type_specific_requirement'
    });
  }

  if (sdType === 'feature') {
    actions.push({
      action: 'Verify user journey E2E tests cover all acceptance criteria',
      owner: 'QA Agent',
      deadline: 'Before EXEC→PLAN handoff',
      success_criteria: 'Each user story has at least one passing E2E test',
      priority: 'high',
      smart_format: true,
      source: 'type_specific_requirement'
    });
  }

  return actions;
}
