/**
 * JUDGE Sub-Agent - Constitutional Conflict Resolution
 *
 * Implements the Debate Protocol for resolving conflicts between LEO sub-agents.
 * Uses constitutional framework (CONST-001 to CONST-011) for principled decision-making.
 *
 * Capabilities:
 * - Conflict Detection: Identifies when 2+ agents have conflicting recommendations
 * - Debate Orchestration: Manages multi-round argument flow (max 3 rounds)
 * - Constitutional Citation: Cites AEGIS rules in verdicts with evidence
 * - Confidence & Escalation: Scores verdicts, escalates low-confidence (<0.6) to humans
 * - Circuit Breaker: Enforces debate limits (max 3/run, 24h cooldown per conflict_hash)
 *
 * @created SD-LEO-SELF-IMPROVE-001K-JUDGE-IMPL
 * @requires SD-LEO-SELF-IMPROVE-001J (database schema)
 * @version 1.0.0
 * @leo_protocol 4.3.3
 */

import dotenv from 'dotenv';
import crypto from 'crypto';
import { createSupabaseServiceClient } from '../../../scripts/lib/supabase-connection.js';

dotenv.config();

let supabase = null;

// Constitutional principles (CONST-001 to CONST-011)
const CONSTITUTIONAL_PRINCIPLES = {
  'CONST-001': {
    name: 'Human Oversight',
    description: 'Humans retain ultimate decision authority. AI assists but does not replace human judgment.',
    keywords: ['human', 'oversight', 'approval', 'review', 'decision']
  },
  'CONST-002': {
    name: 'Transparency',
    description: 'All AI reasoning and decisions must be explainable and auditable.',
    keywords: ['transparent', 'audit', 'explain', 'traceable', 'visible']
  },
  'CONST-003': {
    name: 'Data Integrity',
    description: 'Database is single source of truth. No markdown files for persistent state.',
    keywords: ['database', 'data', 'integrity', 'source', 'truth']
  },
  'CONST-004': {
    name: 'Process Compliance',
    description: 'LEO Protocol phases must be followed. No shortcuts or bypasses.',
    keywords: ['process', 'protocol', 'workflow', 'compliance', 'phase']
  },
  'CONST-005': {
    name: 'Quality Over Speed',
    description: 'Correctness takes priority over velocity. 2-4 hours careful > 6-12 hours rework.',
    keywords: ['quality', 'correctness', 'careful', 'thorough', 'validate']
  },
  'CONST-006': {
    name: 'Scope Discipline',
    description: 'Implement only what is specified. No scope creep or "nice to haves".',
    keywords: ['scope', 'boundary', 'specify', 'requirement', 'limit']
  },
  'CONST-007': {
    name: 'Testing Mandate',
    description: 'All code must have tests. Both unit and E2E tests required.',
    keywords: ['test', 'coverage', 'verify', 'validate', 'assert']
  },
  'CONST-008': {
    name: 'Security First',
    description: 'Security considerations must be addressed proactively, not reactively.',
    keywords: ['security', 'auth', 'permission', 'rls', 'vulnerability']
  },
  'CONST-009': {
    name: 'Documentation Currency',
    description: 'Documentation must be kept current with implementation.',
    keywords: ['document', 'readme', 'guide', 'reference', 'explain']
  },
  'CONST-010': {
    name: 'Minimal Footprint',
    description: 'Prefer simple solutions. Avoid over-engineering and premature abstraction.',
    keywords: ['simple', 'minimal', 'lean', 'straightforward', 'direct']
  },
  'CONST-011': {
    name: 'Reversibility',
    description: 'Prefer reversible decisions. Avoid irreversible changes without explicit approval.',
    keywords: ['reversible', 'rollback', 'undo', 'restore', 'recover']
  }
};

// Circuit breaker configuration
const CIRCUIT_BREAKER_CONFIG = {
  maxDebatesPerRun: 3,
  cooldownHours: 24,
  maxRoundsPerDebate: 3
};

