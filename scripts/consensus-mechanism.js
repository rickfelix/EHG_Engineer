#!/usr/bin/env node

/**
 * Consensus Mechanism System
 * Implements voting and agreement protocols for multi-agent decisions
 * Part of LEO Protocol v4.2.0 - Enhanced Sub-Agent System
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { AgentEventBus, EventTypes, Priority } from './agent-event-system.js';
import crypto from 'crypto';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Voting options
 */
export const VoteOptions = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  ABSTAIN: 'ABSTAIN',
  CONDITIONAL: 'CONDITIONAL',
  ESCALATE: 'ESCALATE'
};

/**
 * Consensus types
 */
export const ConsensusTypes = {
  SIMPLE_MAJORITY: 'SIMPLE_MAJORITY',      // > 50%
  SUPER_MAJORITY: 'SUPER_MAJORITY',        // >= 66%
  UNANIMOUS: 'UNANIMOUS',                  // 100%
  QUORUM: 'QUORUM',                        // Minimum participation
  WEIGHTED: 'WEIGHTED'                     // Based on agent weights
};

/**
 * ConsensusManager - Manages voting and consensus
 */
export class ConsensusManager {
  constructor(coordinationId = null) {
    this.coordinationId = coordinationId || `consensus_${crypto.randomBytes(8).toString('hex')}`;
    this.eventBus = new AgentEventBus('CONSENSUS');
    this.activeVotes = new Map();
    this.agentWeights = new Map();
    this.setupDefaultWeights();
  }

  /**
   * Set up default agent weights
   */
  setupDefaultWeights() {
    // Critical agents have higher weight
    this.agentWeights.set('SECURITY', 2.0);
    this.agentWeights.set('VALIDATION', 1.5);
    this.agentWeights.set('DATABASE', 1.0);
    this.agentWeights.set('TESTING', 1.0);
    this.agentWeights.set('PERFORMANCE', 0.8);
    this.agentWeights.set('DESIGN', 0.7);
    // Default weight for unknown agents
    this.agentWeights.set('DEFAULT', 1.0);
  }

  /**
   * Create a new consensus request
   */
  async createConsensusRequest(options) {
    const consensusId = `cons_${crypto.randomBytes(8).toString('hex')}`;

    const request = {
      id: consensusId,
      coordination_id: this.coordinationId,
      question: options.question,
      description: options.description || '',
      requester: options.requester,
      target_agents: options.targetAgents,
      consensus_type: options.consensusType || ConsensusTypes.SIMPLE_MAJORITY,
      vote_options: options.voteOptions || Object.values(VoteOptions),
      threshold: options.threshold || 0.5,
      timeout_ms: options.timeout || 60000,
      min_participation: options.minParticipation || 0.5,
      context: options.context || {},
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + (options.timeout || 60000)).toISOString(),
      votes: {},
      status: 'PENDING'
    };

