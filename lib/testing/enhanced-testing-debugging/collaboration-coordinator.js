/**
 * Test Collaboration Coordinator
 * Part of SD-LEO-REFAC-TEST-DEBUG-004
 *
 * Coordinates real-time collaboration between testing and debugging agents.
 */

import { TestHandoff } from './test-handoff.js';
import { EnhancedTestingSubAgent } from './testing-sub-agent.js';
import { EnhancedDebuggingSubAgent } from './debugging-sub-agent.js';

/**
 * Real-time collaboration coordinator
 */
export class TestCollaborationCoordinator {
  constructor() {
    this.testingAgent = new EnhancedTestingSubAgent();
    this.debuggingAgent = new EnhancedDebuggingSubAgent();
    this.websocket = null;
    this.listeners = new Map();
  }

  async initialize() {
    await this.testingAgent.initialize();
    await this.debuggingAgent.initialize();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Testing agent events
    this.on('test:started', async (data) => {
      console.log(`🎯 Test started: ${data.testName}`);
    });

    this.on('test:failed', async (data) => {
      console.log(`❌ Test failed: ${data.testName}`);
      // Immediately trigger debugging
      const diagnosis = await this.debuggingAgent.diagnoseFailure(data);
      this.emit('diagnosis:ready', diagnosis);
    });

    this.on('test:passed', async (data) => {
      console.log(`✅ Test passed: ${data.testName}`);
    });

    // Debugging agent events
    this.on('diagnosis:ready', async (diagnosis) => {
      console.log(`🔍 Diagnosis ready for ${diagnosis.testName}`);

      if (diagnosis.suggestedFix && diagnosis.severity !== 'CRITICAL') {
        // Auto-apply fix for non-critical issues
        await this.applyFix(diagnosis.suggestedFix);
      }
    });

    this.on('fix:applied', async (fix) => {
      console.log(`🔧 Fix applied: ${fix.description}`);
      // Retry the failed test
      this.emit('test:retry', fix.testName);
    });
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  emit(event, data) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  async applyFix(fix) {
    if (fix.autoExecutable && fix.script) {
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        await execAsync(`node ${fix.path}`);
        this.emit('fix:applied', fix);
      } catch (error) {
        console.error(`Failed to apply fix: ${error.message}`);
      }
    } else {
      console.log(`⚠️  Manual fix required: ${fix.description}`);
      if (fix.manualSteps) {
        fix.manualSteps.forEach((step, i) => {
          console.log(`  ${i + 1}. ${step}`);
        });
      }
    }
  }

  /**
   * Run complete test suite with real-time collaboration
   */
  async runTestSuite(page, tests) {
    console.log('🚀 Starting collaborative test suite...');

    const handoff = new TestHandoff();
    this.testingAgent.currentHandoff = handoff;

    const results = [];

    for (const test of tests) {
      this.emit('test:started', { testName: test.name });

      try {
        const result = await this.testingAgent.runTest(page, test.name, test.function);
        results.push(result);

        if (result.passed) {
          this.emit('test:passed', result);
        } else {
          this.emit('test:failed', result);

          // Wait for diagnosis before continuing
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Test suite error: ${error.message}`);
      }
    }

    // Create final handoff
    const finalHandoff = this.testingAgent.createHandoff(results);

    // Generate comprehensive diagnosis
    const diagnosis = await this.debuggingAgent.analyzeHandoff(finalHandoff);

    return {
      handoff: finalHandoff,
      diagnosis: diagnosis,
      results: results
    };
  }
}
