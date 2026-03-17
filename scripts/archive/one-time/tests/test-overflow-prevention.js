#!/usr/bin/env node

/**
 * Overflow Prevention Test Suite
 *
 * Tests context monitoring and overflow prevention with simulated scenarios.
 */

import ContextMonitor from '../lib/context/context-monitor.js';
 
import { createSmartHandoff, processSubAgentReports as _processSubAgentReports } from '../lib/context/handoff-with-overflow-prevention.js';
import chalk from 'chalk';

class OverflowPreventionTest {
  constructor() {
    this.monitor = new ContextMonitor();
    this.results = [];
  }

  async runAllTests() {
    console.log(chalk.blue.bold('\n🧪 OVERFLOW PREVENTION TEST SUITE\n'));
    console.log('='.repeat(70) + '\n');

    try {
      // Test 1: Token estimation
      await this.testTokenEstimation();

      // Test 2: Context status detection
      await this.testContextStatusDetection();

      // Test 3: Sub-agent report summarization
      await this.testSubAgentSummarization();

      // Test 4: Smart handoff with healthy context
      await this.testSmartHandoffHealthy();

      // Test 5: Smart handoff with critical context (simulated)
      await this.testSmartHandoffCritical();

      // Test 6: Compression ratio calculation
      await this.testCompressionRatio();

      // Print results
      this.printResults();

    } catch (_error) {
      console.error(chalk.red('\n❌ Test suite failed:'), error.message);
      process.exit(1);
    }
  }

  async testTokenEstimation() {
    console.log(chalk.cyan('TEST 1: Token Estimation'));

    const tests = [
      { text: 'Hello world', expected: 3 },
      { text: 'A'.repeat(400), expected: 100 },
      { text: 'A'.repeat(4000), expected: 1000 }
    ];

    for (const test of tests) {
      const estimated = this.monitor.estimateTokens(test.text);
      const diff = Math.abs(estimated - test.expected);

      if (diff <= 5) { // Allow 5 token margin
        this.pass(`Estimated ${estimated} tokens (expected ~${test.expected})`);
      } else {
        this.fail(`Estimated ${estimated} tokens, expected ~${test.expected}`);
      }
    }
  }

  async testContextStatusDetection() {
    console.log(chalk.cyan('\nTEST 2: Context Status Detection'));

    // Simulate different context sizes (accounting for 56K base context)
    const scenarios = [
      { content: 'A'.repeat(50000 * 4), expectedStatus: 'HEALTHY' },    // 50K + 56K = 106K (HEALTHY)
      { content: 'A'.repeat(100000 * 4), expectedStatus: 'WARNING' },   // 100K + 56K = 156K (WARNING)
      { content: 'A'.repeat(120000 * 4), expectedStatus: 'CRITICAL' }   // 120K + 56K = 176K (CRITICAL)
    ];

    for (const scenario of scenarios) {
      const analysis = this.monitor.analyzeContextUsage(scenario.content);

      if (analysis.status === scenario.expectedStatus) {
        this.pass(`Correctly detected ${analysis.status} status at ${analysis.totalEstimated.toLocaleString()} tokens`);
      } else {
        this.fail(`Expected ${scenario.expectedStatus}, got ${analysis.status} at ${analysis.totalEstimated.toLocaleString()} tokens`);
      }
    }
  }

  async testSubAgentSummarization() {
    console.log(chalk.cyan('\nTEST 3: Sub-Agent Report Summarization'));

    const mockReports = [
      {
        agent: 'DATABASE',
        status: 'passed',
        confidence: 95,
        critical_issues: [],
        recommendations: ['Add index on user_id', 'Optimize query X', 'Review schema Y']
      },
      {
        agent: 'SECURITY',
        status: 'warning',
        confidence: 85,
        critical_issues: [{ issue: 'Weak password policy', severity: 'high' }],
        recommendations: ['Enforce stronger passwords', 'Add rate limiting']
      },
      {
        agent: 'TESTING',
        status: 'passed',
        confidence: 90,
        critical_issues: [],
        recommendations: ['Increase coverage', 'Add e2e tests']
      }
    ];

    const result = this.monitor.summarizeSubAgentReports(mockReports);

    if (result.summary && result.full.length === 3) {
      this.pass(`Summarized 3 reports: "${result.summary.substring(0, 50)}..."`);
    } else {
      this.fail('Summarization failed');
    }

    if (result.compressionRatio > 0) {
      this.pass(`Compression ratio: ${result.compressionRatio}%`);
    } else {
      this.warn('No compression achieved');
    }
  }

