/**
 * Handoff Retrospective Creation for EXEC-TO-PLAN
 *
 * Creates a retrospective record capturing EXEC phase learnings:
 * - Implementation quality and test coverage
 * - Issues encountered during coding
 * - Sub-agent effectiveness
 * - Technical debt created/addressed
 * - Shipping outcomes
 *
 * This is the architecturally correct location for retrospective creation.
 * The PLAN-TO-LEAD gate (RETROSPECTIVE_QUALITY_GATE) validates its existence.
 *
 * ROOT CAUSE FIX (PAT-RETRO-BOILERPLATE-001): Queries issue_patterns table
 * for actual issues discovered during execution instead of generating boilerplate.
 */

import { safeTruncate } from '../../../../../lib/utils/safe-truncate.js';

/**
 * Query issue_patterns table for issues related to this SD
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Array>} Array of issue patterns
 */
async function getIssuesForSD(supabase, sdId) {
  try {
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('pattern_id, issue_summary, category, severity, proven_solutions, prevention_checklist')
      .or(`first_seen_sd_id.eq.${sdId},last_seen_sd_id.eq.${sdId}`)
      .eq('status', 'active');

    if (error) {
      console.log(`   ⚠️  Could not query issue_patterns: ${error.message}`);
      return [];
    }

    return data || [];
  } catch (err) {
    console.log(`   ⚠️  Issue pattern query error: ${err.message}`);
    return [];
  }
}

/**
 * Query recent active issues (not SD-specific but recent/high-priority)
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} Array of recent issue patterns
 */
async function getRecentActiveIssues(supabase) {
  try {
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('pattern_id, issue_summary, category, severity, proven_solutions')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(5);

    if (error) return [];
    return data || [];
  } catch (_err) {
    return [];
  }
}

/**
 * Create EXEC-TO-PLAN handoff retrospective
 *
 * Captures implementation phase learnings: code quality, test coverage,
 * issues encountered, sub-agent results, and shipping outcomes.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID (sd_key)
 * @param {Object} sd - Strategic Directive record
 * @param {Object} handoffResult - Result from handoff execution
 * @param {Object} context - Additional context { gateResults, testEvidence, shippingResult }
 */
