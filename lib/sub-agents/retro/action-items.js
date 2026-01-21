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
  const sdKey = sdData.sd_key || sdData.legacy_id || sdData.id?.substring(0, 8);
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

  return actionItems;
}

/**
 * Convert an improvement area to a SMART action item
 */
export function convertToSmartAction(improvement, _sdKey, _sdType) {
  const improvementLower = improvement.toLowerCase();

  if (improvementLower.includes('no prd')) {
    return {
      action: 'Enforce PRD creation before EXEC phase entry',
      owner: 'PLAN Supervisor',
      deadline: 'Immediate (next SD)',
      success_criteria: 'LEAD→PLAN handoff blocks if PRD missing',
      priority: 'high',
      smart_format: true,
      root_cause: 'PLAN phase skipped or PRD not stored in database',
      source: 'gap_analysis'
    };
  }

  if (improvementLower.includes('handoff') || improvementLower.includes('phase transition')) {
    return {
      action: 'Complete missing handoff documentation',
      owner: 'Executing Agent',
      deadline: 'Before SD completion claim',
      success_criteria: 'All 4 handoffs (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN, PLAN→LEAD) recorded',
      priority: 'medium',
      smart_format: true,
      root_cause: 'Handoff recording skipped during execution',
      source: 'gap_analysis'
    };
  }

  if (improvementLower.includes('sub-agent') || improvementLower.includes('validation')) {
    return {
      action: 'Auto-trigger sub-agents on handoff creation',
      owner: 'LEO Protocol Team',
      deadline: 'Next protocol update',
      success_criteria: 'Handoff triggers run relevant sub-agents automatically',
      priority: 'medium',
      smart_format: true,
      root_cause: 'Sub-agents require manual invocation',
      source: 'automation_gap'
    };
  }

  if (improvementLower.includes('test') && (improvementLower.includes('fail') || improvementLower.includes('coverage'))) {
    return {
      action: 'Improve test coverage or fix failing tests',
      owner: 'QA Agent',
      deadline: 'Before EXEC→PLAN handoff',
      success_criteria: 'Test pass rate ≥80% with no critical failures',
      priority: 'high',
      smart_format: true,
      root_cause: 'Insufficient test coverage or test maintenance',
      source: 'test_quality'
    };
  }

  if (improvementLower.includes('test evidence') || improvementLower.includes('e2e')) {
    return {
      action: 'Run comprehensive E2E test suite and store evidence',
      owner: 'TESTING Sub-Agent',
      deadline: 'Before completion claim',
      success_criteria: 'Test evidence stored in unified_test_evidence table',
      priority: 'medium',
      smart_format: true,
      root_cause: 'Test runs not stored in unified schema',
      source: 'evidence_gap'
    };
  }

  return {
    action: `Address: ${improvement.substring(0, 100)}`,
    owner: 'Implementing Agent',
    deadline: 'Next iteration',
    success_criteria: 'Issue resolved and verified',
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
  const sdKey = sdData.sd_key || sdData.legacy_id || sdData.id?.substring(0, 8);
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
 * Build a single improvement area with 5 Whys root cause analysis
 */
export function buildImprovementArea(improvement, sdKey, sdType, prdData, handoffs, subAgentResults, testEvidence) {
  const improvementLower = improvement.toLowerCase();

  if (improvementLower.includes('no prd') || improvementLower.includes('plan phase skipped')) {
    return {
      area: 'Requirements Definition Gap',
      observation: improvement,
      root_cause_analysis: {
        why_1: 'PRD not created before EXEC phase began',
        why_2: 'LEAD→PLAN handoff did not enforce PRD existence check',
        why_3: 'Phase transition validation focused on approval status, not artifacts',
        why_4: 'Handoff system designed for flexibility over strictness',
        why_5: 'Early LEO Protocol prioritized velocity over documentation',
        root_cause: 'Phase gate validation does not verify required artifacts exist',
        contributing_factors: ['Missing PRD existence check in handoff validation', 'No blocking constraint on EXEC entry', 'Historical SDs that bypassed PLAN']
      },
      preventive_measures: [
        'Add PRD existence check to LEAD→PLAN handoff validation',
        'Block EXEC phase entry if PRD missing',
        'Add PRD_REQUIRED flag to SD types that require it'
      ],
      systemic_issue: true
    };
  }

  if (improvementLower.includes('handoff') || improvementLower.includes('phase transition')) {
    return {
      area: 'Phase Transition Tracking',
      observation: improvement,
      root_cause_analysis: {
        why_1: `Only ${handoffs.count}/4 expected handoffs were recorded for ${sdKey}`,
        why_2: 'Handoff creation is manual, not automated by phase transitions',
        why_3: 'No enforcement mechanism blocks completion without handoffs',
        why_4: 'Handoff value not immediately visible during implementation',
        why_5: 'Historical focus on deliverables over process documentation',
        root_cause: 'Handoff creation is optional and manual rather than enforced',
        contributing_factors: ['No auto-trigger on phase change', 'Completion claims not validated against handoff existence', 'Context pressure encourages skipping documentation']
      },
      preventive_measures: [
        'Auto-create handoff skeleton on phase transition',
        'Block completion claims without complete handoff chain',
        'Add handoff existence to PLAN supervisor verification'
      ],
      systemic_issue: true
    };
  }

  if (improvementLower.includes('sub-agent') || improvementLower.includes('validation')) {
    return {
      area: 'Automated Validation Coverage',
      observation: improvement,
      root_cause_analysis: {
        why_1: 'Sub-agents were not executed during SD lifecycle',
        why_2: 'Sub-agent invocation requires manual triggering',
        why_3: 'No event-driven automation triggers sub-agents on handoff',
        why_4: 'Sub-agent system designed as on-demand rather than mandatory',
        why_5: 'Trade-off between automation overhead and flexibility',
        root_cause: 'Sub-agents require explicit invocation rather than automatic execution',
        contributing_factors: ['Manual trigger dependency', 'No auto-run on handoff events', 'Context cost of sub-agent execution']
      },
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
    return {
      area: 'Test Quality and Coverage',
      observation: improvement,
      root_cause_analysis: {
        why_1: `Test pass rate is ${passRate}%, below target threshold`,
        why_2: 'Tests not updated to match implementation changes',
        why_3: 'Test maintenance not included in SD scope estimation',
        why_4: 'Test debt accumulates when velocity is prioritized',
        why_5: 'No automatic test generation or maintenance tooling',
        root_cause: 'Test maintenance effort not budgeted in SD planning',
        contributing_factors: ['Test-code drift', 'Missing test generators', 'Manual test maintenance burden']
      },
      preventive_measures: [
        'Include test maintenance in SD effort estimation',
        'Add test update requirement to EXEC phase checklist',
        'Track test drift metrics per SD'
      ],
      systemic_issue: true
    };
  }

  if (improvementLower.includes('test evidence') || improvementLower.includes('e2e')) {
    return {
      area: 'Test Evidence Recording',
      observation: improvement,
      root_cause_analysis: {
        why_1: 'Test runs not recorded in unified_test_evidence table',
        why_2: 'Test execution and evidence storage are separate processes',
        why_3: 'Evidence storage requires explicit script invocation',
        why_4: 'Test runners not integrated with evidence schema',
        why_5: 'Evidence schema added after test infrastructure existed',
        root_cause: 'Test execution pipeline not integrated with evidence storage',
        contributing_factors: ['Disconnected test and evidence systems', 'Manual evidence recording', 'Legacy test infrastructure']
      },
      preventive_measures: [
        'Integrate test runner output with evidence ingestion',
        'Add evidence recording to CI/CD pipeline',
        'Auto-ingest test results on completion'
      ],
      systemic_issue: true
    };
  }

  return {
    area: 'Process Improvement Opportunity',
    observation: improvement,
    root_cause_analysis: {
      why_1: `Issue identified during ${sdKey} execution`,
      why_2: 'Contributing factors not immediately clear',
      why_3: 'May require deeper investigation',
      root_cause: 'Requires manual root cause analysis',
      contributing_factors: ['SD-specific context', 'Implementation details']
    },
    preventive_measures: ['Document findings in issue_patterns table', 'Review in next similar SD'],
    systemic_issue: false
  };
}

/**
 * Get SD-type-specific improvement areas
 */
export function getTypeSpecificImprovementAreas(sdType, sdData, subAgentResults) {
  const areas = [];
  const sdKey = sdData.sd_key || sdData.legacy_id || sdData.id?.substring(0, 8);

  const databaseRun = subAgentResults.results?.some(r => r.sub_agent_code === 'DATABASE');
  const securityRun = subAgentResults.results?.some(r => r.sub_agent_code === 'SECURITY');

  if ((sdType === 'database' || sdType === 'infrastructure') && !databaseRun) {
    areas.push({
      area: 'Database Validation Gap',
      observation: `${sdType} SD ${sdKey} completed without DATABASE sub-agent validation`,
      root_cause_analysis: {
        why_1: 'DATABASE sub-agent not triggered for this SD',
        why_2: 'SD type detection not enforcing mandatory sub-agents',
        why_3: 'Sub-agent selection is manual, not type-driven',
        root_cause: 'No SD-type-to-sub-agent mapping enforcement',
        contributing_factors: ['Manual sub-agent selection', 'Missing type enforcement']
      },
      preventive_measures: [
        'Add mandatory sub-agent list per SD type',
        'Auto-trigger DATABASE for database/infrastructure SDs',
        'Block completion without type-appropriate validation'
      ],
      systemic_issue: true
    });
  }

  if ((sdType === 'database' || sdType === 'security') && !securityRun) {
    areas.push({
      area: 'Security Validation Gap',
      observation: `${sdType} SD ${sdKey} completed without SECURITY sub-agent RLS validation`,
      root_cause_analysis: {
        why_1: 'SECURITY sub-agent not triggered for this SD',
        why_2: 'RLS policy validation not enforced for data-touching SDs',
        why_3: 'Security validation treated as optional',
        root_cause: 'Security validation not mandatory for database SDs',
        contributing_factors: ['Optional security checks', 'RLS policy gaps possible']
      },
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
