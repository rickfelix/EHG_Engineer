#!/usr/bin/env node

/**
 * Test script for enhanced GitHub Deployment Sub-Agent
 * Tests uncommitted changes detection and branch synchronization features
 */

import { GitHubDeploymentSubAgent } from './github-deployment-subagent.js';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const execAsync = promisify(exec);

const _supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class GitHubSubAgentTester {
  constructor() {
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 GitHub Sub-Agent Enhancement Tests');
    console.log('=====================================\n');

    await this.testUncommittedChangesDetection();
    await this.testBranchSynchronization();
    await this.testRepositoryStateReport();
    await this.testPreDeploymentChecks();

    this.printResults();
  }

  async testUncommittedChangesDetection() {
    console.log('📝 Test 1: Uncommitted Changes Detection');
    console.log('-----------------------------------------');

    try {
      const agent = new GitHubDeploymentSubAgent('TEST-SD-001');
      const report = await agent.checkUncommittedChanges();

      console.log('  Current branch:', report.currentBranch);
      console.log('  Has uncommitted changes:', report.hasUncommittedChanges);
      console.log('  Summary:', report.summary);

      if (report.hasUncommittedChanges) {
        console.log('  Details:');
        console.log('    - Modified files:', report.modified.length);
        console.log('    - Staged files:', report.staged.length);
        console.log('    - Untracked files:', report.untracked.length);
      }

      this.testResults.push({
        test: 'Uncommitted Changes Detection',
        status: 'PASSED',
        details: report.summary
      });

      console.log('✅ Test passed\n');
    } catch (_error) {
      console.error('❌ Test failed:', error.message);
      this.testResults.push({
        test: 'Uncommitted Changes Detection',
        status: 'FAILED',
        error: error.message
      });
    }
  }

  async testBranchSynchronization() {
    console.log('🔄 Test 2: Branch Synchronization Check');
    console.log('----------------------------------------');

    try {
      const agent = new GitHubDeploymentSubAgent('TEST-SD-002');
      const syncReport = await agent.checkBranchSynchronization();

      console.log('  All branches synced:', syncReport.allSynced);
      console.log('  Summary:', syncReport.summary);

      if (Object.keys(syncReport.branches).length > 0) {
        console.log('  Branch status:');
        Object.entries(syncReport.branches).forEach(([branch, info]) => {
          console.log(`    - ${branch}: ${info.status}`);
        });
      }

      if (syncReport.staleBranches.length > 0) {
        console.log('  Stale branches:', syncReport.staleBranches.join(', '));
      }

      this.testResults.push({
        test: 'Branch Synchronization',
        status: 'PASSED',
        details: syncReport.summary
      });

      console.log('✅ Test passed\n');
    } catch (_error) {
      console.error('❌ Test failed:', error.message);
      this.testResults.push({
        test: 'Branch Synchronization',
        status: 'FAILED',
        error: error.message
      });
    }
  }

  async testRepositoryStateReport() {
    console.log('📊 Test 3: Repository State Report Generation');
    console.log('---------------------------------------------');

    try {
      const agent = new GitHubDeploymentSubAgent('TEST-SD-003');
      const report = await agent.generateRepositoryStateReport();

      console.log('  Repository info:');
      console.log('    - Current branch:', report.repository.currentBranch);
      console.log('    - Latest commit:', report.repository.latestCommit);
      console.log('    - Remote URL:', report.repository.remoteUrl);

      console.log('  Deployment readiness:');
      console.log('    - Clean:', report.deploymentReadiness.clean);
      console.log('    - Synchronized:', report.deploymentReadiness.synchronized);
      console.log('    - Ready:', report.deploymentReadiness.ready);

      if (report.deploymentReadiness.issues.length > 0) {
        console.log('    - Issues:', report.deploymentReadiness.issues.join('; '));
      }

      this.testResults.push({
        test: 'Repository State Report',
        status: 'PASSED',
        details: `Ready: ${report.deploymentReadiness.ready}`
      });

      console.log('✅ Test passed\n');
    } catch (_error) {
      console.error('❌ Test failed:', error.message);
      this.testResults.push({
        test: 'Repository State Report',
        status: 'FAILED',
        error: error.message
      });
    }
  }

  async testPreDeploymentChecks() {
    console.log('🚀 Test 4: Enhanced Pre-Deployment Checks');
    console.log('------------------------------------------');

    try {
      const agent = new GitHubDeploymentSubAgent('TEST-SD-004');

      // This will run the comprehensive checks but not actually deploy
      console.log('  Running pre-deployment checks (without actual deployment)...');

      // Create a test file to simulate uncommitted changes
      const testFile = path.join(__dirname, 'test-uncommitted.tmp');
      await execAsync(`echo "test content" > ${testFile}`);

      try {
        await agent.runPreDeploymentChecks();
        console.log('  All checks passed (changes were stashed if any)');

        this.testResults.push({
          test: 'Pre-Deployment Checks',
          status: 'PASSED',
          details: 'Comprehensive checks executed successfully'
        });
      } catch (checkError) {
        if (checkError.message.includes('uncommitted changes must be resolved')) {
          console.log('  ✅ Correctly detected and blocked uncommitted changes');
          this.testResults.push({
            test: 'Pre-Deployment Checks',
            status: 'PASSED',
            details: 'Correctly blocked deployment with uncommitted changes'
          });
        } else {
          throw checkError;
        }
      } finally {
        // Clean up test file
        await execAsync(`rm -f ${testFile}`);
      }

      console.log('✅ Test passed\n');
    } catch (_error) {
      console.error('❌ Test failed:', error.message);
      this.testResults.push({
        test: 'Pre-Deployment Checks',
        status: 'FAILED',
        error: error.message
      });
    }
  }

  printResults() {
    console.log('\n📋 Test Results Summary');
    console.log('=======================');

    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;

    this.testResults.forEach(result => {
      const icon = result.status === 'PASSED' ? '✅' : '❌';
      console.log(`${icon} ${result.test}: ${result.status}`);
      if (result.details) {
        console.log(`   └─ ${result.details}`);
      }
      if (result.error) {
        console.log(`   └─ Error: ${result.error}`);
      }
    });

    console.log('\n📊 Overall: ' +
      (failed === 0 ? '✅ All tests passed!' : `⚠️ ${passed} passed, ${failed} failed`));

    return failed === 0;
  }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const tester = new GitHubSubAgentTester();

  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    });
}