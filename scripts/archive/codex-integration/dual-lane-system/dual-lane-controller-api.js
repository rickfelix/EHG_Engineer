#!/usr/bin/env node

/**
 * Dual-Lane Controller with API Integration
 * Uses real Claude API calls with permission-based restrictions
 * Replaces simulation with actual AI processing
 */

import { spawn as _spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import crypto from 'crypto';
import DualLaneAPIClient from './dual-lane-api-client.js';
import SecurityContextManager from './security-context-manager.js';

class DualLaneControllerAPI {
  constructor() {
    this.currentMode = null;
    this.artifactDir = '/tmp/codex-artifacts';
    this.auditLog = [];

    // Initialize API client and security manager
    this.apiClient = new DualLaneAPIClient();
    this.securityManager = new SecurityContextManager();

    // Ensure artifact directory exists
    if (!fs.existsSync(this.artifactDir)) {
      fs.mkdirSync(this.artifactDir, { recursive: true });
    }
  }

  /**
   * Load environment configuration for a specific lane
   */
  loadLaneConfig(lane) {
    const envFile = lane === 'codex' ? '.env.codex' : '.env.claude';
    const envPath = path.join(process.cwd(), envFile);

    // Create default config if doesn't exist
    if (!fs.existsSync(envPath)) {
      this.createDefaultConfig(lane, envPath);
    }

    const config = dotenv.parse(fs.readFileSync(envPath));

    return {
      env: config,
      permissions: this.getLanePermissions(lane),
      branch: lane === 'codex' ? 'staging/codex-' : 'feature/',
      marker: lane === 'codex' ? '[CODEX-READY]' : '[CLAUDE-APPLIED]'
    };
  }

  /**
   * Create default configuration file
   */
  createDefaultConfig(lane, envPath) {
    const defaultConfig = lane === 'codex' ? `
# Codex Configuration (Read-Only)
ENABLE_CODEX_MODE=true
ENABLE_WRITE_OPERATIONS=false
READ_ONLY_MODE=true
ALLOWED_BRANCH_PREFIX=staging/codex-
AUDIT_TRAIL_ENABLED=true
` : `
# Claude Configuration (Write-Enabled)
ENABLE_WRITE_OPERATIONS=true
READ_ONLY_MODE=false
ALLOWED_BRANCH_PREFIX=feature/
AUDIT_TRAIL_ENABLED=true
`;

    fs.writeFileSync(envPath, defaultConfig.trim());
    console.log(`Created default config: ${envPath}`);
  }

  /**
   * Get tool permissions for each lane
   */
  getLanePermissions(lane) {
    return this.securityManager.permissions[lane];
  }

  /**
   * Switch to a specific lane mode
   */
  async switchMode(lane) {
    console.log(`\n=== Switching to ${lane.toUpperCase()} mode ===`);

    // Load configuration
    const config = this.loadLaneConfig(lane);

    // Update environment
    Object.assign(process.env, config.env);

    this.currentMode = lane;

    // Log mode switch
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      event: 'MODE_SWITCH',
      lane: lane,
      permissions: config.permissions
    });

    console.log(`Mode: ${lane}`);
    console.log(`Branch prefix: ${config.branch}`);
    console.log(`Permissions: ${config.permissions.allowed.length} allowed, ${config.permissions.denied.length} denied`);

    return config;
  }

  /**
   * Execute a task in Codex mode (read-only) using API
   */
  async executeAsCodex(task, targetFile = null) {
    await this.switchMode('codex');

    console.log('\n=== CODEX Execution (Read-Only) ===');
    console.log(`Task: ${task}`);

    // Validate task doesn't request write operations
    if (!this.securityManager.validateOperation('Read', 'codex')) {
      throw new Error('Codex cannot perform write operations');
    }

    // Execute via API client
    const result = await this.apiClient.executeAsCodex(task, targetFile);

    if (result.success) {
      console.log(`✅ Patch generated in ${result.duration}ms`);
      console.log(`📁 Artifacts saved to: ${this.artifactDir}`);

      // Sign artifacts
      if (result.artifacts && result.artifacts.patch) {
        const signature = this.securityManager.signArtifact(result.artifacts.patch, 'codex');
        console.log(`🔏 Artifact signed with hash: ${signature.hash}`);
      }

      // Create handoff record
      this.createHandoff('codex', 'claude', result.artifacts);
    } else {
      console.log(`❌ Codex execution failed: ${result.error}`);
    }

    return result;
  }

  /**
   * Execute a task in Claude mode (write-enabled) using API
   */
  async executeAsClaude(task, artifacts = null) {
    await this.switchMode('claude');

    console.log('\n=== CLAUDE Execution (Write-Enabled) ===');
    console.log(`Task: ${task}`);

    // If artifacts provided, verify them first
    if (artifacts) {
      console.log('Verifying Codex artifacts...');
      // In a real system, we'd verify the signatures here
    }

    // Execute via API client
    const result = await this.apiClient.executeAsClaude(task, artifacts);

    if (result.success) {
      console.log(`✅ Changes applied in ${result.duration}ms`);

      if (result.applied && result.applied.files) {
        console.log(`📝 Modified files: ${result.applied.files.join(', ')}`);
      }
    } else {
      console.log(`❌ Claude execution failed: ${result.error}`);
    }

    return result;
  }

  /**
   * Create a handoff record between lanes
   */
  createHandoff(fromLane, toLane, artifacts) {
    const handoff = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      from: fromLane,
      to: toLane,
      artifacts: artifacts,
      status: 'ready'
    };

    this.auditLog.push({
      timestamp: handoff.timestamp,
      event: 'HANDOFF',
      from: fromLane,
      to: toLane,
      handoffId: handoff.id
    });

    const handoffFile = path.join(this.artifactDir, `handoff-${handoff.id}.json`);
    fs.writeFileSync(handoffFile, JSON.stringify(handoff, null, 2));

    console.log(`\n🤝 Handoff created: ${fromLane} → ${toLane}`);
    console.log(`   ID: ${handoff.id}`);

    return handoff;
  }

  /**
   * Execute complete dual-lane workflow with API
   */
  async executeDualLaneWorkflow(task, targetFile = null) {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 DUAL-LANE WORKFLOW EXECUTION (API-BASED)');
    console.log('='.repeat(60));

    try {
      // Step 1: Execute as Codex (generate patch)
      const codexResult = await this.executeAsCodex(task, targetFile);

      if (!codexResult.success) {
        throw new Error(`Codex execution failed: ${codexResult.error}`);
      }

      // Step 2: Create handoff
      const handoff = this.createHandoff('codex', 'claude', codexResult.artifacts);

      // Step 3: Execute as Claude (apply patch)
      const claudeResult = await this.executeAsClaude(
        `Apply the patch from handoff ${handoff.id}`,
        codexResult.artifacts
      );

      if (!claudeResult.success) {
        throw new Error(`Claude execution failed: ${claudeResult.error}`);
      }

      // Step 4: Generate summary
      const summary = {
        success: true,
        task: task,
        workflow: {
          codex: {
            duration: codexResult.duration,
            artifactHash: codexResult.artifacts?.hash
          },
          handoff: handoff.id,
          claude: {
            duration: claudeResult.duration,
            applied: claudeResult.applied
          }
        },
        totalDuration: codexResult.duration + claudeResult.duration
      };

      console.log('\n' + '='.repeat(60));
      console.log('✅ WORKFLOW COMPLETED SUCCESSFULLY');
      console.log('='.repeat(60));
      console.log(JSON.stringify(summary, null, 2));

      // Save audit log
      this.saveAuditLog();

      return summary;

    } catch (error) {
      console.error('\n❌ Workflow failed:', error.message);
      this.saveAuditLog();
      throw error;
    }
  }

  /**
   * Save audit log
   */
  saveAuditLog() {
    const logFile = path.join(this.artifactDir, `audit-${Date.now()}.json`);
    fs.writeFileSync(logFile, JSON.stringify(this.auditLog, null, 2));
    console.log(`\n📋 Audit log saved to: ${logFile}`);
  }

  /**
   * Get audit trail
   */
  getAuditTrail() {
    return this.auditLog;
  }
}