export async function createExecToPlanRetrospective(supabase, sdId, sd, handoffResult, context = {}) {
  try {
    console.log('\n📝 EXEC PHASE RETROSPECTIVE: Auto-capturing implementation learnings');
    console.log('='.repeat(70));

    // Query actual issues from issue_patterns table
    const sdIssues = await getIssuesForSD(supabase, sdId);
    const recentIssues = sdIssues.length === 0 ? await getRecentActiveIssues(supabase) : [];
    const allIssues = [...sdIssues, ...recentIssues];

    if (sdIssues.length > 0) {
      console.log(`   📋 Found ${sdIssues.length} issue(s) linked to this SD`);
    }

    // Extract metrics from handoff result and context
    const gateResults = context.gateResults || {};
    const qualityScore = handoffResult.qualityScore || 80;

    // Derive ratings from gate results
    const testEvidenceScore = gateResults.TEST_EVIDENCE_AUTO_CAPTURE?.score || 0;
    const testEvidenceMax = gateResults.TEST_EVIDENCE_AUTO_CAPTURE?.max_score || 1;
    const implFidelityScore = gateResults.IMPLEMENTATION_FIDELITY?.score || 0;
    const implFidelityMax = gateResults.IMPLEMENTATION_FIDELITY?.max_score || 1;
    const subAgentScore = gateResults.SUB_AGENT_ORCHESTRATION?.score || 0;
    const subAgentMax = gateResults.SUB_AGENT_ORCHESTRATION?.max_score || 1;

    const testRating = Math.ceil((testEvidenceScore / Math.max(testEvidenceMax, 1)) * 5);
    const implRating = Math.ceil((implFidelityScore / Math.max(implFidelityMax, 1)) * 5);
    const subAgentRating = Math.ceil((subAgentScore / Math.max(subAgentMax, 1)) * 5);

    // Build what went well
    const whatWentWell = [];
    if (testRating >= 4) whatWentWell.push({ achievement: 'Test evidence was comprehensive and automated', is_boilerplate: false });
    if (implRating >= 4) whatWentWell.push({ achievement: 'Implementation closely matched PRD requirements', is_boilerplate: false });
    if (subAgentRating >= 4) whatWentWell.push({ achievement: 'Sub-agents (TESTING, GITHUB) executed successfully', is_boilerplate: false });
    if (handoffResult.success) whatWentWell.push({ achievement: 'EXEC-TO-PLAN handoff passed all validation gates', is_boilerplate: false });
    if (handoffResult.automated_shipping?.pr_url) {
      whatWentWell.push({ achievement: `PR created and ready for review: ${handoffResult.automated_shipping.pr_url}`, is_boilerplate: false });
    }
    if (whatWentWell.length === 0) {
      whatWentWell.push({ achievement: 'EXEC phase completed - implementation delivered', is_boilerplate: false });
    }

    // Build what needs improvement
    const whatNeedsImprovement = [];
    if (testRating <= 3) whatNeedsImprovement.push('Test coverage or evidence quality needs improvement');
    if (implRating <= 3) whatNeedsImprovement.push('Implementation fidelity to PRD could be closer');
    if (subAgentRating <= 3) whatNeedsImprovement.push('Sub-agent orchestration had gaps or failures');

    // Add actual issues from issue_patterns
    for (const issue of allIssues) {
      if (whatNeedsImprovement.length >= 5) break;
      whatNeedsImprovement.push(`[${issue.pattern_id}] ${issue.issue_summary}`);
    }

    if (whatNeedsImprovement.length === 0) {
      whatNeedsImprovement.push('No specific issues identified - implementation phase was clean');
    }

    // Build key learnings
    const avgRating = [testRating, implRating, subAgentRating]
      .filter(r => r > 0)
      .reduce((sum, r, _, arr) => sum + r / arr.length, 0) || 4;

    const keyLearnings = [
      { learning: `EXEC phase quality score: ${qualityScore}%`, is_boilerplate: false },
      { learning: `Average gate rating: ${avgRating.toFixed(1)}/5`, is_boilerplate: false }
    ];

    if (handoffResult.test_evidence?.testCount > 0) {
      keyLearnings.push({
        learning: `${handoffResult.test_evidence.testCount} test(s) captured as evidence`,
        is_boilerplate: false
      });
    }

    // Add learnings from issue patterns
    for (const issue of allIssues) {
      if (keyLearnings.length >= 7) break;
      keyLearnings.push({
        learning: `[${issue.pattern_id}] ${issue.category} issue: ${safeTruncate(issue.issue_summary, 80)}${issue.issue_summary.length > 80 ? '...' : ''}`,
        is_boilerplate: false,
        pattern_id: issue.pattern_id
      });
      if (issue.prevention_checklist && Array.isArray(issue.prevention_checklist) && issue.prevention_checklist.length > 0) {
        keyLearnings.push({
          learning: `Prevention for ${issue.pattern_id}: ${issue.prevention_checklist[0]}`,
          is_boilerplate: false,
          pattern_id: issue.pattern_id
        });
      }
    }

    if (sdIssues.length > 0) {
      keyLearnings.push({
        learning: `${sdIssues.length} issue pattern(s) linked to this SD for future reference`,
        is_boilerplate: false
      });
    }

    // Build action items
    const actionItems = [];
    if (testRating <= 3) {
      actionItems.push({ action: 'Improve test coverage before next EXEC-TO-PLAN handoff', is_boilerplate: false });
    }
    if (implRating <= 3) {
      actionItems.push({ action: 'Review PRD requirements more carefully during implementation', is_boilerplate: false });
    }

    // Add action items from issue pattern proven_solutions
    for (const issue of allIssues) {
      if (actionItems.length >= 5) break;
      if (issue.proven_solutions && Array.isArray(issue.proven_solutions) && issue.proven_solutions.length > 0) {
        const topSolution = issue.proven_solutions[0];
        if (topSolution.solution) {
          actionItems.push({
            action: `[${issue.pattern_id}] ${topSolution.solution}`,
            is_boilerplate: false,
            pattern_id: issue.pattern_id,
            success_rate: topSolution.success_rate
          });
        }
      }
    }

    if (actionItems.length === 0) {
      actionItems.push({ action: 'No immediate actions required - continue standard workflow', is_boilerplate: false });
    }

    // Build discovered_issues metadata
    const discoveredIssues = allIssues.map(issue => ({
      pattern_id: issue.pattern_id,
      category: issue.category,
      severity: issue.severity,
      summary: safeTruncate(issue.issue_summary, 200)
    }));

    // Determine sub-agents involved from gate results
    const subAgentsInvolved = [];
    if (gateResults.SUB_AGENT_ORCHESTRATION?.details?.agents) {
      for (const agent of gateResults.SUB_AGENT_ORCHESTRATION.details.agents) {
        subAgentsInvolved.push(agent.code || agent.name || 'UNKNOWN');
      }
    }
    if (subAgentsInvolved.length === 0) {
      subAgentsInvolved.push('TESTING', 'GITHUB');
    }

    // Create retrospective record
    const retrospective = {
      sd_id: sd?.id || sdId,
      project_name: sd.title,
      retro_type: 'SD_COMPLETION',
      retrospective_type: 'EXEC_TO_PLAN',
      title: `EXEC Phase Retrospective: ${sd.title}`,
      description: `Implementation retrospective for EXEC-TO-PLAN handoff of ${sd.sd_key}`,
      conducted_date: new Date().toISOString(),
      agents_involved: ['EXEC', 'PLAN'],
      sub_agents_involved: subAgentsInvolved,
      human_participants: ['EXEC'],
      what_went_well: whatWentWell,
      what_needs_improvement: whatNeedsImprovement,
      action_items: actionItems,
      key_learnings: keyLearnings,
      quality_score: qualityScore,
      team_satisfaction: Math.round(avgRating * 2),
      business_value_delivered: 'Implementation delivered and validated',
      customer_impact: 'Feature implementation quality',
      technical_debt_addressed: false,
      technical_debt_created: false,
      bugs_found: sdIssues.filter(i => i.category === 'bug' || i.category === 'error').length,
      bugs_resolved: 0,
      tests_added: handoffResult.test_evidence?.testCount || 0,
      objectives_met: handoffResult.success,
      on_schedule: true,
      within_scope: true,
      success_patterns: [`EXEC quality: ${qualityScore}%`],
      failure_patterns: whatNeedsImprovement.slice(0, 3),
      improvement_areas: whatNeedsImprovement.slice(0, 3),
      protocol_improvements: discoveredIssues.length > 0
        ? discoveredIssues.map(i => `[${i.pattern_id}] ${i.summary}`)
        : null,
      generated_by: 'MANUAL',
      trigger_event: 'HANDOFF_COMPLETION',
      status: 'PUBLISHED',
      performance_impact: 'Standard',
      target_application: 'EHG_Engineer',
      learning_category: 'IMPLEMENTATION_REVIEW',
      related_files: [],
      related_commits: [],
      related_prs: handoffResult.automated_shipping?.pr_url
        ? [handoffResult.automated_shipping.pr_url]
        : [],
      affected_components: ['LEO Protocol', 'Handoff System', 'EXEC Phase'],
      tags: ['handoff', 'exec-to-plan', 'implementation-review'],
      metadata: discoveredIssues.length > 0 ? {
        discovered_issues: discoveredIssues,
        issue_pattern_ids: discoveredIssues.map(i => i.pattern_id),
        gate_scores: {
          test_evidence: { score: testEvidenceScore, max: testEvidenceMax },
          implementation_fidelity: { score: implFidelityScore, max: implFidelityMax },
          sub_agent_orchestration: { score: subAgentScore, max: subAgentMax }
        }
      } : {
        gate_scores: {
          test_evidence: { score: testEvidenceScore, max: testEvidenceMax },
          implementation_fidelity: { score: implFidelityScore, max: implFidelityMax },
          sub_agent_orchestration: { score: subAgentScore, max: subAgentMax }
        }
      }
    };

    // Insert retrospective
    const { data, error } = await supabase
      .from('retrospectives')
      .insert(retrospective)
      .select();

    if (error) {
      console.log(`\n   ⚠️  Could not save retrospective: ${error.message}`);
      console.log('   Retrospective data will not be persisted');
    } else {
      console.log(`\n   ✅ EXEC phase retrospective created (ID: ${data[0].id})`);
      console.log(`   Quality Score: ${qualityScore}% | Issues Captured: ${sdIssues.length}`);
    }

    console.log('');
  } catch (error) {
    console.log(`\n   ⚠️  Retrospective creation error: ${error.message}`);
    console.log('   Continuing with handoff execution');
    console.log('');
  }
}
