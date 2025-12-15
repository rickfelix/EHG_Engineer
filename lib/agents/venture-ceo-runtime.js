/**
 * VentureCEORuntime - Autonomous message processing loop for CEO agents
 *
 * SD-VISION-V2-005: Vision V2 Venture CEO Runtime & Factory
 * Spec Reference: docs/vision/specs/06-hierarchical-agent-architecture.md Section 9
 *
 * Runtime loop pattern:
 * 1. Claim message (fn_claim_next_message with FOR UPDATE SKIP LOCKED)
 * 2. Route to handler
 * 3. Execute handler
 * 4. Commit result
 * 5. Emit outbound messages
 * 6. Run supervisor timers (deadline watchdog)
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

/**
 * CEO Handler Registry - Maps message types to handler functions
 * Based on spec Section 9.5
 */
const CEO_HANDLERS = {
  task_delegation: 'handleCEOTaskDelegation',
  task_completion: 'handleCEOTaskCompletion',
  status_report: 'handleCEOStatusReport',
  escalation: 'handleCEOEscalation',
  query: 'handleCEOQuery',
  response: 'handleCEOResponse'
};

/**
 * VentureCEORuntime - Runtime for CEO agent message processing
 */
export class VentureCEORuntime {
  constructor(options = {}) {
    this.supabase = options.supabaseClient || createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.agentId = options.agentId;
    this.ventureId = options.ventureId;
    this.pollIntervalMs = options.pollIntervalMs || 5000;
    this.deadlineCheckIntervalMs = options.deadlineCheckIntervalMs || 60000;

    this.isRunning = false;
    this.messagesProcessed = 0;
    this.lastDeadlineCheck = Date.now();
    this.agentContext = null;
  }

  /**
   * Start the agent runtime loop
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️  Runtime already running');
      return;
    }

    console.log(`\n🤖 CEO Runtime starting for agent ${this.agentId}`);
    console.log('='.repeat(50));

    // Load agent context
    await this._loadAgentContext();

    this.isRunning = true;
    this.runAgentLoop();
  }

  /**
   * Stop the agent runtime loop
   */
  stop() {
    console.log('\n🛑 Stopping CEO Runtime...');
    this.isRunning = false;
  }

  /**
   * Main runtime loop - processes messages and runs supervisor timers
   */
  async runAgentLoop() {
    while (this.isRunning) {
      try {
        // Step 1: Claim next message
        const message = await this.claimNextMessage();

        if (message) {
          // Step 2-4: Route, execute, commit
          await this.processMessage(message);
          this.messagesProcessed++;
        }

        // Step 6: Run supervisor timers periodically
        if (Date.now() - this.lastDeadlineCheck >= this.deadlineCheckIntervalMs) {
          await this.runSupervisorTimers();
          this.lastDeadlineCheck = Date.now();
        }

        // Wait before next poll
        await this._sleep(this.pollIntervalMs);

      } catch (error) {
        console.error(`\n❌ Runtime error: ${error.message}`);
        // Continue running despite errors
        await this._sleep(this.pollIntervalMs * 2);
      }
    }

    console.log(`\n📊 Runtime stopped. Messages processed: ${this.messagesProcessed}`);
  }

  /**
   * Claim next message using atomic database operation
   * Uses fn_claim_next_message() for concurrency-safe claiming
   */
  async claimNextMessage() {
    const { data, error } = await this.supabase
      .rpc('fn_claim_next_message', { p_agent_id: this.agentId });

    if (error) {
      if (!error.message.includes('No pending messages')) {
        console.warn(`⚠️  Claim error: ${error.message}`);
      }
      return null;
    }

    if (data) {
      console.log(`\n📨 Claimed message: ${data.subject}`);
      console.log(`   Type: ${data.message_type} | Priority: ${data.priority}`);
    }

    return data;
  }

  /**
   * Process a claimed message
   */
  async processMessage(message) {
    const handlerName = CEO_HANDLERS[message.message_type];

    if (!handlerName) {
      console.warn(`⚠️  No handler for message type: ${message.message_type}`);
      await this._markMessageFailed(message.id, `No handler for type: ${message.message_type}`);
      return;
    }

    const handler = this[handlerName];
    if (!handler) {
      console.warn(`⚠️  Handler ${handlerName} not implemented`);
      await this._markMessageFailed(message.id, `Handler not implemented: ${handlerName}`);
      return;
    }

    try {
      // Execute handler
      const result = await handler.call(this, message);

      // Commit result
      await this._markMessageCompleted(message.id, result);

      // Emit outbound messages if any
      if (result && result.outbound_messages) {
        await this._sendOutboundMessages(result.outbound_messages);
      }

      // Update memory if relevant
      if (result && result.memory_update) {
        await this._updateMemory(result.memory_update);
      }

    } catch (error) {
      console.error(`❌ Handler error: ${error.message}`);
      await this._markMessageFailed(message.id, error.message);
    }
  }

