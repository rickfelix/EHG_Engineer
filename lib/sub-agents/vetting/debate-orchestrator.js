/**
 * Debate Orchestrator for Multi-Model Debate System
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B (FR-1, FR-2, FR-5, FR-6)
 *
 * Orchestrates multi-round debates using 3 distinct LLM provider families.
 * Implements:
 * - Multi-round debate with configurable max rounds
 * - Early stopping on consensus detection
 * - CONST-002 family separation validation
 * - Full transcript persistence
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { getProviderAdapter } from './provider-adapters.js';
import {
  getAllPersonas,
  getPersona,
  buildEvaluationPrompt,
  parsePersonaResponse,
  validatePersonaFamilySeparation
} from './critic-personas.js';

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const DEFAULT_MAX_ROUNDS = 3;
const CONSENSUS_SCORE_DELTA = 15; // Max score difference for consensus
const DEBUG_TRANSCRIPTS = process.env.DEBATE_DEBUG_TRANSCRIPTS === 'true';
const TRANSCRIPT_SNIPPET_LENGTH = 500;

/**
 * Debate Orchestrator Class
 */
export class DebateOrchestrator {
  constructor(options = {}) {
    this.supabase = options.supabase || supabase;
    this.maxRounds = options.maxRounds || DEFAULT_MAX_ROUNDS;
    this.consensusThreshold = options.consensusThreshold || CONSENSUS_SCORE_DELTA;
    this.correlationId = options.correlationId || uuidv4();
  }

  /**
   * Run a full debate for a proposal
   * @param {Object} proposal - The proposal to debate
   * @returns {Object} Debate result with transcript
   */
  async runDebate(proposal) {
    const startTime = Date.now();

    this.log('debate_start', { proposalId: proposal.id, maxRounds: this.maxRounds });

    // Step 1: Check idempotency - don't create duplicate debates
    const canCreate = await this.checkIdempotency(proposal.id);
    if (!canCreate.can_create) {
      this.log('idempotency_skip', {
        proposalId: proposal.id,
        reason: canCreate.reason,
        existingDebateId: canCreate.existing_debate_id
      });
      return {
        success: false,
        skipped: true,
        reason: canCreate.reason,
        existingDebateId: canCreate.existing_debate_id
      };
    }

    // Step 2: Validate CONST-002 family separation
    const const002Result = this.validateConst002();
    if (!const002Result.valid) {
      this.log('const_002_fail', { violations: const002Result.violations });
      return {
        success: false,
        const002Passed: false,
        violations: const002Result.violations
      };
    }

    // Step 3: Create debate record
    const debate = await this.createDebateRecord(proposal.id);
    this.log('debate_created', { debateId: debate.id });

    try {
      // Step 4: Run debate rounds
      let orchestratorSummary = null;
      let consensusReached = false;
      let consensusReason = null;

      for (let roundIndex = 0; roundIndex < this.maxRounds && !consensusReached; roundIndex++) {
        this.log('round_start', { debateId: debate.id, roundIndex });

        // Run all personas for this round
        const roundResult = await this.runRound(
          debate.id,
          roundIndex,
          proposal,
          orchestratorSummary
        );

        // Check for consensus
        const consensusCheck = this.checkConsensus(roundResult.personaOutputs);
        consensusReached = consensusCheck.reached;
        consensusReason = consensusCheck.reason;

        // Store round result
        await this.storeRoundResult(debate.id, roundIndex, roundResult, consensusCheck);

        // Generate orchestrator summary for next round
        if (!consensusReached && roundIndex < this.maxRounds - 1) {
          orchestratorSummary = this.generateOrchestratorSummary(roundResult.personaOutputs, roundIndex);
        }

        this.log('round_complete', {
          debateId: debate.id,
          roundIndex,
          consensusReached,
          consensusReason
        });
      }

      // Step 5: Calculate final verdict
      const finalResult = await this.calculateFinalVerdict(debate.id, consensusReached, consensusReason);

      // Step 6: Update debate record with results
      await this.completeDebate(debate.id, finalResult, Date.now() - startTime);

      this.log('debate_complete', {
        debateId: debate.id,
        finalVerdict: finalResult.verdict,
        finalScore: finalResult.score,
        consensusReached,
        durationMs: Date.now() - startTime
      });

      return {
        success: true,
        debateId: debate.id,
        proposalId: proposal.id,
        const002Passed: true,
        consensusReached,
        consensusReason,
        finalVerdict: finalResult.verdict,
        finalScore: finalResult.score,
        topIssues: finalResult.topIssues,
        recommendedNextSteps: finalResult.recommendedNextSteps,
        roundsCompleted: finalResult.roundsCompleted,
        durationMs: Date.now() - startTime
      };

    } catch (error) {
      // Step 6 (error): Mark debate as failed
      await this.failDebate(debate.id, error);

      this.log('debate_fail', {
        debateId: debate.id,
        error: error.message
      });

      return {
        success: false,
        debateId: debate.id,
        error: error.message
      };
    }
  }

