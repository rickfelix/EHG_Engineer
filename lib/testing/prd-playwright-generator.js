#!/usr/bin/env node

/**
 * LEO Protocol v4.2 - PRD to Playwright Test Generator
 * Automatically generates Playwright test files from PRD specifications
 * Enables traceability between requirements and test verification
 *
 * REFACTORED: Modularized from 1,225 LOC to ~100 LOC (SD-LEO-REFAC-TESTING-INFRA-001)
 * Modules: config, utils, prd-fetcher, scenario-generator, code-generators,
 *          file-generators, fixture-generator, documentation-generator
 */

import {
  DEFAULT_CONFIG,
  createSupabaseClient,
  fetchPRD,
  fetchPlaywrightSpecs,
  createDefaultPlaywrightSpecs,
  updateTestMappings,
  generateTestScenarios,
  createTestFiles,
  generatePageObjects,
  generateTestFixtures,
  generateTestDocumentation
} from './prd-playwright/index.js';

class PRDPlaywrightGenerator {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.supabase = createSupabaseClient();
  }

  async generateTestsFromPRD(prdId) {
    console.log(`\u{1F3AF} Generating Playwright tests for PRD: ${prdId}`);

    try {
      const prd = await fetchPRD(this.supabase, prdId);
      if (!prd) {
        throw new Error(`PRD ${prdId} not found`);
      }

      let playwrightSpecs = await fetchPlaywrightSpecs(this.supabase, prdId);
      if (!playwrightSpecs) {
        playwrightSpecs = await createDefaultPlaywrightSpecs(this.supabase, prd, this.config.baseUrl);
      }

      const scenarios = await generateTestScenarios(this.supabase, prd, playwrightSpecs);
      const generatedFiles = await createTestFiles(prd, scenarios, playwrightSpecs, this.config.outputDir);
      const pageObjects = await generatePageObjects(prd, playwrightSpecs, this.config.outputDir);
      const fixtures = await generateTestFixtures(this.supabase, prd, this.config.outputDir);
      await updateTestMappings(this.supabase, prdId, generatedFiles);
      const documentation = await generateTestDocumentation(prd, scenarios, this.config, this.config.outputDir);

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
      console.error('\u274C Test generation failed:', error);
      throw error;
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);
  const prdId = args[0];

  if (!prdId) {
    console.error('Usage: node prd-playwright-generator.js <PRD_ID>');
    process.exit(1);
  }

  const generator = new PRDPlaywrightGenerator();

  generator.generateTestsFromPRD(prdId)
    .then(result => {
      console.log('\n\u2705 Test generation completed successfully!');
      console.log(`\u{1F4C1} Generated ${result.generatedFiles.length} test files`);
      console.log(`\u{1F4C4} Generated ${result.totalScenarios} test scenarios`);
      console.log(`\u{1F4E6} Generated ${result.pageObjects.length} page objects`);
      console.log(`\u{1F4BE} Generated ${result.fixtures.length} test fixtures`);
      console.log(`\u{1F4DA} Documentation: ${result.documentation}`);
    })
    .catch(error => {
      console.error('\u274C Test generation failed:', error);
      process.exit(1);
    });
}

export default PRDPlaywrightGenerator;