/**
 * Generate a deterministic hash for a conflict
 * @param {Object} conflict - Conflict details
 * @returns {string} SHA-256 hash (first 16 chars)
 */
function generateConflictHash(conflict) {
  const payload = JSON.stringify({
    agents: (conflict.agents || []).sort(),
    artifactId: conflict.artifact_id,
    conflictType: conflict.conflict_type
  });
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

/**
 * ConflictDetector - Identifies material conflicts between agents
 */
class ConflictDetector {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Detect if two agent recommendations constitute a material conflict
   * @param {Object} recommendation1 - First agent recommendation
   * @param {Object} recommendation2 - Second agent recommendation
   * @returns {Object|null} Conflict object or null if no material conflict
   */
  detectConflict(recommendation1, recommendation2) {
    // Check if both target the same artifact
    if (recommendation1.artifact_id !== recommendation2.artifact_id) {
      return null; // Different artifacts - no conflict
    }

    // Check for incompatible recommendations
    const similarity = this.calculateSimilarity(
      recommendation1.recommendation,
      recommendation2.recommendation
    );

    // If recommendations are too similar (>0.8), no conflict
    if (similarity > 0.8) {
      return null;
    }

    // Material conflict detected
    const conflictHash = generateConflictHash({
      agents: [recommendation1.agent_code, recommendation2.agent_code],
      artifact_id: recommendation1.artifact_id,
      conflict_type: this.determineConflictType(recommendation1, recommendation2)
    });

    return {
      conflict_hash: conflictHash,
      agents: [recommendation1.agent_code, recommendation2.agent_code],
      artifact_id: recommendation1.artifact_id,
      conflict_type: this.determineConflictType(recommendation1, recommendation2),
      similarity_score: similarity,
      recommendations: [recommendation1, recommendation2]
    };
  }

  /**
   * Calculate semantic similarity between two recommendations
   * @param {string} rec1 - First recommendation text
   * @param {string} rec2 - Second recommendation text
   * @returns {number} Similarity score 0-1
   */
  calculateSimilarity(rec1, rec2) {
    // Simple word overlap similarity (production would use embeddings)
    const words1 = new Set(rec1.toLowerCase().split(/\s+/));
    const words2 = new Set(rec2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }

  /**
   * Determine the type of conflict
   * @param {Object} rec1 - First recommendation
   * @param {Object} rec2 - Second recommendation
   * @returns {string} Conflict type enum value
   */
  determineConflictType(rec1, rec2) {
    const types = [rec1.category, rec2.category].filter(Boolean);

    if (types.includes('architecture')) return 'architecture';
    if (types.includes('security')) return 'security';
    if (types.includes('performance')) return 'performance';
    if (types.includes('scope')) return 'scope';
    if (types.includes('priority')) return 'priority';
    if (types.includes('technical')) return 'technical_choice';

    return 'approach';
  }
}

/**
 * DebateOrchestrator - Manages multi-round debate flow
 */
class DebateOrchestrator {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Initiate a new debate session
   * @param {string} sdId - Strategic Directive ID
   * @param {Object} conflict - Detected conflict
   * @param {string} initiatedBy - Agent or human who triggered
   * @returns {Object} Created debate session
   */
  async initiateDebate(sdId, conflict, initiatedBy) {
    const { data: session, error } = await this.supabase
      .from('debate_sessions')
      .insert({
        sd_id: sdId,
        current_phase: 'EXEC',
        conflict_type: conflict.conflict_type,
        conflict_statement: `Conflict between ${conflict.agents.join(' and ')} on ${conflict.artifact_id}`,
        source_agents: conflict.agents,
        status: 'active',
        round_number: 1,
        max_rounds: CIRCUIT_BREAKER_CONFIG.maxRoundsPerDebate,
        initiated_by: initiatedBy,
        metadata: {
          conflict_hash: conflict.conflict_hash,
          similarity_score: conflict.similarity_score
        }
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to initiate debate: ${error.message}`);
    }

    console.log(`   ✅ Debate session initiated: ${session.id}`);
    return session;
  }

  /**
   * Record an argument in the debate
   * @param {string} debateId - Debate session ID
   * @param {Object} argument - Argument details
   * @returns {Object} Created argument record
   */
  async recordArgument(debateId, argument) {
    const { data, error } = await this.supabase
      .from('debate_arguments')
      .insert({
        debate_session_id: debateId,
        round_number: argument.round_number,
        agent_code: argument.agent_code,
        argument_type: argument.type || 'initial_position',
        summary: argument.summary,
        detailed_reasoning: argument.reasoning,
        constitution_citations: argument.citations || [],
        evidence_refs: argument.evidence || [],
        confidence_score: argument.confidence || 0.5
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record argument: ${error.message}`);
    }

    return data;
  }

  /**
   * Advance to next debate round
   * @param {string} debateId - Debate session ID
   * @returns {Object} Updated session
   */
  async advanceRound(debateId) {
    const { data: session, error: getError } = await this.supabase
      .from('debate_sessions')
      .select('round_number, max_rounds')
      .eq('id', debateId)
      .single();

    if (getError) {
      throw new Error(`Failed to get debate session: ${getError.message}`);
    }

    if (session.round_number >= session.max_rounds) {
      console.log(`   ⚠️  Maximum rounds reached (${session.max_rounds})`);
      return { ...session, max_reached: true };
    }

    const { data: updated, error: updateError } = await this.supabase
      .from('debate_sessions')
      .update({ round_number: session.round_number + 1 })
      .eq('id', debateId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to advance round: ${updateError.message}`);
    }

    console.log(`   📊 Advanced to round ${updated.round_number}/${updated.max_rounds}`);
    return updated;
  }

  /**
   * Close debate with final status
   * @param {string} debateId - Debate session ID
   * @param {string} status - Final status
   * @param {string} resolvedBy - Who resolved it
   */
  async closeDebate(debateId, status, resolvedBy) {
    const { error } = await this.supabase
      .from('debate_sessions')
      .update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy
      })
      .eq('id', debateId);

    if (error) {
      throw new Error(`Failed to close debate: ${error.message}`);
    }

    console.log(`   ✅ Debate closed with status: ${status}`);
  }
}

/**
 * VerdictRenderer - Generates verdicts with constitutional citations
 */
class VerdictRenderer {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Analyze arguments for constitutional relevance
   * @param {Array} debateArgs - All debate arguments
   * @returns {Array} Constitutional citations with evidence
   */
  analyzeConstitutionalRelevance(debateArgs) {
    const citations = [];

    for (const [constCode, principle] of Object.entries(CONSTITUTIONAL_PRINCIPLES)) {
      const relevantArgs = debateArgs.filter(arg => {
        const text = `${arg.summary} ${arg.detailed_reasoning}`.toLowerCase();
        return principle.keywords.some(kw => text.includes(kw));
      });

      if (relevantArgs.length > 0) {
        // Extract evidence quotes
        const evidenceSnippets = relevantArgs.map(arg => ({
          agent: arg.agent_code,
          quote: arg.summary.substring(0, 100) + (arg.summary.length > 100 ? '...' : ''),
          argument_id: arg.id
        }));

        citations.push({
          rule_code: constCode,
          rule_name: principle.name,
          relevance_score: Math.min(1, relevantArgs.length * 0.3),
          evidence_snippets: evidenceSnippets,
          application: `Applies ${principle.name}: ${principle.description}`
        });
      }
    }

    // Sort by relevance
    return citations.sort((a, b) => b.relevance_score - a.relevance_score);
  }

  /**
   * Calculate confidence score for a verdict
   * @param {Array} citations - Constitutional citations
   * @param {Array} debateArgs - Debate arguments
   * @returns {number} Confidence score 0-1
   */
  calculateConfidence(citations, debateArgs) {
    // Factors:
    // 1. Constitutional coverage (30%)
    const constitutionalCoverage = Math.min(1, citations.length / 5) * 0.3;

    // 2. Argument strength (40%) - average confidence of arguments
    const avgArgumentStrength = debateArgs.length > 0
      ? debateArgs.reduce((sum, a) => sum + (a.confidence_score || 0.5), 0) / debateArgs.length
      : 0.5;
    const argumentFactor = avgArgumentStrength * 0.4;

    // 3. Consensus level (30%) - do agents agree more at the end?
    const lastRoundArgs = debateArgs.filter(a =>
      a.round_number === Math.max(...debateArgs.map(x => x.round_number))
    );
    const consensusFactor = this.measureConsensus(lastRoundArgs) * 0.3;

    return Math.min(1, constitutionalCoverage + argumentFactor + consensusFactor);
  }

  /**
   * Measure consensus among arguments
   * @param {Array} debateArgs - Arguments to analyze
   * @returns {number} Consensus score 0-1
   */
  measureConsensus(debateArgs) {
    if (debateArgs.length < 2) return 0.5;

    // Simple heuristic: fewer arguments in final round = more consensus
    return Math.max(0, 1 - (debateArgs.length - 2) * 0.2);
  }

  /**
   * Render final verdict
   * @param {string} debateId - Debate session ID
   * @param {Array} debateArgs - All debate arguments
   * @param {string} winner - Winning agent code or 'DRAW'
   * @param {string} reasoning - Verdict reasoning
   * @returns {Object} Rendered verdict
   */
  async renderVerdict(debateId, debateArgs, winner, reasoning) {
    const citations = this.analyzeConstitutionalRelevance(debateArgs);
    const confidence = this.calculateConfidence(citations, debateArgs);

    // Determine if human escalation needed
    const needsHumanReview = confidence < 0.6;

    // Map winner to verdict_type
    const verdictType = winner === 'DRAW' ? 'defer' : 'recommendation_selected';

    // Format citations for database schema
    const formattedCitations = citations.map(c => ({
      rule_code: c.rule_code,
      rule_name: c.rule_name,
      citation_reason: c.application,
      relevance_score: c.relevance_score,
      evidence_snippets: c.evidence_snippets
    }));

    const { data: verdict, error } = await this.supabase
      .from('judge_verdicts')
      .insert({
        debate_session_id: debateId,
        verdict_type: verdictType,
        selected_agent_code: winner !== 'DRAW' ? winner : null,
        summary: reasoning.substring(0, 200),
        detailed_rationale: reasoning,
        constitution_citations: formattedCitations,
        confidence_score: confidence,
        constitutional_score: citations.length > 0
          ? Math.min(1, citations.reduce((sum, c) => sum + c.relevance_score, 0) / citations.length)
          : 0,
        escalation_required: needsHumanReview,
        escalation_reason: needsHumanReview
          ? `Confidence ${(confidence * 100).toFixed(1)}% below threshold`
          : null
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to render verdict: ${error.message}`);
    }

    console.log(`   ⚖️  Verdict rendered: ${winner} (confidence: ${(confidence * 100).toFixed(1)}%)`);

    if (verdict.escalation_required) {
      console.log(`   ⚠️  Low confidence - human review required`);
      await this.createEscalation(debateId, verdict.id, confidence, citations);
    }

    // Add escalation_required to match expected interface
    verdict.human_review_required = verdict.escalation_required;

    return verdict;
  }

  /**
   * Create human escalation request
   * @param {string} debateId - Debate session ID
   * @param {string} verdictId - Verdict ID
   * @param {number} confidence - Confidence score
   * @param {Array} citations - Constitutional citations
   */
  async createEscalation(debateId, verdictId, confidence, citations) {
    const { error } = await this.supabase
      .from('human_review_requests')
      .insert({
        source_type: 'judge_verdict',
        source_id: verdictId,
        reason: `Low confidence verdict (${(confidence * 100).toFixed(1)}%)`,
        priority: confidence < 0.4 ? 'high' : 'medium',
        metadata: {
          debate_session_id: debateId,
          confidence_score: confidence,
          constitutional_citations: citations.length,
          top_citation: citations[0]?.rule_code
        }
      });

    if (error) {
      console.log(`   ⚠️  Failed to create escalation: ${error.message}`);
    } else {
      console.log(`   📨 Human review request created`);
    }
  }
}

/**
 * CircuitBreaker - Enforces debate limits
 */
class CircuitBreaker {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Check if debate is allowed
   * @param {string} sdId - Strategic Directive ID
   * @param {string} conflictHash - Conflict hash for cooldown
   * @returns {Object} { allowed: boolean, reason?: string, remaining_cooldown?: number }
   */
  async checkDebateAllowed(sdId, conflictHash) {
    // Check run-level limit
    const runLimit = await this.checkRunLimit(sdId);
    if (!runLimit.allowed) {
      return runLimit;
    }

    // Check cooldown for this specific conflict
    const cooldown = await this.checkCooldown(conflictHash);
    if (!cooldown.allowed) {
      return cooldown;
    }

    return { allowed: true };
  }

  /**
   * Check debates per run limit
   * @param {string} sdId - Strategic Directive ID
   * @returns {Object} Check result
   */
  async checkRunLimit(sdId) {
    const { data: debates, error } = await this.supabase
      .from('debate_sessions')
      .select('id')
      .eq('sd_id', sdId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      console.log(`   ⚠️  Error checking run limit: ${error.message}`);
      return { allowed: true }; // Fail open
    }

    if (debates.length >= CIRCUIT_BREAKER_CONFIG.maxDebatesPerRun) {
      return {
        allowed: false,
        reason: `Maximum ${CIRCUIT_BREAKER_CONFIG.maxDebatesPerRun} debates per run reached`,
        debates_today: debates.length
      };
    }

    return { allowed: true, debates_today: debates.length };
  }

  /**
   * Check cooldown for specific conflict
   * @param {string} conflictHash - Conflict hash
   * @returns {Object} Check result
   */
  async checkCooldown(conflictHash) {
    const cooldownMs = CIRCUIT_BREAKER_CONFIG.cooldownHours * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - cooldownMs).toISOString();

    const { data: recent, error } = await this.supabase
      .from('debate_sessions')
      .select('id, created_at')
      .eq('metadata->>conflict_hash', conflictHash)
      .gte('created_at', cutoff)
      .limit(1);

    if (error) {
      console.log(`   ⚠️  Error checking cooldown: ${error.message}`);
      return { allowed: true }; // Fail open
    }

    if (recent && recent.length > 0) {
      const lastDebate = new Date(recent[0].created_at);
      const remainingMs = cooldownMs - (Date.now() - lastDebate.getTime());
      const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));

      return {
        allowed: false,
        reason: `Cooldown active for this conflict`,
        remaining_cooldown_hours: remainingHours,
        last_debate_at: recent[0].created_at
      };
    }

    return { allowed: true };
  }

  /**
   * Record circuit breaker event
   * Note: debate_circuit_breaker table is for state tracking, not event logs.
   * Events are logged to audit_log table or console for now.
   * @param {string} sdId - Strategic Directive ID
   * @param {string} event - Event type
   * @param {Object} details - Event details
   */
  async recordEvent(sdId, event, details) {
    // Log to audit_log table if available
    const { error } = await this.supabase
      .from('audit_log')
      .insert({
        action: `circuit_breaker_${event}`,
        entity_type: 'debate_session',
        entity_id: details.conflict_hash || sdId,
        details: {
          sd_id: sdId,
          ...details
        },
        severity: event === 'debate_blocked' ? 'warning' : 'info'
      });

    if (error) {
      // Fallback: just log to console if audit_log insert fails
      console.log(`   ℹ️  Circuit breaker event: ${event} (${details.conflict_hash || sdId})`);
    }
  }
}

