/**
 * RETRO Sub-Agent Data Analyzers
 * Extracted from retro.js for modularity
 */

/**
 * Extract test metrics for retrospective storage
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} testEvidence - Test evidence from v_latest_test_evidence
 * @param {Object} storyCoverage - Coverage data from getStoryTestCoverage
 * @returns {Object} Test metrics for database storage
 */
export function extractTestMetrics(sdId, testEvidence, storyCoverage) {
  const defaults = {
    test_run_id: null,
    test_pass_rate: null,
    test_total_count: 0,
    test_passed_count: 0,
    test_failed_count: 0,
    test_skipped_count: 0,
    test_evidence_freshness: null,
    story_coverage_percent: null,
    stories_with_tests: 0,
    stories_total: 0,
    test_verdict: null
  };

  if (!testEvidence && !storyCoverage) return defaults;

  const metrics = { ...defaults };

  if (testEvidence) {
    metrics.test_run_id = testEvidence.test_run_id || null;
    metrics.test_pass_rate = testEvidence.pass_rate || null;
    metrics.test_total_count = testEvidence.total_tests || 0;
    metrics.test_passed_count = testEvidence.passed_tests || 0;
    metrics.test_failed_count = testEvidence.failed_tests || 0;
    metrics.test_skipped_count = testEvidence.skipped_tests || 0;
    metrics.test_evidence_freshness = testEvidence.freshness_status || null;
    metrics.test_verdict = testEvidence.verdict || null;
  }

  if (storyCoverage) {
    metrics.stories_with_tests = storyCoverage.passing_count || 0;
    metrics.stories_total = storyCoverage.total_stories || 0;

    if (storyCoverage.total_stories > 0) {
      metrics.story_coverage_percent = Math.round(
        (storyCoverage.passing_count / storyCoverage.total_stories) * 100 * 100
      ) / 100;
    }
  }

  return metrics;
}

/**
 * Categorize learning from SD context
 * Maps SD to one of 9 predefined learning categories
 */
export function categorizeLearning(sdData, _prdData, _handoffs, _subAgentResults) {
  const title = sdData.title?.toLowerCase() || '';
  const scope = sdData.scope?.toLowerCase() || '';
  const category = sdData.category?.toLowerCase() || '';
  const description = sdData.description?.toLowerCase() || '';
  const allText = `${title} ${scope} ${category} ${description}`;

  if (allText.match(/database|schema|migration|table|column|rls|postgres|supabase|sql/)) {
    return 'DATABASE_SCHEMA';
  }
  if (allText.match(/test|e2e|unit|playwright|coverage|spec|vitest|qa|quality/)) {
    return 'TESTING_STRATEGY';
  }
  if (allText.match(/deploy|ci.?cd|github actions|pipeline|build|release/)) {
    return 'DEPLOYMENT_ISSUE';
  }
  if (allText.match(/performance|optimization|speed|cache|load time|latency/)) {
    return 'PERFORMANCE_OPTIMIZATION';
  }
  if (allText.match(/security|auth|rls|permission|role|access control|vulnerability/)) {
    return 'SECURITY_VULNERABILITY';
  }
  if (allText.match(/ux|ui|user experience|usability|interface|design|component|modal/)) {
    return 'USER_EXPERIENCE';
  }
  if (allText.match(/documentation|docs|readme|guide|instruction/)) {
    return 'DOCUMENTATION';
  }
  if (allText.match(/process|workflow|procedure|checklist|standard|handoff|protocol|bmad|backend|frontend|service|orchestration|integration|api|endpoint|route|refactor|cleanup|migration|consolidation|unification/)) {
    return 'PROCESS_IMPROVEMENT';
  }
  return 'APPLICATION_ISSUE';
}

/**
 * Extract affected components from SD data
 * @param {Object} sdData - Strategic Directive data
 * @param {string} learningCategory - The categorized learning type
 * @returns {Array<string>} Array of affected component names
 */
