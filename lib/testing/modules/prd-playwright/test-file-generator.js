/**
 * Test File Generator Module
 * Handles Playwright test file creation from scenarios
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { toPascalCase, toCamelCase } from './prd-fetcher.js';
import { determineNavigationUrl } from './scenario-generator.js';

/**
 * Create test files from scenarios
 * @param {object} prd - PRD data
 * @param {Array} scenarios - Test scenarios
 * @param {object} specs - Playwright specifications
 * @param {object} config - Configuration options
 * @returns {Promise<Array>} Generated file information
 */
export async function createTestFiles(prd, scenarios, specs, config) {
  const files = [];
  const outputDir = path.join(process.cwd(), config.outputDir);

  await fs.mkdir(outputDir, { recursive: true });

  const scenariosByRequirement = {};
  for (const scenario of scenarios) {
    if (!scenariosByRequirement[scenario.requirement_id]) {
      scenariosByRequirement[scenario.requirement_id] = [];
    }
    scenariosByRequirement[scenario.requirement_id].push(scenario);
  }

  for (const [reqId, reqScenarios] of Object.entries(scenariosByRequirement)) {
    const testContent = generateTestFileContent(prd, reqId, reqScenarios, specs);
    const fileName = `${reqId.toLowerCase()}.spec.js`;
    const filePath = path.join(outputDir, fileName);

    await fs.writeFile(filePath, testContent);
    files.push({
      requirement_id: reqId,
      file_name: fileName,
      file_path: filePath,
      scenarios: reqScenarios.length
    });

    console.log(`Generated test file: ${fileName}`);
  }

  return files;
}

/**
 * Generate test file content
 * @param {object} prd - PRD data
 * @param {string} requirementId - Requirement identifier
 * @param {Array} scenarios - Test scenarios
 * @param {object} specs - Playwright specifications
 * @returns {string} Test file content
 */
export function generateTestFileContent(prd, requirementId, scenarios, specs) {
  const requirement = prd.functional_requirements?.find(r => r.id === requirementId) || {};
  const pascalId = toPascalCase(requirementId);
  const camelId = toCamelCase(requirementId);
  const navUrl = determineNavigationUrl(requirement);

  return `/**
 * Playwright Test Suite for ${requirementId}
 * PRD: ${prd.title}
 * Generated: ${new Date().toISOString()}
 *
 * Requirement: ${requirement.name || requirementId}
 * Description: ${requirement.description || 'N/A'}
 */

import { test, expect } from '@playwright/test';
import { ${pascalId}Page } from '../pages/${requirementId}.page';

test.describe('${requirement.name || requirementId}', () => {
  let page;
  let ${camelId}Page;

  test.beforeEach(async ({ page: testPage, context }) => {
    page = testPage;
    ${camelId}Page = new ${pascalId}Page(page);

    // Set up any required context
    await context.addCookies([
      // Add any required cookies
    ]);

    // Navigate to base URL
    await page.goto('${specs.base_url}');
  });

  test.afterEach(async () => {
    // Cleanup after each test
    await page.close();
  });

${scenarios.map(scenario => generateTestCase(scenario)).join('\n\n')}

  // Visual Regression Tests
  test('Visual regression - ${requirementId}', async () => {
    await page.goto('${specs.base_url}${navUrl}');
    await page.waitForLoadState('networkidle');

    // Test different viewport sizes
    const viewports = ${JSON.stringify(specs.viewport_sizes, null, 4)};

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500); // Allow layout to settle
      await expect(page).toHaveScreenshot(\`\${viewport.name}-${requirementId}.png\`);
    }
  });

  // Accessibility Tests
  test('Accessibility - ${requirementId}', async () => {
    await page.goto('${specs.base_url}${navUrl}');
    await page.waitForLoadState('networkidle');

    // Check for ARIA labels
    const buttons = await page.$$('button');
    for (const button of buttons) {
      const ariaLabel = await button.getAttribute('aria-label');
      const text = await button.textContent();
      expect(ariaLabel || text).toBeTruthy();
    }

    // Check for alt text on images
    const images = await page.$$('img');
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      expect(alt).toBeTruthy();
    }
  });
});`;
}

/**
 * Generate individual test case
 * @param {object} scenario - Test scenario
 * @returns {string} Test case code
 */
