#!/usr/bin/env node

/**
 * Agent Event System - Distributed Coordination
 * Implements pub/sub messaging and event-driven workflow
 * Part of LEO Protocol v4.2.0 - Enhanced Sub-Agent System
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import EventEmitter from 'events';
import crypto from 'crypto';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Event Types - Structured categorization
 */
export const EventTypes = {
  // Lifecycle Events
  ANALYSIS_START: 'ANALYSIS_START',
  ANALYSIS_COMPLETE: 'ANALYSIS_COMPLETE',

  // Discovery Events
  FINDING_DETECTED: 'FINDING_DETECTED',
  PATTERN_IDENTIFIED: 'PATTERN_IDENTIFIED',

  // Validation Events
  VALIDATION_PASSED: 'VALIDATION_PASSED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',

  // Coordination Events
  HANDOFF_CREATED: 'HANDOFF_CREATED',
  CONSENSUS_REQUIRED: 'CONSENSUS_REQUIRED',
  HUMAN_REVIEW_REQUIRED: 'HUMAN_REVIEW_REQUIRED',

  // System Events
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  CHECKPOINT: 'CHECKPOINT',
  RECOVERY: 'RECOVERY'
};

/**
 * Priority Levels
 */
export const Priority = {
  CRITICAL: 'CRITICAL',  // Immediate action required
  HIGH: 'HIGH',          // Important but not blocking
  MEDIUM: 'MEDIUM',      // Standard priority
  LOW: 'LOW'             // Informational
};

/**
 * AgentEventBus - Central event coordination
 */
export class AgentEventBus extends EventEmitter {
  constructor(agentCode) {
    super();
    this.agentCode = agentCode;
    this.subscriptions = new Map();
    this.eventQueue = [];
    this.isProcessing = false;
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms

    // Set up real-time subscription
    this.setupRealtimeSubscription();
  }