  /**
   * Check if a debate can be created (idempotency)
   */
  async checkIdempotency(proposalId) {
    const { data, error } = await this.supabase.rpc('can_create_debate', {
      p_proposal_id: proposalId
    });

    if (error) {
      // If function doesn't exist, do manual check
      const { data: existing } = await this.supabase
        .from('proposal_debates')
        .select('id, status')
        .eq('proposal_id', proposalId)
        .in('status', ['running', 'completed'])
        .limit(1);

      if (existing && existing.length > 0) {
        return {
          can_create: false,
          reason: 'existing_debate',
          existing_debate_id: existing[0].id
        };
      }
      return { can_create: true };
    }

    return data;
  }

  /**
   * Validate CONST-002 family separation
   */
  validateConst002() {
    return validatePersonaFamilySeparation();
  }

  /**
   * Create initial debate record
   */
  async createDebateRecord(proposalId) {
    const { data, error } = await this.supabase
      .from('proposal_debates')
      .insert({
        proposal_id: proposalId,
        status: 'running',
        started_at: new Date().toISOString(),
        max_rounds: this.maxRounds,
        consensus_threshold: this.consensusThreshold,
        correlation_id: this.correlationId,
        const_002_passed: true,
        const_002_result: { validated_at: new Date().toISOString(), families: ['anthropic', 'openai', 'google'] }
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create debate record: ${error.message}`);
    }

    return data;
  }

  /**
   * Run a single debate round
   */
  async runRound(debateId, roundIndex, proposal, orchestratorSummary) {
    const personas = getAllPersonas();
    const personaOutputs = {};
    const providerCalls = [];

    // Run personas in parallel
    const promises = personas.map(async (persona) => {
      const startTime = Date.now();
      this.log('persona_call_start', {
        debateId,
        roundIndex,
        persona: persona.id,
        provider: persona.provider
      });

      try {
        const adapter = getProviderAdapter(persona.provider, { model: persona.model });
        const userPrompt = buildEvaluationPrompt(proposal, orchestratorSummary);

        const response = await adapter.complete(persona.systemPrompt, userPrompt);
        const parsed = parsePersonaResponse(response.content);

        const durationMs = Date.now() - startTime;

        this.log('persona_call_end', {
          debateId,
          roundIndex,
          persona: persona.id,
          provider: persona.provider,
          model: response.model,
          durationMs,
          verdict: parsed.verdict,
          score: parsed.score
        });

        return {
          personaId: persona.id,
          output: {
            ...parsed,
            provider: response.provider,
            family: response.family,
            model: response.model,
            durationMs,
            tokensUsed: response.usage
          },
          providerCall: {
            persona: persona.id,
            provider: response.provider,
            model: response.model,
            duration_ms: durationMs,
            tokens_used: response.usage
          }
        };
      } catch (error) {
        const durationMs = Date.now() - startTime;

        this.log('persona_call_error', {
          debateId,
          roundIndex,
          persona: persona.id,
          error: error.message,
          durationMs
        });

        return {
          personaId: persona.id,
          output: {
            verdict: 'revise',
            score: 50,
            rationale: `Provider call failed: ${error.message}`,
            change_requests: ['Provider call failed - retry required'],
            provider: persona.provider,
            model: persona.model,
            durationMs,
            error: error.message
          },
          providerCall: {
            persona: persona.id,
            provider: persona.provider,
            model: persona.model,
            duration_ms: durationMs,
            error: error.message
          }
        };
      }
    });

    const results = await Promise.all(promises);

    for (const result of results) {
      personaOutputs[result.personaId] = result.output;
      providerCalls.push(result.providerCall);
    }

    return { personaOutputs, providerCalls };
  }

  /**
   * Check if consensus is reached
   */
  checkConsensus(personaOutputs) {
    const verdicts = Object.values(personaOutputs).map(o => o.verdict);
    const scores = Object.values(personaOutputs).map(o => o.score);

    // Count verdicts
    const verdictCounts = {};
    for (const v of verdicts) {
      verdictCounts[v] = (verdictCounts[v] || 0) + 1;
    }

    // Find majority verdict (at least 2 of 3)
    const majorityVerdict = Object.entries(verdictCounts)
      .find(([_, count]) => count >= 2)?.[0];

    if (!majorityVerdict) {
      return { reached: false, reason: 'no_majority_verdict' };
    }

    // Check score delta
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const scoreDelta = maxScore - minScore;

    if (scoreDelta > this.consensusThreshold) {
      return {
        reached: false,
        reason: `score_delta_too_high: ${scoreDelta} > ${this.consensusThreshold}`
      };
    }

    return {
      reached: true,
      reason: `consensus: ${majorityVerdict} (${verdictCounts[majorityVerdict]}/3), score_delta=${scoreDelta}`,
      majorityVerdict,
      scoreDelta
    };
  }

  /**
   * Generate orchestrator summary for next round
   */
  generateOrchestratorSummary(personaOutputs, roundIndex) {
    const summaries = [];

    for (const [personaId, output] of Object.entries(personaOutputs)) {
      const persona = getPersona(personaId);
      summaries.push(`**${persona.name} (${personaId}):**
- Verdict: ${output.verdict.toUpperCase()}
- Score: ${output.score}/100
- Key points: ${output.rationale.substring(0, 200)}...
- Change requests: ${output.change_requests.slice(0, 2).join('; ') || 'None'}`);
    }

    return `## Round ${roundIndex + 1} Summary

${summaries.join('\n\n')}

---
Consider the feedback from your fellow critics and update your assessment if warranted.`;
  }

  /**
   * Store round result in database
   */
  async storeRoundResult(debateId, roundIndex, roundResult, consensusCheck) {
    const { error } = await this.supabase
      .from('proposal_debate_rounds')
      .insert({
        debate_id: debateId,
        round_index: roundIndex,
        persona_outputs: roundResult.personaOutputs,
        orchestrator_summary: this.generateOrchestratorSummary(roundResult.personaOutputs, roundIndex),
        consensus_check: consensusCheck,
        provider_calls: roundResult.providerCalls,
        completed_at: new Date().toISOString()
      });

    if (error) {
      console.error('[DebateOrchestrator] Failed to store round result:', error.message);
    }
  }

  /**
   * Calculate final verdict from all rounds
   */
  async calculateFinalVerdict(debateId, consensusReached, consensusReason) {
    // Get all rounds
    const { data: rounds, error } = await this.supabase
      .from('proposal_debate_rounds')
      .select('*')
      .eq('debate_id', debateId)
      .order('round_index', { ascending: true });

    if (error || !rounds || rounds.length === 0) {
      throw new Error('No rounds found for verdict calculation');
    }

    const lastRound = rounds[rounds.length - 1];
    const personaOutputs = lastRound.persona_outputs;

    // Calculate weighted average score (equal weights)
    const scores = Object.values(personaOutputs).map(o => o.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Determine final verdict
    let finalVerdict;
    if (consensusReached) {
      // Use majority verdict from consensus
      const verdicts = Object.values(personaOutputs).map(o => o.verdict);
      const verdictCounts = {};
      for (const v of verdicts) {
        verdictCounts[v] = (verdictCounts[v] || 0) + 1;
      }
      finalVerdict = Object.entries(verdictCounts)
        .sort((a, b) => b[1] - a[1])[0][0];
    } else {
      // Tie-break: use score-based verdict
      if (avgScore >= 70) finalVerdict = 'approve';
      else if (avgScore >= 50) finalVerdict = 'revise';
      else finalVerdict = 'reject';
    }

    // Collect top issues (max 5)
    const allChangeRequests = Object.values(personaOutputs)
      .flatMap(o => o.change_requests || []);
    const topIssues = [...new Set(allChangeRequests)].slice(0, 5);

    // Generate recommended next steps
    const recommendedNextSteps = this.generateNextSteps(finalVerdict, topIssues);

    return {
      verdict: finalVerdict,
      score: Math.round(avgScore * 100) / 100,
      topIssues,
      recommendedNextSteps,
      roundsCompleted: rounds.length,
      consensusReached,
      consensusReason
    };
  }

  /**
   * Generate recommended next steps based on verdict
   */
  generateNextSteps(verdict, topIssues) {
    switch (verdict) {
      case 'approve':
        return ['Proceed with implementation', 'Monitor for issues during rollout'];
      case 'revise':
        return [
          'Address the identified issues',
          ...topIssues.slice(0, 3).map(issue => `Resolve: ${issue}`),
          'Resubmit for another debate round'
        ];
      case 'reject':
        return [
          'Do not proceed with implementation',
          'Consider fundamental redesign if the proposal is still valuable',
          'Consult with stakeholders on alternative approaches'
        ];
      default:
        return ['Review debate transcript for details'];
    }
  }

  /**
   * Mark debate as completed
   */
  async completeDebate(debateId, result, _durationMs) {
    const { error } = await this.supabase
      .from('proposal_debates')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        actual_rounds: result.roundsCompleted,
        consensus_reached: result.consensusReached,
        consensus_reason: result.consensusReason,
        final_verdict: result.verdict,
        final_score: result.score,
        top_issues: result.topIssues,
        recommended_next_steps: result.recommendedNextSteps
      })
      .eq('id', debateId);

    if (error) {
      console.error('[DebateOrchestrator] Failed to complete debate:', error.message);
    }
  }

  /**
   * Mark debate as failed
   */
  async failDebate(debateId, error) {
    await this.supabase
      .from('proposal_debates')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_code: error.code || 'UNKNOWN_ERROR',
        error_message: error.message
      })
      .eq('id', debateId);
  }

  /**
   * Structured logging
   */
  log(eventType, data) {
    const logEntry = {
      correlation_id: this.correlationId,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      ...data
    };

    // Truncate transcript snippets if debug mode disabled
    if (!DEBUG_TRANSCRIPTS && data.rationale) {
      logEntry.rationale = data.rationale.substring(0, TRANSCRIPT_SNIPPET_LENGTH);
    }

    console.log(`[DebateOrchestrator] ${eventType}:`, JSON.stringify(logEntry));
  }
}

/**
 * Trigger a debate for a proposal (convenience function)
 * @param {string} proposalId - UUID of the proposal
 * @param {Object} options - Orchestrator options
 * @returns {Object} Debate result
 */
export async function triggerDebate(proposalId, options = {}) {
  // Fetch proposal
  const { data: proposal, error } = await supabase
    .from('leo_proposals')
    .select('*')
    .eq('id', proposalId)
    .single();

  if (error || !proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }

  // Check proposal status
  if (proposal.status !== 'submitted') {
    return {
      success: false,
      skipped: true,
      reason: `Proposal status is '${proposal.status}', expected 'submitted'`
    };
  }

  const orchestrator = new DebateOrchestrator(options);
  return orchestrator.runDebate(proposal);
}

/**
 * Get debate by ID
 */
export async function getDebate(debateId) {
  const { data, error } = await supabase
    .from('proposal_debates')
    .select(`
      *,
      rounds:proposal_debate_rounds(*)
    `)
    .eq('id', debateId)
    .single();

  if (error) {
    throw new Error(`Failed to get debate: ${error.message}`);
  }

  return data;
}

/**
 * Get latest debate for a proposal
 */
export async function getLatestDebate(proposalId) {
  const { data, error } = await supabase
    .from('proposal_debates')
    .select(`
      *,
      rounds:proposal_debate_rounds(*)
    `)
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get debate: ${error.message}`);
  }

  return data || null;
}

export default DebateOrchestrator;
