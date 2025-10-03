#!/usr/bin/env node

/**
 * Memory Implementation Test Suite
 *
 * Tests the Claude Code Memory Manager implementation by simulating
 * a complete LEAD→PLAN→EXEC workflow with state persistence.
 */

import MemoryManager from '../lib/context/memory-manager.js';
import chalk from 'chalk';

class MemoryImplementationTest {
  constructor() {
    this.memory = new MemoryManager();
    this.testResults = [];
    this.errors = [];
  }

  async runAllTests() {
    console.log(chalk.blue.bold('\n🧪 MEMORY IMPLEMENTATION TEST SUITE\n'));
    console.log('Testing Claude Code Memory Manager with simulated LEAD→PLAN→EXEC workflow\n');
    console.log('='.repeat(70) + '\n');

    try {
      // Test 1: Initial State
      await this.testInitialState();

      // Test 2: Start Session (LEAD)
      await this.testStartSession();

      // Test 3: Update Section (LEAD)
      await this.testUpdateSection();

      // Test 4: Complete LEAD Phase
      await this.testCompletePhase('LEAD');

      // Test 5: PLAN Phase Start
      await this.testPlanPhaseStart();

      // Test 6: Complete PLAN Phase
      await this.testCompletePhase('PLAN');

      // Test 7: EXEC Phase Start
      await this.testExecPhaseStart();

      // Test 8: EXEC Progress Update
      await this.testExecProgressUpdate();

      // Test 9: Complete EXEC Phase
      await this.testCompletePhase('EXEC');

      // Test 10: Read Final State
      await this.testReadFinalState();

      // Test 11: File Tree Freshness
      await this.testFileTreeFreshness();

      // Test 12: Reset Session
      await this.testResetSession();

      // Print Results
      this.printResults();

    } catch (error) {
      console.error(chalk.red('\n❌ Test suite failed with error:'), error.message);
      process.exit(1);
    }
  }

  async testInitialState() {
    console.log(chalk.cyan('TEST 1: Read Initial State'));

    try {
      const state = await this.memory.readSessionState();

      if (state.sessionId === null || state.sessionId === 'No active session') {
        this.pass('Initial state is empty (expected)');
      } else {
        this.fail('Initial state should be empty', state);
      }
    } catch (error) {
      this.fail('Failed to read initial state', error.message);
    }
  }

  async testStartSession() {
    console.log(chalk.cyan('\nTEST 2: Start New Session (LEAD Agent)'));

    try {
      const result = await this.memory.startSession('SD-TEST-001', 'LEAD', {
        title: 'Test Memory Implementation',
        prdId: null
      });

      if (result.sessionId && result.sdId === 'SD-TEST-001' && result.agent === 'LEAD') {
        this.pass(`Session started: ${result.sessionId}`);
      } else {
        this.fail('Session start returned invalid data', result);
      }

      // Verify it was written
      const state = await this.memory.readSessionState();
      if (state.activeDirective && state.activeDirective.id === 'SD-TEST-001') {
        this.pass('Session state persisted correctly');
      } else {
        this.fail('Session state not persisted', state);
      }
    } catch (error) {
      this.fail('Failed to start session', error.message);
    }
  }

  async testUpdateSection() {
    console.log(chalk.cyan('\nTEST 3: Update Section (LEAD Strategic Decisions)'));

    try {
      const content = `- **SD ID**: SD-TEST-001
- **Title**: Test Memory Implementation
- **Status**: LEAD Phase Complete
- **Progress**: 100%
- **Strategic Decisions**: Approved for PLAN phase
- **Priority**: HIGH (85)`;

      const success = await this.memory.updateSection('Active Directive', content);

      if (success) {
        this.pass('Section updated successfully');
      } else {
        this.fail('Section update returned false');
      }

      // Verify it was written
      const state = await this.memory.readSessionState();
      if (state.raw.includes('Strategic Decisions')) {
        this.pass('Section content persisted correctly');
      } else {
        this.fail('Section content not found in state');
      }
    } catch (error) {
      this.fail('Failed to update section', error.message);
    }
  }

  async testCompletePhase(phase) {
    console.log(chalk.cyan(`\nTEST: Complete ${phase} Phase`));

    try {
      const summaries = {
        'LEAD': 'Strategic directive approved, handed to PLAN for technical design',
        'PLAN': 'PRD created with 5 requirements, 10 acceptance criteria, ready for EXEC',
        'EXEC': 'Implementation complete, 5/5 tests passing, ready for verification'
      };

      await this.memory.completePhase(phase, summaries[phase]);
      this.pass(`${phase} phase marked as completed`);

      // Verify phase is marked complete
      const state = await this.memory.readSessionState();
      if (state.raw.includes(`${phase}: ✅ Completed`)) {
        this.pass(`${phase} completion status persisted`);
      } else {
        this.fail(`${phase} completion not found in state`);
      }
    } catch (error) {
      this.fail(`Failed to complete ${phase} phase`, error.message);
    }
  }

  async testPlanPhaseStart() {
    console.log(chalk.cyan('\nTEST 5: PLAN Phase Start'));

    try {
      const content = `- **PRD ID**: PRD-SD-TEST-001
- **Agent**: PLAN
- **Phase**: Technical Design
- **Requirements**: 5
- **Acceptance Criteria**: 10
- **Test Plan**: Comprehensive (unit, integration, e2e)`;

      await this.memory.updateSection('Current PRD', content);
      this.pass('PLAN PRD information added to memory');
    } catch (error) {
      this.fail('Failed to update PLAN information', error.message);
    }
  }

