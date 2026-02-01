/**
 * Route-Aware UAT Reporter
 * SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001 - FR-5
 *
 * Purpose: Enhanced UAT reporting with route context and issue pattern integration.
 * Generates comprehensive reports showing route maturity, pattern matches, and RCA recommendations.
 *
 * Features:
 * - Route development status summary
 * - Pattern match annotations
 * - RCA trigger recommendations
 * - Severity-based prioritization
 * - Actionable insights
 */

import {
  fetchRoutes,
  getRouteDevelopmentSummary,
  annotateWithRouteContext,
  prioritizeByRouteMaturity,
  MATURITY_PRIORITY
} from './route-context-resolver.js';

import {
  matchFailure,
  getRCATriggerRecommendation,
  getPatternStatistics,
  SEVERITY_CONFIG
} from './issue-pattern-matcher.js';

/**
 * Generate route-aware UAT header
 * @returns {Promise<string>} Formatted header
 */
export async function generateRouteAwareHeader() {
  const summary = await getRouteDevelopmentSummary();
  const patternStats = await getPatternStatistics();

  const lines = [
    '═'.repeat(65),
    '  📍 ROUTE-AWARE UAT SESSION',
    '═'.repeat(65),
    '',
    '  Route Development Status:',
    `    ✅ Complete:    ${summary.complete} routes (${summary.completionRate}%)`,
    `    🔧 Development: ${summary.development} routes (${summary.developmentRate}%)`,
    `    📝 Draft:       ${summary.draft} routes (${summary.draftRate}%)`,
    ''
  ];

  if (summary.needsAttention.length > 0) {
    lines.push('  ⚠️  Routes Needing Attention:');
    for (const route of summary.needsAttention.slice(0, 5)) {
      const maturityIcon = route.maturity === 'draft' ? '📝' : '🔧';
      lines.push(`    ${maturityIcon} ${route.path} (${route.maturity})`);
    }
    if (summary.needsAttention.length > 5) {
      lines.push(`    ... and ${summary.needsAttention.length - 5} more`);
    }
    lines.push('');
  }

  if (!patternStats.error) {
    lines.push('  Known Issue Patterns:');
    lines.push(`    🔴 Critical: ${patternStats.bySeverity.critical || 0}`);
    lines.push(`    🟠 High:     ${patternStats.bySeverity.high || 0}`);
    lines.push(`    🟡 Medium:   ${patternStats.bySeverity.medium || 0}`);
    lines.push(`    🔵 Low:      ${patternStats.bySeverity.low || 0}`);
    lines.push('');
  }

  lines.push('─'.repeat(65));

  return lines.join('\n');
}

/**
 * Generate route context annotation for a scenario
 * @param {Object} scenario - Annotated scenario
 * @returns {string} Context annotation
 */
function _formatRouteContext(scenario) {
  if (!scenario.hasRouteContext) {
    return '    📍 Route: Not mapped';
  }

  const ctx = scenario.routeContext;
  const maturityInfo = MATURITY_PRIORITY[ctx.maturity];
  const icon = ctx.maturity === 'complete' ? '✅' : ctx.maturity === 'development' ? '🔧' : '📝';

  return [
    `    📍 Route: ${ctx.path}`,
    `       ${icon} Status: ${maturityInfo.label}`,
    `       🎯 Testing Focus: ${maturityInfo.testingFocus}`
  ].join('\n');
}

/**
 * Process and report a UAT failure with pattern matching
 * @param {Object} failure - UAT failure details
 * @returns {Promise<Object>} Processed failure report
 */
export async function processFailureWithPatterns(failure) {
  // Match against known patterns
  const matchResult = await matchFailure(failure);

  // Get RCA recommendation
  const rcaRecommendation = getRCATriggerRecommendation(matchResult);

  // Build enhanced report
  const report = {
    failure,
    severity: matchResult.classifiedSeverity,
    severityLabel: matchResult.severityLabel,
    patternMatch: {
      found: matchResult.hasMatch,
      pattern: matchResult.bestMatch,
      similarity: matchResult.bestMatch?.similarity,
      allMatches: matchResult.allMatches
    },
    suggestedSolutions: matchResult.suggestedSolutions,
    preventionChecklist: matchResult.preventionChecklist,
    rca: rcaRecommendation,
    formattedOutput: null
  };

  // Generate formatted output
  report.formattedOutput = formatFailureReport(report);

  return report;
}

