/**
 * PRD Playwright Generator - File Generation
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { toPascalCase, toCamelCase, determineNavigationUrl } from './utils.js';
import { generateTestStepCode, generateAssertionCode, generatePreconditionCode, generateCleanupCode } from './code-generators.js';

export async function createTestFiles(prd, scenarios, specs, outputDir) {
  const files = [];
  const fullOutputDir = path.join(process.cwd(), outputDir);

  await fs.mkdir(fullOutputDir, { recursive: true });

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
    const filePath = path.join(fullOutputDir, fileName);

    await fs.writeFile(filePath, testContent);
    files.push({
      requirement_id: reqId,
      file_name: fileName,
      file_path: filePath,
      scenarios: reqScenarios.length
    });

    console.log(`\u2705 Generated test file: ${fileName}`);
  }

  return files;
}

export function generateTestFileContent(prd, requirementId, scenarios, specs) {
  const requirement = prd.functional_requirements?.find(r => r.id === requirementId) || {};

  return `/**
 * Playwright Test Suite for ${requirementId}
 * PRD: ${prd.title}
 * Generated: ${new Date().toISOString()}
 *
 * Requirement: ${requirement.name || requirementId}
 * Description: ${requirement.description || 'N/A'}
 */

import { test, expect } from '@playwright/test';
import { ${toPascalCase(requirementId)}Page } from '../pages/${requirementId}.page';

test.describe('${requirement.name || requirementId}', () => {
  let page;
  let ${toCamelCase(requirementId)}Page;

  test.beforeEach(async ({ page: testPage, context }) => {
    page = testPage;
    ${toCamelCase(requirementId)}Page = new ${toPascalCase(requirementId)}Page(page);

    await context.addCookies([]);
    await page.goto('${specs.base_url}');
  });

  test.afterEach(async () => {
    await page.close();
  });

${scenarios.map(scenario => generateTestCase(scenario)).join('\n\n')}

  // Visual Regression Tests
  test('Visual regression - ${requirementId}', async () => {
    await page.goto('${specs.base_url}${determineNavigationUrl(requirement)}');
    await page.waitForLoadState('networkidle');

    const viewports = ${JSON.stringify(specs.viewport_sizes, null, 4)};

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot(\`\${viewport.name}-${requirementId}.png\`);
    }
  });

  // Accessibility Tests
  test('Accessibility - ${requirementId}', async () => {
    await page.goto('${specs.base_url}${determineNavigationUrl(requirement)}');
    await page.waitForLoadState('networkidle');

    const buttons = await page.$$('button');
    for (const button of buttons) {
      const ariaLabel = await button.getAttribute('aria-label');
      const text = await button.textContent();
      expect(ariaLabel || text).toBeTruthy();
    }

    const images = await page.$$('img');
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      expect(alt).toBeTruthy();
    }
  });
});`;
}

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

export async function generatePageObjects(prd, specs, outputDir) {
  const pageObjects = [];
  const pagesDir = path.join(process.cwd(), outputDir, 'pages');

  await fs.mkdir(pagesDir, { recursive: true });

  for (const req of (prd.functional_requirements || [])) {
    const pageObjectContent = generatePageObjectContent(req, specs);
    const fileName = `${req.id.toLowerCase()}.page.js`;
    const filePath = path.join(pagesDir, fileName);

    await fs.writeFile(filePath, pageObjectContent);
    pageObjects.push({
      requirement_id: req.id,
      file_name: fileName,
      file_path: filePath
    });
  }

  return pageObjects;
}

export function generatePageObjectContent(requirement, specs) {
  const className = toPascalCase(requirement.id) + 'Page';

  return `/**
 * Page Object Model for ${requirement.name}
 * Generated from PRD requirement: ${requirement.id}
 */

export class ${className} {
  constructor(page) {
    this.page = page;

    this.selectors = {
      container: '[data-testid="${requirement.id}-container"]',
      input: '[data-testid="${requirement.id}-input"]',
      submitButton: '[data-testid="${requirement.id}-submit"]',
      result: '[data-testid="${requirement.id}-result"]',
      errorMessage: '[data-testid="${requirement.id}-error"]',
    };
  }

  async goto() {
    await this.page.goto('${specs.base_url}${determineNavigationUrl(requirement)}');
    await this.page.waitForLoadState('networkidle');
  }

  async fillInput(value) {
    await this.page.fill(this.selectors.input, value);
  }

  async submit() {
    await this.page.click(this.selectors.submitButton);
  }

  async waitForResult() {
    await this.page.waitForSelector(this.selectors.result, { state: 'visible' });
  }

  async getResultText() {
    return await this.page.textContent(this.selectors.result);
  }

  async getErrorMessage() {
    return await this.page.textContent(this.selectors.errorMessage);
  }

  async isVisible() {
    return await this.page.isVisible(this.selectors.container);
  }

  async hasError() {
    return await this.page.isVisible(this.selectors.errorMessage);
  }

  async complete${requirement.name.replace(/\s+/g, '')}Flow(data) {
    await this.goto();
    await this.fillInput(data.input || 'test');
    await this.submit();
    await this.waitForResult();
    return await this.getResultText();
  }
}`;
}
