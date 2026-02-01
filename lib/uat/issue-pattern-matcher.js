/**
 * Issue Pattern Matcher
 * SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001 - FR-3, FR-4
 *
 * Purpose: Match UAT failures against known issue_patterns before creating new issues.
 * Prevents duplicate issue tracking and enables knowledge reuse.
 *
 * Features:
 * - Text similarity matching against issue_patterns
 * - Category and severity-based filtering
 * - Suggests proven solutions from matched patterns
 * - Auto-triggers RCA sub-agent for HIGH/CRITICAL severity
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

let supabase = null;

/**
 * Initialize Supabase client
 * @returns {Promise<Object>} Supabase client
 */
async function getClient() {
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }
  return supabase;
}

/**
 * Severity levels with RCA trigger configuration
 * FR-6: Deterministic severity classification
 */
export const SEVERITY_CONFIG = {
  critical: {
    weight: 4,
    autoTriggerRCA: true,
    label: 'CRITICAL',
    color: 'red',
    description: 'Blocks core functionality, data loss risk'
  },
  high: {
    weight: 3,
    autoTriggerRCA: true,
    label: 'HIGH',
    color: 'orange',
    description: 'Significant impact, workaround may exist'
  },
  medium: {
    weight: 2,
    autoTriggerRCA: false,
    label: 'MEDIUM',
    color: 'yellow',
    description: 'Moderate impact, non-blocking'
  },
  low: {
    weight: 1,
    autoTriggerRCA: false,
    label: 'LOW',
    color: 'blue',
    description: 'Minor issue, cosmetic'
  }
};

/**
 * Failure type to severity mapping
 * FR-6: Deterministic severity classification rules
 */
export const FAILURE_TYPE_SEVERITY = {
  // Functional failures - typically high severity
  'functional': 'high',
  'functional-blocking': 'critical',
  'functional-non-blocking': 'medium',

  // Visual failures - typically medium/low
  'visual': 'medium',
  'visual-critical': 'high',
  'visual-minor': 'low',

  // Performance failures
  'performance': 'medium',
  'performance-blocking': 'high',
  'performance-severe': 'critical',

  // Console errors
  'console': 'medium',
  'console-error': 'high',
  'console-warning': 'low',

  // Security failures - always high or critical
  'security': 'critical',
  'security-auth': 'critical',
  'security-data': 'critical',

  // Accessibility failures
  'accessibility': 'medium',
  'accessibility-critical': 'high'
};

/**
 * Classify severity based on failure characteristics
 * FR-6: Deterministic severity classification
 * @param {Object} failure - UAT failure details
 * @returns {string} Severity level
 */
export function classifySeverity(failure) {
  const { failureType, isBlocking, affectsData, affectsAuth, isRegression } = failure;

  // Start with failure type mapping
  let severity = FAILURE_TYPE_SEVERITY[failureType] || 'medium';

  // Escalate based on characteristics
  if (isBlocking && severity !== 'critical') {
    severity = 'high';
  }

  if (affectsData || affectsAuth) {
    severity = 'critical';
  }

  if (isRegression && severity === 'low') {
    severity = 'medium';
  }

  return severity;
}

/**
 * Search issue patterns for matches
 * @param {string} searchText - Text to match against patterns
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Matching patterns
 */