/**
 * Format a failure report for display
 * @param {Object} report - Processed failure report
 * @returns {string} Formatted report
 */
function formatFailureReport(report) {
  const { failure, severity, severityLabel, patternMatch, suggestedSolutions, rca } = report;
  const severityConfig = SEVERITY_CONFIG[severity];

  const lines = [
    '',
    '─'.repeat(65),
    '  ❌ FAILURE DETECTED',
    '─'.repeat(65),
    '',
    `  📋 Description: ${failure.description || 'Not specified'}`,
    `  🏷️  Type: ${failure.failureType || 'Unknown'}`,
    `  ⚠️  Severity: ${severityLabel} (${severityConfig.description})`,
    ''
  ];

  // Pattern match section
  if (patternMatch.found) {
    const pattern = patternMatch.pattern;
    lines.push(`  🔍 PATTERN MATCH FOUND: ${pattern.pattern_id}`);
    lines.push(`     Similarity: ${Math.round(patternMatch.similarity * 100)}%`);
    lines.push(`     Summary: ${pattern.issue_summary.substring(0, 60)}...`);
    lines.push(`     Occurrences: ${pattern.occurrence_count} | Trend: ${pattern.trend}`);
    lines.push('');

    if (suggestedSolutions.length > 0) {
      lines.push('  💡 SUGGESTED SOLUTIONS:');
      for (let i = 0; i < Math.min(suggestedSolutions.length, 3); i++) {
        const solution = suggestedSolutions[i];
        const text = typeof solution === 'string' ? solution : solution.description || JSON.stringify(solution);
        lines.push(`     ${i + 1}. ${text.substring(0, 70)}...`);
      }
      lines.push('');
    }
  } else {
    lines.push('  🔍 No matching patterns found - this may be a new issue type');
    lines.push('');
  }

  // RCA recommendation
  if (rca.shouldTrigger) {
    lines.push(`  🔬 RCA RECOMMENDED: ${rca.reason}`);
    lines.push(`     Priority: ${rca.priority}`);
    lines.push(`     Sub-agent: ${rca.subAgentType}`);
    lines.push('');
  }

  lines.push('─'.repeat(65));

  return lines.join('\n');
}

/**
 * Generate UAT session summary with route awareness
 * @param {Object} session - UAT session data
 * @returns {Promise<string>} Formatted summary
 */
