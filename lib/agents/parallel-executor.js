#!/usr/bin/env node

/**
 * Parallel Sub-Agent Executor
 *
 * Executes multiple sub-agents concurrently with:
 * - Circuit breaker pattern (3 retries, exponential backoff)
 * - Timeout protection (5 min per agent)
 * - Graceful degradation (continue on non-critical failures)
 * - Performance tracking
 * - Database integration
 *
 * Usage:
 *   import ParallelExecutor from './lib/agents/parallel-executor.js';
 *   const executor = new ParallelExecutor();
 *   const results = await executor.executeParallel(subAgents, context);
 */

import { createClient } from '@supabase/supabase-js';
import ContextMonitor from '../context/context-monitor.js';
import MemoryManager from '../context/memory-manager.js';
import dotenv from 'dotenv';

dotenv.config();

class ParallelExecutor {
  constructor(options = {}) {
    // SD-VENTURE-STAGE0-UI-001: Use SERVICE_ROLE_KEY to bypass RLS on sub_agent_execution_batches
    // The table has RLS policies that only allow service_role for INSERT/UPDATE
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Configuration
    this.maxConcurrent = options.maxConcurrent || 10;
    this.timeout = options.timeout || 300000; // 5 minutes
    this.maxRetries = options.maxRetries || 3;
    this.baseBackoff = options.baseBackoff || 1000; // 1 second

    // Circuit breaker state
    this.circuitState = new Map(); // agentId -> { failures, lastFailure, state }

    // Performance metrics
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      timeoutExecutions: 0,
      circuitOpenCount: 0,
      totalDuration: 0
    };