export function generateTestCase(scenario) {
  return `  test('${scenario.scenario_name}', async () => {
    // Test ID: ${scenario.scenario_id}
    // Priority: ${scenario.priority}
    // Type: ${scenario.test_type}

    // Preconditions
${generatePreconditionCode(scenario.preconditions)}

    // Test Steps
${generateTestStepCode(scenario.test_steps)}

    // Assertions
${generateAssertionCode(scenario.assertions)}

    // Cleanup
${generateCleanupCode(scenario.cleanup_steps)}
  });`;
}

/**
 * Generate code for test steps
 * @param {Array} steps - Test steps
 * @returns {string} Test step code
 */
export function generateTestStepCode(steps) {
  if (!steps || steps.length === 0) {
    return '    // No test steps defined';
  }

  return steps.map(step => {
    switch (step.action) {
      case 'navigate':
        return `    await page.goto('${step.target}');`;

      case 'click':
        return `    await page.click('${step.target}');`;

      case 'fill':
        return `    await page.fill('${step.target}', '${step.data}');`;

      case 'waitForSelector':
        return `    await page.waitForSelector('${step.target}', ${JSON.stringify(step.data || {})});`;

      case 'waitForLoadState':
        return `    await page.waitForLoadState('${step.target}');`;

      case 'screenshot':
        return `    await page.screenshot({ path: 'screenshots/${step.data?.name || 'screenshot.png'}', fullPage: ${step.target === 'fullPage'} });`;

      case 'waitForResponse':
        return `    await page.waitForResponse(response => response.url().includes('${step.target}') && response.ok());`;

      default:
        return `    // TODO: Implement ${step.action} for ${step.target}`;
    }
  }).join('\n');
}

/**
 * Generate assertion code
 * @param {Array} assertions - Assertions
 * @returns {string} Assertion code
 */
export function generateAssertionCode(assertions) {
  if (!assertions || assertions.length === 0) {
    return '    // No assertions defined';
  }

  return assertions.map(assertion => {
    switch (assertion.type) {
      case 'toBeVisible':
        return `    await expect(page.locator('${assertion.selector}')).toBeVisible();`;

      case 'toHaveText':
        return `    await expect(page.locator('${assertion.selector}')).toHaveText(/${assertion.text}/);`;

      case 'toHaveValue':
        return `    await expect(page.locator('${assertion.selector}')).toHaveValue('${assertion.value}');`;

      case 'toBeEnabled':
        return `    await expect(page.locator('${assertion.selector}')).toBeEnabled();`;

      case 'toHaveCount':
        return `    await expect(page.locator('${assertion.selector}')).toHaveCount(${assertion.count});`;

      case 'toHaveScreenshot':
        return `    await expect(page).toHaveScreenshot('${assertion.name}', ${JSON.stringify(assertion.options || {})});`;

      case 'toHaveURL':
        return `    await expect(page).toHaveURL(/${assertion.pattern}/);`;

      default:
        return `    // TODO: Implement assertion ${assertion.type}`;
    }
  }).join('\n');
}

/**
 * Generate precondition code
 * @param {Array} preconditions - Preconditions
 * @returns {string} Precondition code
 */
export function generatePreconditionCode(preconditions) {
  if (!preconditions || preconditions.length === 0) {
    return '    // No preconditions';
  }

  return preconditions.map(pre => {
    if (pre.type === 'authentication') {
      return '    // Authenticate user\n    await login(page, fixtures.testUsers.validUser);';
    }
    return `    // ${pre.type}: ${JSON.stringify(pre.data)}`;
  }).join('\n');
}

/**
 * Generate cleanup code
 * @param {Array} cleanupSteps - Cleanup steps
 * @returns {string} Cleanup code
 */
export function generateCleanupCode(cleanupSteps) {
  if (!cleanupSteps || cleanupSteps.length === 0) {
    return '    // No cleanup required';
  }

  return cleanupSteps.map(step => {
    if (step.action === 'clearStorage') {
      return '    await page.evaluate(() => localStorage.clear());';
    }
    if (step.action === 'clearCookies') {
      return '    await context.clearCookies();';
    }
    return `    // ${step.action}`;
  }).join('\n');
}