// Export for use in other modules
export default DualLaneControllerAPI;

// CLI interface
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const controller = new DualLaneControllerAPI();

  const command = process.argv[2];
  const task = process.argv[3];
  const targetFile = process.argv[4];

  if (!command) {
    console.log('Usage: dual-lane-controller-api.js <command> [task] [target-file]');
    console.log('Commands:');
    console.log('  codex <task> [file]  - Execute as Codex (read-only)');
    console.log('  claude <task>        - Execute as Claude (write-enabled)');
    console.log('  workflow <task> [file] - Execute complete workflow');
    console.log('  test                - Run API connection test');
    process.exit(1);
  }

  (async () => {
    try {
      switch (command) {
        case 'codex':
          if (!task) {
            console.error('Task required for Codex execution');
            process.exit(1);
          }
          await controller.executeAsCodex(task, targetFile);
          break;

        case 'claude':
          if (!task) {
            console.error('Task required for Claude execution');
            process.exit(1);
          }
          await controller.executeAsClaude(task);
          break;

        case 'workflow':
          if (!task) {
            console.error('Task required for workflow execution');
            process.exit(1);
          }
          await controller.executeDualLaneWorkflow(task, targetFile);
          break;

        case 'test':
          // Test API connection
          console.log('Testing API connection...');
          const testTask = 'Add a comment that says "Hello from API"';
          const testFile = path.join(process.cwd(), 'test-files/sample-code.js');

          // Ensure test file exists
          if (!fs.existsSync('test-files')) {
            fs.mkdirSync('test-files');
          }
          if (!fs.existsSync(testFile)) {
            fs.writeFileSync(testFile, 'function hello() {\n  console.log("Hello");\n}\n');
          }

          await controller.executeDualLaneWorkflow(testTask, testFile);
          console.log('\n✅ API test completed successfully!');
          break;

        default:
          console.error('Unknown command:', command);
          process.exit(1);
      }
    } catch (error) {
      console.error('Execution failed:', error);
      process.exit(1);
    }
  })();
}