export async function generateRouteAwareSummary(session) {
  const { scenarios, failures, passes, skips, blocked } = session;

  // Get route summary
  const routeSummary = await getRouteDevelopmentSummary();

  // Count scenarios by route maturity
  const annotatedScenarios = await annotateWithRouteContext(scenarios);
  const byMaturity = {
    draft: 0,
    development: 0,
    complete: 0,
    unmapped: 0
  };

  for (const scenario of annotatedScenarios) {
    if (scenario.hasRouteContext) {
      byMaturity[scenario.routeContext.maturity]++;
    } else {
      byMaturity.unmapped++;
    }
  }

  const total = scenarios.length;
  const passRate = total > 0 ? Math.round((passes / total) * 100) : 0;

  // Determine quality gate
  let qualityGate = 'GREEN';
  let gateIcon = '🟢';
  if (failures > 0) {
    qualityGate = passRate >= 85 ? 'YELLOW' : 'RED';
    gateIcon = passRate >= 85 ? '🟡' : '🔴';
  }

  const lines = [
    '',
    '═'.repeat(65),
    '  📊 ROUTE-AWARE UAT SESSION SUMMARY',
    '═'.repeat(65),
    '',
    `  ${gateIcon} Quality Gate: ${qualityGate} (${passRate}% pass rate)`,
    '',
    '  Test Results:',
    `    ✅ Passed:  ${passes}`,
    `    ❌ Failed:  ${failures}`,
    `    ⏭️  Skipped: ${skips}`,
    `    🚫 Blocked: ${blocked}`,
    '',
    '  Coverage by Route Maturity:',
    `    ✅ Complete Routes:    ${byMaturity.complete} scenarios`,
    `    🔧 Development Routes: ${byMaturity.development} scenarios`,
    `    📝 Draft Routes:       ${byMaturity.draft} scenarios`,
    `    ❓ Unmapped:           ${byMaturity.unmapped} scenarios`,
    ''
  ];

  // Add recommendations based on route coverage
  const recommendations = [];

  if (byMaturity.unmapped > byMaturity.complete) {
    recommendations.push('📌 Many scenarios lack route mapping - consider adding path hints');
  }

  if (routeSummary.draft > 0 && byMaturity.draft === 0) {
    recommendations.push(`📌 ${routeSummary.draft} draft routes exist but weren't tested`);
  }

  if (failures > 0 && qualityGate === 'RED') {
    recommendations.push('📌 Pass rate below 85% - address failures before shipping');
  }

  if (recommendations.length > 0) {
    lines.push('  Recommendations:');
    for (const rec of recommendations) {
      lines.push(`    ${rec}`);
    }
    lines.push('');
  }

  lines.push('═'.repeat(65));

  return lines.join('\n');
}

/**
 * Enhance UAT scenarios with route awareness
 * @param {Array} scenarios - Raw scenarios
 * @returns {Promise<Array>} Enhanced scenarios
 */
export async function enhanceScenarios(scenarios) {
  // Annotate with route context
  const annotated = await annotateWithRouteContext(scenarios);

  // Prioritize by route maturity (draft/development first)
  const prioritized = prioritizeByRouteMaturity(annotated);

  return prioritized;
}

/**
 * Get route-based testing recommendations
 * @param {string} _sdId - Strategic Directive ID (for future use)
 * @returns {Promise<Object>} Testing recommendations
 */
export async function getTestingRecommendations(_sdId) {
  const { routes } = await fetchRoutes();
  await getRouteDevelopmentSummary(); // Called for potential side effects

  const recommendations = {
    focusAreas: [],
    skipRecommendations: [],
    priorityRoutes: []
  };

  // Focus on development routes
  const developmentRoutes = routes.filter(r => r.maturity === 'development');
  if (developmentRoutes.length > 0) {
    recommendations.focusAreas.push({
      area: 'Development Routes',
      reason: 'Routes in active development need regression testing',
      routes: developmentRoutes.slice(0, 5).map(r => r.path)
    });
  }

  // Draft routes for exploratory testing
  const draftRoutes = routes.filter(r => r.maturity === 'draft');
  if (draftRoutes.length > 0) {
    recommendations.focusAreas.push({
      area: 'Draft Routes',
      reason: 'New routes need exploratory testing to find issues early',
      routes: draftRoutes.slice(0, 5).map(r => r.path)
    });
  }

  // Complete routes can have lighter testing
  const completeRoutes = routes.filter(r => r.maturity === 'complete');
  if (completeRoutes.length > 5) {
    recommendations.skipRecommendations.push({
      area: 'Stable Routes',
      reason: `${completeRoutes.length} complete routes can use smoke testing only`,
      count: completeRoutes.length
    });
  }

  // Priority routes (development + draft)
  recommendations.priorityRoutes = [
    ...developmentRoutes,
    ...draftRoutes
  ].slice(0, 10).map(r => ({
    path: r.path,
    title: r.title,
    maturity: r.maturity,
    testingFocus: MATURITY_PRIORITY[r.maturity].testingFocus
  }));

  return recommendations;
}

export default {
  generateRouteAwareHeader,
  processFailureWithPatterns,
  generateRouteAwareSummary,
  enhanceScenarios,
  getTestingRecommendations
};
