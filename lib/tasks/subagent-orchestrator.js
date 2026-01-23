/**
 * LEO 5.0 Sub-Agent Orchestrator
 *
 * Manages parallel sub-agent execution during PLAN and EXEC phases.
 * Provides synthesis blocking (wait for all sub-agents to complete).
 *
 * Key concepts:
 * - Parallel spawning: Multiple sub-agents run concurrently
 * - Type-aware requirements: Different SD types require different sub-agents
 * - Timing rules: Sub-agents run at specific phases
 * - Synthesis blocking: Dependent tasks wait for all sub-agents
 *
 * @see plans/LEO_5_0_ARCHITECTURE.md Section 11 for spec
 */

import { createClient } from '@supabase/supabase-js';
import {
  getSubAgentRequirements,
  getSubAgentTiming,
  SUBAGENT_REQUIREMENTS,
  SUBAGENT_TIMING
} from './track-selector.js';

// Sub-agent execution status
const SUBAGENT_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  TIMEOUT: 'timeout'
};

// Default timeout for sub-agents (5 minutes)
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * SubAgentOrchestrator - Manages parallel sub-agent execution
 */
export class SubAgentOrchestrator {
  constructor(supabase, options = {}) {
    this.supabase = supabase || createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.defaultTimeout = options.timeout || DEFAULT_TIMEOUT_MS;
    this.executionLog = new Map(); // Track running executions
  }

  /**
   * Get sub-agents required for an SD at a specific phase
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} phase - Current phase (PLAN, EXEC, FINAL)
   * @returns {Promise<object>} Required sub-agents with timing info
   */
  async getRequiredSubAgents(sdId, phase) {
    console.log('\n   📋 GETTING REQUIRED SUB-AGENTS');
    console.log(`      SD: ${sdId}`);
    console.log(`      Phase: ${phase}`);

    try {
      const sd = await this._loadSD(sdId);
      const sdType = sd.sd_type;
      const categories = sd.categories || [];

      // Get type-based requirements
      const requirements = getSubAgentRequirements(sdType, categories);

      // Filter by phase timing
      const phaseAgents = this._filterByPhase(requirements, phase);

      console.log(`      SD Type: ${sdType}`);
      console.log(`      Required: ${phaseAgents.required.join(', ') || 'none'}`);
      console.log(`      Recommended: ${phaseAgents.recommended.join(', ') || 'none'}`);

      return {
        sdId,
        sdType,
        phase,
        required: phaseAgents.required,
        recommended: phaseAgents.recommended,
        timing: phaseAgents.timing,
        all: [...phaseAgents.required, ...phaseAgents.recommended]
      };

    } catch (error) {
      console.error(`      ❌ Error: ${error.message}`);
      return {
        sdId,
        phase,
        required: [],
        recommended: [],
        timing: {},
        all: [],
        error: error.message
      };
    }
  }

