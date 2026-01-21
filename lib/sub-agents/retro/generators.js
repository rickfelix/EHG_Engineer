/**
 * RETRO Sub-Agent Content Generators
 * Extracted from retro.js for modularity
 */

import {
  extractTestMetrics,
  categorizeLearning,
  extractAffectedComponents,
  calculateOnSchedule,
  calculateWithinScope
} from './analyzers.js';

import {
  generateSmartActionItems,
  generateImprovementAreas
} from './action-items.js';

/**
 * Generate retrospective content
 * @param {Object} sdData - Strategic Directive data
 * @param {Object} prdData - PRD data
 * @param {Object} handoffs - Handoff analysis
 * @param {Object} subAgentResults - Sub-agent execution results
 * @param {Object} _options - Options (unused)
 * @param {Object} testEvidence - Test evidence
 * @param {Object} deliverables - Deliverables data
 * @param {Object} storyCoverage - Story coverage data
 */
export function generateRetrospective(sdData, prdData, handoffs, subAgentResults, _options, testEvidence = null, deliverables = null, storyCoverage = null) {
  const objectivesMet = sdData.status === 'completed';
  const onSchedule = calculateOnSchedule(prdData, handoffs, sdData);
  const withinScope = calculateWithinScope(deliverables);

  const whatWentWell = [];
  if (objectivesMet) whatWentWell.push('All objectives met successfully');
  if (handoffs.count >= 3) whatWentWell.push(`${handoffs.count} handoffs completed per LEO Protocol`);
  if (prdData.found) whatWentWell.push('PRD created with clear requirements');
  if (subAgentResults.count > 0) whatWentWell.push(`${subAgentResults.count} sub-agents executed for validation`);

  if (testEvidence) {
    if (testEvidence.verdict === 'PASS') {
      whatWentWell.push(`Comprehensive test coverage achieved (${testEvidence.pass_rate}% pass rate)`);
    } else if (testEvidence.pass_rate >= 80) {
      whatWentWell.push(`Good test coverage maintained (${testEvidence.pass_rate}% pass rate)`);
    }
  }

  const whatNeedsImprovement = [];
  if (!prdData.found) whatNeedsImprovement.push('No PRD created - PLAN phase skipped');
  if (handoffs.count < 4) whatNeedsImprovement.push('Incomplete handoff chain - missing phase transitions');
  if (subAgentResults.count === 0) whatNeedsImprovement.push('No sub-agent validations - manual verification required');

  if (testEvidence) {
    if (testEvidence.verdict === 'FAIL') {
      whatNeedsImprovement.push(`Test failures need resolution (${testEvidence.pass_rate}% pass rate)`);
    } else if (testEvidence.pass_rate < 80) {
      whatNeedsImprovement.push(`Improve test coverage (currently ${testEvidence.pass_rate}%)`);
    }
    if (testEvidence.freshness_status === 'STALE') {
      whatNeedsImprovement.push('Test evidence is stale - re-run tests before completion');
    }
  } else {
    whatNeedsImprovement.push('No unified test evidence found - consider running comprehensive E2E tests');
  }

  const keyLearnings = generateSdTypeSpecificLearnings(sdData, prdData, handoffs, subAgentResults, testEvidence);

  const successPatterns = [];
  if (whatWentWell.length > 3) successPatterns.push('Comprehensive validation');
  if (handoffs.count >= 4) successPatterns.push('Complete LEO Protocol workflow');
  if (subAgentResults.count >= 3) successPatterns.push('Multi-dimensional verification');

  const failurePatterns = [];
  if (whatNeedsImprovement.length > 2) failurePatterns.push('Protocol shortcuts taken');

  const protocolImprovements = generateProtocolImprovements(sdData, prdData, handoffs, subAgentResults, whatNeedsImprovement);
  const actionItems = generateSmartActionItems(sdData, prdData, handoffs, subAgentResults, whatNeedsImprovement, protocolImprovements);

  if (protocolImprovements.length > 0) {
    actionItems.push(`Apply ${protocolImprovements.length} LEO Protocol improvement(s) to leo_protocol_sections table`);
  }

  const improvementAreas = generateImprovementAreas(sdData, prdData, handoffs, subAgentResults, whatNeedsImprovement, testEvidence);

  let qualityScore = 70;
  if (objectivesMet) qualityScore += 10;
  if (prdData.found) qualityScore += 5;
  if (handoffs.count >= 4) qualityScore += 10;
  if (subAgentResults.count >= 3) qualityScore += 5;

  let teamSatisfaction = 7;
  if (objectivesMet) teamSatisfaction += 1;
  if (qualityScore >= 90) teamSatisfaction += 1;
  if (teamSatisfaction > 10) teamSatisfaction = 10;

  const learningCategory = categorizeLearning(sdData, prdData, handoffs, subAgentResults);

  return {
    sd_id: sdData.id,
    target_application: sdData.target_application,
    title: `${sdData.title} - Retrospective`,
    retro_type: 'SD_COMPLETION',
    conducted_date: new Date().toISOString().split('T')[0],
    generated_by: 'MANUAL',
    status: 'PUBLISHED',
    learning_category: learningCategory,
    what_went_well: whatWentWell,
    what_needs_improvement: whatNeedsImprovement,
    key_learnings: keyLearnings,
    success_patterns: successPatterns,
    failure_patterns: failurePatterns,
    action_items: actionItems,
    improvement_areas: improvementAreas,
    quality_score: qualityScore,
    team_satisfaction: teamSatisfaction,
    objectives_met: objectivesMet,
    on_schedule: onSchedule,
    within_scope: withinScope,
    velocity_achieved: sdData.progress_percentage || 100,
    business_value_delivered: qualityScore,
    auto_generated: true,
    description: `Comprehensive retrospective for ${sdData.title}. Generated by RETRO sub-agent.`,
    protocol_improvements: protocolImprovements,
    affected_components: extractAffectedComponents(sdData, learningCategory),
    tags: [],
    ...extractTestMetrics(sdData.id, testEvidence, storyCoverage)
  };
}

