/**
 * Unified Low-Risk Bypass Evaluation
 * LEO Protocol v4.2.0 - Opus 4.5 Optimization
 *
 * Uses existing risk rubrics and learning data to determine if full SD ceremony can be skipped.
 * Queries learning_configurations and agent_performance_metrics for data-driven decisions.
 *
 * Pathways:
 * - MICRO_FIX: <10 LOC, single file, not critical path → Skip ALL ceremony
 * - QUICK_FIX: ≤50 LOC, low/medium severity → Use QUICKFIX sub-agent only
 * - FULL_SD: Everything else → Full LEAD→PLAN→EXEC workflow
 *
 * Created: 2025-11-26 (LEO Protocol Opus 4.5 Enhancement)
 * Reference: SD-FOUND-SAFETY-002, SD-CREWAI-ARCHITECTURE-001
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

// Consolidated thresholds from existing codebase
// Sources: quickfix.js, risk.js, risk-context.js, ai-loc-estimator.js, validation-enforcement.md
const THRESHOLDS = {
  // LOC thresholds (from quickfix.js:190, ai-loc-estimator.js:145)
  LOC_MICRO_FIX: 10,      // NEW: Trivial changes - skip ALL ceremony
  LOC_QUICK_FIX: 50,      // From quickfix.js - escalation boundary
  LOC_COMPONENT_OPTIMAL: 600,  // From CLAUDE_EXEC.md - component sweet spot
  LOC_COMPONENT_MAX: 1500,     // From risk.js - triggers HIGH complexity

  // Risk score thresholds (from risk.js:564-569)
  RISK_SCORE_LOW: 4,
  RISK_SCORE_MEDIUM: 6,
  RISK_SCORE_HIGH: 8,
  RISK_SCORE_CRITICAL: 10,

  // Context thresholds (from risk-context.js:147-164)
  HIGH_CHURN_THRESHOLD: 10,    // >10 changes in 90 days
  WIDELY_USED_THRESHOLD: 10,   // >10 imports
  LOW_COVERAGE_THRESHOLD: 50,  // <50% test coverage

  // Learning thresholds (from validation-enforcement.md)
  MATURITY_BONUS_SD_COUNT: 10,
  MATURITY_BONUS_SUCCESS_RATE: 0.85,
  TARGET_SUCCESS_RATE: 0.85
};

// Critical path patterns (from risk-context.js)
const CRITICAL_PATH_PATTERNS = [
  /Dashboard/i,
  /App\.(tsx|jsx|js)$/i,
  /Auth/i,
  /Router/i,
  /index\.(tsx|jsx|js)$/i,
  /Layout/i,
  /Provider/i
];

// Non-negotiable blockers - NEVER bypass regardless of LOC
const NON_NEGOTIABLE_KEYWORDS = [
  'migration', 'schema', 'alter table', 'drop', 'truncate',  // Database
  'auth', 'authentication', 'password', 'token', 'session', 'rls',  // Security
  'payment', 'stripe', 'billing', 'subscription',  // Financial
  'delete user', 'gdpr', 'pii', 'personal data'  // Data protection
];

/**
 * Check if issue contains non-negotiable keywords
 * @param {Object} context - Issue context
 * @returns {boolean} True if non-negotiable
 */
function containsNonNegotiable(context) {
  const searchText = [
    context.title || '',
    context.description || '',
    context.scope || '',
    ...(context.affectedFiles || [])
  ].join(' ').toLowerCase();

  return NON_NEGOTIABLE_KEYWORDS.some(keyword =>
    searchText.includes(keyword.toLowerCase())
  );
}

/**
 * Check if any affected files are on critical path
 * @param {string[]} files - List of affected file paths
 * @returns {boolean} True if critical path file affected
 */
function affectsCriticalPath(files = []) {
  return files.some(file =>
    CRITICAL_PATH_PATTERNS.some(pattern => pattern.test(file))
  );
}

/**
 * Query historical performance data for maturity bonus
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Maturity metrics
 */
