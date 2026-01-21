#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Automated Testing Sub-Agent
 * Fully automated visual inspection and test execution system
 * Activates automatically when LEO Protocol testing criteria are met
 */

import { chromium } from 'playwright';
import fsModule from 'fs';
import _path from 'path';
import { createRequire } from 'module';
import { checkActivationCriteria } from './activation.js';
import { discoverTestTargets } from './discovery.js';
import { testFullPage, testGeneric } from './page-testing.js';
import { testComponent } from './component-testing.js';
import { generateAutomatedReport } from './reporting.js';
import {
  analyzeFailure,
  generateFixRecommendation,
  captureErrorState
} from './failure-analysis.js';

const require = createRequire(import.meta.url);
const PlaywrightBridge = require('../../playwright-bridge.js');
const fs = fsModule.promises;

/**
 * Create initial test results object
 * @returns {object}
 */
function createInitialTestResults() {
  return {
    passed: 0,
    failed: 0,
    warnings: 0,
    screenshots: [],
    issues: [],
    failureAnalysis: [],
    fixRecommendations: []
  };
}

/**
 * Default configuration for the testing sub-agent
 * @param {object} config - User-provided configuration
 * @returns {object}
 */
function createConfig(config = {}) {
  return {
    autoRun: true,
    headless: config.headless !== false,
    timeout: config.timeout || 30000,
    baseURL: config.baseURL || 'http://localhost:8080',
    outputDir: config.outputDir || 'test-results/automated',
    screenshotDir: 'test-results/automated/screenshots',
    reportDir: 'test-results/automated/reports',
    ...config
  };
}

class AutomatedTestingSubAgent {
  constructor(config = {}) {
    this.config = createConfig(config);
    this.browser = null;
    this.page = null;
    this.bridge = new PlaywrightBridge();
    this.testResults = createInitialTestResults();

    // Activation criteria per LEO Protocol v4.1
    this.activationTriggers = {
      coverageThreshold: 80,
      e2eRequired: true,
      complexTestScenarios: 10,
      visualInspection: true
    };
  }

  /**
   * Auto-activate based on LEO Protocol criteria
   * @returns {Promise<boolean>}
   */
  async checkActivationCriteria() {
    return checkActivationCriteria(this.activationTriggers);
  }

  /**
   * Fully automated test execution
   * @returns {Promise<object>}
   */
  async executeAutomatedTesting() {
    console.log('Starting fully automated visual inspection...');

    try {
      await this.setup();
      const targets = await this.discoverTestTargets();

      for (const target of targets) {
        await this.executeTargetTests(target);
      }

      await this.generateAutomatedReport();
      await this.cleanup();

      console.log('Automated testing completed successfully');
      return this.testResults;

    } catch (error) {
      console.error('Automated testing failed:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Initialize browser and setup
   * @returns {Promise<void>}
   */
  async setup() {
    console.log('Setting up automated testing environment...');

    await this.ensureDirectories();

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1280, height: 720 });

    this.page.on('pageerror', async (error) => {
      await this.captureErrorState('pageerror', error.message);
    });

    console.log('Environment ready');
  }

  /**
   * Auto-discover what needs to be tested
   * @returns {Promise<Array<object>>}
   */
  async discoverTestTargets() {
    return discoverTestTargets(this.config);
  }

  /**
   * Execute tests for a specific target
   * @param {object} target - Test target configuration
   * @returns {Promise<void>}
   */
  async executeTargetTests(target) {
    console.log(`Testing: ${target.name}`);

    try {
      await this.page.goto(`${this.config.baseURL}${target.url}`, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout
      });

      await this.page.waitForTimeout(2000);

      switch (target.type) {
        case 'page':
          await testFullPage(this.page, target, this.config, this.testResults);
          break;
        case 'component':
          await testComponent(this.page, target, this.config, this.testResults);
          break;
        default:
          await testGeneric(this.page, target, this.config, this.testResults);
      }

      console.log(`${target.name} testing completed`);
      this.testResults.passed++;

    } catch (error) {
      console.error(`${target.name} testing failed:`, error.message);
      this.testResults.failed++;

      const failureAnalysis = await analyzeFailure(error, target, this.page);
      const fixRecommendation = await generateFixRecommendation(failureAnalysis, target);

      this.testResults.issues.push({
        target: target.name,
        error: error.message,
        timestamp: new Date().toISOString(),
        analysis: failureAnalysis,
        recommendation: fixRecommendation
      });

      this.testResults.failureAnalysis.push(failureAnalysis);
      this.testResults.fixRecommendations.push(fixRecommendation);

      await this.captureErrorState(target.name, error.message);
    }
  }

