/**
 * DESIGN Sub-Agent Workflow Analyzer
 * Main workflow review capability function
 *
 * Extracted from design.js for modularity
 * SD-LEO-REFACTOR-DESIGN-SUB-001
 */

import path from 'path';
import { fileURLToPath } from 'url';

// parseBaselineWorkflow is re-exported at bottom of file directly from utils.js
import { loadOrScanPatterns, checkAgainstPatterns } from './patterns.js';
import {
  determineAnalysisDepth,
  calculateSeverity,
  shouldFlag,
  getIssueContext,
  calculateConfidence,
  calculateOverallConfidenceScore,
  calculateUXImpactScore,
  generateWorkflowRecommendations,
  calculateOverallQualityScore
} from './workflow-scoring.js';
import {
  extractWorkflowFromStories,
  buildInteractionGraph,
  detectWorkflowIssues
} from './workflow-detection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main workflow review capability function
 * Analyzes workflow changes and generates UX impact assessment
 *
 * @param {string} sdId - Strategic Directive UUID
 * @param {Object} prdData - PRD content from product_requirements_v2
 * @param {Array} userStories - User stories from user_stories table
 * @param {Object} currentWorkflow - Baseline workflow from SD description
 * @param {Object} options - Options including repo_path for pattern scanning
 * @returns {Promise<Object>} Workflow analysis results
 */
