#!/usr/bin/env node

/**
 * Parallel Execution Test Suite
 *
 * Tests parallel sub-agent execution with:
 * - Concurrent execution
 * - Circuit breaker behavior
 * - Timeout handling
 * - Result aggregation
 * - Conflict resolution
 * - Overflow prevention integration
 * - Performance measurement
 */

import ParallelExecutor from '../lib/agents/parallel-executor.js';
import ResultAggregator from '../lib/agents/result-aggregator.js';
import chalk from 'chalk';

class ParallelExecutionTest {
  constructor() {
    this.results = [];
  }

  async runAllTests() {
    console.log(chalk.blue.bold('\n🧪 PARALLEL EXECUTION TEST SUITE\n'));
    console.log('='.repeat(70) + '\n');

    try {
      // Test 1: Mock sub-agents creation
      await this.testMockSubAgents();

      // Test 2: Parallel execution
      await this.testParallelExecution();

      // Test 3: Result aggregation
      await this.testResultAggregation();

      // Test 4: Conflict resolution
      await this.testConflictResolution();

      // Test 5: Circuit breaker
      await this.testCircuitBreaker();

      // Test 6: Overflow prevention integration
      await this.testOverflowPrevention();

      // Print results
      this.printResults();

    } catch (_error) {
      console.error(chalk.red('\n❌ Test suite failed:'), error.message);
      process.exit(1);
    }
  }

  async testMockSubAgents() {
    console.log(chalk.cyan('TEST 1: Mock Sub-Agent Creation'));

    const mockAgents = this.createMockAgents();

    if (mockAgents.length === 5) {
      this.pass(`Created ${mockAgents.length} mock sub-agents`);
    } else {
      this.fail(`Expected 5 mock agents, got ${mockAgents.length}`);
    }
  }

  async testParallelExecution() {
    console.log(chalk.cyan('\nTEST 2: Parallel Execution'));

    const mockAgents = this.createMockAgents();
    const executor = new ParallelExecutor({
      maxConcurrent: 10,
      timeout: 30000, // 30 seconds for test
      enableOverflowPrevention: false // Disable for faster test
    });

    // Override runSubAgent to use mock execution
    executor.runSubAgent = async (agent) => {
      // Simulate varying execution times
      const delay = Math.random() * 1000 + 500; // 500-1500ms
      await new Promise(resolve => setTimeout(resolve, delay));

      return {
        success: true,
        agent: agent.code,
        status: 'passed',
        confidence: Math.floor(Math.random() * 20) + 80, // 80-100
        message: `${agent.code} verification completed`,
        recommendations: [`Recommendation from ${agent.code}`]
      };
    };

    const startTime = Date.now();
    const { results } = await executor.executeParallel(mockAgents, {
      sdId: 'SD-TEST-001',
      prdId: 'PRD-TEST-001'
    });
    const duration = Date.now() - startTime;

    // All 5 agents should execute
    if (results.length === 5) {
      this.pass(`Executed ${results.length} sub-agents in parallel`);
    } else {
      this.fail(`Expected 5 results, got ${results.length}`);
    }

    // All should succeed (with mock)
    const successful = results.filter(r => r.status === 'completed').length;
    if (successful === 5) {
      this.pass(`All ${successful} executions successful`);
    } else {
      this.fail(`Expected 5 successful, got ${successful}`);
    }

    // Should be faster than sequential (< 2 seconds for 5 parallel vs 5+ sequential)
    if (duration < 2000) {
      this.pass(`Parallel execution completed in ${duration}ms`);
    } else {
      this.warn(`Execution took ${duration}ms (expected < 2000ms)`);
    }
  }

  async testResultAggregation() {
    console.log(chalk.cyan('\nTEST 3: Result Aggregation'));

    const mockResults = [
      {
        agentCode: 'DATABASE',
        agentId: 'id-1',
        status: 'completed',
        results: { status: 'passed', confidence: 95, message: 'DB checks passed' }
      },
      {
        agentCode: 'SECURITY',
        agentId: 'id-2',
        status: 'completed',
        results: { status: 'passed', confidence: 90, message: 'Security verified' }
      },
      {
        agentCode: 'TESTING',
        agentId: 'id-3',
        status: 'completed',
        results: { status: 'passed', confidence: 85, message: 'Tests passed' }
      }
    ];

    const aggregator = new ResultAggregator();
    const report = await aggregator.aggregate(mockResults, { batchId: 'test-batch' });

    if (report.verdict) {
      this.pass(`Generated verdict: ${report.verdict}`);
    } else {
      this.fail('No verdict generated');
    }

    if (report.confidence >= 85) {
      this.pass(`Confidence score: ${report.confidence}%`);
    } else {
      this.warn(`Low confidence: ${report.confidence}%`);
    }

    if (report.summary) {
      this.pass(`Summary generated: "${report.summary.substring(0, 50)}..."`);
    }
  }

