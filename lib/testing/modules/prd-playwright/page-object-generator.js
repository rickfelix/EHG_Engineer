/**
 * Page Object Generator Module
 * Handles Playwright Page Object Model generation
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { toPascalCase } from './prd-fetcher.js';
import { determineNavigationUrl } from './scenario-generator.js';

/**
 * Generate page object models
 * @param {object} prd - PRD data
 * @param {object} specs - Playwright specifications
 * @param {object} config - Configuration options
 * @returns {Promise<Array>} Generated page object information
 */
export async function generatePageObjects(prd, specs, config) {
  const pageObjects = [];
  const pagesDir = path.join(process.cwd(), config.outputDir, 'pages');

  await fs.mkdir(pagesDir, { recursive: true });

  for (const req of prd.functional_requirements || []) {
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

/**
 * Generate page object content
 * @param {object} requirement - Requirement data
 * @param {object} specs - Playwright specifications
 * @returns {string} Page object file content
 */
export function generatePageObjectContent(requirement, specs) {
  const className = toPascalCase(requirement.id) + 'Page';
  const navUrl = determineNavigationUrl(requirement);
  const flowMethodName = requirement.name ? requirement.name.replace(/\s+/g, '') : requirement.id;

  return `/**
 * Page Object Model for ${requirement.name}
 * Generated from PRD requirement: ${requirement.id}
 */

export class ${className} {
  constructor(page) {
    this.page = page;

    // Define selectors
    this.selectors = {
      container: '[data-testid="${requirement.id}-container"]',
      input: '[data-testid="${requirement.id}-input"]',
      submitButton: '[data-testid="${requirement.id}-submit"]',
      result: '[data-testid="${requirement.id}-result"]',
      errorMessage: '[data-testid="${requirement.id}-error"]',
      // Add more selectors as needed
    };
  }

  // Navigation methods
  async goto() {
    await this.page.goto('${specs.base_url}${navUrl}');
    await this.page.waitForLoadState('networkidle');
  }

  // Action methods
  async fillInput(value) {
    await this.page.fill(this.selectors.input, value);
  }

  async submit() {
    await this.page.click(this.selectors.submitButton);
  }

  async waitForResult() {
    await this.page.waitForSelector(this.selectors.result, { state: 'visible' });
  }

  // Getter methods
  async getResultText() {
    return await this.page.textContent(this.selectors.result);
  }

  async getErrorMessage() {
    return await this.page.textContent(this.selectors.errorMessage);
  }

  // Validation methods
  async isVisible() {
    return await this.page.isVisible(this.selectors.container);
  }

  async hasError() {
    return await this.page.isVisible(this.selectors.errorMessage);
  }

  // Complex interactions
  async complete${flowMethodName}Flow(data) {
    await this.goto();
    await this.fillInput(data.input || 'test');
    await this.submit();
    await this.waitForResult();
    return await this.getResultText();
  }
}`;
}