  /**
   * Handler: Task Delegation from EVA or Chairman
   * Decomposes directive into VP tasks
   */
  async handleCEOTaskDelegation(message) {
    console.log('   🎯 Processing task delegation...');

    const { directive, instructions, priority_stage } = message.body || {};
    const outbound_messages = [];

    // Determine which VP should handle based on stage ownership
    const vpAssignment = this._determineVpForStage(priority_stage || 1);

    if (vpAssignment) {
      // Create task delegation to appropriate VP
      outbound_messages.push({
        message_type: 'task_delegation',
        to_agent_id: vpAssignment.vp_id,
        subject: `[DELEGATED] ${directive || message.subject}`,
        body: {
          original_directive: directive,
          instructions: instructions,
          stage: priority_stage,
          delegated_by: 'CEO',
          deadline_hours: 24
        },
        priority: message.priority || 'normal'
      });

      console.log(`   ✅ Delegated to ${vpAssignment.vp_role}`);
    }

    // Send acknowledgement back to sender
    if (message.requires_response) {
      outbound_messages.push({
        message_type: 'response',
        to_agent_id: message.from_agent_id,
        correlation_id: message.correlation_id,
        subject: `[ACK] ${message.subject}`,
        body: {
          status: 'accepted',
          delegated_to: vpAssignment?.vp_role || 'pending_assignment'
        },
        priority: 'normal'
      });
    }

    return {
      status: 'completed',
      delegated_to: vpAssignment?.vp_role,
      outbound_messages,
      memory_update: {
        type: 'decisions',
        content: {
          action: 'task_delegated',
          directive: directive,
          delegated_to: vpAssignment?.vp_role,
          timestamp: new Date().toISOString()
        }
      }
    };
  }

  /**
   * Handler: Task Completion from VP
   * Records completion, potentially advances stage
   */
  async handleCEOTaskCompletion(message) {
    console.log('   ✅ Processing task completion...');

    const { stage_completed, artifacts, key_decisions, ready_for_handoff } = message.body || {};

    // Update memory with completion
    const memory_update = {
      type: 'context',
      content: {
        action: 'stage_progress',
        stage: stage_completed,
        completed_by: message.from_agent_id,
        artifacts_received: artifacts?.length || 0,
        timestamp: new Date().toISOString()
      }
    };

    // If VP signals ready for handoff, CEO can review and commit
    if (ready_for_handoff && stage_completed) {
      console.log(`   📋 Stage ${stage_completed} ready for handoff review`);

      // Import state machine for stage transition
      // This will be handled by venture-state-machine.js
      return {
        status: 'completed',
        stage_ready_for_commit: stage_completed,
        handoff_pending: true,
        memory_update
      };
    }

    return {
      status: 'completed',
      stage_progress_recorded: true,
      memory_update
    };
  }

  /**
   * Handler: Status Report from VP
   * Updates CEO memory with VP status
   */
  async handleCEOStatusReport(message) {
    console.log('   📊 Processing status report...');

    const { vp_role, current_stage, progress_percent, blockers } = message.body || {};

    return {
      status: 'completed',
      memory_update: {
        type: 'context',
        content: {
          action: 'status_update',
          vp_role: vp_role,
          current_stage: current_stage,
          progress: progress_percent,
          blockers: blockers,
          timestamp: new Date().toISOString()
        }
      }
    };
  }

  /**
   * Handler: Escalation from VP
   * Forwards to EVA if beyond CEO authority
   */
  async handleCEOEscalation(message) {
    console.log('   🚨 Processing escalation...');

    const { severity, issue, requires_chairman } = message.body || {};

    // Check if CEO can handle or needs to escalate to EVA
    const ceoCanHandle = !requires_chairman && severity !== 'critical';

    if (ceoCanHandle) {
      console.log('   ✅ CEO handling escalation');
      return {
        status: 'completed',
        handled_by: 'CEO',
        memory_update: {
          type: 'decisions',
          content: {
            action: 'escalation_handled',
            issue: issue,
            resolution_pending: true,
            timestamp: new Date().toISOString()
          }
        }
      };
    }

    // Forward to EVA
    console.log('   ⬆️  Forwarding to EVA');
    const { data: eva } = await this._getEvaAgent();

    return {
      status: 'completed',
      forwarded_to: 'EVA',
      outbound_messages: [{
        message_type: 'escalation',
        to_agent_id: eva?.id,
        subject: `[ESCALATED FROM CEO] ${message.subject}`,
        body: {
          original_from: message.from_agent_id,
          original_issue: issue,
          severity: severity,
          ceo_notes: 'Beyond CEO authority, forwarding to EVA'
        },
        priority: 'critical'
      }]
    };
  }

  /**
   * Handler: Query - Respond to information requests
   */
  async handleCEOQuery(message) {
    console.log('   ❓ Processing query...');

    const { query_type, query_params } = message.body || {};

    // Build response based on query type
    let response_data = {};

    switch (query_type) {
      case 'venture_status':
        response_data = await this._getVentureStatus();
        break;
      case 'vp_status':
        response_data = await this._getVpStatuses();
        break;
      default:
        response_data = { error: `Unknown query type: ${query_type}` };
    }

    return {
      status: 'completed',
      outbound_messages: [{
        message_type: 'response',
        to_agent_id: message.from_agent_id,
        correlation_id: message.correlation_id,
        subject: `[RESPONSE] ${message.subject}`,
        body: response_data,
        priority: 'normal'
      }]
    };
  }