export async function workflowReviewCapability(sdId, prdData, userStories, currentWorkflow, options = {}) {
  console.log('   🔍 Analyzing workflow changes...');

  const analysis = {
    version: '1.0.0',
    analyzed_at: new Date().toISOString(),
    status: 'PASS',
    ux_impact_score: 10,
    ux_score_breakdown: {},
    workflow_delta: {},
    interaction_impact: {},
    validation_results: {},
    recommendations: [],
    analysis_depth_info: {},
    confidence_metrics: {}
  };

  try {
    // Step 1: Determine adaptive analysis depth for each user story
    console.log('   📐 Determining analysis depth...');
    const analysisDepths = userStories.map(story => determineAnalysisDepth(story));
    const maxDepth = analysisDepths.reduce((max, d) => {
      const depthOrder = { 'LIGHT': 1, 'STANDARD': 2, 'DEEP': 3 };
      return depthOrder[d.depth] > depthOrder[max] ? d.depth : max;
    }, 'LIGHT');
    console.log(`   📐 Analysis depth: ${maxDepth} (${analysisDepths.filter(d => d.depth === 'DEEP').length} DEEP, ${analysisDepths.filter(d => d.depth === 'STANDARD').length} STANDARD, ${analysisDepths.filter(d => d.depth === 'LIGHT').length} LIGHT)`);

    analysis.analysis_depth_info = {
      overall_depth: maxDepth,
      story_depths: analysisDepths,
      depth_rationale: analysisDepths
        .filter(d => d.triggers.length > 0)
        .map(d => `${d.story_id}: ${d.depth} (${d.triggers.join(', ')})`)
    };

    // Step 2: Load or scan codebase patterns (with caching)
    const repoPath = options.repo_path || path.resolve(__dirname, '../../../../../ehg');
    console.log('   🔍 Loading codebase patterns...');
    const codebasePatterns = await loadOrScanPatterns(repoPath, options);

    // Step 3: Extract workflow from user stories
    const newWorkflow = await extractWorkflowFromStories(userStories);
    console.log(`   📊 Extracted ${newWorkflow.steps.length} workflow steps from user stories`);

    // Step 4: Build interaction graph
    const interactionGraph = buildInteractionGraph(newWorkflow);
    console.log(`   🗺️  Built interaction graph: ${interactionGraph.nodes.length} nodes, ${interactionGraph.edges.length} edges`);

    // Step 5: Detect workflow issues with adaptive depth and pattern awareness
    const rawIssues = detectWorkflowIssues(interactionGraph, currentWorkflow, analysisDepths, userStories);

    // Step 6: Apply intelligent severity scoring and confidence calculation
    console.log('   🎯 Scoring issue severity and confidence...');
    const allIssues = [];

    // Process each issue dimension
    for (const [dimension, dimensionIssues] of Object.entries(rawIssues)) {
      if (Array.isArray(dimensionIssues)) {
        for (const issue of dimensionIssues) {
          // Find associated user story
          const userStory = userStories.find(s => s.id === issue.story_id || s.story_key === issue.story_id);

          // Build context
          const context = getIssueContext(issue, userStory);

          // Apply auto-pass filter
          if (!shouldFlag(issue, context)) {
            continue; // Skip issues that don't meet flagging criteria
          }

          // Calculate severity
          const severity = calculateSeverity(issue, context);

          // Calculate confidence
          const confidence = calculateConfidence(issue, codebasePatterns, userStory);

          allIssues.push({
            ...issue,
            dimension,
            severity,
            confidence,
            context_flags: {
              is_financial: context.isFinancialTransaction,
              is_destructive: context.isDestructiveAction,
              is_required_path: context.isRequiredPath,
              priority: context.priority
            }
          });
        }
      }
    }

    console.log(`   ✅ ${allIssues.length} issues flagged after filtering (${Object.values(rawIssues).flat().length - allIssues.length} auto-passed)`);

    // Step 7: Calculate overall confidence score
    const confidenceMetrics = calculateOverallConfidenceScore(allIssues, codebasePatterns);
    analysis.confidence_metrics = confidenceMetrics;
    console.log(`   🎯 Overall confidence: ${(confidenceMetrics.overall * 100).toFixed(0)}% (${confidenceMetrics.high_confidence_count} high, ${confidenceMetrics.medium_confidence_count} medium, ${confidenceMetrics.low_confidence_count} low)`);

    // Step 8: Generate pattern-based recommendations
    const patternRecommendations = userStories
      .map(story => checkAgainstPatterns(story, codebasePatterns))
      .flat();

    // Step 9: Calculate UX impact score
    const issues = {
      deadEnds: allIssues.filter(i => i.dimension === 'deadEnds'),
      circularFlows: allIssues.filter(i => i.dimension === 'circularFlows'),
      unreachableStates: allIssues.filter(i => i.dimension === 'unreachableStates'),
      regressions: allIssues.filter(i => i.dimension === 'regressions'),
      touchpoints: rawIssues.touchpoints || [],
      navigation: rawIssues.navigation || {}
    };
    const uxScore = calculateUXImpactScore(issues, newWorkflow, currentWorkflow);

    // Step 10: Populate analysis results
    analysis.workflow_delta = {
      current_flow: currentWorkflow.steps || [],
      new_flow: newWorkflow.steps.map(s => s.action),
      added_steps: newWorkflow.steps.filter(
        s => !currentWorkflow.steps?.some(cs => cs.includes(s.action))
      ).map(s => s.action),
      removed_steps: currentWorkflow.steps?.filter(
        cs => !newWorkflow.steps.some(s => s.action.includes(cs))
      ) || [],
      modified_steps: [],
      step_count_delta: newWorkflow.steps.length - (currentWorkflow.steps?.length || 0)
    };

    analysis.interaction_impact = {
      affected_touchpoints: issues.touchpoints || [],
      navigation_impact: issues.navigation || {
        added_routes: [],
        removed_routes: [],
        modified_routes: [],
        requires_redirects: false
      },
      regressions_detected: issues.regressions || []
    };

    // Step 11: Build comprehensive validation results with all dimensions
    analysis.validation_results = {
      // Core topology issues (ALL depths)
      dead_ends: issues.deadEnds || [],
      circular_flows: issues.circularFlows || [],
      unreachable_states: issues.unreachableStates || [],

      // Enhanced dimensions (STANDARD + DEEP)
      error_recovery: allIssues.filter(i => i.dimension === 'error_recovery'),
      loading_states: allIssues.filter(i => i.dimension === 'loading_states'),
      confirmations: allIssues.filter(i => i.dimension === 'confirmations'),

      // Deep analysis dimensions (DEEP only)
      form_validation: allIssues.filter(i => i.dimension === 'form_validation'),
      state_management: allIssues.filter(i => i.dimension === 'state_management'),
      permission_gates: allIssues.filter(i => i.dimension === 'permission_gates'),
      accessibility: allIssues.filter(i => i.dimension === 'accessibility'),
      browser_controls: allIssues.filter(i => i.dimension === 'browser_controls'),

      graph_metrics: {
        total_nodes: interactionGraph.nodes.length,
        total_edges: interactionGraph.edges.length,
        average_path_length: interactionGraph.edges.length > 0
          ? (interactionGraph.edges.length / interactionGraph.nodes.length).toFixed(1)
          : 0,
        max_path_depth: Math.max(...interactionGraph.nodes.map((n, i) => i + 1), 0),
        goal_nodes: interactionGraph.nodes.filter(n => n.type === 'goal').length
      }
    };

    analysis.ux_impact_score = uxScore.overall;
    analysis.ux_score_breakdown = uxScore.dimensions;

    // Step 12: Merge generated recommendations with pattern-based recommendations
    const workflowRecommendations = generateWorkflowRecommendations(issues, uxScore, analysis);
    analysis.recommendations = [
      ...workflowRecommendations,
      ...patternRecommendations.map(rec => ({
        ...rec,
        source: 'pattern_analysis'
      }))
    ];

    // Determine pass/fail status - consider CRITICAL severity issues
    const criticalIssues = allIssues.filter(i => i.severity === 'CRITICAL');
    const hasBlockingIssues =
      criticalIssues.length > 0 ||
      issues.deadEnds.length > 0 ||
      issues.circularFlows.length > 0 ||
      uxScore.overall < 6.0;

    analysis.status = hasBlockingIssues ? 'FAIL' : 'PASS';

    // Calculate quality gate status
    analysis.quality_gate_status = {
      workflow_validation: analysis.status,
      ux_score_threshold: uxScore.overall >= 6.0 ? 'PASS' : 'FAIL',
      regression_mitigation: issues.regressions.length === 0 ? 'PASS' : 'CONDITIONAL',
      test_coverage: 'PENDING',
      overall: hasBlockingIssues ? 'BLOCKED' : (uxScore.overall >= 6.5 ? 'PASS' : 'CONDITIONAL_PASS'),
      overall_score: calculateOverallQualityScore(analysis)
    };

    console.log(`   ${analysis.status === 'PASS' ? '✅' : '❌'} Workflow validation: ${analysis.status}`);
    console.log(`   📊 UX Impact Score: ${uxScore.overall}/10`);

    // Log critical issues
    if (criticalIssues.length > 0) {
      console.log(`   🚨 ${criticalIssues.length} CRITICAL issue(s) detected`);
    }

    // Log core topology issues
    if (issues.deadEnds.length > 0) {
      console.log(`   ⚠️  ${issues.deadEnds.length} dead end(s) detected`);
    }
    if (issues.circularFlows.length > 0) {
      console.log(`   ⚠️  ${issues.circularFlows.length} circular flow(s) detected`);
    }
    if (issues.regressions.length > 0) {
      console.log(`   ⚠️  ${issues.regressions.length} regression(s) detected`);
    }

    // Log enhanced dimensions (if present)
    const errorRecoveryIssues = allIssues.filter(i => i.dimension === 'error_recovery');
    const confirmationIssues = allIssues.filter(i => i.dimension === 'confirmations');
    const loadingIssues = allIssues.filter(i => i.dimension === 'loading_states');
    const formValidationIssues = allIssues.filter(i => i.dimension === 'form_validation');
    const accessibilityIssues = allIssues.filter(i => i.dimension === 'accessibility');

    if (errorRecoveryIssues.length > 0) {
      console.log(`   ⚠️  ${errorRecoveryIssues.length} missing error recovery path(s)`);
    }
    if (confirmationIssues.length > 0) {
      console.log(`   ⚠️  ${confirmationIssues.length} missing confirmation(s) for destructive actions`);
    }
    if (loadingIssues.length > 0) {
      console.log(`   ⚠️  ${loadingIssues.length} missing loading state(s)`);
    }
    if (formValidationIssues.length > 0) {
      console.log(`   ⚠️  ${formValidationIssues.length} form validation timing issue(s)`);
    }
    if (accessibilityIssues.length > 0) {
      console.log(`   ⚠️  ${accessibilityIssues.length} accessibility issue(s)`);
    }

    // Log recommendations summary
    if (analysis.recommendations.length > 0) {
      const highPriorityRecs = analysis.recommendations.filter(r => r.priority === 'HIGH' || r.priority === 'CRITICAL');
      console.log(`   💡 ${analysis.recommendations.length} recommendation(s) generated (${highPriorityRecs.length} high priority)`);
    }

    return analysis;

  } catch (error) {
    console.error('   ❌ Workflow analysis error:', error.message);
    analysis.status = 'ERROR';
    analysis.error = error.message;
    return analysis;
  }
}

// Re-export parseBaselineWorkflow for external use
export { parseBaselineWorkflow } from './utils.js';