async function getMaturityMetrics(supabase) {
  try {
    // Get learning configuration
    const { data: config } = await supabase
      .from('learning_configurations')
      .select('target_success_rate, current_success_rate, total_adaptations')
      .eq('config_scope', 'global')
      .single();

    // Get recent agent performance
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: metrics } = await supabase
      .from('agent_performance_metrics')
      .select('agent_code, successful_executions, total_executions, avg_execution_time')
      .gte('measurement_date', thirtyDaysAgo.toISOString().split('T')[0]);

    // Calculate aggregate success rate
    let totalSuccess = 0;
    let totalExecutions = 0;

    if (metrics && metrics.length > 0) {
      metrics.forEach(m => {
        totalSuccess += m.successful_executions || 0;
        totalExecutions += m.total_executions || 0;
      });
    }

    const avgSuccessRate = totalExecutions > 0 ? totalSuccess / totalExecutions : 0;

    // Count completed SDs
    const { count: sdCount } = await supabase
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed');

    return {
      targetSuccessRate: config?.target_success_rate || THRESHOLDS.TARGET_SUCCESS_RATE,
      currentSuccessRate: config?.current_success_rate || avgSuccessRate,
      calculatedSuccessRate: avgSuccessRate,
      completedSDs: sdCount || 0,
      hasMaturityBonus: (sdCount || 0) >= THRESHOLDS.MATURITY_BONUS_SD_COUNT &&
                        avgSuccessRate >= THRESHOLDS.MATURITY_BONUS_SUCCESS_RATE,
      totalAdaptations: config?.total_adaptations || 0
    };
  } catch (error) {
    console.warn('   ⚠️  Could not fetch maturity metrics:', error.message);
    return {
      targetSuccessRate: THRESHOLDS.TARGET_SUCCESS_RATE,
      currentSuccessRate: 0,
      calculatedSuccessRate: 0,
      completedSDs: 0,
      hasMaturityBonus: false,
      totalAdaptations: 0
    };
  }
}

/**
 * Query similar past issues to inform bypass decision
 * @param {Object} supabase - Supabase client
 * @param {Object} context - Issue context
 * @returns {Promise<Object>} Similar issue metrics
 */
async function getSimilarIssueMetrics(supabase, context) {
  try {
    // Find retrospectives with similar learning categories
    const category = categorizeIssue(context);

    const { data: retros } = await supabase
      .from('retrospectives')
      .select('quality_score, learning_category, what_went_well, what_needs_improvement')
      .eq('learning_category', category)
      .gte('quality_score', 70)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!retros || retros.length === 0) {
      return { similarIssuesFound: 0, avgQualityScore: 0, patternsApplicable: false };
    }

    const avgScore = retros.reduce((sum, r) => sum + (r.quality_score || 0), 0) / retros.length;

    return {
      similarIssuesFound: retros.length,
      avgQualityScore: avgScore,
      patternsApplicable: avgScore >= 80 && retros.length >= 3
    };
  } catch (error) {
    console.warn('   ⚠️  Could not fetch similar issue metrics:', error.message);
    return { similarIssuesFound: 0, avgQualityScore: 0, patternsApplicable: false };
  }
}

/**
 * Categorize issue for retrospective matching
 * Mirrors the logic in retro.js:categorizeLearning
 */
function categorizeIssue(context) {
  const searchText = [
    context.title || '',
    context.description || '',
    context.type || '',
    ...(context.affectedFiles || [])
  ].join(' ').toLowerCase();

  if (/database|schema|migration|table|column|rls|postgres|supabase|sql/.test(searchText)) {
    return 'DATABASE_SCHEMA';
  }
  if (/test|e2e|unit|playwright|coverage|spec|vitest|qa|quality/.test(searchText)) {
    return 'TESTING_STRATEGY';
  }
  if (/deploy|ci.?cd|github actions|pipeline|build|release/.test(searchText)) {
    return 'DEPLOYMENT_ISSUE';
  }
  if (/performance|optimization|speed|cache|load time|latency/.test(searchText)) {
    return 'PERFORMANCE_OPTIMIZATION';
  }
  if (/security|auth|rls|permission|role|access control|vulnerability/.test(searchText)) {
    return 'SECURITY_VULNERABILITY';
  }
  if (/ux|ui|user experience|usability|interface|design|component|modal/.test(searchText)) {
    return 'USER_EXPERIENCE';
  }
  if (/documentation|docs|readme|guide|instruction/.test(searchText)) {
    return 'DOCUMENTATION';
  }
  if (/process|workflow|procedure|checklist|standard|handoff|protocol|bmad/.test(searchText)) {
    return 'PROCESS_IMPROVEMENT';
  }

  return 'APPLICATION_ISSUE';
}