  /**
   * Subscribe to real-time events from database
   */
  async setupRealtimeSubscription() {
    try {
      // Subscribe to events targeted at this agent
      const subscription = supabase
        .channel(`agent_events_${this.agentCode}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'agent_events',
            filter: `target_agents.cs.{${this.agentCode}}`
          },
          (payload) => this.handleIncomingEvent(payload.new)
        )
        .subscribe();

      console.log(`🔔 Subscribed to events for agent: ${this.agentCode}`);

      // Also subscribe to broadcast events (no specific target)
      const broadcastSub = supabase
        .channel('agent_events_broadcast')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'agent_events',
            filter: 'target_agents.eq.{}'
          },
          (payload) => this.handleIncomingEvent(payload.new)
        )
        .subscribe();

    } catch (error) {
      console.error(`❌ Failed to setup subscription: ${error.message}`);
    }
  }

  /**
   * Publish an event
   */
  async publish(eventType, action, payload, options = {}) {
    const event = {
      event_id: `evt_${crypto.randomBytes(8).toString('hex')}`,
      timestamp: new Date().toISOString(),
      agent_code: this.agentCode,
      event_type: eventType,
      action,
      payload,
      priority: options.priority || Priority.MEDIUM,
      target_agents: options.targetAgents || [],
      requires_acknowledgment: options.requiresAck || false,
      sd_id: options.sdId || null,
      prd_id: options.prdId || null,
      phase: options.phase || null
    };

    // Add to local queue
    this.eventQueue.push(event);

    // Emit locally
    this.emit(eventType, event);

    // Persist to database
    await this.persistEvent(event);

    // Process queue
    await this.processQueue();

    return event.event_id;
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(eventType, handler, options = {}) {
    const subscriptionId = crypto.randomBytes(8).toString('hex');

    const subscription = {
      id: subscriptionId,
      eventType,
      handler,
      filter: options.filter || null,
      priority: options.priority || null
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.on(eventType, handler);

    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      this.removeListener(subscription.eventType, subscription.handler);
      this.subscriptions.delete(subscriptionId);
      return true;
    }
    return false;
  }

  /**
   * Handle incoming event from database
   */
  async handleIncomingEvent(event) {
    console.log(`📨 Received event: ${event.event_type} from ${event.agent_code}`);

    // Check if event requires acknowledgment
    if (event.requires_acknowledgment) {
      await this.acknowledgeEvent(event.event_id);
    }

    // Emit to local handlers
    this.emit(event.event_type, event);

    // Process based on priority
    if (event.priority === Priority.CRITICAL) {
      await this.handleCriticalEvent(event);
    }
  }

  /**
   * Handle critical events immediately
   */
  async handleCriticalEvent(event) {
    console.log(`🚨 CRITICAL EVENT: ${event.action}`);

    // Pause other processing
    this.isProcessing = true;

    try {
      // Handle based on event type
      switch (event.event_type) {
        case EventTypes.VALIDATION_FAILED:
          await this.handleValidationFailure(event);
          break;

        case EventTypes.HUMAN_REVIEW_REQUIRED:
          await this.requestHumanReview(event);
          break;

        case EventTypes.ERROR:
          await this.handleError(event);
          break;

        default:
          console.log(`Processing critical event: ${event.event_type}`);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Persist event to database
   */
  async persistEvent(event, retry = 0) {
    try {
      const { data, error } = await supabase
        .from('agent_events')
        .insert(event)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Event persisted: ${event.event_id}`);
      return data;

    } catch (error) {
      console.error(`❌ Failed to persist event: ${error.message}`);

      // Retry logic
      if (retry < this.maxRetries) {
        console.log(`🔄 Retrying (${retry + 1}/${this.maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.persistEvent(event, retry + 1);
      }

      // Store locally if persist fails
      this.storeFailedEvent(event);
      return null;
    }
  }

  /**
   * Process queued events
   */
  async processQueue() {
    if (this.isProcessing || this.eventQueue.length === 0) return;

    this.isProcessing = true;

    try {
      // Sort by priority
      this.eventQueue.sort((a, b) => {
        const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      // Process events
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        await this.processEvent(event);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process individual event
   */
  async processEvent(event) {
    // Apply filters from subscriptions
    for (const [id, subscription] of this.subscriptions) {
      if (subscription.eventType === event.event_type) {
        // Check filters
        if (subscription.filter && !subscription.filter(event)) {
          continue;
        }

        // Check priority
        if (subscription.priority) {
          const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
          if (priorityOrder[event.priority] > priorityOrder[subscription.priority]) {
            continue;
          }
        }

        // Execute handler
        try {
          await subscription.handler(event);
        } catch (error) {
          console.error(`Handler error for ${event.event_type}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Acknowledge event receipt
   */
  async acknowledgeEvent(eventId) {
    try {
      const { error } = await supabase.rpc('acknowledge_event', {
        p_event_id: eventId,
        p_agent_code: this.agentCode
      });

      if (error) throw error;

      console.log(`✅ Acknowledged event: ${eventId}`);

    } catch (error) {
      console.error(`Failed to acknowledge event: ${error.message}`);
    }
  }

  /**
   * Request consensus from other agents
   */
  async requestConsensus(question, targetAgents, options = {}) {
    const consensusId = `consensus_${crypto.randomBytes(8).toString('hex')}`;

    const event = await this.publish(
      EventTypes.CONSENSUS_REQUIRED,
      `Consensus requested: ${question}`,
      {
        consensusId,
        question,
        options: options.votingOptions || ['APPROVE', 'REJECT', 'ABSTAIN'],
        timeout: options.timeout || 60000, // 1 minute default
        requiredVotes: options.requiredVotes || targetAgents.length,
        threshold: options.threshold || 0.5
      },
      {
        targetAgents,
        priority: Priority.HIGH,
        requiresAck: true
      }
    );

    // Wait for consensus
    return this.waitForConsensus(consensusId, options.timeout || 60000);
  }

  /**
   * Wait for consensus to be reached
   */
  async waitForConsensus(consensusId, timeout) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check consensus status
      const { data: consensus } = await supabase
        .from('agent_coordination_state')
        .select('*')
        .eq('coordination_id', consensusId)
        .single();

      if (consensus && consensus.consensus_reached !== null) {
        return {
          reached: consensus.consensus_reached,
          votes: consensus.votes,
          state: consensus.current_state
        };
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Timeout reached
    return {
      reached: false,
      reason: 'timeout',
      votes: {}
    };
  }

  /**
   * Create checkpoint for recovery
   */
  async createCheckpoint(data, description) {
    const checkpointId = `chk_${crypto.randomBytes(8).toString('hex')}`;

    await this.publish(
      EventTypes.CHECKPOINT,
      description || 'Checkpoint created',
      {
        checkpointId,
        data,
        agent: this.agentCode,
        timestamp: new Date().toISOString()
      },
      {
        priority: Priority.LOW
      }
    );

    // Also update coordination state
    await this.updateCoordinationState({
      checkpoint_data: data,
      last_checkpoint: new Date().toISOString()
    });

    return checkpointId;
  }

  /**
   * Recover from checkpoint
   */
  async recoverFromCheckpoint(checkpointId) {
    try {
      // Find checkpoint event
      const { data: events } = await supabase
        .from('agent_events')
        .select('*')
        .eq('event_type', EventTypes.CHECKPOINT)
        .eq('payload->>checkpointId', checkpointId)
        .single();

      if (!events) {
        throw new Error(`Checkpoint ${checkpointId} not found`);
      }

      const checkpointData = events.payload.data;

      // Emit recovery event
      await this.publish(
        EventTypes.RECOVERY,
        `Recovered from checkpoint ${checkpointId}`,
        {
          checkpointId,
          recoveredData: checkpointData
        },
        {
          priority: Priority.HIGH
        }
      );

      return checkpointData;

    } catch (error) {
      console.error(`Recovery failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Update coordination state
   */
  async updateCoordinationState(updates) {
    try {
      const { error } = await supabase
        .from('agent_coordination_state')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .or(`active_agents.cs.{${this.agentCode}},pending_agents.cs.{${this.agentCode}}`);

      if (error) throw error;

    } catch (error) {
      console.error(`Failed to update coordination state: ${error.message}`);
    }
  }

  /**
   * Handle validation failure
   */
  async handleValidationFailure(event) {
    console.log(`⚠️ Validation failure: ${event.payload.reason || 'Unknown'}`);

    // Store failure for audit
    await supabase
      .from('leo_mandatory_validations')
      .insert({
        sd_id: event.sd_id,
        prd_id: event.prd_id,
        phase: event.phase,
        sub_agent_code: event.agent_code,
        status: 'failed',
        results: event.payload
      });
  }

  /**
   * Request human review
   */
  async requestHumanReview(event) {
    console.log(`👤 Human review requested: ${event.action}`);

    // Could integrate with notification system
    // For now, just log prominently
    console.log('\n' + '='.repeat(50));
    console.log('🚨 HUMAN REVIEW REQUIRED');
    console.log('='.repeat(50));
    console.log(`Reason: ${event.action}`);
    console.log(`Context: ${JSON.stringify(event.payload, null, 2)}`);
    console.log('='.repeat(50) + '\n');
  }

  /**
   * Handle error events
   */
  async handleError(event) {
    console.error(`❌ ERROR from ${event.agent_code}: ${event.action}`);

    // Could trigger recovery procedures
    if (event.payload.recoverable) {
      const checkpoint = event.payload.checkpoint;
      if (checkpoint) {
        console.log(`Attempting recovery from checkpoint: ${checkpoint}`);
        await this.recoverFromCheckpoint(checkpoint);
      }
    }
  }

  /**
   * Store failed events locally for later retry
   */
  storeFailedEvent(event) {
    // In production, this could write to local file or cache
    console.log(`📝 Storing failed event locally: ${event.event_id}`);
    // Implementation would depend on requirements
  }

  /**
   * Get event history
   */
  async getEventHistory(filters = {}) {
    try {
      let query = supabase
        .from('agent_events')
        .select('*')
        .order('timestamp', { ascending: false });

      if (filters.eventType) {
        query = query.eq('event_type', filters.eventType);
      }

      if (filters.agentCode) {
        query = query.eq('agent_code', filters.agentCode);
      }

      if (filters.since) {
        query = query.gte('timestamp', filters.since);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];

    } catch (error) {
      console.error(`Failed to get event history: ${error.message}`);
      return [];
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    // Unsubscribe from all channels
    await supabase.removeAllChannels();

    // Clear subscriptions
    this.subscriptions.clear();

    // Remove all listeners
    this.removeAllListeners();

    console.log(`✅ Cleaned up event bus for ${this.agentCode}`);
  }
}

/**
 * Event Aggregator - Combines events from multiple agents
 */
export class EventAggregator {
  constructor() {
    this.eventBuses = new Map();
  }

  /**
   * Register an agent's event bus
   */
  registerAgent(agentCode) {
    if (!this.eventBuses.has(agentCode)) {
      const bus = new AgentEventBus(agentCode);
      this.eventBuses.set(agentCode, bus);
      return bus;
    }
    return this.eventBuses.get(agentCode);
  }

  /**
   * Get aggregated view of events
   */
  async getAggregatedEvents(filters = {}) {
    const allEvents = [];

    for (const [agentCode, bus] of this.eventBuses) {
      const events = await bus.getEventHistory(filters);
      allEvents.push(...events);
    }

    // Sort by timestamp
    allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return allEvents;
  }

  /**
   * Broadcast event to all agents
   */
  async broadcast(eventType, action, payload, options = {}) {
    const results = [];

    for (const [agentCode, bus] of this.eventBuses) {
      const eventId = await bus.publish(eventType, action, payload, options);
      results.push({ agent: agentCode, eventId });
    }

    return results;
  }

  /**
   * Clean up all event buses
   */
  async cleanup() {
    for (const [agentCode, bus] of this.eventBuses) {
      await bus.cleanup();
    }
    this.eventBuses.clear();
  }
}

// Example usage and testing
async function demonstrateEventSystem() {
  console.log('\n🚀 AGENT EVENT SYSTEM DEMONSTRATION');
  console.log('=' .repeat(50));

  // Create event bus for VALIDATION agent
  const validationBus = new AgentEventBus('VALIDATION');

  // Subscribe to specific events
  const subId = validationBus.subscribe(
    EventTypes.FINDING_DETECTED,
    (event) => {
      console.log(`📍 Finding detected: ${event.action}`);
      console.log(`   Details: ${JSON.stringify(event.payload)}`);
    },
    { priority: Priority.HIGH }
  );

  // Publish various events
  console.log('\n📤 Publishing events...\n');

  // Start analysis
  await validationBus.publish(
    EventTypes.ANALYSIS_START,
    'Beginning codebase validation',
    {
      target: 'src/components',
      patterns: ['dashboard', 'user interface']
    },
    {
      sdId: 'test-sd-123',
      prdId: 'test-prd-456',
      phase: 'LEAD_TO_PLAN'
    }
  );

  // Simulate finding
  await validationBus.publish(
    EventTypes.FINDING_DETECTED,
    'Found existing dashboard implementation',
    {
      location: 'src/client/src/components/Dashboard.jsx',
      confidence: 0.95,
      type: 'duplicate_implementation'
    },
    {
      priority: Priority.HIGH,
      targetAgents: ['LEAD', 'PLAN']
    }
  );

  // Create checkpoint
  const checkpointId = await validationBus.createCheckpoint(
    {
      filesAnalyzed: 42,
      findingsCount: 3,
      currentPhase: 'analysis'
    },
    'Mid-analysis checkpoint'
  );
  console.log(`\n✅ Created checkpoint: ${checkpointId}`);

  // Complete analysis
  await validationBus.publish(
    EventTypes.ANALYSIS_COMPLETE,
    'Validation complete',
    {
      totalFindings: 3,
      criticalIssues: 1,
      recommendation: 'REVIEW_REQUIRED'
    },
    {
      priority: Priority.HIGH,
      requiresAck: true
    }
  );

  // Demonstrate consensus request (mock)
  console.log('\n🤝 Requesting consensus...');
  const consensus = await validationBus.requestConsensus(
    'Should we proceed with implementation given existing code?',
    ['LEAD', 'PLAN', 'SECURITY'],
    {
      votingOptions: ['PROCEED', 'BLOCK', 'MODIFY'],
      threshold: 0.66,
      timeout: 5000
    }
  );
  console.log(`Consensus result: ${JSON.stringify(consensus)}`);

  // Get event history
  console.log('\n📜 Event History:');
  const history = await validationBus.getEventHistory({
    limit: 5,
    eventType: EventTypes.FINDING_DETECTED
  });

  history.forEach(event => {
    console.log(`  - [${event.timestamp}] ${event.event_type}: ${event.action}`);
  });

  // Clean up
  await validationBus.cleanup();

  console.log('\n✅ Event system demonstration complete');
}

// Export for use in other modules
export default {
  AgentEventBus,
  EventAggregator,
  EventTypes,
  Priority
};

// Run demonstration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateEventSystem().catch(error => {
    console.error('❌ Demonstration failed:', error);
    process.exit(1);
  });
}