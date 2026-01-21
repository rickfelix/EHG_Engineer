#!/usr/bin/env node

/**
 * LEO Protocol v4.2 - PRD to Playwright Test Generator
 * Automatically generates Playwright test files from PRD specifications
 * Enables traceability between requirements and test verification
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  fetchPRD,
  fetchPlaywrightSpecs,
  createDefaultPlaywrightSpecs,
  toPascalCase,
  toCamelCase
} from './prd-fetcher.js';
import { generateTestScenarios } from './scenario-generator.js';
import { createTestFiles } from './test-file-generator.js';
import { generatePageObjects } from './page-object-generator.js';
import { generateTestFixtures } from './fixture-generator.js';
import { generateTestDocumentation, updateTestMappings } from './documentation-generator.js';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

class PRDPlaywrightGenerator {
  constructor(config = {}) {
    this.config = {
      outputDir: config.outputDir || 'tests/e2e/generated',
      templateDir: config.templateDir || 'tests/templates',
      baseUrl: config.baseUrl || 'http://localhost:8080',
      ...config
    };

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Generate Playwright tests from PRD
   * @param {string} prdId - PRD identifier
   * @returns {Promise<object>} Generation result
   */
  async generateTestsFromPRD(prdId) {
    console.log(`Generating Playwright tests for PRD: ${prdId}`);

    try {
      const prd = await fetchPRD(this.supabase, prdId);
      if (!prd) {
        throw new Error(`PRD ${prdId} not found`);
      }

      let playwrightSpecs = await fetchPlaywrightSpecs(this.supabase, prdId);
      if (!playwrightSpecs) {
        playwrightSpecs = await createDefaultPlaywrightSpecs(this.supabase, prd, this.config);
      }

      const scenarios = await generateTestScenarios(this.supabase, prd, playwrightSpecs);

      const generatedFiles = await createTestFiles(prd, scenarios, playwrightSpecs, this.config);

      const pageObjects = await generatePageObjects(prd, playwrightSpecs, this.config);

      const fixtures = await generateTestFixtures(this.supabase, prd, this.config);

      await updateTestMappings(this.supabase, prdId, generatedFiles);

      const documentation = await generateTestDocumentation(prd, scenarios, this.config);

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
      console.error('Test generation failed:', error);
      throw error;
    }
  }

  // Expose module methods for direct access
  async fetchPRD(prdId) {
    return fetchPRD(this.supabase, prdId);
  }

  async fetchPlaywrightSpecs(prdId) {
    return fetchPlaywrightSpecs(this.supabase, prdId);
  }

  async createDefaultPlaywrightSpecs(prd) {
    return createDefaultPlaywrightSpecs(this.supabase, prd, this.config);
  }

  async generateTestScenarios(prd, playwrightSpecs) {
    return generateTestScenarios(this.supabase, prd, playwrightSpecs);
  }

  async createTestFiles(prd, scenarios, playwrightSpecs) {
    return createTestFiles(prd, scenarios, playwrightSpecs, this.config);
  }

  async generatePageObjects(prd, playwrightSpecs) {
    return generatePageObjects(prd, playwrightSpecs, this.config);
  }

  async generateTestFixtures(prd) {
    return generateTestFixtures(this.supabase, prd, this.config);
  }

  async updateTestMappings(prdId, generatedFiles) {
    return updateTestMappings(this.supabase, prdId, generatedFiles);
  }

  async generateTestDocumentation(prd, scenarios) {
    return generateTestDocumentation(prd, scenarios, this.config);
  }

  // Utility methods
  toPascalCase(str) {
    return toPascalCase(str);
  }

  toCamelCase(str) {
    return toCamelCase(str);
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const prdId = args[0];

  if (!prdId) {
    console.error('Usage: node index.js <PRD_ID>');
    process.exit(1);
  }

  const generator = new PRDPlaywrightGenerator();

  generator.generateTestsFromPRD(prdId)
    .then(result => {
      console.log('\nTest generation completed successfully!');
      console.log(`Generated ${result.generatedFiles.length} test files`);
      console.log(`Generated ${result.totalScenarios} test scenarios`);
      console.log(`Generated ${result.pageObjects.length} page objects`);
      console.log(`Generated ${result.fixtures.length} test fixtures`);
      console.log(`Documentation: ${result.documentation}`);
    })
    .catch(error => {
      console.error('Test generation failed:', error);
      process.exit(1);
    });
}

export default PRDPlaywrightGenerator;
export { PRDPlaywrightGenerator };

// Re-export all module functions for advanced usage
export * from './prd-fetcher.js';
export * from './scenario-generator.js';
export * from './test-file-generator.js';
export * from './page-object-generator.js';
export * from './fixture-generator.js';
export * from './documentation-generator.js';