/**
 * Generate LEO Protocol improvements based on retrospective analysis
 */
export function generateProtocolImprovements(sdData, prdData, handoffs, subAgentResults, whatNeedsImprovement) {
  const improvements = [];
  const sdType = (sdData.sd_type || 'feature').toLowerCase();

  const EXEMPT_FROM_TESTING = ['orchestrator', 'documentation', 'docs'];
  const EXEMPT_FROM_E2E = ['orchestrator', 'documentation', 'docs', 'infrastructure'];
  const EXEMPT_FROM_SUBAGENTS = ['orchestrator', 'documentation', 'docs', 'bugfix'];
  const EXEMPT_FROM_FULL_HANDOFFS = ['orchestrator', 'documentation', 'docs', 'infrastructure', 'bugfix'];
  const EXEMPT_FROM_PRD = ['documentation', 'docs'];

  if (!prdData.found && !EXEMPT_FROM_PRD.includes(sdType)) {
    improvements.push({
      category: 'PLAN_ENFORCEMENT',
      improvement: 'Enforce LEAD→PLAN handoff requirement: Block EXEC phase if no PRD exists',
      evidence: `SD ${sdData.id} proceeded without PRD creation`,
      impact: 'Prevents implementation without documented requirements',
      affected_phase: 'LEAD'
    });
  }

  const minHandoffs = EXEMPT_FROM_FULL_HANDOFFS.includes(sdType) ? 2 : 4;
  if (handoffs.count < minHandoffs && !['orchestrator'].includes(sdType)) {
    const missingHandoffs = minHandoffs - handoffs.count;
    improvements.push({
      category: 'HANDOFF_ENFORCEMENT',
      improvement: `Strengthen handoff validation: ${missingHandoffs} handoff(s) missing from complete chain`,
      evidence: `SD ${sdData.id} (${sdType}) had ${handoffs.count}/${minHandoffs} expected handoffs`,
      impact: 'Ensures complete handoff cycle for this SD type',
      affected_phase: null
    });
  }

  if (subAgentResults.count === 0 && !EXEMPT_FROM_SUBAGENTS.includes(sdType)) {
    improvements.push({
      category: 'SUB_AGENT_AUTOMATION',
      improvement: 'Auto-trigger sub-agents on handoff creation: No sub-agents executed during SD lifecycle',
      evidence: `SD ${sdData.id} completed without any sub-agent validations`,
      impact: 'Prevents quality gaps from manual-only verification',
      affected_phase: 'EXEC'
    });
  }

  const testingRun = subAgentResults.results?.some(r => r.sub_agent_code === 'TESTING');
  if (!testingRun && subAgentResults.count > 0 && !EXEMPT_FROM_TESTING.includes(sdType)) {
    improvements.push({
      category: 'TESTING_ENFORCEMENT',
      improvement: 'Mandate TESTING sub-agent execution before EXEC→PLAN handoff',
      evidence: `SD ${sdData.id} ran ${subAgentResults.count} sub-agents but not TESTING`,
      impact: 'Ensures test coverage validation before completion claims',
      affected_phase: 'EXEC'
    });
  }

  if (whatNeedsImprovement.length > 3) {
    improvements.push({
      category: 'PROCESS_SIMPLIFICATION',
      improvement: 'Review SD scope: High improvement count suggests over-scoping',
      evidence: `SD ${sdData.id} identified ${whatNeedsImprovement.length} improvement areas`,
      impact: 'Encourages smaller, more focused SDs with fewer gaps',
      affected_phase: 'LEAD'
    });
  }

  const category = sdData.category?.toLowerCase() || '';

  if (category.includes('test') || category.includes('qa')) {
    improvements.push({
      category: 'TESTING_METRICS',
      improvement: 'Add test coverage metrics to testing-focused SD retrospectives',
      evidence: `SD ${sdData.id} is testing-related but may lack coverage metrics`,
      impact: 'Quantifies testing improvements for future reference',
      affected_phase: 'PLAN'
    });
  }

  if (category.includes('database') || category.includes('schema')) {
    improvements.push({
      category: 'DATABASE_VALIDATION',
      improvement: 'Mandate DATABASE sub-agent for schema-related SDs',
      evidence: `SD ${sdData.id} involves database changes`,
      impact: 'Ensures schema changes are validated before deployment',
      affected_phase: 'EXEC'
    });
  }

  if (EXEMPT_FROM_TESTING.includes(sdType) || EXEMPT_FROM_E2E.includes(sdType) || EXEMPT_FROM_SUBAGENTS.includes(sdType)) {
    console.log(`   ℹ️  SD type '${sdType}' exemptions applied:`);
    if (EXEMPT_FROM_TESTING.includes(sdType)) console.log('      - Exempt from TESTING_ENFORCEMENT');
    if (EXEMPT_FROM_E2E.includes(sdType)) console.log('      - Exempt from E2E_TESTING');
    if (EXEMPT_FROM_SUBAGENTS.includes(sdType)) console.log('      - Exempt from SUB_AGENT_AUTOMATION');
    if (EXEMPT_FROM_FULL_HANDOFFS.includes(sdType)) console.log('      - Using simplified handoff chain');
    if (EXEMPT_FROM_PRD.includes(sdType)) console.log('      - PRD optional');
  }

  return improvements;
}

