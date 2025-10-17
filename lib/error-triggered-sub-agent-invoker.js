#!/usr/bin/env node

/**
 * Error-Triggered Sub-Agent Invoker with Circuit Breaker
 *
 * Purpose: Automatically invoke appropriate sub-agents when errors are detected
 *          during EXEC/PLAN phases, with circuit breaker protection to prevent
 *          infinite loops.
 *
 * Features:
 * - Monitors error output from execution processes
 * - Automatically detects error patterns
 * - Invokes appropriate sub-agents for diagnosis
 * - Circuit breaker prevents infinite invocation loops
 * - Learning system stores resolution patterns
 * - Escalation path for unresolved errors
 *
 * Usage:
 *   import { monitorExecution, invokeForError } from './error-triggered-sub-agent-invoker.js';
 *
 *   const monitor = await monitorExecution(command, options);
 *   // Errors automatically trigger sub-agent invocation
 */

import { detectError, recommendSubAgent, ERROR_CATEGORIES, SEVERITY_LEVELS } from './error-pattern-library.js';
import { createClient } from '@supabase/supabase-js';
import { executeSubAgent } from './sub-agent-executor.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ============================================================================
// TEST MODE CONFIGURATION
// ============================================================================

// When TEST_MODE=true, skip actual sub-agent execution and return mock results
const TEST_MODE = process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test';

// ============================================================================
// CIRCUIT BREAKER CONFIGURATION
// ============================================================================

const CIRCUIT_BREAKER_CONFIG = {
  // Maximum invocations per error pattern per SD in a time window
  maxInvocationsPerPattern: 3,

  // Time window for invocation counting (milliseconds)
  timeWindowMs: 30 * 60 * 1000, // 30 minutes

  // Cooldown period after circuit opens (milliseconds)
  cooldownMs: 60 * 60 * 1000, // 1 hour

  // Maximum total invocations per SD (all patterns)
  maxTotalInvocations: 10,

  // Auto-invoke thresholds by severity
  autoInvokeSeverity: [SEVERITY_LEVELS.CRITICAL, SEVERITY_LEVELS.HIGH],

  // Escalation threshold (invoke human after N failures)
  escalationThreshold: 5
};

// ============================================================================
// INVOCATION HISTORY TRACKING
// ============================================================================

class InvocationHistory {
  constructor() {
    this.history = new Map(); // sdId -> Array<InvocationRecord>
  }

  /**
   * Record a sub-agent invocation
   */
  record(sdId, errorId, subAgentCode, result) {
    if (!this.history.has(sdId)) {
      this.history.set(sdId, []);
    }

    const record = {
      errorId,
      subAgentCode,
      timestamp: Date.now(),
      result,
      resolved: result.verdict === 'PASS'
    };

    this.history.get(sdId).push(record);
  }

  /**
   * Get invocation count for specific error pattern
   */
  getPatternCount(sdId, errorId, timeWindowMs) {
    if (!this.history.has(sdId)) {
      return 0;
    }

    const now = Date.now();
    const cutoff = now - timeWindowMs;

    return this.history.get(sdId).filter(r =>
      r.errorId === errorId && r.timestamp >= cutoff
    ).length;
  }

  /**
   * Get total invocation count for SD
   */
  getTotalCount(sdId, timeWindowMs) {
    if (!this.history.has(sdId)) {
      return 0;
    }

    const now = Date.now();
    const cutoff = now - timeWindowMs;

    return this.history.get(sdId).filter(r =>
      r.timestamp >= cutoff
    ).length;
  }

  /**
   * Get failure count for escalation check
   */
  getFailureCount(sdId) {
    if (!this.history.has(sdId)) {
      return 0;
    }

    return this.history.get(sdId).filter(r => !r.resolved).length;
  }

  /**
   * Check if circuit should be opened
   */
  shouldOpenCircuit(sdId, errorId, config) {
    const patternCount = this.getPatternCount(sdId, errorId, config.timeWindowMs);
    const totalCount = this.getTotalCount(sdId, config.timeWindowMs);

    return patternCount >= config.maxInvocationsPerPattern ||
           totalCount >= config.maxTotalInvocations;
  }

  /**
   * Check if error should escalate to human
   */
  shouldEscalate(sdId, config) {
    const failureCount = this.getFailureCount(sdId);
    return failureCount >= config.escalationThreshold;
  }

  /**
   * Clear history for SD (after successful resolution)
   */
  clear(sdId) {
    this.history.delete(sdId);
  }
}

const invocationHistory = new InvocationHistory();

// ============================================================================
// CIRCUIT BREAKER STATE
// ============================================================================

class CircuitBreaker {
  constructor(config) {
    this.config = config;
    this.circuits = new Map(); // key -> { state, openedAt }
  }

  /**
   * Get circuit key for tracking
   */
  _getKey(sdId, errorId) {
    return `${sdId}:${errorId}`;
  }