  /**
   * Handler: Response - Process response to previous query
   */
  async handleCEOResponse(message) {
    console.log('   📬 Processing response...');

    return {
      status: 'completed',
      memory_update: {
        type: 'context',
        content: {
          action: 'response_received',
          correlation_id: message.correlation_id,
          response_summary: message.subject,
          timestamp: new Date().toISOString()
        }
      }
    };
  }

  /**
   * Run supervisor timers - deadline watchdog
   */
  async runSupervisorTimers() {
    console.log('\n⏰ Running supervisor timers...');

    // Check for overdue messages
    const { data: overdueMessages } = await this.supabase
      .from('agent_messages')
      .select('id, subject, to_agent_id, response_deadline')
      .eq('status', 'pending')
      .lt('response_deadline', new Date().toISOString())
      .limit(10);

    if (overdueMessages && overdueMessages.length > 0) {
      console.log(`   ⚠️  Found ${overdueMessages.length} overdue messages`);

      for (const msg of overdueMessages) {
        // Send reminder or escalate
        await this._handleOverdueMessage(msg);
      }
    } else {
      console.log('   ✅ No overdue messages');
    }

    // Aggregate status for EVA briefing (daily)
    // This would run on a longer interval in production
  }

  // ============ Private Helper Methods ============

  /**
   * Load agent context from database
   */
  async _loadAgentContext() {
    const { data } = await this.supabase
      .from('agent_registry')
      .select('*, agent_memory_stores(*)')
      .eq('id', this.agentId)
      .single();

    this.agentContext = data;
    this.ventureId = data?.venture_id;

    console.log(`   Agent: ${data?.display_name}`);
    console.log(`   Venture: ${this.ventureId}`);
  }

  /**
   * Determine which VP should handle a stage
   */
  _determineVpForStage(stage) {
    // Based on STANDARD_VENTURE_TEMPLATE stage_ownership
    const stageToVp = {
      VP_STRATEGY: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      VP_PRODUCT: [10, 11, 12],
      VP_TECH: [13, 14, 15, 16, 17, 18, 19, 20],
      VP_GROWTH: [21, 22, 23, 24, 25]
    };

    for (const [vpRole, stages] of Object.entries(stageToVp)) {
      if (stages.includes(stage)) {
        return {
          vp_role: vpRole,
          vp_id: this.agentContext?.vp_ids?.[vpRole] || null
        };
      }
    }

    return null;
  }

  /**
   * Get EVA agent
   */
  async _getEvaAgent() {
    return this.supabase
      .from('agent_registry')
      .select('id')
      .eq('agent_type', 'eva')
      .single();
  }

  /**
   * Get venture status
   */
  async _getVentureStatus() {
    const { data } = await this.supabase
      .from('ventures')
      .select('id, name, current_lifecycle_stage, status')
      .eq('id', this.ventureId)
      .single();

    return data || { error: 'Venture not found' };
  }

  /**
   * Get VP statuses
   */
  async _getVpStatuses() {
    const { data } = await this.supabase
      .from('agent_registry')
      .select('id, agent_role, status, token_consumed')
      .eq('venture_id', this.ventureId)
      .eq('agent_type', 'executive');

    return data || [];
  }

  /**
   * Mark message as completed
   */
  async _markMessageCompleted(messageId, result) {
    await this.supabase
      .from('agent_messages')
      .update({
        status: 'completed',
        metadata: { result_summary: result.status }
      })
      .eq('id', messageId);
  }

  /**
   * Mark message as failed
   */
  async _markMessageFailed(messageId, errorMessage) {
    await this.supabase
      .from('agent_messages')
      .update({
        status: 'failed',
        metadata: { error: errorMessage }
      })
      .eq('id', messageId);
  }

  /**
   * Send outbound messages
   */
  async _sendOutboundMessages(messages) {
    for (const msg of messages) {
      const { error } = await this.supabase
        .from('agent_messages')
        .insert({
          ...msg,
          from_agent_id: this.agentId,
          correlation_id: msg.correlation_id || uuidv4(),
          status: 'pending',
          created_at: new Date().toISOString()
        });

      if (error) {
        console.warn(`⚠️  Failed to send message: ${error.message}`);
      }
    }
  }

  /**
   * Update agent memory
   */
  async _updateMemory(update) {
    await this.supabase
      .from('agent_memory_stores')
      .insert({
        agent_id: this.agentId,
        memory_type: update.type,
        content: update.content,
        summary: JSON.stringify(update.content).substring(0, 200),
        version: 1,
        is_current: true,
        importance_score: 0.7
      });
  }

  /**
   * Handle overdue message
   */
  async _handleOverdueMessage(msg) {
    console.log(`   📌 Handling overdue: ${msg.subject}`);
    // Could escalate or send reminder
  }

  /**
   * Sleep helper
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export handler map for reference
export { CEO_HANDLERS };

// Default export
export default VentureCEORuntime;
