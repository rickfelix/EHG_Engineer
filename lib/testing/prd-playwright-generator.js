#!/usr/bin/env node

/**
 * LEO Protocol v4.2 - PRD to Playwright Test Generator
 * Automatically generates Playwright test files from PRD specifications
 * Enables traceability between requirements and test verification
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

class PRDPlaywrightGenerator {
  constructor(config = {}) {
    this.config = {
      outputDir: config.outputDir || 'tests/e2e/generated',
      templateDir: config.templateDir || 'tests/templates',
      baseUrl: config.baseUrl || 'http://localhost:8080', // SD-ARCH-EHG-007: EHG unified frontend
      ...config
    };
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Generate Playwright tests from PRD
   */
  async generateTestsFromPRD(prdId) {
    console.log(`🎯 Generating Playwright tests for PRD: ${prdId}`);
    
    try {
      // 1. Fetch PRD data
      const prd = await this.fetchPRD(prdId);
      if (!prd) {
        throw new Error(`PRD ${prdId} not found`);
      }
      
      // 2. Fetch or create Playwright specifications
      let playwrightSpecs = await this.fetchPlaywrightSpecs(prdId);
      if (!playwrightSpecs) {
        playwrightSpecs = await this.createDefaultPlaywrightSpecs(prd);
      }
      
      // 3. Generate test scenarios from requirements
      const scenarios = await this.generateTestScenarios(prd, playwrightSpecs);
      
      // 4. Create test files
      const generatedFiles = await this.createTestFiles(prd, scenarios, playwrightSpecs);
      
      // 5. Create page object models
      const pageObjects = await this.generatePageObjects(prd, playwrightSpecs);
      
      // 6. Create test data fixtures
      const fixtures = await this.generateTestFixtures(prd);
      
      // 7. Update database with mappings
      await this.updateTestMappings(prdId, generatedFiles);
      
      // 8. Generate test documentation
      const documentation = await this.generateTestDocumentation(prd, scenarios);
      
      return {
        success: true,
        prdId,
        generatedFiles,
        pageObjects,
        fixtures,
        documentation,
        totalScenarios: scenarios.length
      };
      
    } catch (error) {
      console.error('❌ Test generation failed:', error);
      throw error;
    }
  }

  /**
   * Fetch PRD from database
   */
  async fetchPRD(prdId) {
    const { data, error } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();
    
    if (error) {
      console.error('Error fetching PRD:', error);
      return null;
    }
    
    return data;
  }

  /**
   * Fetch existing Playwright specifications
   */
  async fetchPlaywrightSpecs(prdId) {
    const { data, error } = await this.supabase
      .from('prd_playwright_specifications')
      .select('*')
      .eq('prd_id', prdId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching Playwright specs:', error);
    }
    
    return data;
  }

  /**
   * Create default Playwright specifications
   */
  async createDefaultPlaywrightSpecs(prd) {
    const specs = {
      prd_id: prd.id,
      base_url: this.config.baseUrl,
      test_timeout_ms: 30000,
      viewport_sizes: [
        { name: 'desktop', width: 1920, height: 1080 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'mobile', width: 375, height: 667 }
      ],
      browsers: ['chromium', 'firefox', 'webkit'],
      page_objects: this.extractPageObjects(prd),
      shared_selectors: this.generateSharedSelectors(prd),
      api_endpoints: this.extractAPIEndpoints(prd),
      visual_regression_enabled: true,
      created_by: 'PRD Generator'
    };
    
    const { data, error } = await this.supabase
      .from('prd_playwright_specifications')
      .insert(specs)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating Playwright specs:', error);
      return specs; // Return local version if DB insert fails
    }
    
    return data;
  }

  /**
   * Generate test scenarios from PRD requirements
   */
  async generateTestScenarios(prd, playwrightSpecs) {
    const scenarios = [];
    const functionalReqs = prd.functional_requirements || [];
    
    for (const req of functionalReqs) {
      const reqScenarios = await this.createScenariosForRequirement(req, prd, playwrightSpecs);
      scenarios.push(...reqScenarios);
    }
    
    // Store scenarios in database
    if (scenarios.length > 0) {
      const { error } = await this.supabase
        .from('prd_playwright_scenarios')
        .upsert(scenarios, { onConflict: 'scenario_id' });
      
      if (error) {
        console.error('Error storing scenarios:', error);
      }
    }
    
    return scenarios;
  }

  /**
   * Create test scenarios for a single requirement
   */
  async createScenariosForRequirement(requirement, prd, specs) {
    const scenarios = [];
    const acceptanceCriteria = requirement.acceptance_criteria || [];
    
    // Generate main happy path scenario
    const mainScenario = {
      prd_id: prd.id,
      requirement_id: requirement.id,
      scenario_id: `${requirement.id}-TEST-MAIN`,
      scenario_name: `${requirement.name} - Happy Path`,
      scenario_description: requirement.description,
      priority: this.mapPriority(prd.priority),
      test_type: 'e2e',
      preconditions: this.generatePreconditions(requirement),
      test_steps: this.generateTestSteps(requirement, acceptanceCriteria, specs),
      expected_results: this.generateExpectedResults(acceptanceCriteria),
      assertions: this.generateAssertions(requirement, acceptanceCriteria),
      test_data: this.generateTestData(requirement),
      cleanup_steps: this.generateCleanupSteps(requirement),
      auto_generated: true
    };
    
    scenarios.push(mainScenario);
    
    // Generate edge case scenarios if complex requirement
    if (acceptanceCriteria.length > 3) {
      const edgeScenario = {
        ...mainScenario,
        scenario_id: `${requirement.id}-TEST-EDGE`,
        scenario_name: `${requirement.name} - Edge Cases`,
        test_steps: this.generateEdgeCaseSteps(requirement, acceptanceCriteria, specs),
        priority: 'medium'
      };
      scenarios.push(edgeScenario);
    }
    
    // Generate negative test scenario if validation is involved
    if (this.requiresValidation(requirement)) {
      const negativeScenario = {
        ...mainScenario,
        scenario_id: `${requirement.id}-TEST-NEG`,
        scenario_name: `${requirement.name} - Negative Tests`,
        test_steps: this.generateNegativeTestSteps(requirement, acceptanceCriteria, specs),
        priority: 'low'
      };
      scenarios.push(negativeScenario);
    }
    
    return scenarios;
  }

  /**
   * Generate test steps from acceptance criteria
   */
  generateTestSteps(requirement, acceptanceCriteria, specs) {
    const steps = [];
    let stepNumber = 1;
    
    // Navigation step
    const navUrl = this.determineNavigationUrl(requirement);
    steps.push({
      step: stepNumber++,
      action: 'navigate',
      target: `${specs.base_url}${navUrl}`,
      data: null,
      assertion: {
        type: 'url',
        expected: navUrl
      }
    });
    
    // Wait for page load
    steps.push({
      step: stepNumber++,
      action: 'waitForLoadState',
      target: 'networkidle',
      data: null,
      assertion: null
    });
    
    // Generate steps from acceptance criteria
    for (const criteria of acceptanceCriteria) {
      const criteriaSteps = this.parseAcceptanceCriteria(criteria, stepNumber);
      steps.push(...criteriaSteps);
      stepNumber += criteriaSteps.length;
    }
    
    // Add screenshot at the end
    steps.push({
      step: stepNumber++,
      action: 'screenshot',
      target: 'fullPage',
      data: {
        name: `${requirement.id}-complete`
      },
      assertion: null
    });
    
    return steps;
  }

  /**
   * Parse acceptance criteria into test steps
   */
  parseAcceptanceCriteria(criteria, startStep) {
    const steps = [];
    let stepNum = startStep;
    
    // Analyze criteria text to determine actions
    const criteriaText = typeof criteria === 'string' ? criteria : criteria.text || '';
    const lowerText = criteriaText.toLowerCase();
    
    // Input/Form related
    if (lowerText.includes('input') || lowerText.includes('enter') || lowerText.includes('fill')) {
      const selector = this.extractSelector(criteriaText) || '[data-testid="input-field"]';
      steps.push({
        step: stepNum++,
        action: 'fill',
        target: selector,
        data: 'Test input data',
        assertion: {
          type: 'value',
          expected: 'Test input data'
        }
      });
    }
    
    // Click/Button related
    if (lowerText.includes('click') || lowerText.includes('button') || lowerText.includes('submit')) {
      const selector = this.extractSelector(criteriaText) || '[data-testid="submit-button"]';
      steps.push({
        step: stepNum++,
        action: 'click',
        target: selector,
        data: null,
        assertion: {
          type: 'visible',
          selector: selector
        }
      });
    }
    
    // Validation/Display related
    if (lowerText.includes('display') || lowerText.includes('show') || lowerText.includes('appear')) {
      const selector = this.extractSelector(criteriaText) || '[data-testid="result"]';
      steps.push({
        step: stepNum++,
        action: 'waitForSelector',
        target: selector,
        data: {
          state: 'visible',
          timeout: 5000
        },
        assertion: {
          type: 'visible',
          selector: selector
        }
      });
    }
    
    // API/Network related
    if (lowerText.includes('api') || lowerText.includes('request') || lowerText.includes('response')) {
      steps.push({
        step: stepNum++,
        action: 'waitForResponse',
        target: '**/api/**',
        data: {
          predicate: 'response.ok()'
        },
        assertion: {
          type: 'network',
          expected: 'success'
        }
      });
    }
    
    return steps;
  }

  /**
   * Generate Playwright assertions
   */
  generateAssertions(requirement, acceptanceCriteria) {
    const assertions = [];
    
    // Basic visibility assertions
    assertions.push({
      type: 'toBeVisible',
      selector: `[data-testid="${requirement.id}-container"]`,
      description: `${requirement.name} container should be visible`
    });
    
    // Generate assertions from acceptance criteria
    for (const criteria of acceptanceCriteria) {
      const criteriaText = typeof criteria === 'string' ? criteria : criteria.text || '';
      
      if (criteriaText.toLowerCase().includes('text')) {
        assertions.push({
          type: 'toHaveText',
          selector: '[data-testid="content"]',
          text: '.*',
          description: 'Content should have text'
        });
      }
      
      if (criteriaText.toLowerCase().includes('enabled')) {
        assertions.push({
          type: 'toBeEnabled',
          selector: '[data-testid="action-button"]',
          description: 'Action button should be enabled'
        });
      }
      
      if (criteriaText.toLowerCase().includes('count')) {
        assertions.push({
          type: 'toHaveCount',
          selector: '[data-testid="list-item"]',
          count: '>0',
          description: 'Should have list items'
        });
      }
    }
    
    // Add screenshot assertion for visual testing
    assertions.push({
      type: 'toHaveScreenshot',
      name: `${requirement.id}-final.png`,
      options: {
        maxDiffPixels: 100,
        threshold: 0.2
      }
    });
    
    return assertions;
  }

  /**
   * Create test files from scenarios
   */
  async createTestFiles(prd, scenarios, specs) {
    const files = [];
    const outputDir = path.join(process.cwd(), this.config.outputDir);
    
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    // Group scenarios by requirement for better organization
    const scenariosByRequirement = {};
    for (const scenario of scenarios) {
      if (!scenariosByRequirement[scenario.requirement_id]) {
        scenariosByRequirement[scenario.requirement_id] = [];
      }
      scenariosByRequirement[scenario.requirement_id].push(scenario);
    }
    
    // Generate test file for each requirement
    for (const [reqId, reqScenarios] of Object.entries(scenariosByRequirement)) {
      const testContent = this.generateTestFileContent(prd, reqId, reqScenarios, specs);
      const fileName = `${reqId.toLowerCase()}.spec.js`;
      const filePath = path.join(outputDir, fileName);
      
      await fs.writeFile(filePath, testContent);
      files.push({
        requirement_id: reqId,
        file_name: fileName,
        file_path: filePath,
        scenarios: reqScenarios.length
      });
      
      console.log(`✅ Generated test file: ${fileName}`);
    }
    
    return files;
  }

  /**
   * Generate test file content
   */
  generateTestFileContent(prd, requirementId, scenarios, specs) {
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
import { ${this.toPascalCase(requirementId)}Page } from '../pages/${requirementId}.page';

test.describe('${requirement.name || requirementId}', () => {
  let page;
  let ${this.toCamelCase(requirementId)}Page;
  
  test.beforeEach(async ({ page: testPage, context }) => {
    page = testPage;
    ${this.toCamelCase(requirementId)}Page = new ${this.toPascalCase(requirementId)}Page(page);
    
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
  
${scenarios.map(scenario => this.generateTestCase(scenario, requirementId)).join('\n\n')}
  
  // Visual Regression Tests
  test('Visual regression - ${requirementId}', async () => {
    await page.goto('${specs.base_url}${this.determineNavigationUrl(requirement)}');
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
    await page.goto('${specs.base_url}${this.determineNavigationUrl(requirement)}');
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
   */
  generateTestCase(scenario, _requirementId) {
    return `  test('${scenario.scenario_name}', async () => {
    // Test ID: ${scenario.scenario_id}
    // Priority: ${scenario.priority}
    // Type: ${scenario.test_type}
    
    // Preconditions
${this.generatePreconditionCode(scenario.preconditions)}
    
    // Test Steps
${this.generateTestStepCode(scenario.test_steps)}
    
    // Assertions
${this.generateAssertionCode(scenario.assertions)}
    
    // Cleanup
${this.generateCleanupCode(scenario.cleanup_steps)}
  });`;
  }

  /**
   * Generate code for test steps
   */
  generateTestStepCode(steps) {
    if (!steps || steps.length === 0) return '    // No test steps defined';
    
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
   */
  generateAssertionCode(assertions) {
    if (!assertions || assertions.length === 0) return '    // No assertions defined';
    
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
   * Generate page object models
   */
  async generatePageObjects(prd, specs) {
    const pageObjects = [];
    const pagesDir = path.join(process.cwd(), this.config.outputDir, 'pages');
    
    await fs.mkdir(pagesDir, { recursive: true });
    
    for (const req of (prd.functional_requirements || [])) {
      const pageObjectContent = this.generatePageObjectContent(req, specs);
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
   */
  generatePageObjectContent(requirement, specs) {
    const className = this.toPascalCase(requirement.id) + 'Page';
    
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
    await this.page.goto('${specs.base_url}${this.determineNavigationUrl(requirement)}');
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
  async complete${requirement.name.replace(/\s+/g, '')}Flow(data) {
    await this.goto();
    await this.fillInput(data.input || 'test');
    await this.submit();
    await this.waitForResult();
    return await this.getResultText();
  }
}`;
  }

  /**
   * Generate test fixtures
   */
  async generateTestFixtures(prd) {
    const fixtures = [];
    
    // Create user fixtures
    const userFixture = {
      prd_id: prd.id,
      fixture_name: 'test-users',
      fixture_type: 'user',
      fixture_data: {
        validUser: {
          email: 'test@example.com',
          password: 'Test123!',
          name: 'Test User'
        },
        adminUser: {
          email: 'admin@example.com',
          password: 'Admin123!',
          name: 'Admin User',
          role: 'admin'
        }
      },
      description: 'Test user accounts for authentication testing'
    };
    
    // Create data fixtures based on requirements
    const dataFixtures = this.generateDataFixtures(prd);
    
    fixtures.push(userFixture, ...dataFixtures);
    
    // Store in database
    if (fixtures.length > 0) {
      const { error } = await this.supabase
        .from('prd_test_fixtures')
        .upsert(fixtures, { onConflict: 'prd_id,fixture_name' });
      
      if (error) {
        console.error('Error storing fixtures:', error);
      }
    }
    
    // Write fixtures to file
    const fixturesDir = path.join(process.cwd(), this.config.outputDir, 'fixtures');
    await fs.mkdir(fixturesDir, { recursive: true });
    
    const fixturesContent = `// Test Fixtures for ${prd.title}
export const fixtures = ${JSON.stringify(fixtures.reduce((acc, f) => {
      acc[f.fixture_name] = f.fixture_data;
      return acc;
    }, {}), null, 2)};`;
    
    await fs.writeFile(path.join(fixturesDir, 'test-data.js'), fixturesContent);
    
    return fixtures;
  }

  /**
   * Update test mappings in database
   */
  async updateTestMappings(prdId, generatedFiles) {
    const mappings = [];
    
    for (const file of generatedFiles) {
      mappings.push({
        prd_id: prdId,
        requirement_id: file.requirement_id,
        scenario_id: `${file.requirement_id}-TEST-MAIN`,
        verification_type: 'automated',
        verification_status: 'pending',
        test_file_path: file.file_path,
        test_function_name: `test('${file.requirement_id}')`,
        created_at: new Date().toISOString()
      });
    }
    
    if (mappings.length > 0) {
      const { error } = await this.supabase
        .from('prd_test_verification_mapping')
        .upsert(mappings, { onConflict: 'prd_id,requirement_id,scenario_id' });
      
      if (error) {
        console.error('Error updating test mappings:', error);
      }
    }
  }

  /**
   * Generate test documentation
   */
  async generateTestDocumentation(prd, scenarios) {
    const docPath = path.join(process.cwd(), this.config.outputDir, 'TEST_PLAN.md');
    
    const documentation = `# Test Plan for ${prd.title}

## PRD ID: ${prd.id}

## Overview
This document outlines the automated Playwright test coverage for the PRD requirements.

## Test Configuration
- Base URL: ${this.config.baseUrl}
- Browsers: Chromium, Firefox, WebKit
- Viewports: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)

## Test Scenarios

${scenarios.map(scenario => `### ${scenario.scenario_name}
- **ID**: ${scenario.scenario_id}
- **Requirement**: ${scenario.requirement_id}
- **Priority**: ${scenario.priority}
- **Type**: ${scenario.test_type}
- **Test Steps**: ${scenario.test_steps?.length || 0} steps
- **Assertions**: ${scenario.assertions?.length || 0} assertions

`).join('')}

## Coverage Summary
- Total Requirements: ${prd.functional_requirements?.length || 0}
- Total Scenarios: ${scenarios.length}
- Automated Tests: ${scenarios.filter(s => s.auto_generated).length}
- Manual Tests: ${scenarios.filter(s => !s.auto_generated).length}

## Running the Tests

\`\`\`bash
# Run all tests
npm run test:e2e

# Run specific requirement tests
npm run test:e2e -- ${prd.id.toLowerCase()}

# Run with specific browser
npm run test:e2e -- --project=chromium

# Run in headed mode
npm run test:e2e -- --headed

# Generate HTML report
npm run test:report
\`\`\`

## Test Data
Test fixtures are located in \`tests/e2e/generated/fixtures/test-data.js\`

## Page Objects
Page object models are located in \`tests/e2e/generated/pages/\`

## Visual Testing
Baseline screenshots are stored in \`tests/e2e/generated/screenshots/\`

## Continuous Integration
These tests are automatically executed on:
- Pull requests
- Main branch commits
- Nightly builds

## Maintenance
Tests are auto-generated from PRD specifications. To update:
1. Update PRD requirements in the database
2. Run: \`npm run generate:tests -- --prd=${prd.id}\`
3. Review and commit generated changes

---
*Generated: ${new Date().toISOString()}*
*Generator Version: 1.0.0*
`;
    
    await fs.writeFile(docPath, documentation);
    
    return docPath;
  }

  // Helper methods
  
  extractPageObjects(prd) {
    const pageObjects = {};
    
    for (const req of (prd.functional_requirements || [])) {
      const pageName = this.toPascalCase(req.id) + 'Page';
      pageObjects[pageName] = {
        selectors: {
          container: `[data-testid="${req.id}-container"]`,
          input: `[data-testid="${req.id}-input"]`,
          button: `[data-testid="${req.id}-button"]`,
          result: `[data-testid="${req.id}-result"]`
        },
        actions: ['navigate', 'fill', 'click', 'submit', 'validate']
      };
    }
    
    return pageObjects;
  }

  generateSharedSelectors(_prd) {
    return {
      navigation: {
        header: '[data-testid="header"]',
        nav: '[data-testid="navigation"]',
        footer: '[data-testid="footer"]'
      },
      common: {
        loader: '[data-testid="loader"]',
        error: '[data-testid="error-message"]',
        success: '[data-testid="success-message"]',
        modal: '[data-testid="modal"]'
      }
    };
  }

  extractAPIEndpoints(prd) {
    const endpoints = [];
    const apis = prd.technical_requirements?.apis || [];
    
    for (const api of apis) {
      endpoints.push({
        method: api.methods?.[0] || 'GET',
        path: api.endpoint,
        expectedStatus: 200,
        description: api.description
      });
    }
    
    return endpoints;
  }

  determineNavigationUrl(requirement) {
    const reqId = requirement.id || '';
    const name = requirement.name || '';
    
    if (name.toLowerCase().includes('dashboard')) return '/dashboard';
    if (name.toLowerCase().includes('login')) return '/login';
    if (name.toLowerCase().includes('directive')) return '/directives';
    if (reqId.toLowerCase().includes('sdip')) return '/directive-lab';
    
    return '/';
  }

  extractSelector(text) {
    // Try to extract data-testid or other selector patterns
    const patterns = [
      /data-testid="([^"]+)"/,
      /id="([^"]+)"/,
      /class="([^"]+)"/,
      /\[([^\]]+)\]/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }
    
    return null;
  }

  mapPriority(prdPriority) {
    const mapping = {
      'critical': 'critical',
      'high': 'high',
      'medium': 'medium',
      'low': 'low'
    };
    
    return mapping[prdPriority] || 'medium';
  }

  requiresValidation(requirement) {
    const text = JSON.stringify(requirement).toLowerCase();
    return text.includes('valid') || 
           text.includes('require') || 
           text.includes('must') ||
           text.includes('should');
  }

  generatePreconditions(requirement) {
    const preconditions = [];
    
    if (requirement.name?.toLowerCase().includes('auth')) {
      preconditions.push({
        type: 'authentication',
        action: 'login',
        data: { user: 'testUser' }
      });
    }
    
    if (requirement.dependencies?.length > 0) {
      preconditions.push({
        type: 'dependency',
        action: 'ensure',
        data: { dependencies: requirement.dependencies }
      });
    }
    
    return preconditions;
  }

  generateExpectedResults(acceptanceCriteria) {
    return acceptanceCriteria.map(criteria => ({
      criteria: typeof criteria === 'string' ? criteria : criteria.text,
      validated: false
    }));
  }

  generateTestData(_requirement) {
    return {
      valid: {
        input: 'Valid test data',
        expected: 'Success'
      },
      invalid: {
        input: '',
        expected: 'Validation error'
      },
      edge: {
        input: 'x'.repeat(1000),
        expected: 'Handle large input'
      }
    };
  }

  generateCleanupSteps(_requirement) {
    return [
      {
        action: 'clearStorage',
        target: 'localStorage'
      },
      {
        action: 'clearCookies',
        target: 'all'
      }
    ];
  }

  generateEdgeCaseSteps(requirement, acceptanceCriteria, specs) {
    // Similar to generateTestSteps but with edge cases
    const steps = this.generateTestSteps(requirement, acceptanceCriteria, specs);
    
    // Add edge case specific steps
    steps.push({
      step: steps.length + 1,
      action: 'fill',
      target: '[data-testid="input"]',
      data: 'x'.repeat(10000), // Very long input
      assertion: {
        type: 'validation',
        expected: 'handled'
      }
    });
    
    return steps;
  }

  generateNegativeTestSteps(requirement, acceptanceCriteria, specs) {
    const steps = [];
    
    // Test with invalid data
    steps.push({
      step: 1,
      action: 'navigate',
      target: `${specs.base_url}${this.determineNavigationUrl(requirement)}`,
      data: null
    });
    
    // Submit without filling required fields
    steps.push({
      step: 2,
      action: 'click',
      target: '[data-testid="submit"]',
      data: null,
      assertion: {
        type: 'error',
        expected: 'validation-error'
      }
    });
    
    return steps;
  }

  generatePreconditionCode(preconditions) {
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

  generateCleanupCode(cleanupSteps) {
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

  generateDataFixtures(prd) {
    const fixtures = [];
    
    for (const req of (prd.functional_requirements || [])) {
      fixtures.push({
        prd_id: prd.id,
        fixture_name: `${req.id}-test-data`,
        fixture_type: 'data',
        fixture_data: {
          valid: this.generateValidData(req),
          invalid: this.generateInvalidData(req),
          edge: this.generateEdgeData(req)
        },
        description: `Test data for ${req.name}`
      });
    }
    
    return fixtures;
  }

  generateValidData(_requirement) {
    // Generate valid test data based on requirement
    return {
      input: 'Valid input',
      expected: 'Success'
    };
  }

  generateInvalidData(_requirement) {
    // Generate invalid test data
    return {
      input: '',
      expected: 'Validation error'
    };
  }

  generateEdgeData(_requirement) {
    // Generate edge case data
    return {
      veryLong: 'x'.repeat(10000),
      specialChars: '!@#$%^&*()',
      unicode: '你好世界 🌍'
    };
  }

  toPascalCase(str) {
    return str
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  toCamelCase(str) {
    const pascal = this.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const prdId = args[0];
  
  if (!prdId) {
    console.error('Usage: node prd-playwright-generator.js <PRD_ID>');
    process.exit(1);
  }
  
  const generator = new PRDPlaywrightGenerator();
  
  generator.generateTestsFromPRD(prdId)
    .then(result => {
      console.log('\n✅ Test generation completed successfully!');
      console.log(`📁 Generated ${result.generatedFiles.length} test files`);
      console.log(`📄 Generated ${result.totalScenarios} test scenarios`);
      console.log(`📦 Generated ${result.pageObjects.length} page objects`);
      console.log(`💾 Generated ${result.fixtures.length} test fixtures`);
      console.log(`📚 Documentation: ${result.documentation}`);
    })
    .catch(error => {
      console.error('❌ Test generation failed:', error);
      process.exit(1);
    });
}

export default PRDPlaywrightGenerator;