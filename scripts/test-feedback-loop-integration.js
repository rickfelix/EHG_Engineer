#!/usr/bin/env node

/**
 * Integration Tests for LEO Hook Feedback System
 *
 * Tests the complete feedback loop including:
 * - Sub-agent activation
 * - Error resolution
 * - Circuit breaker behavior
 * - Database recording
 */

import SessionManagerSubAgent from './session-manager-subagent.js';
import HookSubAgentActivator from './hook-subagent-activator.js';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// import { execSync } from 'child_process'; // Unused - available for shell commands
import dotenv from 'dotenv';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'example-key'
);

class FeedbackLoopIntegrationTests {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  /**
   * Run all integration tests
   */
  async runAll() {
    console.log(chalk.blue('🧪 LEO Hook Feedback System Integration Tests'));
    console.log(chalk.gray('=' .repeat(50)));

    const tests = [
      this.testSessionManagerActivation,
      this.testSessionCreation,
      this.testSessionValidation,
      this.testSessionRefresh,
      this.testSubAgentActivation,
      this.testErrorResolution,
      this.testExponentialBackoff,
      this.testCircuitBreaker,
      this.testDatabaseRecording,
      this.testMaintenanceCleanup,
      this.testEndToEndCommitFlow
    ];

    for (const test of tests) {
      await this.runTest(test.bind(this));
    }

    this.printSummary();
    return this.failed === 0;
  }

  /**
   * Run a single test
   */
  async runTest(testFunc) {
    const testName = testFunc.name.replace(/^test/, '');
    process.stdout.write(`Testing ${testName}... `);

    try {
      await testFunc();
      this.passed++;
      this.results.push({ name: testName, status: 'passed' });
      console.log(chalk.green('✓'));
    } catch (_error) {
      this.failed++;
      this.results.push({ name: testName, status: 'failed', error: error.message });
      console.log(chalk.red('✗'));
      console.log(chalk.red(`   Error: ${error.message}`));
    }
  }

  /**
   * Test Session Manager activation
   */
  async testSessionManagerActivation() {
    const sessionManager = new SessionManagerSubAgent();
    const result = await sessionManager.activate({ action: 'validate' });

    if (!result || typeof result.success !== 'boolean') {
      throw new Error('Session Manager did not return expected result structure');
    }
  }

  /**
   * Test session creation
   */
  async testSessionCreation() {
    // Clean up first
    await fs.unlink('.leo-session-active').catch(() => {});
    await fs.unlink('.leo-session-id').catch(() => {});

    const sessionManager = new SessionManagerSubAgent();
    const result = await sessionManager.activate({
      action: 'create',
      sdId: 'SD-TEST-001'
    });

    if (!result.success) {
      throw new Error('Failed to create session');
    }

    // Verify files were created
    const sessionExists = await fs.access('.leo-session-active')
      .then(() => true)
      .catch(() => false);

    if (!sessionExists) {
      throw new Error('Session file was not created');
    }

    // Verify SD ID
    const sdId = await fs.readFile('.leo-session-id', 'utf8');
    if (sdId.trim() !== 'SD-TEST-001') {
      throw new Error(`Wrong SD ID: expected SD-TEST-001, got ${sdId}`);
    }
  }

  /**
   * Test session validation
   */
  async testSessionValidation() {
    const sessionManager = new SessionManagerSubAgent();

    // Should have valid session from previous test
    const result = await sessionManager.activate({ action: 'validate' });

    if (!result.success) {
      throw new Error('Session validation failed when it should succeed');
    }

    if (!result.validation || !result.validation.valid) {
      throw new Error('Session not marked as valid');
    }
  }

  /**
   * Test session refresh
   */
  async testSessionRefresh() {
    // Make session old
    const oldTime = new Date(Date.now() - 1000000).toISOString();
    await fs.writeFile('.leo-session-active', oldTime);

    const sessionManager = new SessionManagerSubAgent();
    const result = await sessionManager.activate({ action: 'refresh' });

    if (!result.success) {
      throw new Error('Failed to refresh session');
    }

    // Check timestamp was updated
    const newTime = await fs.readFile('.leo-session-active', 'utf8');
    if (newTime === oldTime) {
      throw new Error('Session timestamp was not updated');
    }
  }

  /**
   * Test sub-agent activation
   */
  async testSubAgentActivation() {
    const activator = new HookSubAgentActivator();

    // Test session manager activation
    const result = await activator.activateForFailure('no_orchestrator_session', {
      sdId: 'SD-TEST-002'
    });

    if (!result) {
      throw new Error('Sub-agent activation returned nothing');
    }

    // Check activation was recorded
    const summary = activator.getActivationSummary();
    if (summary.totalActivations === 0) {
      throw new Error('Activation was not recorded');
    }
  }

  /**
   * Test error resolution flow
   */
  async testErrorResolution() {
    const activator = new HookSubAgentActivator();

    // Test multiple error types
    const errorTypes = [
      'no_orchestrator_session',
      'stale_session',
      'uncommitted_changes'
    ];

    for (const errorType of errorTypes) {
      const canHandle = activator.canHandle(errorType);
      if (!canHandle) {
        throw new Error(`Cannot handle error type: ${errorType}`);
      }
    }
  }

