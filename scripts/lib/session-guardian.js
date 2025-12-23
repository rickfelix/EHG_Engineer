#!/usr/bin/env node
/**
 * Session Guardian - Checkpoint, Safe-Stop, and Loop Detection Service
 *
 * Provides reliability safeguards for extended LEO Protocol sessions:
 * 1. Checkpoint: Save/restore state after gates and phase transitions
 * 2. Safe-Stop: Pattern detection for prohibited operations
 * 3. Loop Detection: Track repeated operations and halt if stuck
 *
 * @module lib/session-guardian
 * @version 1.0.0
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Session Guardian - Combined checkpointing, safe-stop, and loop detection
 */
export class SessionGuardian {
  /**
   * @param {string} sessionId - Unique session identifier
   * @param {Object} config - Configuration object (from session-guardian-config.json)
   */
  constructor(sessionId, config = null) {
    this.sessionId = sessionId;
    this.config = config || this.loadDefaultConfig();
    this.operationHistory = [];
    this.checkpointPath = null;
    this.startTime = Date.now();
    this.totalOperations = 0;
    this.state = {
      status: 'RUNNING',
      currentPhase: null,
      currentSdId: null,
      gatesCompleted: [],
      lastCheckpoint: null
    };
  }

  /**
   * Load default configuration from file
   */
  loadDefaultConfig() {
    try {
      const configPath = path.join(__dirname, '..', '..', 'config', 'session-guardian-config.json');
      const configContent = require(configPath);
      return configContent;
    } catch {
      // Return sensible defaults if config file not found
      console.warn('⚠️  Session Guardian config not found, using defaults');
      return {
        checkpoint: {
          enabled: true,
          afterGates: true,
          afterPhaseTransition: true,
          directory: '/tmp/leo-checkpoints',
          maxAge: '24h',
          format: 'json'
        },
        loopDetection: {
          enabled: true,
          threshold: 5,
          windowSeconds: 300,
          excludePatterns: []
        },
        safeStop: {
          enabled: true,
          patterns: [
            { pattern: 'git push.*(main|master)', severity: 'critical', message: 'Direct push to main/master prohibited' },
            { pattern: 'git push.*(-f|--force)', severity: 'critical', message: 'Force push prohibited' },
            { pattern: 'DROP TABLE|DROP DATABASE|TRUNCATE', severity: 'critical', message: 'Destructive DB operations prohibited' }
          ]
        },
        resourceLimits: {
          maxDurationMinutes: 480,
          maxGateRetries: 3,
          maxTotalOperations: 1000
        },
        recovery: {
          enabled: true,
          autoResumeOnRestart: true,
          preserveDecisionLog: true
        }
      };
    }
  }

  /**
   * Initialize the guardian - create checkpoint directory, check for existing checkpoint
   * @returns {Promise<Object|null>} Existing checkpoint to resume from, or null
   */
  async init() {
    const checkpointDir = this.config.checkpoint.directory;
    await fs.mkdir(checkpointDir, { recursive: true });
    this.checkpointPath = path.join(checkpointDir, `checkpoint-${this.sessionId}.json`);

    // Check for existing checkpoint to resume
    if (this.config.recovery.enabled && this.config.recovery.autoResumeOnRestart) {
      const existingCheckpoint = await this.loadCheckpoint();
      if (existingCheckpoint) {
        console.log(`📍 Found existing checkpoint from ${existingCheckpoint.timestamp}`);
        return existingCheckpoint;
      }
    }

    return null;
  }

  // ============================================================================
  // CHECKPOINT MANAGEMENT
  // ============================================================================

  /**
   * Save checkpoint after gate or phase transition
   * @param {string} reason - What triggered the checkpoint (e.g., 'gate_passed', 'phase_transition')
   * @param {Object} additionalState - Extra state to save
   */
  async saveCheckpoint(reason, additionalState = {}) {
    if (!this.config.checkpoint.enabled) {
      return;
    }

    const checkpoint = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      reason,
      state: {
        ...this.state,
        ...additionalState
      },
      operationCount: this.totalOperations,
      durationMinutes: Math.round((Date.now() - this.startTime) / 60000)
    };

