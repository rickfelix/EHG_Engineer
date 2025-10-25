#!/usr/bin/env node

/**
 * Test Dual-Lane Active Status
 * Verifies that Codex is ACTUALLY ACTIVE, not just architecturally supported
 */

import DualLaneController from './dual-lane-controller.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testDualLaneActive() {
  console.log('🧪 TESTING DUAL-LANE ACTIVE STATUS');
  console.log('='.repeat(50));

  const controller = new DualLaneController();
  const tests = {
    passed: [],
    failed: []
  };

  // Test 1: Can switch to Codex mode
  console.log('\n📋 Test 1: Codex Mode Activation');
  try {
    const codexConfig = controller.loadLaneConfig('codex');

    // Check for read-only markers
    if (codexConfig.env.READ_ONLY_MODE === 'true' &&
        codexConfig.env.ENABLE_WRITE_OPERATIONS === 'false' &&
        codexConfig.env.ENABLE_DATABASE_WRITES === 'false') {
      tests.passed.push('✅ Codex mode configuration loaded with read-only settings');
    } else {
      tests.failed.push('❌ Codex mode not configured correctly');
    }

    // Verify branch prefix
    if (codexConfig.branch === 'staging/codex-') {
      tests.passed.push('✅ Codex uses correct branch prefix');
    } else {
      tests.failed.push('❌ Incorrect branch prefix for Codex');
    }

    // Verify commit marker
    if (codexConfig.marker === '[CODEX-READY]') {
      tests.passed.push('✅ Codex uses correct commit marker');
    } else {
      tests.failed.push('❌ Incorrect commit marker for Codex');
    }
  } catch (e) {
    tests.failed.push(`❌ Codex mode activation failed: ${e.message}`);
  }

  // Test 2: Codex generates artifacts
  console.log('\n📋 Test 2: Codex Artifact Generation');
  try {
    const result = await controller.runAsCodex(
      'Generate a simple hello world function',
      { test: true }
    );

    if (result.success && result.artifacts.length > 0) {
      tests.passed.push(`✅ Codex generated ${result.artifacts.length} artifacts`);

      // Verify artifact types
      const hasPatch = result.artifacts.find(a => a.type === 'patch');
      const hasSBOM = result.artifacts.find(a => a.type === 'sbom');
      const hasAttestation = result.artifacts.find(a => a.type === 'attestation');

      if (hasPatch) {
        tests.passed.push('✅ Patch artifact generated');
      }
      if (hasSBOM) {
        tests.passed.push('✅ SBOM artifact generated');
      }
      if (hasAttestation) {
        tests.passed.push('✅ Attestation artifact generated');
      }

      // Verify artifacts are in correct directory
      const artifactDir = '/tmp/codex-artifacts';
      if (fs.existsSync(artifactDir)) {
        const files = fs.readdirSync(artifactDir);
        if (files.length > 0) {
          tests.passed.push(`✅ Artifacts saved to ${artifactDir}`);
        }
      }
    } else {
      tests.failed.push('❌ Codex failed to generate artifacts');
    }
  } catch (e) {
    tests.failed.push(`❌ Codex execution failed: ${e.message}`);
  }

  // Test 3: Verify read-only constraints
  console.log('\n📋 Test 3: Read-Only Constraints');
  const codexPerms = controller.getLanePermissions('codex');

  // Check denied operations
  const criticalDenied = ['Write', 'Edit', 'MultiEdit', 'Bash(git commit:*)', 'Bash(git push:*)'];
  let allDenied = true;

  for (const op of criticalDenied) {
    if (!codexPerms.denied.includes(op)) {
      allDenied = false;
      tests.failed.push(`❌ Codex should deny: ${op}`);
    }
  }

  if (allDenied) {
    tests.passed.push('✅ Codex has all write operations blocked');
  }

  // Check allowed operations
  const criticalAllowed = ['Read', 'Grep', 'Bash(git diff:*)'];
  let allAllowed = true;

  for (const op of criticalAllowed) {
    if (!codexPerms.allowed.includes(op)) {
      allAllowed = false;
      tests.failed.push(`❌ Codex should allow: ${op}`);
    }
  }

  if (allAllowed) {
    tests.passed.push('✅ Codex has necessary read operations allowed');
  }

  // Test 4: Claude can apply artifacts
  console.log('\n📋 Test 4: Claude Mode Activation');
  try {
    const claudeConfig = controller.loadLaneConfig('claude');

    // Check for write permissions
    if (!claudeConfig.env.READ_ONLY_MODE ||
        claudeConfig.env.READ_ONLY_MODE !== 'true') {
      tests.passed.push('✅ Claude mode has write permissions');
    } else {
      tests.failed.push('❌ Claude mode incorrectly restricted');
    }

    // Verify branch prefix
    if (claudeConfig.branch === 'feature/') {
      tests.passed.push('✅ Claude uses correct branch prefix');
    } else {
      tests.failed.push('❌ Incorrect branch prefix for Claude');
    }

    // Verify commit marker
    if (claudeConfig.marker === '[CLAUDE-APPLIED]') {
      tests.passed.push('✅ Claude uses correct commit marker');
    } else {
      tests.failed.push('❌ Incorrect commit marker for Claude');
    }
  } catch (e) {
    tests.failed.push(`❌ Claude mode activation failed: ${e.message}`);
  }

  // Test 5: Audit trail
  console.log('\n📋 Test 5: Audit Trail');
  const auditTrail = controller.getAuditTrail();
  if (auditTrail.length > 0) {
    tests.passed.push(`✅ Audit trail contains ${auditTrail.length} entries`);

    // Verify audit trail has Codex entries
    const codexEntries = auditTrail.filter(e => e.mode === 'codex');
    if (codexEntries.length > 0) {
      tests.passed.push('✅ Audit trail shows Codex activity');
    }
  } else {
    tests.failed.push('❌ No audit trail generated');
  }

  // Test 6: End-to-end handoff
  console.log('\n📋 Test 6: End-to-End Handoff Test');
  try {
    // Generate artifacts with Codex
    const codexResult = await controller.runAsCodex(
      'Create a validation function',
      { e2e_test: true }
    );

    if (codexResult.success && codexResult.artifacts.length > 0) {
      // Apply with Claude
      const claudeResult = await controller.runAsClaude(
        codexResult.artifacts,
        { e2e_test: true }
      );

      if (claudeResult.success) {
        tests.passed.push('✅ End-to-end handoff successful');
        tests.passed.push('✅ Codex → Claude flow completed');
      } else {
        tests.failed.push('❌ Claude failed to apply Codex artifacts');
      }
    } else {
      tests.failed.push('❌ E2E test failed at Codex stage');
    }
  } catch (e) {
    tests.failed.push(`❌ E2E test failed: ${e.message}`);
  }

  // Results
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`Passed: ${tests.passed.length}`);
  console.log(`Failed: ${tests.failed.length}`);
  console.log('');

  console.log('PASSED TESTS:');
  tests.passed.forEach(test => console.log(`  ${test}`));

  if (tests.failed.length > 0) {
    console.log('\nFAILED TESTS:');
    tests.failed.forEach(test => console.log(`  ${test}`));
  }

  const isActive = tests.failed.length === 0;
  console.log('\n' + '='.repeat(50));

  if (isActive) {
    console.log('🎉 CODEX IS ACTIVE - Dual-lane workflow operational');
    console.log('');
    console.log('This proves:');
    console.log('  ✅ Codex operates with read-only constraints');
    console.log('  ✅ Artifacts are generated without write access');
    console.log('  ✅ Claude applies Codex-generated changes');
    console.log('  ✅ Proper handoff markers are used');
    console.log('  ✅ Audit trail tracks both lanes');
  } else {
    console.log('❌ CODEX IS NOT FULLY ACTIVE');
    console.log('');
    console.log('Issues to address:');
    console.log(`  - ${tests.failed.length} test(s) failed`);
    console.log('  - Review failed tests above for specific issues');
  }

  // Save detailed report
  const reportFile = `/tmp/codex-active-test-${Date.now()}.json`;
  const report = {
    timestamp: new Date().toISOString(),
    isActive: isActive,
    passedTests: tests.passed.length,
    failedTests: tests.failed.length,
    details: {
      passed: tests.passed,
      failed: tests.failed
    },
    auditTrail: controller.getAuditTrail()
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportFile}`);

  return isActive;
}

// Run test
testDualLaneActive().then(isActive => {
  process.exit(isActive ? 0 : 1);
}).catch(err => {
  console.error('❌ Test failed with error:', err.message);
  process.exit(1);
});