export function extractAffectedComponents(sdData, learningCategory) {
  const components = new Set();
  const title = sdData.title || '';
  const scope = sdData.scope || '';
  const description = sdData.description || '';
  const allText = `${title} ${scope} ${description}`;

  // Pattern 1: PascalCase component names
  const pascalCasePattern = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;
  let match;
  while ((match = pascalCasePattern.exec(allText)) !== null) {
    components.add(match[1]);
  }

  // Pattern 2: camelCase names
  const camelCasePattern = /\b([a-z]+(?:[A-Z][a-z]+)+)\b/g;
  while ((match = camelCasePattern.exec(allText)) !== null) {
    components.add(match[1]);
  }

  // Pattern 3: Technical terms
  const technicalTerms = [
    'EVA', 'API', 'UI', 'Backend', 'Frontend', 'Database', 'Service',
    'Orchestration', 'Dashboard', 'Authentication', 'Authorization',
    'Token', 'Decision', 'Venture', 'Stage', 'Blueprint', 'Chairman',
    'Integration', 'Migration', 'Validation', 'Test', 'Contract'
  ];

  for (const term of technicalTerms) {
    if (allText.toLowerCase().includes(term.toLowerCase())) {
      components.add(term);
    }
  }

  // Pattern 4: SD category
  if (sdData.sd_type) {
    components.add(sdData.sd_type.charAt(0).toUpperCase() + sdData.sd_type.slice(1));
  }

  // Pattern 5: SD category
  if (sdData.category && sdData.category !== sdData.sd_type) {
    components.add(sdData.category.charAt(0).toUpperCase() + sdData.category.slice(1));
  }

  // Ensure APPLICATION_ISSUE always has at least one component
  if (learningCategory === 'APPLICATION_ISSUE' && components.size === 0) {
    const titleWords = title.split(/[\s:-]+/).filter(w => w.length > 3);
    for (const word of titleWords.slice(0, 3)) {
      if (/^[a-zA-Z]+$/.test(word)) {
        components.add(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
      }
    }
    if (components.size === 0) {
      components.add('Application');
    }
  }

  return Array.from(components).slice(0, 10);
}

/**
 * Calculate if SD was completed on schedule
 * @param {Object} prdData - PRD data with planned_end field
 * @param {Object} handoffs - Handoff data with timestamps
 * @param {Object} sdData - SD data with updated_at field
 * @returns {boolean} True if completed on or before planned_end
 */
export function calculateOnSchedule(prdData, handoffs, sdData) {
  if (!prdData.found || !prdData.prd?.planned_end) {
    return true;
  }

  const plannedEnd = new Date(prdData.prd.planned_end);
  let completionDate = null;

  if (handoffs.handoffs && handoffs.handoffs.length > 0) {
    const execToPlanHandoff = handoffs.handoffs.find(h =>
      h.handoff_type === 'EXEC-TO-PLAN' || h.handoff_type === 'exec_to_plan'
    );
    if (execToPlanHandoff) {
      completionDate = new Date(execToPlanHandoff.created_at);
    }
  }

  if (!completionDate && sdData.status === 'completed' && sdData.updated_at) {
    completionDate = new Date(sdData.updated_at);
  }

  if (!completionDate) {
    return true;
  }

  return completionDate <= plannedEnd;
}

/**
 * Calculate if SD stayed within scope
 * @param {Object} deliverables - Deliverables data with items array
 * @returns {boolean} True if all required deliverables completed
 */
export function calculateWithinScope(deliverables) {
  if (!deliverables || !deliverables.found || !deliverables.items || deliverables.items.length === 0) {
    return true;
  }

  const requiredDeliverables = deliverables.items.filter(d => d.priority === 'required');

  if (requiredDeliverables.length === 0) {
    return true;
  }

  const allRequiredCompleted = requiredDeliverables.every(d => d.completion_status === 'completed');
  const anySkipped = requiredDeliverables.some(d => d.completion_status === 'skipped');

  return allRequiredCompleted && !anySkipped;
}