export async function searchPatterns(searchText, options = {}) {
  const client = await getClient();
  const { category, severity, limit = 5, minSimilarity = 0.3 } = options;

  // Build query for active patterns
  let query = client
    .from('issue_patterns')
    .select(`
      id,
      pattern_id,
      category,
      severity,
      issue_summary,
      occurrence_count,
      proven_solutions,
      prevention_checklist,
      related_sub_agents,
      success_rate,
      status,
      trend
    `)
    .in('status', ['active', 'assigned']);

  if (category) {
    query = query.eq('category', category);
  }

  if (severity) {
    query = query.eq('severity', severity);
  }

  const { data: patterns, error } = await query;

  if (error) {
    console.error('[IssuePatternMatcher] Error searching patterns:', error.message);
    return [];
  }

  if (!patterns || patterns.length === 0) {
    return [];
  }

  // Calculate similarity scores using text matching
  const scored = patterns.map(pattern => {
    const similarity = calculateSimilarity(searchText, pattern.issue_summary);
    return { ...pattern, similarity };
  });

  // Filter by minimum similarity and sort
  const matched = scored
    .filter(p => p.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return matched;
}

/**
 * Calculate text similarity (simple token-based)
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @returns {number} Similarity score 0-1
 */
function calculateSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;

  // Normalize and tokenize
  const normalize = (text) => text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);

  const tokens1 = new Set(normalize(text1));
  const tokens2 = new Set(normalize(text2));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  // Calculate Jaccard similarity
  const intersection = [...tokens1].filter(t => tokens2.has(t)).length;
  const union = new Set([...tokens1, ...tokens2]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * Match a UAT failure against issue patterns
 * @param {Object} failure - UAT failure details
 * @returns {Promise<Object>} Match result
 */
export async function matchFailure(failure) {
  const { description, failureType, errorMessage, routePath } = failure;

  // Build search text from failure details
  const searchText = [description, failureType, errorMessage, routePath]
    .filter(Boolean)
    .join(' ');

  // Classify severity
  const severity = classifySeverity(failure);
  const severityConfig = SEVERITY_CONFIG[severity];

  // Search for matching patterns
  const matches = await searchPatterns(searchText, {
    limit: 3,
    minSimilarity: 0.25
  });

  // Build result
  const result = {
    failure,
    classifiedSeverity: severity,
    severityLabel: severityConfig.label,
    shouldTriggerRCA: severityConfig.autoTriggerRCA,
    hasMatch: matches.length > 0,
    bestMatch: matches[0] || null,
    allMatches: matches,
    suggestedSolutions: [],
    preventionChecklist: []
  };

  // Extract solutions from best match
  if (result.bestMatch) {
    result.suggestedSolutions = result.bestMatch.proven_solutions || [];
    result.preventionChecklist = result.bestMatch.prevention_checklist || [];
    result.relatedSubAgents = result.bestMatch.related_sub_agents || [];
  }

  return result;
}

/**
 * Get RCA trigger recommendation
 * FR-4: Auto-trigger RCA for HIGH/CRITICAL severity
 * @param {Object} matchResult - Result from matchFailure
 * @returns {Object} RCA trigger recommendation
 */
export function getRCATriggerRecommendation(matchResult) {
  const { classifiedSeverity, shouldTriggerRCA, hasMatch, bestMatch, failure } = matchResult;

  // Always recommend RCA for critical/high
  if (shouldTriggerRCA) {
    return {
      shouldTrigger: true,
      reason: `${SEVERITY_CONFIG[classifiedSeverity].label} severity failure requires root cause analysis`,
      rcaPrompt: buildRCAPrompt(failure, bestMatch),
      subAgentType: 'rca-agent',
      priority: classifiedSeverity === 'critical' ? 'immediate' : 'high'
    };
  }

  // Recommend RCA if pattern is recurring (high occurrence count)
  if (hasMatch && bestMatch.occurrence_count >= 3 && bestMatch.trend === 'increasing') {
    return {
      shouldTrigger: true,
      reason: `Recurring pattern (${bestMatch.occurrence_count} occurrences, trend: increasing)`,
      rcaPrompt: buildRCAPrompt(failure, bestMatch),
      subAgentType: 'rca-agent',
      priority: 'medium'
    };
  }

  return {
    shouldTrigger: false,
    reason: `${SEVERITY_CONFIG[classifiedSeverity].label} severity does not require automatic RCA`,
    subAgentType: null,
    priority: null
  };
}

/**
 * Build RCA prompt for sub-agent invocation
 * @param {Object} failure - Failure details
 * @param {Object} pattern - Matched pattern (if any)
 * @returns {string} RCA prompt
 */
function buildRCAPrompt(failure, pattern) {
  const parts = [
    'Analyze the root cause of this UAT failure:',
    '',
    `**Failure Description**: ${failure.description || 'Not specified'}`,
    `**Failure Type**: ${failure.failureType || 'Unknown'}`,
    `**Error Message**: ${failure.errorMessage || 'None'}`,
    `**Route/Path**: ${failure.routePath || 'Not specified'}`
  ];

  if (pattern) {
    parts.push(
      '',
      `**Related Pattern**: ${pattern.pattern_id}`,
      `**Pattern Summary**: ${pattern.issue_summary}`,
      `**Occurrence Count**: ${pattern.occurrence_count}`,
      `**Trend**: ${pattern.trend}`
    );

    if (pattern.proven_solutions?.length > 0) {
      parts.push(
        '',
        '**Previous Solutions Tried**:',
        ...pattern.proven_solutions.map((s, i) => `${i + 1}. ${typeof s === 'string' ? s : s.description || JSON.stringify(s)}`)
      );
    }
  }

  parts.push(
    '',
    'Perform 5-whys analysis and identify the true root cause.',
    'Recommend corrective and preventive actions (CAPA).'
  );

  return parts.join('\n');
}

/**
 * Update pattern with new occurrence
 * @param {string} patternId - Pattern to update
 * @param {Object} failureDetails - Details of the new occurrence
 * @returns {Promise<Object>} Update result
 */
export async function recordPatternOccurrence(patternId, failureDetails) {
  const client = await getClient();
  const { sdId } = failureDetails;

  // Increment occurrence count and update last_seen
  const { data, error } = await client
    .from('issue_patterns')
    .update({
      occurrence_count: client.sql`occurrence_count + 1`,
      last_seen_sd_id: sdId,
      updated_at: new Date().toISOString()
    })
    .eq('pattern_id', patternId)
    .select()
    .single();

  if (error) {
    console.error('[IssuePatternMatcher] Error updating pattern:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true, pattern: data };
}

/**
 * Get pattern statistics for reporting
 * @returns {Promise<Object>} Pattern statistics
 */
export async function getPatternStatistics() {
  const client = await getClient();

  const { data: patterns, error } = await client
    .from('issue_patterns')
    .select('category, severity, status, occurrence_count, trend')
    .in('status', ['active', 'assigned']);

  if (error || !patterns) {
    return { error: error?.message || 'No patterns found' };
  }

  const stats = {
    total: patterns.length,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    byStatus: { active: 0, assigned: 0 },
    byTrend: { increasing: 0, stable: 0, decreasing: 0 },
    totalOccurrences: 0,
    categories: new Set()
  };

  for (const pattern of patterns) {
    stats.bySeverity[pattern.severity] = (stats.bySeverity[pattern.severity] || 0) + 1;
    stats.byStatus[pattern.status] = (stats.byStatus[pattern.status] || 0) + 1;
    stats.byTrend[pattern.trend] = (stats.byTrend[pattern.trend] || 0) + 1;
    stats.totalOccurrences += pattern.occurrence_count || 0;
    stats.categories.add(pattern.category);
  }

  stats.categories = [...stats.categories];

  return stats;
}

export default {
  searchPatterns,
  matchFailure,
  classifySeverity,
  getRCATriggerRecommendation,
  recordPatternOccurrence,
  getPatternStatistics,
  SEVERITY_CONFIG,
  FAILURE_TYPE_SEVERITY
};