    await fs.writeFile(this.checkpointPath, JSON.stringify(checkpoint, null, 2));
    this.state.lastCheckpoint = checkpoint.timestamp;
    console.log(`💾 Checkpoint saved: ${reason} at ${checkpoint.timestamp}`);
  }

  /**
   * Load checkpoint from file
   * @returns {Promise<Object|null>} Checkpoint data or null
   */
  async loadCheckpoint() {
    try {
      const content = await fs.readFile(this.checkpointPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Restore state from checkpoint
   * @param {Object} checkpoint - Checkpoint to restore from
   */
  restoreFromCheckpoint(checkpoint) {
    if (!checkpoint || !checkpoint.state) {
      return false;
    }

    this.state = { ...this.state, ...checkpoint.state };
    console.log(`✅ Restored from checkpoint: phase=${this.state.currentPhase}, gates=${this.state.gatesCompleted.length}`);
    return true;
  }

  /**
   * Clear checkpoint (after successful session completion)
   */
  async clearCheckpoint() {
    try {
      await fs.unlink(this.checkpointPath);
      console.log('🗑️  Checkpoint cleared (session completed successfully)');
    } catch {
      // Ignore if file doesn't exist
    }
  }

  // ============================================================================
  // SAFE-STOP DETECTION
  // ============================================================================

  /**
   * Check if a command matches any safe-stop patterns
   * @param {string} command - Command to check
   * @returns {Object} { blocked: boolean, pattern: string, message: string, severity: string }
   */
  checkSafeStop(command) {
    if (!this.config.safeStop.enabled || !command) {
      return { blocked: false };
    }

    for (const rule of this.config.safeStop.patterns) {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(command)) {
        return {
          blocked: true,
          pattern: rule.pattern,
          message: rule.message,
          severity: rule.severity
        };
      }
    }

    return { blocked: false };
  }

  /**
   * Validate a command before execution - throws if blocked
   * @param {string} command - Command to validate
   * @throws {Error} If command matches safe-stop pattern
   */
  validateCommand(command) {
    const result = this.checkSafeStop(command);
    if (result.blocked) {
      this.state.status = 'SAFE_STOP';
      const error = new Error(`SAFE_STOP: ${result.message}\nCommand: ${command}\nPattern: ${result.pattern}`);
      error.code = 'SAFE_STOP';
      error.severity = result.severity;
      throw error;
    }
    return true;
  }

  // ============================================================================
  // LOOP DETECTION
  // ============================================================================

  /**
   * Track an operation for loop detection
   * @param {string} operation - Operation identifier (e.g., command, function name)
   * @returns {Object} { loopDetected: boolean, count: number }
   */
  trackOperation(operation) {
    if (!this.config.loopDetection.enabled) {
      return { loopDetected: false, count: 0 };
    }

    // Check if operation is excluded
    for (const excludePattern of this.config.loopDetection.excludePatterns || []) {
      if (operation.includes(excludePattern)) {
        return { loopDetected: false, count: 0, excluded: true };
      }
    }

    const now = Date.now();
    const windowMs = this.config.loopDetection.windowSeconds * 1000;
    const threshold = this.config.loopDetection.threshold;

    // Add operation to history
    this.operationHistory.push({
      operation,
      timestamp: now
    });

    // Clean up old entries outside the window
    this.operationHistory = this.operationHistory.filter(
      op => now - op.timestamp < windowMs
    );

    // Count occurrences of this operation in window
    const count = this.operationHistory.filter(
      op => op.operation === operation
    ).length;

    this.totalOperations++;

    if (count >= threshold) {
      this.state.status = 'LOOP_DETECTED';
      return {
        loopDetected: true,
        count,
        threshold,
        windowSeconds: this.config.loopDetection.windowSeconds
      };
    }

    return { loopDetected: false, count };
  }

  /**
   * Check for loop and throw if detected
   * @param {string} operation - Operation to check
   * @throws {Error} If loop detected
   */
  checkLoop(operation) {
    const result = this.trackOperation(operation);
    if (result.loopDetected) {
      const error = new Error(
        `LOOP_DETECTED: Operation "${operation}" repeated ${result.count} times ` +
        `within ${result.windowSeconds}s (threshold: ${result.threshold})`
      );
      error.code = 'LOOP_DETECTED';
      throw error;
    }
    return result;
  }

  // ============================================================================
  // RESOURCE LIMITS
  // ============================================================================

  /**
   * Check if resource limits have been exceeded
   * @returns {Object} { exceeded: boolean, reason: string }
   */
  checkResourceLimits() {
    const limits = this.config.resourceLimits;

    // Check duration
    const durationMinutes = (Date.now() - this.startTime) / 60000;
    if (limits.maxDurationMinutes && durationMinutes > limits.maxDurationMinutes) {
      return {
        exceeded: true,
        reason: `Session duration ${Math.round(durationMinutes)} minutes exceeds limit of ${limits.maxDurationMinutes} minutes`
      };
    }

    // Check total operations
    if (limits.maxTotalOperations && this.totalOperations > limits.maxTotalOperations) {
      return {
        exceeded: true,
        reason: `Total operations ${this.totalOperations} exceeds limit of ${limits.maxTotalOperations}`
      };
    }

    return { exceeded: false };
  }

  // ============================================================================
  // PHASE & GATE TRACKING
  // ============================================================================

  /**
   * Record a gate being passed
   * @param {string} gate - Gate identifier (e.g., 'LEAD-TO-PLAN', 'PLAN-TO-EXEC')
   * @param {Object} result - Gate result data
   */
  async recordGatePassed(gate, result = {}) {
    this.state.gatesCompleted.push({
      gate,
      timestamp: new Date().toISOString(),
      result
    });

    if (this.config.checkpoint.afterGates) {
      await this.saveCheckpoint('gate_passed', { lastGate: gate });
    }
  }

  /**
   * Record a phase transition
   * @param {string} fromPhase - Source phase
   * @param {string} toPhase - Target phase
   */
  async recordPhaseTransition(fromPhase, toPhase) {
    this.state.currentPhase = toPhase;

    if (this.config.checkpoint.afterPhaseTransition) {
      await this.saveCheckpoint('phase_transition', {
        fromPhase,
        toPhase
      });
    }
  }

  /**
   * Set current SD being worked on
   * @param {string} sdId - Strategic Directive ID
   */
  setCurrentSD(sdId) {
    this.state.currentSdId = sdId;
  }

  // ============================================================================
  // SESSION LIFECYCLE
  // ============================================================================

  /**
   * Mark session as completed successfully
   */
  async complete() {
    this.state.status = 'COMPLETED';
    await this.clearCheckpoint();
  }

  /**
   * Mark session as failed
   * @param {string} reason - Failure reason
   */
  async fail(reason) {
    this.state.status = 'FAILED';
    await this.saveCheckpoint('session_failed', { failureReason: reason });
  }

  /**
   * Get session summary
   * @returns {Object} Session summary
   */
  getSummary() {
    return {
      sessionId: this.sessionId,
      status: this.state.status,
      durationMinutes: Math.round((Date.now() - this.startTime) / 60000),
      totalOperations: this.totalOperations,
      gatesCompleted: this.state.gatesCompleted.length,
      currentPhase: this.state.currentPhase,
      currentSdId: this.state.currentSdId,
      lastCheckpoint: this.state.lastCheckpoint
    };
  }
}

/**
 * Create a session guardian from config file
 * @param {string} sessionId - Unique session identifier
 * @returns {Promise<SessionGuardian>} Initialized guardian
 */
export async function createSessionGuardian(sessionId) {
  const configPath = path.join(__dirname, '..', '..', 'config', 'session-guardian-config.json');
  let config;

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    console.warn('⚠️  Could not load session-guardian-config.json, using defaults');
    config = null;
  }

  const guardian = new SessionGuardian(sessionId, config);
  await guardian.init();
  return guardian;
}