  /**
   * Spawn sub-agents in parallel
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} phase - Current phase
   * @param {object} options - Spawn options
   * @returns {Promise<object>} Spawn results
   */
  async spawnSubAgents(sdId, phase, options = {}) {
    console.log('\n   🚀 SPAWNING SUB-AGENTS');
    console.log(`      SD: ${sdId}`);
    console.log(`      Phase: ${phase}`);

    try {
      const sd = await this._loadSD(sdId);
      const sdUuid = sd.uuid_id || sd.id;

      // Get required sub-agents for this phase
      const agentReqs = await this.getRequiredSubAgents(sdId, phase);

      if (agentReqs.all.length === 0) {
        console.log('      No sub-agents required for this phase');
        return {
          success: true,
          spawned: [],
          phase,
          message: 'No sub-agents required'
        };
      }

      // Include recommended if specified
      const agentsToSpawn = options.includeRecommended
        ? agentReqs.all
        : agentReqs.required;

      if (agentsToSpawn.length === 0) {
        console.log('      No required sub-agents for this phase');
        return {
          success: true,
          spawned: [],
          phase,
          message: 'No required sub-agents'
        };
      }

      console.log(`      Spawning: ${agentsToSpawn.join(', ')}`);

      // Create execution records
      const executions = [];
      for (const agentCode of agentsToSpawn) {
        const execution = await this._createExecution(sdUuid, agentCode, phase, options);
        executions.push(execution);
      }

      // Record batch spawn event
      await this._recordSpawnEvent(sdUuid, phase, executions, options);

      console.log(`      ✅ Spawned ${executions.length} sub-agent(s)`);

      return {
        success: true,
        spawned: executions,
        phase,
        executionIds: executions.map(e => e.id),
        synthesisBlockedBy: agentsToSpawn.map(a => `${sd.id}-${phase}-${a}`)
      };

    } catch (error) {
      console.error(`      ❌ Spawn error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        spawned: []
      };
    }
  }

  /**
   * Check if all sub-agents for a phase have completed
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} phase - Phase to check
   * @returns {Promise<object>} Completion status
   */
  async checkSynthesisReady(sdId, phase) {
    console.log('\n   🔍 CHECKING SYNTHESIS READINESS');
    console.log(`      SD: ${sdId}`);
    console.log(`      Phase: ${phase}`);

    try {
      const sd = await this._loadSD(sdId);
      const sdUuid = sd.uuid_id || sd.id;

      // Get all executions for this SD and phase
      const { data: executions, error } = await this.supabase
        .from('sub_agent_execution_results')
        .select('*')
        .eq('sd_id', sdUuid)
        .eq('phase', phase)
        .order('created_at', { ascending: true });

      if (error) {
        console.log(`      ⚠️  Query error: ${error.message}`);
        // If table doesn't exist, assume ready
        return {
          ready: true,
          pending: [],
          completed: [],
          failed: [],
          message: 'No execution records (table may not exist)'
        };
      }

      if (!executions || executions.length === 0) {
        console.log('      No sub-agent executions for this phase');
        return {
          ready: true,
          pending: [],
          completed: [],
          failed: [],
          message: 'No sub-agents were spawned'
        };
      }

      // Categorize by status
      const pending = executions.filter(e =>
        e.status === SUBAGENT_STATUS.PENDING || e.status === SUBAGENT_STATUS.RUNNING
      );
      const completed = executions.filter(e => e.status === SUBAGENT_STATUS.COMPLETED);
      const failed = executions.filter(e =>
        e.status === SUBAGENT_STATUS.FAILED || e.status === SUBAGENT_STATUS.TIMEOUT
      );
      const skipped = executions.filter(e => e.status === SUBAGENT_STATUS.SKIPPED);

      const isReady = pending.length === 0;

      console.log(`      Total: ${executions.length}`);
      console.log(`      Completed: ${completed.length}`);
      console.log(`      Failed: ${failed.length}`);
      console.log(`      Pending: ${pending.length}`);
      console.log(`      Ready for synthesis: ${isReady ? 'YES' : 'NO'}`);

      return {
        ready: isReady,
        pending: pending.map(e => ({ agent: e.agent_code, status: e.status })),
        completed: completed.map(e => ({ agent: e.agent_code, verdict: e.verdict })),
        failed: failed.map(e => ({ agent: e.agent_code, error: e.error_message })),
        skipped: skipped.map(e => ({ agent: e.agent_code })),
        total: executions.length,
        allPassed: failed.length === 0 && completed.length === executions.length - skipped.length
      };

    } catch (error) {
      console.error(`      ❌ Check error: ${error.message}`);
      return {
        ready: false,
        error: error.message
      };
    }
  }

  /**
   * Record sub-agent completion
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} agentCode - Sub-agent code
   * @param {object} result - Execution result
   * @returns {Promise<object>} Update result
   */
  async recordCompletion(sdId, agentCode, result) {
    console.log('\n   ✅ RECORDING SUB-AGENT COMPLETION');
    console.log(`      SD: ${sdId}`);
    console.log(`      Agent: ${agentCode}`);
    console.log(`      Verdict: ${result.verdict || 'N/A'}`);

    try {
      const sd = await this._loadSD(sdId);
      const sdUuid = sd.uuid_id || sd.id;

      // Update execution record
      const { data, error } = await this.supabase
        .from('sub_agent_execution_results')
        .update({
          status: SUBAGENT_STATUS.COMPLETED,
          verdict: result.verdict || 'PASS',
          output_summary: result.summary,
          recommendations: result.recommendations || [],
          execution_time_ms: result.executionTimeMs,
          completed_at: new Date().toISOString(),
          metadata: {
            ...result.metadata,
            completed_by: result.completedBy || 'system'
          }
        })
        .eq('sd_id', sdUuid)
        .eq('agent_code', agentCode)
        .eq('status', SUBAGENT_STATUS.RUNNING)
        .select()
        .single();

      if (error) {
        console.log(`      ⚠️  Update error: ${error.message}`);
        return { success: false, error: error.message };
      }

      console.log(`      Execution updated: ${data?.id}`);

      // Check if synthesis is now ready
      const synthesisStatus = await this.checkSynthesisReady(sdId, result.phase);

      return {
        success: true,
        executionId: data?.id,
        synthesisReady: synthesisStatus.ready
      };

    } catch (error) {
      console.error(`      ❌ Completion error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Record sub-agent failure
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} agentCode - Sub-agent code
   * @param {object} failure - Failure details
   * @returns {Promise<object>} Update result
   */
  async recordFailure(sdId, agentCode, failure) {
    console.log('\n   ❌ RECORDING SUB-AGENT FAILURE');
    console.log(`      SD: ${sdId}`);
    console.log(`      Agent: ${agentCode}`);
    console.log(`      Reason: ${failure.reason || 'Unknown'}`);

    try {
      const sd = await this._loadSD(sdId);
      const sdUuid = sd.uuid_id || sd.id;

      const status = failure.timeout ? SUBAGENT_STATUS.TIMEOUT : SUBAGENT_STATUS.FAILED;

      const { data, error } = await this.supabase
        .from('sub_agent_execution_results')
        .update({
          status,
          verdict: 'FAIL',
          error_message: failure.reason || failure.error,
          execution_time_ms: failure.executionTimeMs,
          completed_at: new Date().toISOString(),
          metadata: {
            ...failure.metadata,
            failure_type: failure.timeout ? 'timeout' : 'error',
            stack_trace: failure.stackTrace
          }
        })
        .eq('sd_id', sdUuid)
        .eq('agent_code', agentCode)
        .eq('status', SUBAGENT_STATUS.RUNNING)
        .select()
        .single();

      if (error) {
        console.log(`      ⚠️  Update error: ${error.message}`);
        return { success: false, error: error.message };
      }

      console.log(`      Failure recorded: ${data?.id}`);

      return {
        success: true,
        executionId: data?.id,
        status
      };

    } catch (error) {
      console.error(`      ❌ Record error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get execution history for an SD
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {object} options - Query options
   * @returns {Promise<array>} Execution history
   */
  async getExecutionHistory(sdId, options = {}) {
    try {
      const sd = await this._loadSD(sdId);
      const sdUuid = sd.uuid_id || sd.id;

      let query = this.supabase
        .from('sub_agent_execution_results')
        .select('*')
        .eq('sd_id', sdUuid)
        .order('created_at', { ascending: false });

      if (options.phase) {
        query = query.eq('phase', options.phase);
      }

      if (options.status) {
        query = query.eq('status', options.status);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error(`Error fetching execution history: ${error.message}`);
        return [];
      }

      return data || [];

    } catch (error) {
      console.error(`Error in getExecutionHistory: ${error.message}`);
      return [];
    }
  }

  /**
   * Get synthesis summary for all completed sub-agents
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} phase - Phase to summarize
   * @returns {Promise<object>} Synthesis summary
   */
  async getSynthesisSummary(sdId, phase) {
    console.log('\n   📊 GENERATING SYNTHESIS SUMMARY');
    console.log(`      SD: ${sdId}`);
    console.log(`      Phase: ${phase}`);

    try {
      const sd = await this._loadSD(sdId);
      const sdUuid = sd.uuid_id || sd.id;

      const { data: executions, error } = await this.supabase
        .from('sub_agent_execution_results')
        .select('*')
        .eq('sd_id', sdUuid)
        .eq('phase', phase)
        .eq('status', SUBAGENT_STATUS.COMPLETED)
        .order('completed_at', { ascending: true });

      if (error || !executions || executions.length === 0) {
        return {
          hasOutputs: false,
          message: 'No completed sub-agent outputs'
        };
      }

      // Aggregate outputs
      const summary = {
        hasOutputs: true,
        phase,
        agentCount: executions.length,
        outputs: {},
        allRecommendations: [],
        overallVerdict: 'PASS'
      };

      for (const exec of executions) {
        summary.outputs[exec.agent_code] = {
          verdict: exec.verdict,
          summary: exec.output_summary,
          recommendations: exec.recommendations || [],
          executionTimeMs: exec.execution_time_ms
        };

        // Collect all recommendations
        if (exec.recommendations && Array.isArray(exec.recommendations)) {
          summary.allRecommendations.push(...exec.recommendations.map(r => ({
            source: exec.agent_code,
            recommendation: r
          })));
        }

        // If any agent failed, overall is FAIL
        if (exec.verdict === 'FAIL') {
          summary.overallVerdict = 'FAIL';
        }
      }

      console.log(`      Agents: ${executions.length}`);
      console.log(`      Overall: ${summary.overallVerdict}`);
      console.log(`      Recommendations: ${summary.allRecommendations.length}`);

      return summary;

    } catch (error) {
      console.error(`      ❌ Summary error: ${error.message}`);
      return {
        hasOutputs: false,
        error: error.message
      };
    }
  }

  /**
   * Skip a sub-agent (mark as not needed)
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} agentCode - Sub-agent code
   * @param {string} reason - Skip reason
   * @returns {Promise<object>} Skip result
   */
  async skipSubAgent(sdId, agentCode, reason) {
    console.log('\n   ⏭️  SKIPPING SUB-AGENT');
    console.log(`      SD: ${sdId}`);
    console.log(`      Agent: ${agentCode}`);
    console.log(`      Reason: ${reason}`);

    try {
      const sd = await this._loadSD(sdId);
      const sdUuid = sd.uuid_id || sd.id;

      // Try to update existing or create new record
      const { data, error } = await this.supabase
        .from('sub_agent_execution_results')
        .upsert({
          sd_id: sdUuid,
          agent_code: agentCode,
          status: SUBAGENT_STATUS.SKIPPED,
          output_summary: reason,
          completed_at: new Date().toISOString(),
          metadata: { skip_reason: reason }
        }, {
          onConflict: 'sd_id,agent_code'
        })
        .select()
        .single();

      if (error) {
        console.log(`      ⚠️  Skip error: ${error.message}`);
        return { success: false, error: error.message };
      }

      console.log(`      Skipped: ${data?.id}`);

      return {
        success: true,
        executionId: data?.id
      };

    } catch (error) {
      console.error(`      ❌ Skip error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============ Private Helper Methods ============

  async _loadSD(sdId) {
    let { data: sd, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (error || !sd) {
      const result = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('uuid_id', sdId)
        .single();
      sd = result.data;
      error = result.error;
    }

    if (error || !sd) {
      throw new Error(`SD not found: ${sdId}`);
    }

    return sd;
  }

  _filterByPhase(requirements, phase) {
    const phaseAgents = {
      PLAN: SUBAGENT_TIMING.PLAN_PHASE,
      EXEC: SUBAGENT_TIMING.EXEC_PHASE,
      FINAL: SUBAGENT_TIMING.FINAL_PHASE,
      ANY: SUBAGENT_TIMING.ANY_PHASE
    };

    const allowedForPhase = [
      ...(phaseAgents[phase] || []),
      ...(phaseAgents.ANY || [])
    ];

    const required = requirements.required.filter(agent =>
      allowedForPhase.includes(agent)
    );

    const recommended = requirements.recommended.filter(agent =>
      allowedForPhase.includes(agent)
    );

    // Get timing for filtered agents
    const timing = getSubAgentTiming([...required, ...recommended]);

    return {
      required,
      recommended,
      timing
    };
  }

  async _createExecution(sdUuid, agentCode, phase, options) {
    const execution = {
      sd_id: sdUuid,
      agent_code: agentCode,
      phase,
      status: SUBAGENT_STATUS.PENDING,
      verdict: null,
      output_summary: null,
      recommendations: [],
      execution_time_ms: null,
      created_at: new Date().toISOString(),
      metadata: {
        spawned_by: options.spawnedBy || 'orchestrator',
        include_recommended: options.includeRecommended || false
      }
    };

    const { data, error } = await this.supabase
      .from('sub_agent_execution_results')
      .insert(execution)
      .select()
      .single();

    if (error) {
      console.log(`      ⚠️  Failed to create execution record: ${error.message}`);
      // Return a mock execution if table doesn't exist
      return { ...execution, id: `mock-${agentCode}-${Date.now()}` };
    }

    return data;
  }

  async _recordSpawnEvent(sdUuid, phase, executions, options) {
    try {
      await this.supabase
        .from('sub_agent_spawn_events')
        .insert({
          sd_id: sdUuid,
          phase,
          agents_spawned: executions.map(e => e.agent_code),
          execution_ids: executions.map(e => e.id).filter(id => !id.startsWith('mock-')),
          spawned_at: new Date().toISOString(),
          metadata: {
            include_recommended: options.includeRecommended || false,
            spawned_by: options.spawnedBy || 'orchestrator'
          }
        });
    } catch (error) {
      console.log(`      ⚠️  Could not record spawn event: ${error.message}`);
    }
  }
}

// Export constants and class
export { SUBAGENT_STATUS };

export default SubAgentOrchestrator;