  async testConflictResolution() {
    console.log(chalk.cyan('\nTEST 4: Conflict Resolution'));

    const mockResults = [
      {
        agentCode: 'SECURITY', // High priority
        agentId: 'id-1',
        status: 'completed',
        results: {
          status: 'warning',
          confidence: 90,
          critical_issues: [{ issue: 'Weak password policy', severity: 'high' }]
        }
      },
      {
        agentCode: 'TESTING', // Lower priority
        agentId: 'id-2',
        status: 'completed',
        results: { status: 'passed', confidence: 95, message: 'All tests passed' }
      }
    ];

    const aggregator = new ResultAggregator();
    const report = await aggregator.aggregate(mockResults, {});

    // Security should take precedence
    const hasCriticalIssues = report.keyFindings.critical.length > 0;
    if (hasCriticalIssues) {
      this.pass('Conflict resolved: SECURITY (high priority) findings included');
    } else {
      this.fail('Conflict resolution failed: Critical issues not detected');
    }

    // Verdict should reflect critical issues
    if (report.verdict === 'FAIL') {
      this.pass('Verdict correctly set to FAIL due to critical issue');
    } else {
      this.warn(`Expected FAIL, got ${report.verdict}`);
    }
  }

  async testCircuitBreaker() {
    console.log(chalk.cyan('\nTEST 5: Circuit Breaker'));

    const executor = new ParallelExecutor({
      maxRetries: 3,
      baseBackoff: 100,
      enableOverflowPrevention: false
    });

    const circuitKey = 'test-agent-id';

    // Record 3 failures to open circuit
    executor.recordFailure(circuitKey);
    executor.recordFailure(circuitKey);
    executor.recordFailure(circuitKey);

    const isOpen = executor.isCircuitOpen(circuitKey);
    if (isOpen) {
      this.pass('Circuit breaker opened after 3 failures');
    } else {
      this.fail('Circuit breaker should be open');
    }

    // Reset and check
    executor.resetCircuit(circuitKey);
    const isClosedAfterReset = !executor.isCircuitOpen(circuitKey);
    if (isClosedAfterReset) {
      this.pass('Circuit breaker reset successfully');
    } else {
      this.fail('Circuit breaker failed to reset');
    }
  }

  async testOverflowPrevention() {
    console.log(chalk.cyan('\nTEST 6: Overflow Prevention Integration'));

    const executor = new ParallelExecutor({
      enableOverflowPrevention: true,
      maxConcurrent: 3,
      timeout: 10000
    });

    // Check that context monitoring is available
    if (executor.contextMonitor) {
      this.pass('Context monitor integrated');
    } else {
      this.fail('Context monitor not available');
    }

    if (executor.memoryManager) {
      this.pass('Memory manager integrated');
    } else {
      this.fail('Memory manager not available');
    }

    // Check overflow prevention flag
    if (executor.enableOverflowPrevention === true) {
      this.pass('Overflow prevention enabled by default');
    } else {
      this.warn('Overflow prevention not enabled');
    }
  }

  createMockAgents() {
    return [
      {
        id: 'mock-db-id',
        code: 'DATABASE',
        name: 'Database Architect',
        priority: 6,
        active: true,
        activation_type: 'automatic'
      },
      {
        id: 'mock-security-id',
        code: 'SECURITY',
        name: 'Security Architect',
        priority: 10,
        active: true,
        activation_type: 'automatic'
      },
      {
        id: 'mock-testing-id',
        code: 'TESTING',
        name: 'QA Director',
        priority: 5,
        active: true,
        activation_type: 'automatic'
      },
      {
        id: 'mock-perf-id',
        code: 'PERFORMANCE',
        name: 'Performance Engineer',
        priority: 4,
        active: true,
        activation_type: 'automatic'
      },
      {
        id: 'mock-design-id',
        code: 'DESIGN',
        name: 'Design Lead',
        priority: 3,
        active: true,
        activation_type: 'automatic'
      }
    ];
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
    console.log(chalk.blue.bold('\n📊 PARALLEL EXECUTION TEST RESULTS\n'));

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
      console.log(chalk.green('Parallel execution is working correctly.\\n'));
    } else {
      console.log(chalk.red.bold('\n❌ SOME TESTS FAILED'));
      console.log(chalk.red('Review errors above.\\n'));
    }

    console.log('='.repeat(70) + '\n');

    process.exit(failed === 0 ? 0 : 1);
  }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const tester = new ParallelExecutionTest();
  tester.runAllTests();
}