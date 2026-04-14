/**
 * UAT Test Plan Generator
 * SD: SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-B-D
 *
 * Generates structured UAT test plans from S19 sprint items and S20 repo analysis.
 * Each sprint item's acceptance criteria are mapped to testable scenarios with
 * steps, expected results, and pass/fail criteria.
 *
 * @module lib/eva/bridge/uat-test-plan-generator
 */

/**
 * Generate a UAT test plan from sprint items and repo analysis.
 *
 * @param {Array<{name: string, description: string, acceptanceCriteria?: string, architectureLayer?: string, designReference?: object}>} sprintItems
 * @param {object} [repoAnalysis] - Repo analysis from github-repo-analyzer
 * @param {Array<{path: string}>} [repoAnalysis.files]
 * @param {object} [repoAnalysis.structure] - { hasTests, hasSrc, topLevelDirs }
 * @param {object} [repoAnalysis.dependencies]
 * @returns {{ testPlan: Array<object>, summary: { totalScenarios: number, itemsCovered: number } }}
 */
export function generateUATTestPlan(sprintItems = [], repoAnalysis = {}) {
  if (!Array.isArray(sprintItems) || sprintItems.length === 0) {
    return { testPlan: [], summary: { totalScenarios: 0, itemsCovered: 0 } };
  }

  const routes = extractRoutes(repoAnalysis);
  const testPlan = sprintItems.map((item, index) => {
    const scenarios = buildScenarios(item, routes, repoAnalysis.structure);
    return {
      sprintItemRef: item.name || `Item ${index + 1}`,
      sprintItemIndex: index,
      architectureLayer: item.architectureLayer || 'unknown',
      scenarios,
    };
  });

  const totalScenarios = testPlan.reduce((sum, item) => sum + item.scenarios.length, 0);
  return {
    testPlan,
    summary: { totalScenarios, itemsCovered: testPlan.length },
  };
}

function buildScenarios(item, routes, structure) {
  const scenarios = [];
  const criteria = item.acceptanceCriteria || item.acceptance_criteria || '';

  if (criteria) {
    // Split multi-criteria strings (semicolons, newlines, or numbered lists)
    const parts = criteria.split(/[;\n]|(?:\d+\.\s)/).map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      scenarios.push({
        title: `Verify: ${part.substring(0, 80)}`,
        steps: buildSteps(item, part, routes, structure),
        expectedResult: part,
        passCriteria: `Criterion met: ${part.substring(0, 120)}`,
      });
    }
  }

  // Always generate at least one scenario from the item description
  if (scenarios.length === 0) {
    scenarios.push({
      title: `Verify ${item.name} works as described`,
      steps: buildSteps(item, item.description || item.name, routes, structure),
      expectedResult: item.description || `${item.name} is functional`,
      passCriteria: `Feature "${item.name}" operates correctly`,
    });
  }

  return scenarios;
}

function buildSteps(item, criterion, routes, structure) {
  const steps = [];
  const layer = (item.architectureLayer || '').toLowerCase();

  // Step 1: Navigate to the relevant area
  if (layer === 'frontend' && routes.length > 0) {
    const matchedRoute = routes.find(r => criterion.toLowerCase().includes(r.toLowerCase())) || routes[0];
    steps.push(`Navigate to ${matchedRoute}`);
  } else if (layer === 'frontend') {
    steps.push('Open the application in a browser');
  } else if (layer === 'backend') {
    steps.push('Send a request to the relevant API endpoint');
  } else {
    steps.push('Access the feature under test');
  }

  // Step 2: Execute the action
  steps.push(`Perform the action described: ${criterion.substring(0, 150)}`);

  // Step 3: Verify
  steps.push('Verify the expected outcome matches the acceptance criteria');

  // Step 4: Check for regressions (if tests exist)
  if (structure?.hasTests) {
    steps.push('Run existing test suite to confirm no regressions');
  }

  return steps;
}

function extractRoutes(repoAnalysis) {
  if (!repoAnalysis?.files) return [];

  // Detect route-like files (pages/, routes/, app/ directories)
  return repoAnalysis.files
    .filter(f => {
      const path = typeof f === 'string' ? f : f.path || '';
      return /\/(pages|routes|app)\//.test(path) && /\.(js|ts|jsx|tsx)$/.test(path);
    })
    .map(f => {
      const path = typeof f === 'string' ? f : f.path || '';
      // Convert file path to route: pages/about.tsx -> /about
      return '/' + path
        .replace(/.*\/(pages|routes|app)\//, '')
        .replace(/\.(js|ts|jsx|tsx)$/, '')
        .replace(/\/index$/, '')
        .replace(/\[([^\]]+)\]/g, ':$1');
    })
    .filter(r => r !== '/')
    .slice(0, 20);
}