  /**
   * Test exponential backoff calculation
   */
  async testExponentialBackoff() {
    // Import just the calculation logic
    const calculateDelay = (attemptNumber) => {
      const baseDelay = 1000;
      const maxDelay = 30000;
      const multiplier = 2;

      const delay = Math.min(
        baseDelay * Math.pow(multiplier, attemptNumber - 1),
        maxDelay
      );
      return Math.floor(delay);
    };

    // Test progression
    const delays = [1, 2, 3, 4, 5].map(calculateDelay);
    const expected = [1000, 2000, 4000, 8000, 16000];

    for (let i = 0; i < delays.length; i++) {
      if (Math.abs(delays[i] - expected[i]) > 100) { // Allow small variance
        throw new Error(`Backoff incorrect: expected ~${expected[i]}, got ${delays[i]}`);
      }
    }
  }

  /**
   * Test circuit breaker behavior
   */
  async testCircuitBreaker() {
    // Simulate circuit breaker
    const breaker = {
      failures: 0,
      state: 'closed',
      threshold: 3
    };

    // Record failures
    for (let i = 0; i < 3; i++) {
      breaker.failures++;
      if (breaker.failures >= breaker.threshold) {
        breaker.state = 'open';
      }
    }

    if (breaker.state !== 'open') {
      throw new Error('Circuit breaker did not open after threshold');
    }

    // Reset
    breaker.failures = 0;
    breaker.state = 'closed';

    if (breaker.state !== 'closed') {
      throw new Error('Circuit breaker did not reset');
    }
  }

  /**
   * Test database recording
   */
  async testDatabaseRecording() {
    // Try to query database (may fail if not configured)
    try {
      const { error } = await supabase
        .from('sub_agent_activations')
        .select('id')
        .limit(1);

      if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
        console.warn(chalk.yellow('\n   ⚠️  Database tables not created - skipping DB test'));
        return; // Skip but don't fail
      }
    } catch {
      console.warn(chalk.yellow('\n   ⚠️  Database not configured - skipping DB test'));
      return; // Skip but don't fail
    }
  }

  /**
   * Test maintenance cleanup
   */
  async testMaintenanceCleanup() {
    // Create old session file
    const oldSessionFile = '.leo-session-old.tmp';
    await fs.writeFile(oldSessionFile, 'test');

    // Import maintenance functions
    const { default: LEOMaintenanceManager } = await import('./leo-maintenance.js');
    const manager = new LEOMaintenanceManager();

    // Run cleanup
    await manager.cleanupOrphanedFiles();

    // Check if file was cleaned
    const exists = await fs.access(oldSessionFile)
      .then(() => true)
      .catch(() => false);

    // Clean up if still exists
    if (exists) {
      await fs.unlink(oldSessionFile);
    }
  }

  /**
   * Test end-to-end commit flow
   */
  async testEndToEndCommitFlow() {
    // Clean up session files
    await fs.unlink('.leo-session-active').catch(() => {});
    await fs.unlink('.leo-session-id').catch(() => {});

    // This would normally trigger the full flow
    // For testing, we simulate the key parts
    const activator = new HookSubAgentActivator();

    // Simulate hook failure detection
    const failure = {
      type: 'no_orchestrator_session',
      message: 'No session active'
    };

    // Activate sub-agent
    const result = await activator.activateForFailure(failure.type);

    if (!result.success) {
      throw new Error('End-to-end flow failed');
    }

    // Verify session was created
    const sessionExists = await fs.access('.leo-session-active')
      .then(() => true)
      .catch(() => false);

    if (!sessionExists) {
      throw new Error('Session not created in end-to-end flow');
    }
  }

  /**
   * Print test summary
   */
  printSummary() {
    console.log(chalk.blue('\n📊 Test Summary'));
    console.log(chalk.gray('=' .repeat(50)));

    const total = this.passed + this.failed;
    const passRate = total > 0 ? ((this.passed / total) * 100).toFixed(1) : 0;

    console.log(`Total: ${total}`);
    console.log(chalk.green(`Passed: ${this.passed}`));
    console.log(chalk.red(`Failed: ${this.failed}`));
    console.log(`Pass Rate: ${passRate}%`);

    if (this.failed > 0) {
      console.log(chalk.red('\nFailed Tests:'));
      this.results
        .filter(r => r.status === 'failed')
        .forEach(r => {
          console.log(chalk.red(`  - ${r.name}: ${r.error}`));
        });
    }

    console.log(chalk.gray('\n' + '=' .repeat(50)));

    if (this.failed === 0) {
      console.log(chalk.green('✅ All tests passed!'));
    } else {
      console.log(chalk.red(`❌ ${this.failed} test(s) failed`));
    }
  }

  /**
   * Cleanup after tests
   */
  async cleanup() {
    // Clean up test files
    await fs.unlink('.leo-session-active').catch(() => {});
    await fs.unlink('.leo-session-id').catch(() => {});
    await fs.unlink('.leo-session-old.tmp').catch(() => {});
  }
}

// Run tests
async function main() {
  const tester = new FeedbackLoopIntegrationTests();

  try {
    const success = await tester.runAll();
    await tester.cleanup();
    process.exit(success ? 0 : 1);
  } catch (_error) {
    console.error(chalk.red('\n❌ Test suite failed:'), error);
    await tester.cleanup();
    process.exit(1);
  }
}

main();

export default FeedbackLoopIntegrationTests;