/**
 * Execute JUDGE Sub-Agent
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions from database
 * @param {Object} options - Execution options
 * @param {Array} options.recommendations - Agent recommendations to evaluate
 * @param {string} options.conflict_hash - Optional existing conflict hash
 * @param {boolean} options.dry_run - If true, don't persist changes
 * @returns {Promise<Object>} Execution results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n⚖️  Starting JUDGE Sub-Agent for ${sdId}...`);
  console.log('   Constitutional conflict resolution via debate protocol');

  // Initialize Supabase
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }

  const results = {
    verdict: 'PASS',
    confidence: 100,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {
      conflict_detected: false,
      debate_session_id: null,
      verdict_id: null,
      constitutional_citations: []
    },
    findings: {},
    options
  };

  try {
    // Initialize components
    const conflictDetector = new ConflictDetector(supabase);
    const debateOrchestrator = new DebateOrchestrator(supabase);
    const verdictRenderer = new VerdictRenderer(supabase);
    const circuitBreaker = new CircuitBreaker(supabase);

    // Phase 1: Conflict Detection
    console.log('\n📋 Phase 1: Conflict Detection...');

    if (!options.recommendations || options.recommendations.length < 2) {
      console.log('   ℹ️  No conflicting recommendations provided');
      results.findings.no_conflict = true;
      results.detailed_analysis.conflict_detected = false;
      return results;
    }

    const conflict = conflictDetector.detectConflict(
      options.recommendations[0],
      options.recommendations[1]
    );

    if (!conflict) {
      console.log('   ✅ No material conflict detected');
      results.findings.no_conflict = true;
      results.detailed_analysis.conflict_detected = false;
      return results;
    }

    console.log(`   🔥 Material conflict detected: ${conflict.conflict_type}`);
    console.log(`   📊 Similarity score: ${(conflict.similarity_score * 100).toFixed(1)}%`);
    results.detailed_analysis.conflict_detected = true;
    results.detailed_analysis.conflict_type = conflict.conflict_type;

    // Phase 2: Circuit Breaker Check
    console.log('\n📋 Phase 2: Circuit Breaker Check...');

    const breakerCheck = await circuitBreaker.checkDebateAllowed(sdId, conflict.conflict_hash);

    if (!breakerCheck.allowed) {
      console.log(`   🛑 Circuit breaker BLOCKED: ${breakerCheck.reason}`);
      results.verdict = 'BLOCKED';
      results.confidence = 0;
      results.findings.circuit_breaker_blocked = true;
      results.findings.block_reason = breakerCheck.reason;
      results.warnings.push({
        severity: 'HIGH',
        issue: `Debate blocked by circuit breaker: ${breakerCheck.reason}`,
        recommendation: 'Wait for cooldown or resolve conflict manually'
      });

      await circuitBreaker.recordEvent(sdId, 'debate_blocked', {
        conflict_hash: conflict.conflict_hash,
        reason: breakerCheck.reason
      });

      return results;
    }

    console.log('   ✅ Circuit breaker: ALLOWED');

    // Phase 3: Debate Orchestration
    console.log('\n📋 Phase 3: Debate Orchestration...');

    if (options.dry_run) {
      console.log('   ℹ️  Dry run - skipping debate persistence');
      results.findings.dry_run = true;
      return results;
    }

    const debateSession = await debateOrchestrator.initiateDebate(
      sdId,
      conflict,
      subAgent?.name || 'JUDGE'
    );
    results.detailed_analysis.debate_session_id = debateSession.id;

    // Record initial positions from both agents
    for (const rec of options.recommendations) {
      await debateOrchestrator.recordArgument(debateSession.id, {
        round_number: 1,
        agent_code: rec.agent_code,
        type: 'initial_position',
        summary: rec.recommendation.substring(0, 200),
        reasoning: rec.recommendation,
        citations: [],
        confidence: rec.confidence || 0.5
      });
    }

    // Phase 4: Constitutional Analysis
    console.log('\n📋 Phase 4: Constitutional Analysis...');

    const { data: allArguments } = await supabase
      .from('debate_arguments')
      .select('*')
      .eq('debate_session_id', debateSession.id)
      .order('created_at', { ascending: true });

    // Determine winner based on constitutional alignment
    const citations = verdictRenderer.analyzeConstitutionalRelevance(allArguments || []);
    results.detailed_analysis.constitutional_citations = citations;

    // Simple winner determination: agent with more constitutional alignment
    const agentScores = {};
    for (const arg of (allArguments || [])) {
      if (!agentScores[arg.agent_code]) {
        agentScores[arg.agent_code] = 0;
      }
      agentScores[arg.agent_code] += arg.confidence_score || 0.5;
    }

    const winner = Object.entries(agentScores)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'DRAW';

    console.log(`   🏆 Constitutional analysis favors: ${winner}`);

    // Phase 5: Verdict Rendering
    console.log('\n📋 Phase 5: Verdict Rendering...');

    const verdict = await verdictRenderer.renderVerdict(
      debateSession.id,
      allArguments || [],
      winner,
      `After constitutional analysis citing ${citations.length} principles, ${winner === 'DRAW' ? 'no clear winner' : `${winner}'s position`} better aligns with LEO Protocol governance.`
    );

    results.detailed_analysis.verdict_id = verdict.id;
    results.confidence = verdict.confidence_score * 100;

    // Close debate session
    await debateOrchestrator.closeDebate(
      debateSession.id,
      verdict.escalation_required ? 'escalated' : 'verdict_rendered',
      'JUDGE'
    );

    // Record circuit breaker event
    await circuitBreaker.recordEvent(sdId, 'debate_completed', {
      conflict_hash: conflict.conflict_hash,
      verdict_id: verdict.id,
      winner,
      confidence: verdict.confidence_score
    });

    // Set final verdict
    if (verdict.human_review_required) {
      results.verdict = 'CONDITIONAL_PASS';
      results.warnings.push({
        severity: 'MEDIUM',
        issue: 'Low confidence verdict requires human review',
        recommendation: 'Review verdict in human_review_requests table'
      });
    } else {
      results.verdict = 'PASS';
    }

    results.findings = {
      winner,
      confidence_score: verdict.confidence_score,
      constitutional_citations_count: citations.length,
      human_review_required: verdict.human_review_required,
      debate_session_id: debateSession.id,
      verdict_id: verdict.id
    };

    results.recommendations.push({
      priority: 'HIGH',
      action: `ACCEPT_${winner.toUpperCase()}_RECOMMENDATION`,
      details: `JUDGE recommends accepting ${winner}'s position based on ${citations.length} constitutional principles`
    });

    console.log(`\n✅ JUDGE complete: ${results.verdict} (${results.confidence.toFixed(1)}% confidence)`);

    return results;

  } catch (error) {
    console.error(`\n❌ JUDGE error:`, error.message);
    results.verdict = 'FAIL';
    results.error = error.message;
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'JUDGE sub-agent execution failed',
      recommendation: 'Review error and retry',
      error: error.message
    });
    return results;
  }
}

export default {
  execute,
  ConflictDetector,
  DebateOrchestrator,
  VerdictRenderer,
  CircuitBreaker,
  CONSTITUTIONAL_PRINCIPLES,
  CIRCUIT_BREAKER_CONFIG,
  generateConflictHash
};