/**
 * Main bypass evaluation function
 *
 * @param {Object} issueContext - Context about the issue/change
 * @param {number} issueContext.estimatedLoc - Estimated lines of code
 * @param {string} issueContext.severity - low, medium, high, critical
 * @param {string[]} issueContext.affectedFiles - List of files to be changed
 * @param {string} issueContext.type - bug, feature, polish, typo, documentation
 * @param {string} issueContext.title - Issue title
 * @param {string} issueContext.description - Issue description
 * @param {boolean} issueContext.hasSchemaChanges - Database schema changes
 * @param {boolean} issueContext.hasAuthChanges - Authentication/authorization changes
 * @param {Object} options - Evaluation options
 * @param {boolean} options.skipLearningQuery - Skip database queries (for testing)
 * @param {boolean} options.verbose - Log detailed reasoning
 * @returns {Promise<Object>} Bypass decision with reasoning
 */
export async function shouldBypassFullSD(issueContext, options = {}) {
  const {
    estimatedLoc = 0,
    severity = 'medium',
    affectedFiles = [],
    type = 'bug',
    title = '',
    description: _description = '',
    hasSchemaChanges = false,
    hasAuthChanges = false
  } = issueContext;

  const result = {
    bypass: false,
    pathway: 'FULL_SD',
    confidence: 0,
    reason: '',
    reasoning: [],
    thresholds: THRESHOLDS,
    maturityMetrics: null,
    similarIssueMetrics: null
  };

  const log = (msg) => {
    result.reasoning.push(msg);
    if (options.verbose) console.log(`   ${msg}`);
  };

  log(`Evaluating: ${title || 'Untitled'} (${estimatedLoc} LOC, ${severity} severity, ${type})`);

  // ============================================
  // PHASE 1: Non-Negotiable Blockers
  // ============================================

  if (hasSchemaChanges) {
    log('❌ BLOCKED: Schema changes require full SD');
    result.reason = 'Schema changes require full SD review';
    return result;
  }

  if (hasAuthChanges) {
    log('❌ BLOCKED: Auth changes require full SD');
    result.reason = 'Authentication/authorization changes require full SD review';
    return result;
  }

  if (severity === 'critical') {
    log('❌ BLOCKED: Critical severity requires full SD');
    result.reason = 'Critical severity issues require full SD review';
    return result;
  }

  if (containsNonNegotiable(issueContext)) {
    log('❌ BLOCKED: Contains non-negotiable keywords');
    result.reason = 'Issue contains keywords requiring full SD review';
    return result;
  }

  // ============================================
  // PHASE 2: Query Learning Data (if not skipped)
  // ============================================

  let supabase = null;
  if (!options.skipLearningQuery) {
    try {
      supabase = await createSupabaseServiceClient('engineer', { verbose: false });
      result.maturityMetrics = await getMaturityMetrics(supabase);
      result.similarIssueMetrics = await getSimilarIssueMetrics(supabase, issueContext);

      log(`📊 Maturity: ${result.maturityMetrics.completedSDs} SDs, ${(result.maturityMetrics.calculatedSuccessRate * 100).toFixed(1)}% success`);
      log(`📊 Similar issues: ${result.similarIssueMetrics.similarIssuesFound} found, avg quality ${result.similarIssueMetrics.avgQualityScore.toFixed(0)}`);
    } catch (error) {
      log(`⚠️  Learning query failed: ${error.message}`);
    }
  }

  // ============================================
  // PHASE 3: Pathway Determination
  // ============================================

  const onCriticalPath = affectsCriticalPath(affectedFiles);

  // MICRO_FIX: Trivial changes
  if (estimatedLoc <= THRESHOLDS.LOC_MICRO_FIX &&
      affectedFiles.length <= 1 &&
      !onCriticalPath &&
      ['typo', 'documentation', 'bug'].includes(type)) {

    result.bypass = true;
    result.pathway = 'MICRO_FIX';
    result.confidence = 95;
    result.reason = `Trivial change: ${estimatedLoc} LOC, single file, not critical path`;
    log(`✅ MICRO_FIX: ${result.reason}`);
    return result;
  }

  // QUICK_FIX: Standard quick-fix path
  if (estimatedLoc <= THRESHOLDS.LOC_QUICK_FIX &&
      ['low', 'medium'].includes(severity) &&
      type !== 'feature' &&
      affectedFiles.length <= 3) {

    // Base confidence from LOC proximity to threshold
    let confidence = 85 - (estimatedLoc / THRESHOLDS.LOC_QUICK_FIX * 15);

    // Maturity bonus
    if (result.maturityMetrics?.hasMaturityBonus) {
      confidence += 5;
      log('📈 +5 confidence: Maturity bonus (>10 SDs, >85% success)');
    }

    // Similar issue bonus
    if (result.similarIssueMetrics?.patternsApplicable) {
      confidence += 5;
      log('📈 +5 confidence: Similar patterns succeeded');
    }

    // Critical path penalty
    if (onCriticalPath) {
      confidence -= 10;
      log('📉 -10 confidence: Critical path file affected');
    }

    // Multiple files penalty
    if (affectedFiles.length > 1) {
      confidence -= (affectedFiles.length - 1) * 3;
      log(`📉 -${(affectedFiles.length - 1) * 3} confidence: Multiple files (${affectedFiles.length})`);
    }

    result.bypass = confidence >= 70;
    result.pathway = result.bypass ? 'QUICK_FIX' : 'FULL_SD';
    result.confidence = Math.max(0, Math.min(100, Math.round(confidence)));
    result.reason = result.bypass
      ? `Quick-fix eligible: ${estimatedLoc} LOC, ${severity} severity, ${confidence.toFixed(0)}% confidence`
      : `Below confidence threshold: ${confidence.toFixed(0)}% < 70%`;

    log(`${result.bypass ? '✅' : '⚠️'} ${result.pathway}: ${result.reason}`);
    return result;
  }

  // FULL_SD: Default path
  result.reason = `Full SD required: ${estimatedLoc} LOC ${estimatedLoc > THRESHOLDS.LOC_QUICK_FIX ? '(exceeds 50 LOC limit)' : ''}, ${severity} severity, ${type}`;
  log(`📋 FULL_SD: ${result.reason}`);

  return result;
}