  /**
   * Capture error state for debugging
   * @param {string} context - Error context description
   * @param {string} errorMessage - Error message
   * @returns {Promise<void>}
   */
  async captureErrorState(context, errorMessage) {
    await captureErrorState(this.page, context, errorMessage, this.config, this.testResults);
  }

  /**
   * Generate comprehensive automated report
   * @returns {Promise<void>}
   */
  async generateAutomatedReport() {
    await generateAutomatedReport(this.testResults, this.config);
  }

  /**
   * Validate a fix by re-running specific test
   * @param {string} targetName - Name of the target to validate
   * @param {number} attempt - Current attempt number
   * @returns {Promise<object>}
   */
  async validateFix(targetName, attempt = 1) {
    console.log(`Validating fix for ${targetName} (attempt ${attempt})...`);

    try {
      if (!this.browser) {
        await this.setup();
      }

      const targets = await this.discoverTestTargets();
      const target = targets.find(t => t.name === targetName);

      if (!target) {
        throw new Error(`Target ${targetName} not found`);
      }

      await this.executeTargetTests(target);

      const lastIssue = this.testResults.issues[this.testResults.issues.length - 1];

      if (!lastIssue || lastIssue.target !== targetName) {
        console.log('Fix validated successfully!');
        return { success: true, attempt };
      }

      if (attempt < 3) {
        console.log('Fix incomplete, generating refined recommendation...');
        const refinedAnalysis = await analyzeFailure(new Error(lastIssue.error), target, this.page);
        const refinedRecommendation = await generateFixRecommendation(refinedAnalysis, target);

        return {
          success: false,
          attempt,
          refinedRecommendation
        };
      }

      console.log('Fix validation failed after 3 attempts');
      return { success: false, attempt, finalFailure: true };

    } catch (error) {
      console.error('Validation error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Ensure output directories exist
   * @returns {Promise<void>}
   */
  async ensureDirectories() {
    const dirs = [
      this.config.outputDir,
      this.config.screenshotDir,
      this.config.reportDir
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Cleanup resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (this.page) {
      await this.page.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Auto-execution when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const agent = new AutomatedTestingSubAgent();

  if (args[0] === '--validate-fix' && args[1]) {
    agent.validateFix(args[1])
      .then(result => {
        if (result.success) {
          console.log('Validation passed!');
          process.exit(0);
        } else {
          console.log('Validation failed');
          if (result.refinedRecommendation) {
            console.log('\nRefined Fix Recommendation:');
            console.log(JSON.stringify(result.refinedRecommendation, null, 2));
          }
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('Validation error:', error);
        process.exit(1);
      });
  } else {
    agent.checkActivationCriteria()
      .then(shouldActivate => {
        if (shouldActivate) {
          return agent.executeAutomatedTesting();
        } else {
          console.log('Testing Sub-Agent not activated - criteria not met');
          process.exit(0);
        }
      })
      .then(results => {
        console.log('Automated testing completed successfully');

        if (results.failed > 0 && results.fixRecommendations.length > 0) {
          console.log('\nFix Recommendations:');
          console.log('='.repeat(50));
          for (const rec of results.fixRecommendations) {
            console.log(`\n${rec.summary}`);
            console.log(`Priority: ${rec.priority} | Confidence: ${rec.confidence}%`);
            console.log('Steps:');
            rec.steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
            if (rec.validation) {
              console.log(`\nValidation: ${rec.validation.command}`);
            }
          }
        }

        process.exit(results.failed > 0 ? 1 : 0);
      })
      .catch(error => {
        console.error('Automated testing failed:', error);
        process.exit(1);
      });
  }
}

export default AutomatedTestingSubAgent;
export { AutomatedTestingSubAgent, createConfig, createInitialTestResults };

// Re-export all module functions for advanced usage
export * from './activation.js';
export * from './discovery.js';
export * from './page-testing.js';
export * from './component-testing.js';
export * from './performance.js';
export * from './accessibility.js';
export * from './reporting.js';
export * from './failure-analysis.js';