  /**
   * Check if circuit is open
   */
  isOpen(sdId, errorId) {
    const key = this._getKey(sdId, errorId);
    const circuit = this.circuits.get(key);

    if (!circuit || circuit.state !== 'OPEN') {
      return false;
    }

    // Check if cooldown period has elapsed
    const now = Date.now();
    const cooldownEnds = circuit.openedAt + this.config.cooldownMs;

    if (now >= cooldownEnds) {
      // Close circuit after cooldown
      this.close(sdId, errorId);
      return false;
    }

    return true;
  }

  /**
   * Open circuit (prevent further invocations)
   */
  open(sdId, errorId, reason) {
    const key = this._getKey(sdId, errorId);
    this.circuits.set(key, {
      state: 'OPEN',
      openedAt: Date.now(),
      reason
    });

    console.warn(`🔴 Circuit breaker OPEN for ${key}: ${reason}`);
  }

  /**
   * Close circuit (allow invocations)
   */
  close(sdId, errorId) {
    const key = this._getKey(sdId, errorId);
    this.circuits.delete(key);
    console.log(`🟢 Circuit breaker CLOSED for ${key}`);
  }

  /**
   * Get circuit state
   */
  getState(sdId, errorId) {
    const key = this._getKey(sdId, errorId);
    const circuit = this.circuits.get(key);
    return circuit ? circuit.state : 'CLOSED';
  }
}

const circuitBreaker = new CircuitBreaker(CIRCUIT_BREAKER_CONFIG);

// ============================================================================
// ERROR-TRIGGERED INVOCATION
// ============================================================================

/**
 * Invoke sub-agent for detected error
 * @param {object} errorInfo - Error information from detectError()
 * @param {string} sdId - Strategic Directive ID
 * @param {object} context - Execution context (phase, file, etc.)
 * @returns {object} Invocation result
 */
export async function invokeForError(errorInfo, sdId, context = {}) {
  console.log('\n🚨 ERROR-TRIGGERED SUB-AGENT INVOCATION');
  console.log('═'.repeat(60));
  console.log(`SD: ${sdId}`);
  console.log(`Error: ${errorInfo.id}`);
  console.log(`Severity: ${errorInfo.severity}`);
  console.log(`Confidence: ${errorInfo.confidence}%`);

  // Step 1: Check circuit breaker
  if (circuitBreaker.isOpen(sdId, errorInfo.id)) {
    const cooldownEnds = Date.now() + CIRCUIT_BREAKER_CONFIG.cooldownMs;
    return {
      invoked: false,
      reason: 'CIRCUIT_BREAKER_OPEN',
      message: `Circuit breaker open - cooldown until ${new Date(cooldownEnds).toISOString()}`,
      errorInfo
    };
  }

  // Step 2: Check invocation limits
  if (invocationHistory.shouldOpenCircuit(sdId, errorInfo.id, CIRCUIT_BREAKER_CONFIG)) {
    circuitBreaker.open(sdId, errorInfo.id, 'Max invocations reached');
    return {
      invoked: false,
      reason: 'MAX_INVOCATIONS_REACHED',
      message: 'Circuit breaker opened due to invocation limits',
      errorInfo
    };
  }

  // Step 3: Check escalation threshold
  if (invocationHistory.shouldEscalate(sdId, CIRCUIT_BREAKER_CONFIG)) {
    return {
      invoked: false,
      reason: 'ESCALATION_REQUIRED',
      message: 'Too many failures - human intervention required',
      errorInfo,
      escalate: true
    };
  }

  // Step 4: Get sub-agent recommendation
  const recommendation = recommendSubAgent(errorInfo);

  if (!recommendation.recommended || recommendation.recommended.length === 0) {
    return {
      invoked: false,
      reason: 'NO_RECOMMENDATION',
      message: 'No sub-agent recommendation available',
      errorInfo
    };
  }

  // Step 5: Check if auto-invoke is appropriate
  const shouldAutoInvoke = CIRCUIT_BREAKER_CONFIG.autoInvokeSeverity.includes(errorInfo.severity);

  if (!shouldAutoInvoke) {
    return {
      invoked: false,
      reason: 'MANUAL_INTERVENTION_REQUIRED',
      message: `Severity ${errorInfo.severity} requires manual review`,
      recommendation,
      errorInfo
    };
  }

  // Step 6: Invoke sub-agents
  console.log(`\n⚡ Auto-invoking ${recommendation.recommended.length} sub-agent(s)...`);

  const results = [];

  for (const agent of recommendation.recommended) {
    console.log(`\n🤖 Invoking ${agent.code} (${agent.name})...`);

    try {
      let result;

      if (TEST_MODE) {
        // Mock result for testing - simulates failed sub-agent execution
        result = {
          verdict: 'FAIL',
          confidence: 0,
          execution_time_ms: 1,
          message: 'TEST_MODE: Mock sub-agent execution'
        };
        console.log(`   🧪 TEST_MODE: Using mock result`);
      } else {
        // Real sub-agent execution
        result = await executeSubAgent(agent.code, sdId, {
          phase: 'error-recovery',
          priority: agent.priority,
          errorContext: {
            errorId: errorInfo.id,
            errorMessage: errorInfo.errorMessage,
            category: errorInfo.category,
            severity: errorInfo.severity,
            diagnosis: errorInfo.diagnosis
          }
        });
      }

      // Record invocation
      invocationHistory.record(sdId, errorInfo.id, agent.code, result);

      results.push({
        agent: agent.code,
        verdict: result.verdict,
        confidence: result.confidence,
        execution_time: result.execution_time_ms
      });

      console.log(`   ${result.verdict === 'PASS' ? '✅' : '❌'} ${agent.code}: ${result.verdict} (${result.confidence}%)`);

      // If resolved, clear history and close circuit
      if (result.verdict === 'PASS') {
        invocationHistory.clear(sdId);
        circuitBreaker.close(sdId, errorInfo.id);
      }

    } catch (error) {
      console.error(`   ❌ ${agent.code} invocation failed: ${error.message}`);

      results.push({
        agent: agent.code,
        verdict: 'ERROR',
        error: error.message
      });

      // Record failed invocation
      invocationHistory.record(sdId, errorInfo.id, agent.code, {
        verdict: 'FAIL',
        confidence: 0
      });
    }
  }

  return {
    invoked: true,
    errorInfo,
    recommendation,
    results,
    historyCleared: results.some(r => r.verdict === 'PASS')
  };
}

