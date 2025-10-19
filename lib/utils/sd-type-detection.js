/**
 * SD Type Detection Utility
 *
 * Helps distinguish between different types of Strategic Directives
 * to enable appropriate validation and progress calculation logic.
 *
 * Created: 2025-10-19
 * Purpose: Fix Issue #4 from SD-PLAN-PRESENT-001 retrospective
 */

/**
 * Determine if an SD is an engineering/infrastructure SD
 * vs a customer-facing feature SD
 *
 * @param {Object} sd - Strategic Directive object
 * @param {string} sd.category - SD category
 * @param {string} sd.target_application - Target application (EHG_engineer vs EHG)
 * @param {string} sd.title - SD title
 * @param {string} sd.scope - SD scope description
 * @returns {Object} Type detection result
 */
export function detectSDType(sd) {
  const result = {
    type: 'feature', // Default
    isEngineering: false,
    isFeature: true,
    confidence: 0,
    reasons: []
  };

  if (!sd) {
    return { ...result, type: 'unknown', confidence: 0, reasons: ['No SD provided'] };
  }

  let engineeringScore = 0;
  let featureScore = 0;

  // Check 1: Target Application (strongest signal)
  if (sd.target_application) {
    const targetApp = sd.target_application.toLowerCase();
    if (targetApp.includes('engineer')) {
      engineeringScore += 40;
      result.reasons.push('Target application is EHG_Engineer');
    } else if (targetApp === 'ehg' || targetApp.includes('app')) {
      featureScore += 40;
      result.reasons.push('Target application is EHG (customer-facing)');
    }
  }

  // Check 2: Category (strong signal)
  if (sd.category) {
    const category = sd.category.toLowerCase();
    const engineeringCategories = [
      'engineering',
      'tool',
      'infrastructure',
      'devops',
      'ci-cd',
      'protocol',
      'testing',
      'database',
      'migration',
      'automation'
    ];

    if (engineeringCategories.some(cat => category.includes(cat))) {
      engineeringScore += 30;
      result.reasons.push(`Category '${sd.category}' indicates engineering work`);
    } else {
      featureScore += 20;
      result.reasons.push(`Category '${sd.category}' indicates feature work`);
    }
  }

  // Check 3: Title Keywords (moderate signal)
  if (sd.title) {
    const title = sd.title.toLowerCase();
    const engineeringKeywords = [
      'protocol',
      'handoff',
      'gate',
      'validation',
      'migration',
      'schema',
      'pipeline',
      'agent',
      'sub-agent',
      'automation',
      'script',
      'tool',
      'infrastructure'
    ];

    const featureKeywords = [
      'user',
      'customer',
      'ui',
      'ux',
      'page',
      'component',
      'dashboard',
      'venture',
      'portfolio',
      'meeting',
      'eva'
    ];

    const engineeringMatches = engineeringKeywords.filter(kw => title.includes(kw));
    const featureMatches = featureKeywords.filter(kw => title.includes(kw));

    if (engineeringMatches.length > 0) {
      engineeringScore += engineeringMatches.length * 10;
      result.reasons.push(`Title contains engineering keywords: ${engineeringMatches.join(', ')}`);
    }

    if (featureMatches.length > 0) {
      featureScore += featureMatches.length * 10;
      result.reasons.push(`Title contains feature keywords: ${featureMatches.join(', ')}`);
    }
  }

  // Check 4: Scope Keywords (weak signal)
  if (sd.scope) {
    const scope = sd.scope.toLowerCase();
    if (scope.includes('database') || scope.includes('migration') || scope.includes('schema')) {
      engineeringScore += 10;
      result.reasons.push('Scope mentions database/migration/schema work');
    }
    if (scope.includes('user') || scope.includes('customer') || scope.includes('interface')) {
      featureScore += 10;
      result.reasons.push('Scope mentions user/customer/interface work');
    }
  }

  // Determine final type
  const totalScore = engineeringScore + featureScore;
  if (totalScore === 0) {
    result.type = 'unknown';
    result.confidence = 0;
    result.reasons.push('Insufficient signals to determine type');
  } else if (engineeringScore > featureScore) {
    result.type = 'engineering';
    result.isEngineering = true;
    result.isFeature = false;
    result.confidence = Math.min(Math.round((engineeringScore / totalScore) * 100), 100);
  } else {
    result.type = 'feature';
    result.isEngineering = false;
    result.isFeature = true;
    result.confidence = Math.min(Math.round((featureScore / totalScore) * 100), 100);
  }

  return result;
}

/**
 * Get appropriate validation requirements for an SD based on its type
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} Validation requirements
 */
export function getValidationRequirements(sd) {
  const typeDetection = detectSDType(sd);

  const baseRequirements = {
    type: typeDetection.type,
    requiresE2ETests: true,
    requiresUnitTests: true,
    requiresUIScreenshots: true,
    requiresDeliverables: true,
    requiresUserStories: true,
    minimumDeliverables: 3
  };

  // Adjust requirements for engineering SDs
  if (typeDetection.isEngineering) {
    return {
      ...baseRequirements,
      requiresE2ETests: false, // Engineering SDs often don't need E2E tests
      requiresUIScreenshots: false, // No UI changes
      requiresUnitTests: true, // Unit tests for scripts/logic
      minimumDeliverables: 2, // Usually fewer deliverables
      validationApproach: 'script-based', // Test via script execution
      notes: 'Engineering SD - validation focuses on script/database work'
    };
  }

  // Feature SDs keep standard requirements
  return {
    ...baseRequirements,
    validationApproach: 'ui-based',
    notes: 'Feature SD - standard validation requirements'
  };
}

/**
 * Determine if boilerplate deliverables should be skipped for this SD
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {boolean} True if boilerplate should be skipped
 */
export function shouldSkipBoilerplateDeliverables(sd) {
  const typeDetection = detectSDType(sd);

  // Skip boilerplate for high-confidence engineering SDs
  return typeDetection.isEngineering && typeDetection.confidence >= 70;
}

export default {
  detectSDType,
  getValidationRequirements,
  shouldSkipBoilerplateDeliverables
};
