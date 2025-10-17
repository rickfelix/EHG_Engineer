#!/usr/bin/env node
/**
 * Test Tier Selector Module
 * Enhanced QA Engineering Director v2.0
 *
 * Smart test tier selection based on SD type to avoid over-testing.
 * Impact: Prevents 100+ manual test checklists, focuses effort.
 */

/**
 * Select appropriate test tier for SD
 * @param {Object} sd - Strategic Directive object
 * @returns {Promise<Object>} Test tier recommendations
 */
export async function selectTestTier(sd) {
  const { category, scope, metadata = {} } = sd;

  console.log(`🎯 Test Tier Selector: Analyzing SD type...`);

  // Tier 1: Smoke tests (ALWAYS REQUIRED)
  const tier1 = {
    name: 'Smoke Tests',
    required: true,
    count: '3-5 tests',
    time_budget: '<60 seconds',
    description: 'Critical path validation - SUFFICIENT for LEAD approval',
    priority: 'MANDATORY'
  };

  // Tier 2: E2E tests (CONDITIONAL)
  const requiresE2E = isUIFeature(category, scope) ||
                      hasUserFlows(scope) ||
                      metadata?.user_facing === true;

  const tier2 = {
    name: 'E2E Tests',
    required: requiresE2E,
    count: requiresE2E ? '10-20 tests' : '0',
    time_budget: requiresE2E ? '<5 minutes' : 'N/A',
    description: 'User flow validation for UI features',
    priority: requiresE2E ? 'RECOMMENDED' : 'SKIP',
    rationale: requiresE2E
      ? 'UI feature detected - E2E tests validate user flows'
      : 'No UI components - E2E tests not needed'
  };

  // Tier 3: Manual testing (RARE)
  const requiresManual = hasComplexLogic(scope) &&
                         (metadata?.logic_lines > 10 || metadata?.business_critical === true);

  const tier3 = {
    name: 'Manual Testing',
    required: requiresManual,
    checklist_size: requiresManual ? '5-10 items' : '0',
    time_budget: requiresManual ? '<30 minutes' : 'N/A',
    description: 'Manual validation for complex business logic',
    priority: requiresManual ? 'RECOMMENDED' : 'SKIP',
    rationale: requiresManual
      ? 'Complex business logic detected - manual verification needed'
      : 'No complex logic - automated tests sufficient'
  };

  const totalTime = calculateTotalTime(tier1, tier2, tier3);
  const rationale = generateRationale(sd, tier1, tier2, tier3);

  return {
    recommended_tiers: [tier1, tier2, tier3],
    primary_tier: tier1,
    total_estimated_time_seconds: totalTime,
    total_estimated_time_display: formatTime(totalTime),
    rationale,
    category,
    scope_summary: scope?.substring(0, 100) + '...'
  };
}

/**
 * Check if SD is a UI feature
 */
function isUIFeature(category, scope) {
  if (!category && !scope) return false;

  const uiCategories = ['UI', 'Feature', 'Dashboard', 'Component', 'Page', 'Frontend'];
  const uiKeywords = ['component', 'page', 'dashboard', 'interface', 'form', 'button', 'modal', 'chart'];

  const categoryMatch = uiCategories.some(cat =>
    category?.toLowerCase().includes(cat.toLowerCase())
  );

  const scopeMatch = uiKeywords.some(kw =>
    scope?.toLowerCase().includes(kw)
  );

  return categoryMatch || scopeMatch;
}

/**
 * Check if SD involves user flows
 */
function hasUserFlows(scope) {
  if (!scope) return false;

  const flowKeywords = ['user flow', 'navigation', 'workflow', 'journey', 'multi-step', 'wizard'];
  return flowKeywords.some(kw => scope.toLowerCase().includes(kw));
}

/**
 * Check if SD has complex business logic
 */
function hasComplexLogic(scope) {
  if (!scope) return false;

  const logicKeywords = [
    'algorithm', 'calculation', 'business logic', 'validation rules',
    'complex rules', 'decision engine', 'scoring', 'ranking'
  ];
  return logicKeywords.some(kw => scope.toLowerCase().includes(kw));
}

/**
 * Calculate total estimated time in seconds
 */
function calculateTotalTime(tier1, tier2, tier3) {
  let total = 60; // Tier 1 always 60s

  if (tier2.required) {
    total += 300; // 5 minutes for E2E
  }

  if (tier3.required) {
    total += 1800; // 30 minutes for manual
  }

  return total;
}

/**
 * Format seconds to human-readable time
 */
function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Generate rationale for tier selection
 */
function generateRationale(sd, tier1, tier2, tier3) {
  const parts = [];

  parts.push(`Tier 1 (Smoke): Always required for ${sd.id || 'SD'}`);

  if (tier2.required) {
    parts.push(`Tier 2 (E2E): Required - UI feature detected in category/scope`);
  } else {
    parts.push(`Tier 2 (E2E): Skipped - no UI components identified`);
  }

  if (tier3.required) {
    parts.push(`Tier 3 (Manual): Recommended - complex business logic detected`);
  } else {
    parts.push(`Tier 3 (Manual): Skipped - automated tests sufficient`);
  }

  return parts.join('. ');
}