  async testExecPhaseStart() {
    console.log(chalk.cyan('\nTEST 7: EXEC Phase Start'));

    try {
      const content = `- File trees: ✅ Fresh (loaded)
- PWD: /mnt/c/_EHG/ehg
- Git branch: feature/SD-TEST-001-memory-test
- Target files: src/components/TestComponent.tsx, src/services/test-service.ts`;

      await this.memory.updateSection('Context Cache', content);
      this.pass('EXEC context cache updated in memory');
    } catch (error) {
      this.fail('Failed to update EXEC context', error.message);
    }
  }

  async testExecProgressUpdate() {
    console.log(chalk.cyan('\nTEST 8: EXEC Progress Update'));

    try {
      const content = `### Implementation Progress
- ✅ Component created: TestComponent.tsx
- ✅ Service implemented: test-service.ts
- ✅ Unit tests: 3/3 passing
- ✅ Integration tests: 2/2 passing
- ⏳ E2E tests: In progress`;

      await this.memory.updateSection('EXEC Progress', content);
      this.pass('EXEC progress tracking added');
    } catch (error) {
      this.fail('Failed to update EXEC progress', error.message);
    }
  }

  async testReadFinalState() {
    console.log(chalk.cyan('\nTEST 10: Read Final State (Verify Full Workflow)'));

    try {
      const state = await this.memory.readSessionState();

      // Check all phases are marked complete
      const phasesComplete = ['LEAD', 'PLAN', 'EXEC'].every(phase =>
        state.raw.includes(`${phase}: ✅ Completed`)
      );

      if (phasesComplete) {
        this.pass('All phases marked as completed');
      } else {
        this.fail('Not all phases marked complete');
      }

      // Check SD ID is present
      if (state.activeDirective.id === 'SD-TEST-001') {
        this.pass('SD ID persisted through entire workflow');
      } else {
        this.fail('SD ID not found or incorrect');
      }

      // Check PRD info is present
      if (state.raw.includes('PRD-SD-TEST-001')) {
        this.pass('PRD information persisted');
      } else {
        this.fail('PRD information not found');
      }

      // Check EXEC context is present
      if (state.raw.includes('/mnt/c/_EHG/ehg')) {
        this.pass('EXEC context persisted');
      } else {
        this.fail('EXEC context not found');
      }
    } catch (error) {
      this.fail('Failed to read final state', error.message);
    }
  }

  async testFileTreeFreshness() {
    console.log(chalk.cyan('\nTEST 11: File Tree Freshness Check'));

    try {
      const freshness = await this.memory.checkFileTreesFreshness();

      if (freshness.includes('Fresh')) {
        this.pass(`File trees are fresh: ${freshness}`);
      } else {
        this.warn(`File trees may need refresh: ${freshness}`);
      }
    } catch (error) {
      this.fail('Failed to check file tree freshness', error.message);
    }
  }

  async testResetSession() {
    console.log(chalk.cyan('\nTEST 12: Reset Session (Cleanup)'));

    try {
      await this.memory.resetSession();
      this.pass('Session reset successfully');

      // Verify reset
      const state = await this.memory.readSessionState();
      if (state.sessionId === null || state.sessionId === 'No active session') {
        this.pass('Session state cleared correctly');
      } else {
        this.fail('Session not properly reset', state);
      }
    } catch (error) {
      this.fail('Failed to reset session', error.message);
    }
  }

  pass(message) {
    console.log(chalk.green('  ✅ PASS:'), message);
    this.testResults.push({ status: 'pass', message });
  }

  fail(message, details = null) {
    console.log(chalk.red('  ❌ FAIL:'), message);
    if (details) {
      console.log(chalk.gray('     Details:'), details);
    }
    this.testResults.push({ status: 'fail', message, details });
    this.errors.push({ message, details });
  }

  warn(message) {
    console.log(chalk.yellow('  ⚠️  WARN:'), message);
    this.testResults.push({ status: 'warn', message });
  }

  printResults() {
    console.log('\n' + '='.repeat(70));
    console.log(chalk.blue.bold('\n📊 TEST RESULTS SUMMARY\n'));

    const passed = this.testResults.filter(r => r.status === 'pass').length;
    const failed = this.testResults.filter(r => r.status === 'fail').length;
    const warned = this.testResults.filter(r => r.status === 'warn').length;
    const total = this.testResults.length;

    console.log(`Total Tests: ${total}`);
    console.log(chalk.green(`Passed: ${passed}`));
    console.log(chalk.red(`Failed: ${failed}`));
    console.log(chalk.yellow(`Warnings: ${warned}`));

    const passRate = ((passed / total) * 100).toFixed(1);
    console.log(`\nPass Rate: ${passRate}%`);

    if (failed === 0) {
      console.log(chalk.green.bold('\n✅ ALL TESTS PASSED!'));
      console.log(chalk.green('Memory implementation is working correctly.\n'));
    } else {
      console.log(chalk.red.bold('\n❌ SOME TESTS FAILED'));
      console.log(chalk.red('Review errors above for details.\n'));
    }

    console.log('='.repeat(70) + '\n');

    // Exit with appropriate code
    process.exit(failed === 0 ? 0 : 1);
  }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new MemoryImplementationTest();
  tester.runAllTests();
}