#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Test Target Discovery Module
 * Auto-discovers test targets for automated visual inspection
 */

/**
 * Default test targets for automated discovery
 * @returns {Array<object>}
 */
function getDefaultTargets() {
  return [
    {
      name: 'Dashboard Overview',
      url: '/',
      type: 'page',
      critical: true
    },
    {
      name: 'Strategic Directives',
      url: '/',
      type: 'component',
      selectors: ['.strategic-directives', '[data-testid*="sd"]', '.directive'],
      critical: true
    },
    {
      name: 'Navigation',
      url: '/',
      type: 'component',
      selectors: ['nav', '.navigation', '.navbar', '.menu'],
      critical: false
    },
    {
      name: 'Progress Indicators',
      url: '/',
      type: 'component',
      selectors: ['.progress', '.progress-bar', '[data-testid*="progress"]'],
      critical: false
    }
  ];
}

/**
 * Auto-discover what needs to be tested
 * @param {object} _config - Configuration options (reserved for future use)
 * @returns {Promise<Array<object>>}
 */
async function discoverTestTargets(_config = {}) {
  console.log('Auto-discovering test targets...');

  const targets = getDefaultTargets();

  console.log(`Found ${targets.length} test targets`);
  return targets;
}

/**
 * Filter targets by criticality
 * @param {Array<object>} targets - List of test targets
 * @param {boolean} criticalOnly - Whether to filter for critical only
 * @returns {Array<object>}
 */
function filterTargetsByCriticality(targets, criticalOnly = false) {
  if (!criticalOnly) {
    return targets;
  }
  return targets.filter(target => target.critical);
}

/**
 * Filter targets by type
 * @param {Array<object>} targets - List of test targets
 * @param {string} type - Target type to filter by
 * @returns {Array<object>}
 */
function filterTargetsByType(targets, type) {
  if (!type) {
    return targets;
  }
  return targets.filter(target => target.type === type);
}

export {
  discoverTestTargets,
  getDefaultTargets,
  filterTargetsByCriticality,
  filterTargetsByType
};
