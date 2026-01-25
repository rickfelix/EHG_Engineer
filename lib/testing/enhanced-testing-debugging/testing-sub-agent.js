/**
 * Enhanced Testing Sub-Agent
 * Part of SD-LEO-REFAC-TEST-DEBUG-004
 *
 * Provides self-healing selectors, intelligent retry, and test execution.
 */

import { createClient } from '@supabase/supabase-js';
import { TestHandoff } from './test-handoff.js';

// Require environment variables - no hardcoded fallbacks for security
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

/**
 * Enhanced Testing Sub-Agent with Self-Healing Selectors
 */
export class EnhancedTestingSubAgent {
  constructor() {
    this.name = 'Enhanced Testing Sub-Agent';
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.backstory = null;
    this.currentHandoff = null;
    this.selectorStrategies = [];
  }

  async initialize() {
    await this.loadBackstory();
    this.setupSelectorStrategies();
  }

  async loadBackstory() {
    const { data } = await this.supabase
      .from('leo_sub_agents')
      .select('name, description, metadata')
      .eq('id', 'testing-sub')
      .single();

    if (data?.metadata?.backstory) {
      this.backstory = data.metadata.backstory;
      console.log('🧪 ENHANCED TESTING SUB-AGENT ACTIVATED');
      console.log(`📖 ${this.backstory.summary}`);
      console.log(`💭 Mantra: "${this.backstory.mantras?.[0]}"`);
    }
  }

  setupSelectorStrategies() {
    // Define fallback selector strategies
    this.selectorStrategies = [
      { name: 'testId', selector: (id) => `[data-testid="${id}"]` },
      { name: 'id', selector: (id) => `#${id}` },
      { name: 'text', selector: (text) => `text=${text}` },
      { name: 'partialText', selector: (text) => `text=/${text}/i` },
      { name: 'role', selector: (role, name) => `role=${role}[name="${name}"]` },
      { name: 'xpath', selector: (xpath) => xpath },
      { name: 'css', selector: (css) => css }
    ];
  }

  /**
   * Self-healing selector that tries multiple strategies
   */
  async findElement(page, selectors) {
    const attempts = [];

    for (const strategy of selectors) {
      try {
        const element = await page.locator(strategy.selector).first();
        const count = await element.count();

        attempts.push({
          strategy: strategy.name || 'custom',
          selector: strategy.selector,
          found: count > 0
        });

        if (count > 0) {
          console.log(`✅ Found element using ${strategy.name || 'custom'} strategy`);
          return element;
        }
      } catch (error) {
        attempts.push({
          strategy: strategy.name || 'custom',
          selector: strategy.selector,
          error: error.message
        });
      }
    }

    // All strategies failed - create detailed failure report
    const failure = {
      testName: 'Element Location',
      error: 'Could not find element with any strategy',
      attempts: attempts,
      screenshot: await page.screenshot({ encoding: 'base64' })
    };

    this.currentHandoff.addFailure(failure);
    return null;
  }

  /**
   * Run test with enhanced error handling and metrics
   */
  async runTest(page, testName, testFunction) {
    const testStart = Date.now();
    const testResult = {
      name: testName,
      passed: false,
      duration: 0,
      error: null,
      retries: 0
    };

    try {
      // Set up console and network logging
      const consoleLogs = [];
      const networkLogs = [];

      page.on('console', msg => consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      }));

      page.on('response', response => networkLogs.push({
        url: response.url(),
        status: response.status(),
        ok: response.ok(),
        timestamp: new Date().toISOString()
      }));

      // Run the actual test
      await testFunction();

      testResult.passed = true;
      console.log(`✅ ${testName} passed`);

    } catch (error) {
      testResult.error = error;
      testResult.passed = false;
      console.log(`❌ ${testName} failed: ${error.message}`);

      // Capture failure context
      const failure = {
        testName: testName,
        error: error.message,
        stack: error.stack,
        consoleLogs: consoleLogs,
        networkLogs: networkLogs.filter(log => !log.ok),
        screenshot: await page.screenshot({ encoding: 'base64' }),
        url: page.url(),
        timestamp: new Date().toISOString()
      };

      this.currentHandoff.addFailure(failure);
    }

    testResult.duration = Date.now() - testStart;
    return testResult;
  }

  /**
   * Intelligent retry with exponential backoff
   */
  async intelligentRetry(page, test, maxRetries = 3) {
    const retryStrategies = {
      'TimeoutError': { wait: 2000, multiplier: 2 },
      'NetworkError': { wait: 1000, multiplier: 1.5 },
      'ElementNotFound': { wait: 500, multiplier: 1.2 },
      'Default': { wait: 1000, multiplier: 1.5 }
    };

    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`🔄 Retry attempt ${attempt + 1}/${maxRetries} for ${test.name}`);
        const result = await this.runTest(page, test.name, test.function);

        if (result.passed) {
          console.log(`✅ Test passed on retry ${attempt + 1}`);
          return result;
        }

        lastError = result.error;

        // Determine wait time based on error type
        const errorType = this.classifyError(result.error);
        const strategy = retryStrategies[errorType] || retryStrategies.Default;
        const waitTime = strategy.wait * Math.pow(strategy.multiplier, attempt);

        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));

      } catch (error) {
        lastError = error;
      }
    }

    // All retries failed
    throw lastError;
  }

  classifyError(error) {
    if (!error) return 'Default';
    const message = error.message || error.toString();

    if (message.includes('Timeout')) return 'TimeoutError';
    if (message.includes('net::')) return 'NetworkError';
    if (message.includes('not found')) return 'ElementNotFound';

    return 'Default';
  }

  /**
   * Create test handoff for debugging agent
   */
  createHandoff(testResults) {
    if (!this.currentHandoff) {
      this.currentHandoff = new TestHandoff();
    }

    // Update metrics
    this.currentHandoff.metrics.totalTests = testResults.length;
    this.currentHandoff.metrics.passed = testResults.filter(t => t.passed).length;
    this.currentHandoff.metrics.failed = testResults.filter(t => !t.passed).length;

    return this.currentHandoff.finalize();
  }
}