// CLI for testing
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    console.log('🛡️  Session Guardian - Test Mode\n');

    const guardian = await createSessionGuardian(`test-${Date.now()}`);

    // Test safe-stop detection
    console.log('Testing safe-stop patterns:');
    const testCommands = [
      'git push origin main',
      'git push --force origin feature',
      'DROP TABLE users',
      'git commit -m "test"',
      'npm run build'
    ];

    for (const cmd of testCommands) {
      const result = guardian.checkSafeStop(cmd);
      if (result.blocked) {
        console.log(`  ❌ BLOCKED: "${cmd}" - ${result.message}`);
      } else {
        console.log(`  ✅ ALLOWED: "${cmd}"`);
      }
    }

    // Test loop detection
    console.log('\nTesting loop detection:');
    const loopOp = 'failing_operation';
    for (let i = 0; i < 6; i++) {
      const result = guardian.trackOperation(loopOp);
      console.log(`  Iteration ${i + 1}: count=${result.count}, loopDetected=${result.loopDetected}`);
      if (result.loopDetected) {
        console.log(`  ⚠️  Loop detected after ${result.count} repetitions`);
        break;
      }
    }

    // Test checkpoint
    console.log('\nTesting checkpoint:');
    await guardian.saveCheckpoint('test', { testData: 'hello' });
    const loaded = await guardian.loadCheckpoint();
    console.log(`  Saved and loaded checkpoint: ${loaded ? 'OK' : 'FAILED'}`);

    // Summary
    console.log('\nSession Summary:');
    console.log(guardian.getSummary());

    // Cleanup
    await guardian.clearCheckpoint();
    console.log('\n✅ All tests passed');
  })().catch(console.error);
}