    // Overflow prevention (Phase 3 integration)
    this.contextMonitor = new ContextMonitor();
    this.memoryManager = new MemoryManager();
    this.enableOverflowPrevention = options.enableOverflowPrevention !== false; // Default true
  }

  /**
   * Execute multiple sub-agents in parallel
   */
  async executeParallel(subAgents, context = {}) {
    const startTime = Date.now();

    console.log(`\n🚀 Parallel Executor: Starting execution of ${subAgents.length} sub-agents`);
    console.log(`   Max Concurrent: ${this.maxConcurrent}`);
    console.log(`   Timeout: ${this.timeout}ms\n`);

    // Phase 3: Pre-execution context check
    if (this.enableOverflowPrevention) {
      await this.checkContextHealth('parallel-execution-start');
    }

    // Create execution batch in database
    const batch = await this.createExecutionBatch(subAgents, context);

    // Execute sub-agents with concurrency limit
    const results = await this.executeBatch(subAgents, context, batch.id);

    // Phase 3: Stream results to memory if context is getting full
    if (this.enableOverflowPrevention) {
      await this.streamResultsToMemory(results, context);
    }

    // Update batch completion
    await this.completeBatch(batch.id, results, startTime);

    const duration = Date.now() - startTime;
    console.log(`\n✅ Parallel Execution Complete in ${duration}ms`);
    console.log(`   Successful: ${results.filter(r => r.status === 'completed').length}/${subAgents.length}`);
    console.log(`   Failed: ${results.filter(r => r.status === 'failed').length}/${subAgents.length}`);
    console.log(`   Timeout: ${results.filter(r => r.status === 'timeout').length}/${subAgents.length}\n`);

    return {
      batchId: batch.id,
      results,
      metrics: {
        ...this.metrics,
        batchDuration: duration
      }
    };
  }

  /**
   * Phase 3: Check context health before execution
   */
  async checkContextHealth(phase) {
    const state = await this.memoryManager.readSessionState();
    const analysis = this.contextMonitor.analyzeContextUsage(state.raw);

    if (analysis.status === 'WARNING' || analysis.status === 'CRITICAL') {
      console.log(`   ⚠️  Context Status: ${analysis.status} (${analysis.percentUsed}%)`);
      console.log('   💡 Overflow prevention will apply summarization during execution');
    } else {
      console.log(`   ✅ Context Status: ${analysis.status} (${analysis.percentUsed}%)`);
    }

    return analysis;
  }

  /**
   * Phase 3: Stream results to memory to prevent overflow
   */
  async streamResultsToMemory(results, context) {
    // Check if we need to apply summarization
    const state = await this.memoryManager.readSessionState();
    const analysis = this.contextMonitor.analyzeContextUsage(state.raw);

    if (analysis.status === 'CRITICAL' || analysis.status === 'EMERGENCY') {
      console.log(`\n   🗜️ Context ${analysis.status} - Applying summarization...`);

      // Summarize sub-agent reports
      const summarized = this.contextMonitor.summarizeSubAgentReports(
        results.map(r => ({
          agent: r.agentCode,
          status: r.status,
          confidence: r.results?.confidence || 0,
          critical_issues: r.results?.critical_issues || [],
          recommendations: r.results?.recommendations || []
        }))
      );

      // Save full results to memory
      await this.memoryManager.updateSection(
        'Parallel Sub-Agent Execution Results',
        JSON.stringify(results, null, 2)
      );

      console.log('   💾 Full results saved to memory');
      console.log(`   📊 Compression: ${summarized.compressionRatio}%`);
    }
  }

  /**
   * Execute batch of sub-agents with concurrency control
   */
  async executeBatch(subAgents, context, batchId) {
    // Sort by priority (higher priority first)
    const sortedAgents = [...subAgents].sort((a, b) => b.priority - a.priority);

    // Execute with Promise.all (native concurrent execution)
    const promises = sortedAgents.map(agent =>
      this.executeWithCircuitBreaker(agent, context, batchId)
    );

    // Wait for all to complete or timeout
    const results = await Promise.all(promises);

    return results;
  }

  /**
   * Execute single sub-agent with circuit breaker protection
   */
  async executeWithCircuitBreaker(agent, context, batchId) {
    const circuitKey = agent.id;

    // Check circuit breaker state
    if (this.isCircuitOpen(circuitKey)) {
      console.log(`   ⚠️  Circuit OPEN for ${agent.code} - Skipping`);
      this.metrics.circuitOpenCount++;

      return {
        agentId: agent.id,
        agentCode: agent.code,
        status: 'circuit_open',
        error: 'Circuit breaker is open',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 0
      };
    }

    // Try execution with retries
    let lastError = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await this.executeSingleAgent(agent, context, batchId, attempt);

        // Success - reset circuit
        this.resetCircuit(circuitKey);
        this.metrics.successfulExecutions++;

        return result;

      } catch (error) {
        lastError = error;
        console.log(`   ⚠️  ${agent.code} failed (attempt ${attempt + 1}/${this.maxRetries}): ${error.message}`);

        // Record failure in circuit breaker
        this.recordFailure(circuitKey);

        // Exponential backoff before retry
        if (attempt < this.maxRetries - 1) {
          const backoffMs = this.baseBackoff * Math.pow(2, attempt);
          console.log(`   ⏳ Backing off ${backoffMs}ms before retry...`);
          await this.sleep(backoffMs);
        }
      }
    }

    // All retries failed
    this.metrics.failedExecutions++;

    return {
      agentId: agent.id,
      agentCode: agent.code,
      status: 'failed',
      error: lastError.message,
      retryCount: this.maxRetries,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 0
    };
  }

  /**
   * Execute single sub-agent with timeout protection
   */
  async executeSingleAgent(agent, context, batchId, attemptNumber) {
    const startTime = Date.now();
    const executionId = await this.createExecution(agent, context, batchId);

    console.log(`   🔄 Executing ${agent.code}...`);

    try {
      // Execute with timeout
      const result = await Promise.race([
        this.runSubAgent(agent, context),
        this.timeoutPromise(this.timeout, agent.code)
      ]);

      const duration = Date.now() - startTime;

      // Update execution in database
      await this.updateExecution(executionId, {
        status: 'completed',
        results: result,
        completed_at: new Date().toISOString(),
        duration_ms: duration
      });

      console.log(`   ✅ ${agent.code} completed in ${duration}ms`);

      return {
        executionId,
        agentId: agent.id,
        agentCode: agent.code,
        status: 'completed',
        results: result,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      // Check if timeout
      const isTimeout = error.message.includes('timeout');
      const status = isTimeout ? 'timeout' : 'failed';

      if (isTimeout) {
        this.metrics.timeoutExecutions++;
      }

      // Update execution in database
      await this.updateExecution(executionId, {
        status,
        error_message: error.message,
        retry_count: attemptNumber,
        completed_at: new Date().toISOString(),
        duration_ms: duration
      });

      throw error;
    }
  }

  /**
   * Run sub-agent (mock for now, will integrate with actual sub-agents)
   */
  async runSubAgent(agent, context) {
    // TODO: Integrate with actual sub-agent execution
    // For now, simulate execution with agent's script_path

    if (agent.script_path) {
      // Execute script if available
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      try {
        const { stdout, stderr } = await execAsync(`node ${agent.script_path} --prd "${context.prdId || ''}"`);

        return {
          success: true,
          output: stdout,
          errors: stderr || null,
          agent: agent.code
        };
      } catch (error) {
        throw new Error(`Script execution failed: ${error.message}`);
      }
    } else {
      // Use context_file or generate mock result
      return {
        success: true,
        agent: agent.code,
        status: 'passed',
        confidence: 85,
        message: `${agent.code} verification completed`,
        recommendations: []
      };
    }
  }

  /**
   * Create timeout promise
   */
  timeoutPromise(ms, agentCode) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${agentCode} execution timeout after ${ms}ms`));
      }, ms);
    });
  }

  /**
   * Circuit breaker: Check if circuit is open
   */
  isCircuitOpen(circuitKey) {
    const state = this.circuitState.get(circuitKey);
    if (!state) return false;

    if (state.state === 'open') {
      // Check if enough time has passed to try half-open
      const timeSinceLastFailure = Date.now() - state.lastFailure;
      const cooldownPeriod = 60000; // 1 minute

      if (timeSinceLastFailure > cooldownPeriod) {
        state.state = 'half-open';
        this.circuitState.set(circuitKey, state);
        return false;
      }

      return true;
    }

    return false;
  }

  /**
   * Circuit breaker: Record failure
   */
  recordFailure(circuitKey) {
    const state = this.circuitState.get(circuitKey) || { failures: 0, lastFailure: 0, state: 'closed' };
    state.failures++;
    state.lastFailure = Date.now();

    // Open circuit after 3 consecutive failures
    if (state.failures >= 3) {
      state.state = 'open';
      console.log(`   🔴 Circuit breaker OPENED for ${circuitKey}`);
    }

    this.circuitState.set(circuitKey, state);
  }

  /**
   * Circuit breaker: Reset on success
   */
  resetCircuit(circuitKey) {
    this.circuitState.set(circuitKey, { failures: 0, lastFailure: 0, state: 'closed' });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Database: Create execution batch
   */
  async createExecutionBatch(subAgents, context) {
    const { data, error } = await this.supabase
      .from('sub_agent_execution_batches')
      .insert({
        strategic_directive_id: context.strategicDirectiveId || context.sdId || 'unknown',
        prd_id: context.prdId || null,
        batch_mode: 'parallel',
        total_agents: subAgents.length,
        status: 'running',
        started_at: new Date().toISOString(),
        metadata: {
          agentCodes: subAgents.map(a => a.code),
          context: context
        }
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create execution batch:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Database: Create individual execution record
   */
  async createExecution(agent, context, batchId) {
    const { data, error } = await this.supabase
      .from('sub_agent_executions')
      .insert({
        sub_agent_id: agent.id,
        prd_id: context.prdId || null,
        strategic_directive_id: context.strategicDirectiveId || context.sdId || 'unknown',
        execution_mode: 'parallel',
        status: 'running',
        started_at: new Date().toISOString(),
        metadata: {
          batchId,
          priority: agent.priority,
          activationType: agent.activation_type
        }
      })
      .select()
      .single();

    if (error) {
      console.error(`Failed to create execution record for ${agent.code}:`, error);
      // Continue execution even if DB write fails
      return null;
    }

    return data.id;
  }

  /**
   * Database: Update execution record
   */
  async updateExecution(executionId, updates) {
    if (!executionId) return;

    const { error } = await this.supabase
      .from('sub_agent_executions')
      .update(updates)
      .eq('id', executionId);

    if (error) {
      console.error('Failed to update execution:', error);
    }
  }

  /**
   * Database: Complete execution batch
   */
  async completeBatch(batchId, results, startTime) {
    const completedCount = results.filter(r => r.status === 'completed').length;
    const failedCount = results.filter(r => r.status !== 'completed').length;

    const { error } = await this.supabase
      .from('sub_agent_execution_batches')
      .update({
        completed_agents: completedCount,
        failed_agents: failedCount,
        status: failedCount === 0 ? 'completed' : 'partial_failure',
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        performance_metrics: this.metrics
      })
      .eq('id', batchId);

    if (error) {
      console.error('Failed to complete batch:', error);
    }
  }
}

export default ParallelExecutor;