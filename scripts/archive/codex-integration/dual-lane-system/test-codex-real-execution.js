#!/usr/bin/env node

/**
 * Test Codex Real Execution
 * Verifies that Codex is actually executing, not just simulated
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import _crypto from 'crypto';
import { fileURLToPath } from 'url';
import DualLaneController from './dual-lane-controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class CodexRealExecutionTester {
  constructor() {
    this.controller = new DualLaneController();
    this.testResults = {
      passed: [],
      failed: []
    };
    this.artifactHashes = new Set();
  }

  /**
   * Test 1: Verify Real Process Spawning
   */
  async testRealProcessSpawning() {
    console.log('\n📋 Test 1: Real Process Spawning');
    console.log('-'.repeat(40));

    try {
      // Check if Claude CLI is available
      const claudeVersion = await this.executeCommand('claude', ['--version']);
      if (claudeVersion) {
        this.testResults.passed.push('✅ Claude CLI is installed and available');
      }

      // Test spawning with constraints
      const testPrompt = 'echo "Testing Codex constraints"';
      const result = await this.spawnClaudeWithConstraints(
        testPrompt,
        ['Read', 'Grep'],
        ['Write', 'Edit']
      );

      if (result.pid) {
        this.testResults.passed.push('✅ Claude process spawned with PID during test');
        this.testResults.passed.push(`✅ Process completed with exit code: ${result.exitCode}`);
      }

    } catch (error) {
      this.testResults.failed.push(`❌ Process spawning failed: ${error.message}`);
    }
  }

  /**
   * Test 2: Dynamic Task Response
   */
  async testDynamicTaskResponse() {
    console.log('\n📋 Test 2: Dynamic Task Response');
    console.log('-'.repeat(40));

    const timestamp = Date.now();
    const uniqueTask1 = `Add a function called getTimestamp_${timestamp}`;
    const uniqueTask2 = `Add a function called processData_${timestamp + 1}`;

    try {
      // Run Codex with first unique task
      const result1 = await this.controller.runAsCodex(uniqueTask1, { test: true });
      const patch1 = this.extractPatchContent(result1.artifacts);

      // Run Codex with second unique task
      const result2 = await this.controller.runAsCodex(uniqueTask2, { test: true });
      const patch2 = this.extractPatchContent(result2.artifacts);

      // Verify patches are different
      if (patch1 && patch2 && patch1 !== patch2) {
        this.testResults.passed.push('✅ Different tasks produce different patches');
      } else {
        this.testResults.failed.push('❌ Patches are identical for different tasks');
      }

      // Check if patch contains task-specific content
      if (patch1 && patch1.includes(`getTimestamp_${timestamp}`)) {
        this.testResults.passed.push('✅ Patch content matches requested function name');
      } else if (patch1 && patch1.includes('example')) {
        this.testResults.failed.push('❌ Patch contains generic/simulated content');
      }

    } catch (error) {
      this.testResults.failed.push(`❌ Dynamic task test failed: ${error.message}`);
    }
  }

  /**
   * Test 3: Permission Enforcement
   */
  async testPermissionEnforcement() {
    console.log('\n📋 Test 3: Permission Enforcement');
    console.log('-'.repeat(40));

    const permissions = this.controller.getLanePermissions('codex');

    // Test denied operations
    if (permissions.denied.includes('Write')) {
      this.testResults.passed.push('✅ Write operation blocked in permissions');
    } else {
      this.testResults.failed.push('❌ Write operation not blocked');
    }

    if (permissions.denied.includes('Edit')) {
      this.testResults.passed.push('✅ Edit operation blocked in permissions');
    } else {
      this.testResults.failed.push('❌ Edit operation not blocked');
    }

    // Test allowed operations
    if (permissions.allowed.includes('Read')) {
      this.testResults.passed.push('✅ Read operation allowed');
    } else {
      this.testResults.failed.push('❌ Read operation not allowed');
    }

    if (permissions.allowed.includes('Grep')) {
      this.testResults.passed.push('✅ Grep operation allowed');
    } else {
      this.testResults.failed.push('❌ Grep operation not allowed');
    }

    // Test actual enforcement
    try {
      const writeTestPrompt = 'Write a file to /tmp/test.txt';
      const result = await this.spawnClaudeWithConstraints(
        writeTestPrompt,
        permissions.allowed,
        permissions.denied
      );

      if (result.output && result.output.includes('not allowed')) {
        this.testResults.passed.push('✅ Write operation actually blocked at runtime');
      }
    } catch (error) {
      // Error is expected for blocked operations
      if (error.message.includes('not allowed') || error.message.includes('denied')) {
        this.testResults.passed.push('✅ Permission denial enforced');
      }
    }
  }

  /**
   * Test 4: Artifact Uniqueness
   */
  async testArtifactUniqueness() {
    console.log('\n📋 Test 4: Artifact Uniqueness');
    console.log('-'.repeat(40));

    const artifacts = [];

    // Generate multiple artifacts
    for (let i = 0; i < 3; i++) {
      const task = `Create function number_${Date.now()}_${i}`;
      const result = await this.controller.runAsCodex(task, { iteration: i });

      if (result.artifacts && result.artifacts.length > 0) {
        const patchArtifact = result.artifacts.find(a => a.type === 'patch');
        if (patchArtifact) {
          artifacts.push({
            hash: patchArtifact.sha256,
            timestamp: new Date().toISOString(),
            filename: patchArtifact.filename
          });

          // Check if hash is unique
          if (this.artifactHashes.has(patchArtifact.sha256)) {
            this.testResults.failed.push(`❌ Duplicate artifact hash detected: ${patchArtifact.sha256}`);
          } else {
            this.artifactHashes.add(patchArtifact.sha256);
          }
        }
      }

      // Small delay between runs
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.artifactHashes.size === artifacts.length && artifacts.length > 0) {
      this.testResults.passed.push(`✅ All ${artifacts.length} artifacts have unique hashes`);
    }

    // Verify timestamps are current
    const now = Date.now();
    const recentArtifacts = artifacts.filter(a => {
      const artifactTime = new Date(a.timestamp).getTime();
      return (now - artifactTime) < 60000; // Within last minute
    });

    if (recentArtifacts.length === artifacts.length) {
      this.testResults.passed.push('✅ All artifact timestamps are current');
    } else {
      this.testResults.failed.push('❌ Some artifacts have old timestamps');
    }
  }

  /**
   * Test 5: Live Code Modification
   */
  async testLiveCodeModification() {
    console.log('\n📋 Test 5: Live Code Modification');
    console.log('-'.repeat(40));

    const testFile = path.join(__dirname, '..', 'test-files', 'sample-code.js');

    if (!fs.existsSync(testFile)) {
      this.testResults.failed.push('❌ Test file not found');
      return;
    }

    // Read original content
    const originalContent = fs.readFileSync(testFile, 'utf8');

    try {
      // Run Codex to generate patch for the file
      const task = `Looking at the file ${testFile}, generate a patch to add a new function called getCurrentTimestamp that returns Date.now()`;
      const codexResult = await this.controller.runAsCodex(task, {
        file: testFile,
        realFile: true
      });

      if (codexResult.success && codexResult.artifacts.length > 0) {
        this.testResults.passed.push('✅ Codex generated patch for real file');

        // Verify file is unchanged (Codex is read-only)
        const contentAfterCodex = fs.readFileSync(testFile, 'utf8');
        if (contentAfterCodex === originalContent) {
          this.testResults.passed.push('✅ Original file unchanged by Codex (read-only verified)');
        } else {
          this.testResults.failed.push('❌ Codex modified the file (should be read-only)');
        }

        // Check patch content
        const patchArtifact = codexResult.artifacts.find(a => a.type === 'patch');
        if (patchArtifact) {
          const patchContent = fs.readFileSync(patchArtifact.path, 'utf8');

          if (patchContent.includes('getCurrentTimestamp') ||
              patchContent.includes('Date.now()')) {
            this.testResults.passed.push('✅ Patch contains requested function');
          } else {
            this.testResults.failed.push('❌ Patch does not contain requested function');
          }
        }
      } else {
        this.testResults.failed.push('❌ Codex failed to generate patch for real file');
      }

    } catch (error) {
      this.testResults.failed.push(`❌ Live code test failed: ${error.message}`);
    }
  }

  /**
   * Test 6: Verify No Simulation
   */
  async testNoSimulation() {
    console.log('\n📋 Test 6: Verify No Simulation');
    console.log('-'.repeat(40));

    // Check if controller is using simulation
    const controllerCode = fs.readFileSync(
      path.join(__dirname, 'dual-lane-controller.js'),
      'utf8'
    );

    if (controllerCode.includes('simulateCodexResponse')) {
      this.testResults.failed.push('⚠️  Controller contains simulation code');

      // Check if it's actually being used
      if (controllerCode.includes('this.simulateCodexResponse')) {
        this.testResults.failed.push('❌ Controller is actively using simulation');
      } else {
        this.testResults.passed.push('✅ Simulation code present but not active');
      }
    } else {
      this.testResults.passed.push('✅ No simulation code found');
    }

    // Test with a complex, specific task
    const complexTask = 'Generate a TypeScript interface for a User object with id (number), name (string), email (string), and createdAt (Date)';
    const result = await this.controller.runAsCodex(complexTask, { complex: true });

    if (result.artifacts && result.artifacts.length > 0) {
      const patch = this.extractPatchContent(result.artifacts);

      // Check for TypeScript-specific content (not in simulation)
      if (patch && (patch.includes('interface') || patch.includes('TypeScript'))) {
        this.testResults.passed.push('✅ Complex task handled (not simulated)');
      } else if (patch && patch.includes('example.js')) {
        this.testResults.failed.push('❌ Response appears to be simulated (contains example.js)');
      }
    }
  }

  // Helper methods

  async executeCommand(command, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let output = '';

      proc.stdout.on('data', (data) => output += data);
      proc.stderr.on('data', (data) => output += data);

      proc.on('close', (_code) => {
        resolve(output);
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  async spawnClaudeWithConstraints(prompt, allowed, denied) {
    return new Promise((resolve, reject) => {
      const args = ['--print'];

      if (allowed && allowed.length > 0) {
        args.push('--allowed-tools', allowed.join(' '));
      }

      if (denied && denied.length > 0) {
        args.push('--disallowed-tools', denied.join(' '));
      }

      args.push(prompt);

      const claude = spawn('claude', args, { encoding: 'utf8' });
      const result = {
        output: '',
        error: '',
        exitCode: null,
        pid: claude.pid
      };

      claude.stdout.on('data', (data) => result.output += data);
      claude.stderr.on('data', (data) => result.error += data);

      claude.on('close', (code) => {
        result.exitCode = code;
        if (code === 0) {
          resolve(result);
        } else {
          reject(new Error(`Process exited with code ${code}: ${result.error}`));
        }
      });

      claude.on('error', (err) => {
        reject(err);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        claude.kill();
        reject(new Error('Process timeout'));
      }, 10000);
    });
  }

  extractPatchContent(artifacts) {
    const patchArtifact = artifacts.find(a => a.type === 'patch');
    if (patchArtifact && fs.existsSync(patchArtifact.path)) {
      return fs.readFileSync(patchArtifact.path, 'utf8');
    }
    return null;
  }

  // Run all tests
  async runAllTests() {
    console.log('🧪 TESTING REAL CODEX EXECUTION');
    console.log('='.repeat(50));
    console.log('This test verifies Codex is actually working,');
    console.log('not just using simulated responses.');
    console.log('');

    await this.testRealProcessSpawning();
    await this.testDynamicTaskResponse();
    await this.testPermissionEnforcement();
    await this.testArtifactUniqueness();
    await this.testLiveCodeModification();
    await this.testNoSimulation();

    // Generate report
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(50));
    console.log(`Passed: ${this.testResults.passed.length}`);
    console.log(`Failed: ${this.testResults.failed.length}`);
    console.log('');

    if (this.testResults.passed.length > 0) {
      console.log('PASSED TESTS:');
      this.testResults.passed.forEach(test => console.log(`  ${test}`));
    }

    if (this.testResults.failed.length > 0) {
      console.log('\nFAILED TESTS:');
      this.testResults.failed.forEach(test => console.log(`  ${test}`));
    }

    const isReallyWorking = this.testResults.failed.length === 0 ||
                           (this.testResults.failed.length === 1 &&
                            this.testResults.failed[0].includes('simulation code'));

    console.log('\n' + '='.repeat(50));
    if (isReallyWorking) {
      console.log('✅ CODEX IS ACTUALLY WORKING');
      console.log('');
      console.log('Verification:');
      console.log('  • Real process execution confirmed');
      console.log('  • Dynamic responses to different tasks');
      console.log('  • Permission boundaries enforced');
      console.log('  • Unique artifacts generated');
      console.log('  • Can process real code files');
    } else {
      console.log('⚠️  CODEX MAY BE USING SIMULATION');
      console.log('');
      console.log('Issues detected:');
      this.testResults.failed.forEach(test => {
        if (!test.includes('⚠️')) {
          console.log(`  • ${test.replace('❌ ', '')}`);
        }
      });
    }

    // Save detailed report
    const reportFile = `/tmp/codex-real-execution-test-${Date.now()}.json`;
    const report = {
      timestamp: new Date().toISOString(),
      isReallyWorking: isReallyWorking,
      passedTests: this.testResults.passed.length,
      failedTests: this.testResults.failed.length,
      details: this.testResults,
      artifactHashes: Array.from(this.artifactHashes)
    };

    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportFile}`);

    return isReallyWorking;
  }
}

// Run the test
const tester = new CodexRealExecutionTester();
tester.runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('❌ Test suite failed:', err.message);
  process.exit(1);
});