/**
 * Monitor command execution and auto-invoke sub-agents on errors
 * @param {string} command - Command to execute
 * @param {string} sdId - Strategic Directive ID
 * @param {object} options - Execution options
 * @returns {object} Execution result with error handling
 */
export async function monitorExecution(command, sdId, options = {}) {
  const { spawn } = await import('child_process');

  return new Promise((resolve, reject) => {
    console.log(`\n🔍 Monitoring execution: ${command}`);
    console.log(`   SD: ${sdId}`);

    const errorBuffer = [];
    const outputBuffer = [];

    const proc = spawn(command, {
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe']
    });

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer.push(output);
      process.stdout.write(output);
    });

    proc.stderr.on('data', async (data) => {
      const error = data.toString();
      errorBuffer.push(error);
      process.stderr.write(error);

      // Detect error patterns
      const errorInfo = detectError(error, {
        sdId,
        command,
        phase: options.phase || 'EXEC'
      });

      if (errorInfo && errorInfo.id !== 'UNKNOWN_ERROR') {
        // Auto-invoke sub-agent
        const result = await invokeForError(errorInfo, sdId, {
          command,
          phase: options.phase
        });

        if (result.escalate) {
          console.warn('\n⚠️  ESCALATION REQUIRED - Too many failures');
          console.warn('   Please review error patterns and manual intervention may be needed.');
        }
      }
    });

    proc.on('close', (code) => {
      resolve({
        exitCode: code,
        output: outputBuffer.join(''),
        errors: errorBuffer.join(''),
        success: code === 0
      });
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Get invocation statistics for SD
 * @param {string} sdId - Strategic Directive ID
 * @returns {object} Statistics
 */
export function getInvocationStats(sdId) {
  const records = invocationHistory.history.get(sdId) || [];

  return {
    totalInvocations: records.length,
    resolvedCount: records.filter(r => r.resolved).length,
    failureCount: records.filter(r => !r.resolved).length,
    bySubAgent: records.reduce((acc, r) => {
      acc[r.subAgentCode] = (acc[r.subAgentCode] || 0) + 1;
      return acc;
    }, {}),
    byError: records.reduce((acc, r) => {
      acc[r.errorId] = (acc[r.errorId] || 0) + 1;
      return acc;
    }, {}),
    shouldEscalate: invocationHistory.shouldEscalate(sdId, CIRCUIT_BREAKER_CONFIG),
    circuitState: records.length > 0 ? circuitBreaker.getState(sdId, records[0].errorId) : 'CLOSED'
  };
}

/**
 * Reset circuit breaker and history for SD
 * @param {string} sdId - Strategic Directive ID
 */
export function reset(sdId) {
  invocationHistory.clear(sdId);

  // Close all circuits for this SD
  const records = invocationHistory.history.get(sdId) || [];
  const errorIds = [...new Set(records.map(r => r.errorId))];

  errorIds.forEach(errorId => {
    circuitBreaker.close(sdId, errorId);
  });

  console.log(`🔄 Reset invocation history and circuit breaker for ${sdId}`);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  invokeForError,
  monitorExecution,
  getInvocationStats,
  reset,
  CIRCUIT_BREAKER_CONFIG
};
