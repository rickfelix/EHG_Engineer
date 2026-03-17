#!/usr/bin/env node

/**
 * LEO Protocol CI/CD Integration Test Suite
 * End-to-end testing of GitHub webhook processing and automated resolution
 */

import { createClient } from '@supabase/supabase-js';
import LEOCICDValidator from './leo-ci-cd-validator.js';
import EnhancedDevOpsPlatformArchitect from './devops-platform-architect-enhanced.js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class LEOCICDIntegrationTester {
  constructor() {
    this.validator = new LEOCICDValidator();
    this.devopsAgent = new EnhancedDevOpsPlatformArchitect();
    this.testResults = [];
  }

  async runAllTests() {
    console.log(chalk.blue.bold('\n🧪 LEO Protocol CI/CD Integration Test Suite'));
    console.log(chalk.cyan('Testing end-to-end GitHub webhook processing and automation...'));
    console.log(chalk.gray('═'.repeat(70)));

    const tests = [
      this.testDatabaseSchema,
      this.testWebhookEventProcessing,
      this.testCiCdValidation,
      this.testDevOpsAgentResolution,
      this.testPhaseGateValidation,
      this.testFailureResolution,
      this.testDashboardDataRetrieval
    ];

    for (const test of tests) {
      try {
        await test.call(this);
      } catch (_error) {
        this.addTestResult(test.name, false, error.message);
        console.error(chalk.red(`❌ ${test.name} failed: ${error.message}`));
      }
    }

    this.printTestSummary();
    return this.testResults.every(r => r.passed);
  }

  addTestResult(testName, passed, message = '') {
    this.testResults.push({ testName, passed, message });
    const icon = passed ? '✅' : '❌';
    const color = passed ? chalk.green : chalk.red;
    console.log(color(`${icon} ${testName}: ${message}`));
  }

  async testDatabaseSchema() {
    console.log(chalk.cyan('\n📊 Testing database schema creation...'));

    // Test tables exist
    const tables = [
      'ci_cd_pipeline_status',
      'github_webhook_events',
      'ci_cd_failure_resolutions',
      'leo_phase_ci_cd_gates',
      'ci_cd_monitoring_config'
    ];

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        throw new Error(`Table ${table} not accessible: ${error.message}`);
      }
    }

    // Test RPC function
    const { error: rpcError } = await supabase
      .rpc('get_sd_ci_cd_status', { sd_id_param: 'SD-TEST' });

    if (rpcError) {
      throw new Error(`RPC function not working: ${rpcError.message}`);
    }

    this.addTestResult('Database Schema', true, 'All tables and functions accessible');
  }

  async testWebhookEventProcessing() {
    console.log(chalk.cyan('\n🔗 Testing webhook event processing...'));

    // Create test webhook event
    const testEvent = {
      event_type: 'workflow_run',
      delivery_id: `test-${Date.now()}`,
      event_payload: {
        action: 'completed',
        workflow_run: {
          id: 123456,
          name: 'CI',
          status: 'completed',
          conclusion: 'failure',
          head_sha: 'abc123',
          head_branch: 'feature/SD-TEST',
          html_url: 'https://github.com/test/repo/actions/runs/123456',
          head_commit: {
            message: 'feat(SD-TEST): test implementation'
          }
        },
        repository: {
          full_name: 'test/repo'
        }
      },
      signature_valid: true,
      processed_successfully: false
    };

    const { error } = await supabase
      .from('github_webhook_events')
      .insert(testEvent);

    if (error) {
      throw new Error(`Failed to insert webhook event: ${error.message}`);
    }

    this.addTestResult('Webhook Event Processing', true, 'Test webhook event stored successfully');
  }

  async testCiCdValidation() {
    console.log(chalk.cyan('\n🔍 Testing CI/CD validation logic...'));

    // Create test SD if it doesn't exist
    const { error: sdError } = await supabase
      .from('strategic_directives_v2')
      .upsert({
        id: 'SD-TEST',
        title: 'Test Strategic Directive',
        status: 'active',
        priority: 'medium',
        ci_cd_status: 'failure',
        pipeline_health_score: 50
      });

    if (sdError) {
      throw new Error(`Failed to create test SD: ${sdError.message}`);
    }

    // Test validation for different phases
    const phases = ['LEAD', 'PLAN', 'EXEC', 'VERIFICATION', 'APPROVAL'];
    let passedPhases = 0;

    for (const phase of phases) {
      try {
        const result = await this.validator.validateSDCiCdStatus('SD-TEST', phase);
        if (result && typeof result.valid === 'boolean') {
          passedPhases++;
        }
      } catch (_error) {
        console.warn(chalk.yellow(`Phase ${phase} validation warning: ${error.message}`));
      }
    }

    if (passedPhases !== phases.length) {
      throw new Error(`Only ${passedPhases}/${phases.length} phases validated successfully`);
    }

    this.addTestResult('CI/CD Validation', true, `All ${phases.length} phases validated`);
  }

  async testDevOpsAgentResolution() {
    console.log(chalk.cyan('\n🤖 Testing DevOps Platform Architect resolution...'));

    // Create test pipeline failure
    const testPipeline = {
      sd_id: 'SD-TEST',
      repository_name: 'test/repo',
      workflow_name: 'Test Workflow',
      workflow_id: 123,
      run_id: 456,
      run_number: 1,
      commit_sha: 'abc123',
      commit_message: 'feat(SD-TEST): test implementation',
      branch_name: 'feature/SD-TEST',
      status: 'completed',
      conclusion: 'failure',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      workflow_url: 'https://github.com/test/repo/actions/runs/456',
      failure_reason: 'Test failure for automated resolution'
    };

    const { error: pipelineError } = await supabase
      .from('ci_cd_pipeline_status')
      .insert(testPipeline);

    if (pipelineError) {
      throw new Error(`Failed to insert test pipeline: ${pipelineError.message}`);
    }

    // Test DevOps agent execution
    const result = await this.devopsAgent.execute({
      sd_id: 'SD-TEST',
      trigger_type: 'test'
    });

    if (!result || typeof result.success !== 'boolean') {
      throw new Error('DevOps agent returned invalid result');
    }

    this.addTestResult('DevOps Agent Resolution', true, `Agent execution: ${result.success ? 'Success' : 'Failed'}`);
  }

  async testPhaseGateValidation() {
    console.log(chalk.cyan('\n🚪 Testing LEO phase gate validation...'));

    // Test phase gate creation and validation
    const testGate = {
      sd_id: 'SD-TEST',
      phase_name: 'EXEC',
      gate_type: 'blocking',
      validation_status: 'failed',
      validation_score: 60,
      last_validation_at: new Date().toISOString(),
      validation_details: {
        errors: ['Test CI/CD failure'],
        warnings: ['Test warning'],
        ci_cd_status: 'failure',
        health_score: 60,
        active_failures: 1
      }
    };

    const { error } = await supabase
      .from('leo_phase_ci_cd_gates')
      .upsert(testGate);

    if (error) {
      throw new Error(`Failed to create phase gate: ${error.message}`);
    }

    // Test validation update
    const validationResult = {
      valid: false,
      score: 60,
      errors: ['Test error'],
      warnings: ['Test warning'],
      blocking: true,
      status: 'failure',
      health_score: 60,
      active_failures: 1
    };

    const updated = await this.validator.updatePhaseGateStatus('SD-TEST', 'EXEC', validationResult);

    if (!updated) {
      throw new Error('Failed to update phase gate status');
    }

    this.addTestResult('Phase Gate Validation', true, 'Gate creation and updates working');
  }

  async testFailureResolution() {
    console.log(chalk.cyan('\n🛠️ Testing failure resolution tracking...'));

    // Create test failure resolution
    const testResolution = {
      pipeline_status_id: '00000000-0000-0000-0000-000000000000', // UUID placeholder
      sd_id: 'SD-TEST',
      failure_category: 'test_failure',
      auto_resolution_attempted: true,
      auto_resolution_successful: false,
      resolution_method: 'automated_analysis',
      manual_intervention_required: true,
      resolution_notes: 'Test resolution notes'
    };

    const { error } = await supabase
      .from('ci_cd_failure_resolutions')
      .insert(testResolution);

    if (error) {
      throw new Error(`Failed to create failure resolution: ${error.message}`);
    }

    // Test categorization logic
    const categories = [
      { workflow: 'test-workflow', expected: 'test_failure' },
      { workflow: 'lint-check', expected: 'lint_error' },
      { workflow: 'build-app', expected: 'build_failure' },
      { workflow: 'deploy-prod', expected: 'deployment_failure' }
    ];

    for (const { workflow, expected } of categories) {
      const actual = this.devopsAgent.categorizeFailure(workflow, 'failure');
      if (actual !== expected) {
        throw new Error(`Categorization failed: ${workflow} -> ${actual}, expected ${expected}`);
      }
    }

    this.addTestResult('Failure Resolution', true, 'Resolution tracking and categorization working');
  }

  async testDashboardDataRetrieval() {
    console.log(chalk.cyan('\n📈 Testing dashboard data retrieval...'));

    // Test data queries used by dashboard
    const queries = [
      { table: 'ci_cd_pipeline_status', filter: { sd_id: 'SD-TEST' } },
      { table: 'leo_phase_ci_cd_gates', filter: { sd_id: 'SD-TEST' } },
      { table: 'ci_cd_failure_resolutions', filter: { sd_id: 'SD-TEST' } },
      { table: 'github_webhook_events', filter: {} }
    ];

    let successfulQueries = 0;

    for (const { table, filter } of queries) {
      try {
        let query = supabase.from(table).select('*');

        if (filter.sd_id) {
          query = query.eq('sd_id', filter.sd_id);
        }

        const { data: _data, error } = await query.limit(5);

        if (error) {
          console.warn(chalk.yellow(`Query warning for ${table}: ${error.message}`));
        } else {
          successfulQueries++;
        }
      } catch (err) {
        console.warn(chalk.yellow(`Query failed for ${table}: ${err.message}`));
      }
    }

    if (successfulQueries === 0) {
      throw new Error('All dashboard queries failed');
    }

    this.addTestResult('Dashboard Data Retrieval', true, `${successfulQueries}/${queries.length} queries successful`);
  }

  async cleanupTestData() {
    console.log(chalk.cyan('\n🧹 Cleaning up test data...'));

    const cleanup = [
      supabase.from('ci_cd_failure_resolutions').delete().eq('sd_id', 'SD-TEST'),
      supabase.from('leo_phase_ci_cd_gates').delete().eq('sd_id', 'SD-TEST'),
      supabase.from('ci_cd_pipeline_status').delete().eq('sd_id', 'SD-TEST'),
      supabase.from('github_webhook_events').delete().like('delivery_id', 'test-%'),
      supabase.from('strategic_directives_v2').delete().eq('id', 'SD-TEST')
    ];

    let cleanedUp = 0;
    for (const cleanupQuery of cleanup) {
      try {
        const { error } = await cleanupQuery;
        if (!error) cleanedUp++;
      } catch (_error) {
        console.warn(chalk.yellow(`Cleanup warning: ${error.message}`));
      }
    }

    console.log(chalk.gray(`Cleaned up ${cleanedUp}/${cleanup.length} test records`));
  }

  printTestSummary() {
    console.log(chalk.blue.bold('\n📋 Test Summary'));
    console.log(chalk.gray('═'.repeat(50)));

    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    const percentage = Math.round((passed / total) * 100);

    console.log(chalk.cyan(`Tests Passed: ${passed}/${total} (${percentage}%)`));

    if (passed === total) {
      console.log(chalk.green.bold('🎉 All tests passed! CI/CD integration is working correctly.'));
    } else {
      console.log(chalk.red.bold('❌ Some tests failed. Check the results above.'));

      const failed = this.testResults.filter(r => !r.passed);
      failed.forEach(test => {
        console.log(chalk.red(`   • ${test.testName}: ${test.message}`));
      });
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new LEOCICDIntegrationTester();
  const cleanup = process.argv.includes('--cleanup');

  if (cleanup) {
    tester.cleanupTestData()
      .then(() => {
        console.log(chalk.green('✅ Test data cleanup completed'));
        process.exit(0);
      })
      .catch(error => {
        console.error(chalk.red('❌ Cleanup failed:', error.message));
        process.exit(1);
      });
  } else {
    tester.runAllTests()
      .then(success => {
        console.log('\n' + chalk.gray('─'.repeat(50)));

        if (process.argv.includes('--auto-cleanup')) {
          return tester.cleanupTestData().then(() => success);
        }

        return success;
      })
      .then(success => {
        process.exit(success ? 0 : 1);
      })
      .catch(error => {
        console.error(chalk.red('\n❌ Test suite failed:', error.message));
        process.exit(1);
      });
  }
}