#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Automated Testing Sub-Agent
 * Fully automated visual inspection and test execution system
 * Activates automatically when LEO Protocol testing criteria are met
 *
 * REFACTORED: Modularized from 1,098 LOC to ~180 LOC (SD-LEO-REFAC-TESTING-INFRA-001)
 * Modules: config, test-discovery, page-testing, component-testing,
 *          performance-accessibility, failure-analysis, report-generator
 */

import { chromium } from 'playwright';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import PlaywrightBridge from './playwright-bridge.js';

import {
  DEFAULT_CONFIG,
  ACTIVATION_TRIGGERS,
  createTestResults,
  checkCoverageRequirement,
  checkE2ERequirement,
  checkComplexScenarios,
  discoverTestTargets,
  testFullPage,
  testGeneric,
  testComponent,
  analyzeFailure,
  generateFixRecommendation,
  generateAutomatedReport
} from './testing-agent/index.js';

class AutomatedTestingSubAgent {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.config.headless = config.headless !== false;
    this.browser = null;
    this.page = null;
    this.bridge = new PlaywrightBridge();
    this.testResults = createTestResults();
    this.activationTriggers = ACTIVATION_TRIGGERS;
  }

  async checkActivationCriteria() {
    console.log('\u{1F50D} LEO Protocol v4.1 - Checking Testing Sub-Agent activation criteria...');

    const criteria = {
      coverageRequired: await checkCoverageRequirement(),
      e2eTestingMentioned: await checkE2ERequirement(),
      complexScenarios: await checkComplexScenarios(),
      visualTestingNeeded: true
    };

    const shouldActivate = criteria.coverageRequired ||
                          criteria.e2eTestingMentioned ||
                          criteria.complexScenarios ||
                          criteria.visualTestingNeeded;

    if (shouldActivate) {
      console.log('\u2705 Testing Sub-Agent activation criteria met');
      console.log('\u{1F4CB} Criteria:', JSON.stringify(criteria, null, 2));
      return true;
    }

    console.log('\u274C Testing Sub-Agent activation criteria not met');
    return false;
  }

  async executeAutomatedTesting() {
    console.log('\u{1F680} Starting fully automated visual inspection...');

    try {
      await this.setup();
      const targets = discoverTestTargets();

      for (const target of targets) {
        await this.executeTargetTests(target);
      }

      await generateAutomatedReport(this.testResults, this.config);
      await this.cleanup();

      console.log('\u2705 Automated testing completed successfully');
      return this.testResults;

    } catch (error) {
      console.error('\u274C Automated testing failed:', error);
      await this.cleanup();
      throw error;
    }
  }

  async setup() {
    console.log('\u{1F527} Setting up automated testing environment...');

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

    console.log('\u2705 Environment ready');
  }

  async executeTargetTests(target) {
    console.log(`\u{1F3AF} Testing: ${target.name}`);

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

      console.log(`\u2705 ${target.name} testing completed`);
      this.testResults.passed++;

    } catch (error) {
      console.error(`\u274C ${target.name} testing failed:`, error.message);
      this.testResults.failed++;

      const failureAnalysis = await analyzeFailure(this.page, error, target);
      const fixRecommendation = generateFixRecommendation(failureAnalysis, target);

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

  async captureErrorState(context, _errorMessage) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const errorScreenshot = `error-${context}-${timestamp}.png`;

      await this.page.screenshot({
        path: path.join(this.config.screenshotDir, errorScreenshot),
        fullPage: true
      });

      this.testResults.screenshots.push(errorScreenshot);
      console.log(`\u{1F4F8} Error state captured: ${errorScreenshot}`);
    } catch (error) {
      console.log('\u26A0\uFE0F  Could not capture error state:', error.message);
    }
  }

  async validateFix(targetName, attempt = 1) {
    console.log(`\u{1F504} Validating fix for ${targetName} (attempt ${attempt})...`);

    try {
      if (!this.browser) await this.setup();

      const targets = discoverTestTargets();
      const target = targets.find(t => t.name === targetName);

      if (!target) throw new Error(`Target ${targetName} not found`);

      await this.executeTargetTests(target);

      const lastIssue = this.testResults.issues[this.testResults.issues.length - 1];

      if (!lastIssue || lastIssue.target !== targetName) {
        console.log('\u2705 Fix validated successfully!');
        return { success: true, attempt };
      } else if (attempt < 3) {
        console.log('\u274C Fix incomplete, generating refined recommendation...');
        const refinedAnalysis = await analyzeFailure(this.page, new Error(lastIssue.error), target);
        const refinedRecommendation = generateFixRecommendation(refinedAnalysis, target);
        return { success: false, attempt, refinedRecommendation };
      } else {
        console.log('\u274C Fix validation failed after 3 attempts');
        return { success: false, attempt, finalFailure: true };
      }

    } catch (error) {
      console.error('\u{1F4A5} Validation error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async ensureDirectories() {
    const dirs = [this.config.outputDir, this.config.screenshotDir, this.config.reportDir];
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async cleanup() {
    if (this.page) await this.page.close();
    if (this.browser) await this.browser.close();
  }
}

// Auto-execution when run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);
  const agent = new AutomatedTestingSubAgent();

  if (args[0] === '--validate-fix' && args[1]) {
    agent.validateFix(args[1])
      .then(result => {
        if (result.success) {
          console.log('\u2705 Validation passed!');
          process.exit(0);
        } else {
          console.log('\u274C Validation failed');
          if (result.refinedRecommendation) {
            console.log('\n\u{1F4CB} Refined Fix Recommendation:');
            console.log(JSON.stringify(result.refinedRecommendation, null, 2));
          }
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('\u{1F4A5} Validation error:', error);
        process.exit(1);
      });
  } else {
    agent.checkActivationCriteria()
      .then(shouldActivate => {
        if (shouldActivate) {
          return agent.executeAutomatedTesting();
        } else {
          console.log('\u{1F512} Testing Sub-Agent not activated - criteria not met');
          process.exit(0);
        }
      })
      .then(results => {
        console.log('\u{1F389} Automated testing completed successfully');

        if (results.failed > 0 && results.fixRecommendations.length > 0) {
          console.log('\n\u{1F4CB} Fix Recommendations:');
          console.log('='.repeat(50));
          for (const rec of results.fixRecommendations) {
            console.log(`\n\u{1F527} ${rec.summary}`);
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
        console.error('\u{1F4A5} Automated testing failed:', error);
        process.exit(1);
      });
  }
}

export default AutomatedTestingSubAgent;