/**
 * Generate SD-type-specific learnings
 */
export function generateSdTypeSpecificLearnings(sdData, prdData, handoffs, subAgentResults, testEvidence) {
  const learnings = [];
  const sdType = (sdData.category || sdData.sd_type || 'feature').toLowerCase();
  const sdTitle = sdData.title || 'Unknown SD';
  const sdKey = sdData.sd_key || sdData.legacy_id || sdData.id?.substring(0, 8);

  const typeSpecificLearnings = {
    database: [
      {
        category: 'DATABASE_SCHEMA',
        learning: `Schema design for ${sdTitle}: Foreign key constraints require target tables to exist before referencing tables.`,
        evidence: `SD ${sdKey} required creating prerequisite tables in dependency order`,
        applicability: 'Apply dependency-aware table creation in future database SDs'
      },
      {
        category: 'DATABASE_SCHEMA',
        learning: 'RLS policies must be created atomically with tables. Supabase migrations that create tables without immediate RLS leave security gaps.',
        evidence: `DATABASE sub-agent validation pattern for ${sdKey}`,
        applicability: 'Include RLS policies in same migration as table creation'
      },
      {
        category: 'PROCESS_IMPROVEMENT',
        learning: 'Database SDs should bypass UI-focused E2E tests (PAT-DB-SD-E2E-001). Schema validation via DATABASE sub-agent + table existence checks is sufficient.',
        evidence: 'TESTING sub-agent now detects SD type and returns early PASS for database SDs',
        applicability: 'SD-type-aware validation prevents blocking on inapplicable gates'
      }
    ],
    infrastructure: [
      {
        category: 'PROCESS_IMPROVEMENT',
        learning: 'Infrastructure SDs have relaxed CI/CD requirements (PAT-DB-SD-E2E-001). PR existence check is sufficient - no deployment/workflow status needed.',
        evidence: `GITHUB sub-agent now detects SD type for ${sdKey}`,
        applicability: 'Apply SD-type detection to all sub-agents that validate CI/CD'
      },
      {
        category: 'DEPLOYMENT_ISSUE',
        learning: 'Infrastructure changes should be validated via existence checks, not E2E user flows. The infrastructure itself IS the deliverable.',
        evidence: `${sdKey} validated via table existence and DATABASE sub-agent`,
        applicability: 'Use infrastructure-appropriate validation methods'
      }
    ],
    feature: [
      {
        category: 'USER_EXPERIENCE',
        learning: 'Feature SDs require full LEAD→PLAN→EXEC workflow with user story coverage. Each story maps to testable acceptance criteria.',
        evidence: `${handoffs.count} handoffs completed for ${sdKey}`,
        applicability: 'Maintain complete phase transitions for feature work'
      },
      {
        category: 'TESTING_STRATEGY',
        learning: `E2E test evidence validates user journeys. ${testEvidence?.pass_rate || 'N/A'}% pass rate indicates ${testEvidence?.verdict || 'unknown'} test health.`,
        evidence: `Test evidence from ${testEvidence?.run_type || 'manual'} run`,
        applicability: 'Track test pass rates as quality indicators'
      }
    ],
    security: [
      {
        category: 'SECURITY_VULNERABILITY',
        learning: 'Security SDs require explicit RLS policy validation. SERVICE_ROLE_KEY bypasses RLS - use ANON_KEY for security testing.',
        evidence: `Security validation pattern from ${sdKey}`,
        applicability: 'Always test RLS with non-admin roles'
      }
    ],
    documentation: [
      {
        category: 'DOCUMENTATION',
        learning: 'Documentation SDs focus on clarity and coverage, not code architecture. Acceptance criteria should measure documentation completeness.',
        evidence: `Documentation-focused SD ${sdKey}`,
        applicability: 'Use documentation-specific quality metrics'
      }
    ],
    protocol: [
      {
        category: 'PROCESS_IMPROVEMENT',
        learning: 'Protocol SDs improve LEO Protocol itself. Changes should be captured in leo_protocol_sections table and regenerated via generate-claude-md-from-db.js',
        evidence: `Protocol improvement from ${sdKey}`,
        applicability: 'Database-first protocol updates ensure consistency'
      }
    ]
  };

  const typeLearnings = typeSpecificLearnings[sdType] || typeSpecificLearnings.feature;
  learnings.push(...typeLearnings);

  learnings.push({
    category: 'PROCESS_IMPROVEMENT',
    learning: 'EXEC phase should check existing state before reading specs (PAT-EXEC-IMPL-001). Query database for completed work to avoid re-tracing steps.',
    evidence: `Applied to ${sdKey} - found existing tables already created`,
    applicability: 'Start EXEC by verifying current state, not re-reading requirements'
  });

  if (handoffs.count > 0) {
    const handoffTypes = [...new Set(handoffs.handoffs.map(h => h.handoff_type))];
    learnings.push({
      category: 'PROCESS_IMPROVEMENT',
      learning: `Complete handoff chain (${handoffTypes.join(' → ')}) ensures phase transitions are tracked. ${handoffs.count} handoffs captured validation state at each gate.`,
      evidence: `Handoff chain for ${sdKey}`,
      applicability: 'Use handoffs as phase transition checkpoints'
    });
  }

  if (subAgentResults.count > 0) {
    const agents = [...new Set(subAgentResults.results.map(r => r.sub_agent_code))];
    const passCount = subAgentResults.results.filter(r => r.verdict === 'PASS').length;
    learnings.push({
      category: 'PROCESS_IMPROVEMENT',
      learning: `Sub-agent coverage (${agents.join(', ')}) provided ${passCount}/${subAgentResults.count} PASS verdicts. Multi-agent validation catches different issue types.`,
      evidence: `Sub-agent execution history for ${sdKey}`,
      applicability: 'Run relevant sub-agents for comprehensive validation'
    });
  }

  if (prdData.found) {
    learnings.push({
      category: 'PROCESS_IMPROVEMENT',
      learning: `PRD "${prdData.prd.title}" defined ${prdData.prd.functional_requirements?.length || 0} functional requirements. Clear FR definitions enable objective completion validation.`,
      evidence: `PRD created for ${sdKey}`,
      applicability: 'Define measurable FRs for unambiguous completion criteria'
    });
  }

  return learnings;
}