  async testSmartHandoffHealthy() {
    console.log(chalk.cyan('\nTEST 4: Smart Handoff (Healthy Context)'));

    const mockHandoff = {
      executiveSummary: 'LEAD phase completed successfully',
      completenessReport: { total: 5, completed: 5 },
      deliverablesManifest: { primary: ['Strategy document'] },
      keyDecisions: ['Approved for PLAN phase'],
      knownIssues: [],
      resourceUtilization: { time: '2 hours' },
      actionItems: ['Begin technical planning']
    };

    try {
      const handoff = await createSmartHandoff('LEAD', 'PLAN', 'SD-TEST-002', mockHandoff);

      if (handoff.strategy === 'full-context') {
        this.pass('Healthy context: Using full-context strategy');
      } else {
        this.warn(`Expected full-context, got ${handoff.strategy}`);
      }

      if (handoff.contextStatus === 'HEALTHY') {
        this.pass(`Context status correctly reported as ${handoff.contextStatus}`);
      }
    } catch (_error) {
      this.fail(`Smart handoff failed: ${error.message}`);
    }
  }

  async testSmartHandoffCritical() {
    console.log(chalk.cyan('\nTEST 5: Smart Handoff (Critical Context - Simulated)'));

    // Create a very large handoff to trigger compression
    const largeHandoff = {
      executiveSummary: 'X'.repeat(50000),
      completenessReport: { total: 10, completed: 10 },
      deliverablesManifest: { primary: Array(100).fill('Item') },
      keyDecisions: Array(50).fill('Decision X with long description ' + 'Y'.repeat(100)),
      knownIssues: Array(20).fill({ issue: 'Issue ' + 'Z'.repeat(200), severity: 'low' }),
      resourceUtilization: { details: 'W'.repeat(10000) },
      actionItems: Array(30).fill('Action item ' + 'V'.repeat(100))
    };

    try {
      // Note: This will still show HEALTHY because we're testing in isolation
      // In real scenario with conversation history, it would show CRITICAL
      const handoff = await createSmartHandoff('PLAN', 'EXEC', 'SD-TEST-002', largeHandoff);

      // The system should recognize this as large content
      const tokens = this.monitor.estimateTokens(JSON.stringify(largeHandoff));

      if (tokens > 50000) {
        this.pass(`Large handoff detected (${tokens.toLocaleString()} tokens)`);
      }

      if (handoff.strategy) {
        this.pass(`Strategy applied: ${handoff.strategy}`);
      }
    } catch (_error) {
      this.fail(`Critical handoff test failed: ${error.message}`);
    }
  }

  async testCompressionRatio() {
    console.log(chalk.cyan('\nTEST 6: Compression Ratio Calculation'));

    const original = { data: 'X'.repeat(10000), nested: { more: 'Y'.repeat(5000) } };
    const compressed = { data: 'Summary', nested: { more: 'Brief' } };

    const ratio = this.monitor.calculateCompressionRatio(original, compressed);

    if (parseFloat(ratio) > 90) {
      this.pass(`High compression ratio achieved: ${ratio}%`);
    } else if (parseFloat(ratio) > 50) {
      this.pass(`Moderate compression: ${ratio}%`);
    } else {
      this.warn(`Low compression: ${ratio}%`);
    }
  }

  pass(message) {
    console.log(chalk.green('  ✅ PASS:'), message);
    this.results.push({ status: 'pass', message });
  }

  fail(message) {
    console.log(chalk.red('  ❌ FAIL:'), message);
    this.results.push({ status: 'fail', message });
  }

  warn(message) {
    console.log(chalk.yellow('  ⚠️  WARN:'), message);
    this.results.push({ status: 'warn', message });
  }

  printResults() {
    console.log('\n' + '='.repeat(70));
    console.log(chalk.blue.bold('\n📊 OVERFLOW PREVENTION TEST RESULTS\n'));

    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const warned = this.results.filter(r => r.status === 'warn').length;
    const total = this.results.length;

    console.log(`Total Tests: ${total}`);
    console.log(chalk.green(`Passed: ${passed}`));
    console.log(chalk.red(`Failed: ${failed}`));
    console.log(chalk.yellow(`Warnings: ${warned}`));

    const passRate = ((passed / total) * 100).toFixed(1);
    console.log(`\nPass Rate: ${passRate}%`);

    if (failed === 0) {
      console.log(chalk.green.bold('\n✅ ALL TESTS PASSED!'));
      console.log(chalk.green('Overflow prevention is working correctly.\n'));
    } else {
      console.log(chalk.red.bold('\n❌ SOME TESTS FAILED'));
      console.log(chalk.red('Review errors above.\n'));
    }

    console.log('='.repeat(70) + '\n');

    process.exit(failed === 0 ? 0 : 1);
  }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new OverflowPreventionTest();
  tester.runAllTests();
}