    try {
      // Save to database
      const { data, error } = await supabase
        .from('consensus_requests')
        .insert(request)
        .select()
        .single();

      if (error) throw error;

      // Track active vote
      this.activeVotes.set(consensusId, request);

      // Broadcast consensus request
      await this.eventBus.publish(
        EventTypes.CONSENSUS_REQUIRED,
        `Consensus requested: ${options.question}`,
        {
          consensusId,
          question: options.question,
          voteOptions: request.vote_options,
          deadline: request.expires_at,
          context: options.context
        },
        {
          priority: Priority.HIGH,
          targetAgents: options.targetAgents,
          requiresAck: true
        }
      );

      console.log(`🗳️ Consensus request created: ${consensusId}`);
      console.log(`   Question: ${options.question}`);
      console.log(`   Target agents: ${options.targetAgents.join(', ')}`);

      // Set up timeout handler
      this.setupTimeoutHandler(consensusId, options.timeout || 60000);

      return consensusId;

    } catch (error) {
      console.error(`Failed to create consensus request: ${error.message}`);
      return null;
    }
  }

  /**
   * Cast a vote
   */
  async castVote(consensusId, agentCode, vote, reason = null) {
    const request = this.activeVotes.get(consensusId);
    if (!request) {
      console.error(`Consensus request ${consensusId} not found`);
      return false;
    }

    // Check if agent is authorized to vote
    if (!request.target_agents.includes(agentCode) && !request.target_agents.includes('ALL')) {
      console.error(`Agent ${agentCode} not authorized to vote on ${consensusId}`);
      return false;
    }

    // Check if already voted
    if (request.votes[agentCode]) {
      console.log(`Agent ${agentCode} already voted on ${consensusId}`);
      return false;
    }

    // Validate vote option
    if (!request.vote_options.includes(vote)) {
      console.error(`Invalid vote option: ${vote}`);
      return false;
    }

    try {
      // Record vote
      request.votes[agentCode] = {
        vote,
        reason,
        timestamp: new Date().toISOString(),
        weight: this.agentWeights.get(agentCode) || this.agentWeights.get('DEFAULT')
      };

      // Update database
      await supabase
        .from('consensus_requests')
        .update({
          votes: request.votes,
          updated_at: new Date().toISOString()
        })
        .eq('id', consensusId);

      console.log(`✅ Vote recorded: ${agentCode} voted ${vote} on ${consensusId}`);

      // Check if consensus reached
      const result = await this.evaluateConsensus(consensusId);
      if (result.consensusReached !== null) {
        await this.finalizeConsensus(consensusId, result);
      }

      return true;

    } catch (error) {
      console.error(`Failed to cast vote: ${error.message}`);
      return false;
    }
  }

  /**
   * Evaluate if consensus has been reached
   */
  async evaluateConsensus(consensusId) {
    const request = this.activeVotes.get(consensusId);
    if (!request) return { consensusReached: null };

    const totalAgents = request.target_agents.length;
    const votedAgents = Object.keys(request.votes).length;
    const participationRate = votedAgents / totalAgents;

    // Check minimum participation
    if (participationRate < request.min_participation) {
      return {
        consensusReached: null,
        reason: 'Insufficient participation',
        participationRate,
        votedAgents,
        totalAgents
      };
    }

    // Calculate results based on consensus type
    let result;
    switch (request.consensus_type) {
      case ConsensusTypes.SIMPLE_MAJORITY:
        result = this.calculateSimpleMajority(request.votes);
        break;

      case ConsensusTypes.SUPER_MAJORITY:
        result = this.calculateSuperMajority(request.votes);
        break;

      case ConsensusTypes.UNANIMOUS:
        result = this.calculateUnanimous(request.votes);
        break;

      case ConsensusTypes.WEIGHTED:
        result = this.calculateWeighted(request.votes);
        break;

      case ConsensusTypes.QUORUM:
        result = this.calculateQuorum(request.votes, request.threshold);
        break;

      default:
        result = this.calculateSimpleMajority(request.votes);
    }

    // Check if consensus threshold met
    const consensusReached = result.approvalRate >= request.threshold;

    return {
      consensusReached,
      result: consensusReached ? result.decision : null,
      approvalRate: result.approvalRate,
      voteSummary: result.summary,
      participationRate,
      votedAgents,
      totalAgents
    };
  }

  /**
   * Calculate simple majority
   */
  calculateSimpleMajority(votes) {
    const voteCount = {};
    let totalVotes = 0;

    for (const [agent, voteData] of Object.entries(votes)) {
      if (voteData.vote !== VoteOptions.ABSTAIN) {
        voteCount[voteData.vote] = (voteCount[voteData.vote] || 0) + 1;
        totalVotes++;
      }
    }

    const approvals = voteCount[VoteOptions.APPROVE] || 0;
    const approvalRate = totalVotes > 0 ? approvals / totalVotes : 0;

    return {
      decision: approvalRate > 0.5 ? VoteOptions.APPROVE : VoteOptions.REJECT,
      approvalRate,
      summary: voteCount
    };
  }

  /**
   * Calculate super majority (2/3)
   */
  calculateSuperMajority(votes) {
    const result = this.calculateSimpleMajority(votes);
    result.decision = result.approvalRate >= 0.66 ? VoteOptions.APPROVE : VoteOptions.REJECT;
    return result;
  }

  /**
   * Calculate unanimous decision
   */
  calculateUnanimous(votes) {
    let allApprove = true;
    const voteCount = {};

    for (const [agent, voteData] of Object.entries(votes)) {
      voteCount[voteData.vote] = (voteCount[voteData.vote] || 0) + 1;
      if (voteData.vote !== VoteOptions.APPROVE && voteData.vote !== VoteOptions.ABSTAIN) {
        allApprove = false;
      }
    }

    return {
      decision: allApprove ? VoteOptions.APPROVE : VoteOptions.REJECT,
      approvalRate: allApprove ? 1.0 : 0.0,
      summary: voteCount
    };
  }

  /**
   * Calculate weighted consensus
   */
  calculateWeighted(votes) {
    const weightedVotes = {};
    let totalWeight = 0;

    for (const [agent, voteData] of Object.entries(votes)) {
      if (voteData.vote !== VoteOptions.ABSTAIN) {
        const weight = voteData.weight || 1.0;
        weightedVotes[voteData.vote] = (weightedVotes[voteData.vote] || 0) + weight;
        totalWeight += weight;
      }
    }

    const approvalWeight = weightedVotes[VoteOptions.APPROVE] || 0;
    const approvalRate = totalWeight > 0 ? approvalWeight / totalWeight : 0;

    return {
      decision: approvalRate > 0.5 ? VoteOptions.APPROVE : VoteOptions.REJECT,
      approvalRate,
      summary: weightedVotes
    };
  }

  /**
   * Calculate quorum-based consensus
   */
  calculateQuorum(votes, quorumThreshold) {
    const participationRate = Object.keys(votes).length / this.activeVotes.size;
    if (participationRate < quorumThreshold) {
      return {
        decision: null,
        approvalRate: 0,
        summary: { quorumNotMet: true }
      };
    }
    return this.calculateSimpleMajority(votes);
  }

  /**
   * Finalize consensus
   */
  async finalizeConsensus(consensusId, result) {
    const request = this.activeVotes.get(consensusId);
    if (!request) return;

    try {
      // Update status
      request.status = result.consensusReached ? 'APPROVED' : 'REJECTED';
      request.result = result;
      request.completed_at = new Date().toISOString();

      // Update database
      await supabase
        .from('consensus_requests')
        .update({
          status: request.status,
          result: request.result,
          completed_at: request.completed_at
        })
        .eq('id', consensusId);

      // Update coordination state if exists
      await supabase
        .from('agent_coordination_state')
        .update({
          consensus_reached: result.consensusReached,
          current_state: result.consensusReached ? 'COMPLETED' : 'FAILED',
          updated_at: new Date().toISOString()
        })
        .eq('coordination_id', this.coordinationId);

      // Broadcast result
      await this.eventBus.publish(
        EventTypes.ANALYSIS_COMPLETE,
        `Consensus ${result.consensusReached ? 'reached' : 'failed'}: ${request.question}`,
        {
          consensusId,
          result: result.result,
          approvalRate: result.approvalRate,
          voteSummary: result.voteSummary
        },
        {
          priority: Priority.HIGH,
          targetAgents: request.target_agents
        }
      );

      // Remove from active votes
      this.activeVotes.delete(consensusId);

      console.log(`\n${'='.repeat(50)}`);
      console.log(`🎯 CONSENSUS ${result.consensusReached ? 'REACHED' : 'FAILED'}`);
      console.log(`${'='.repeat(50)}`);
      console.log(`Question: ${request.question}`);
      console.log(`Result: ${result.result || 'No decision'}`);
      console.log(`Approval rate: ${(result.approvalRate * 100).toFixed(1)}%`);
      console.log(`Participation: ${result.votedAgents}/${result.totalAgents} agents`);
      console.log(`${'='.repeat(50)}\n`);

    } catch (error) {
      console.error(`Failed to finalize consensus: ${error.message}`);
    }
  }

  /**
   * Set up timeout handler
   */
  setupTimeoutHandler(consensusId, timeout) {
    setTimeout(async () => {
      const request = this.activeVotes.get(consensusId);
      if (request && request.status === 'PENDING') {
        console.log(`⏰ Consensus timeout for ${consensusId}`);

        // Evaluate with current votes
        const result = await this.evaluateConsensus(consensusId);

        // Force finalization
        await this.finalizeConsensus(consensusId, {
          ...result,
          consensusReached: false,
          reason: 'Timeout'
        });
      }
    }, timeout);
  }

  /**
   * Get consensus status
   */
  async getConsensusStatus(consensusId) {
    const request = this.activeVotes.get(consensusId);
    if (request) {
      return request;
    }

    // Try database
    const { data } = await supabase
      .from('consensus_requests')
      .select('*')
      .eq('id', consensusId)
      .single();

    return data;
  }

  /**
   * Simulate agent votes for testing
   */
  async simulateVotes(consensusId, voteDistribution = {}) {
    const request = this.activeVotes.get(consensusId);
    if (!request) return;

    const defaultDistribution = {
      APPROVE: 0.6,
      REJECT: 0.2,
      ABSTAIN: 0.1,
      CONDITIONAL: 0.1
    };

    const distribution = { ...defaultDistribution, ...voteDistribution };

    for (const agent of request.target_agents) {
      // Random vote based on distribution
      const rand = Math.random();
      let cumulative = 0;
      let selectedVote = VoteOptions.ABSTAIN;

      for (const [vote, probability] of Object.entries(distribution)) {
        cumulative += probability;
        if (rand < cumulative) {
          selectedVote = vote;
          break;
        }
      }

      await this.castVote(consensusId, agent, selectedVote, 'Simulated vote');

      // Small delay to simulate real voting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Create database tables
async function createConsensusTables() {
  const sql = `
    -- Consensus requests table
    CREATE TABLE IF NOT EXISTS consensus_requests (
      id TEXT PRIMARY KEY,
      coordination_id TEXT,
      question TEXT NOT NULL,
      description TEXT,
      requester TEXT,
      target_agents TEXT[],
      consensus_type TEXT,
      vote_options TEXT[],
      threshold FLOAT,
      timeout_ms INTEGER,
      min_participation FLOAT,
      context JSONB,
      votes JSONB DEFAULT '{}',
      status TEXT DEFAULT 'PENDING',
      result JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP,
      completed_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_consensus_coordination
    ON consensus_requests(coordination_id);

    CREATE INDEX IF NOT EXISTS idx_consensus_status
    ON consensus_requests(status);

    CREATE INDEX IF NOT EXISTS idx_consensus_created
    ON consensus_requests(created_at DESC);
  `;

  console.log('Consensus tables SQL generated (run via migration)');
  return sql;
}

// Demonstration
async function demonstrateConsensus() {
  console.log('\n🗳️ CONSENSUS MECHANISM DEMONSTRATION');
  console.log('=' .repeat(50));

  const manager = new ConsensusManager();

  // Create a consensus request
  const consensusId = await manager.createConsensusRequest({
    question: 'Should we proceed with the dashboard implementation?',
    description: 'Validation found potential conflicts that need team consensus',
    requester: 'VALIDATION',
    targetAgents: ['SECURITY', 'DATABASE', 'TESTING', 'DESIGN', 'PERFORMANCE'],
    consensusType: ConsensusTypes.SUPER_MAJORITY,
    threshold: 0.66,
    timeout: 10000, // 10 seconds for demo
    context: {
      sdId: 'test-sd',
      prdId: 'test-prd',
      conflicts: ['existing dashboard component']
    }
  });

  if (!consensusId) {
    console.error('Failed to create consensus request');
    return;
  }

  console.log('\n📮 Simulating agent votes...\n');

  // Simulate some votes manually
  await manager.castVote(consensusId, 'SECURITY', VoteOptions.CONDITIONAL,
    'Needs security review before proceeding');
  await manager.castVote(consensusId, 'DATABASE', VoteOptions.APPROVE,
    'No database conflicts detected');
  await manager.castVote(consensusId, 'TESTING', VoteOptions.APPROVE,
    'Test coverage looks adequate');

  // Simulate remaining votes
  await manager.simulateVotes(consensusId, {
    APPROVE: 0.7,
    REJECT: 0.1,
    ABSTAIN: 0.1,
    CONDITIONAL: 0.1
  });

  // Wait for consensus to complete
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get final status
  const status = await manager.getConsensusStatus(consensusId);
  if (status) {
    console.log('\n📊 Final Consensus Status:');
    console.log(`Status: ${status.status}`);
    console.log(`Votes: ${JSON.stringify(status.votes, null, 2)}`);
  }

  console.log('\n✅ Consensus demonstration complete');
}

// Export for use
export default {
  ConsensusManager,
  VoteOptions,
  ConsensusTypes
};

// Run demonstration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateConsensus().catch(error => {
    console.error('❌ Demonstration failed:', error);
    process.exit(1);
  });
}