/**
 * Quick check without database queries (for fast decisions)
 * @param {Object} issueContext - Same as shouldBypassFullSD
 * @returns {Object} Quick decision (no async)
 */
export function quickBypassCheck(issueContext) {
  const {
    estimatedLoc = 0,
    severity = 'medium',
    affectedFiles = [],
    type = 'bug',
    hasSchemaChanges = false,
    hasAuthChanges = false
  } = issueContext;

  // Immediate disqualifiers
  if (hasSchemaChanges || hasAuthChanges || severity === 'critical') {
    return { bypass: false, pathway: 'FULL_SD', quickReason: 'Non-negotiable blocker' };
  }

  if (containsNonNegotiable(issueContext)) {
    return { bypass: false, pathway: 'FULL_SD', quickReason: 'Contains sensitive keywords' };
  }

  // MICRO_FIX check
  if (estimatedLoc <= THRESHOLDS.LOC_MICRO_FIX &&
      affectedFiles.length <= 1 &&
      !affectsCriticalPath(affectedFiles)) {
    return { bypass: true, pathway: 'MICRO_FIX', quickReason: 'Trivial change' };
  }

  // QUICK_FIX check
  if (estimatedLoc <= THRESHOLDS.LOC_QUICK_FIX &&
      ['low', 'medium'].includes(severity) &&
      type !== 'feature') {
    return { bypass: true, pathway: 'QUICK_FIX', quickReason: 'Standard quick-fix' };
  }

  return { bypass: false, pathway: 'FULL_SD', quickReason: 'Requires full SD' };
}

// Export thresholds for reference
export { THRESHOLDS, CRITICAL_PATH_PATTERNS, NON_NEGOTIABLE_KEYWORDS };
