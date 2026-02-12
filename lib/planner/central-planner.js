/**
 * Central Planner Orchestrator
 *
 * The coordination layer that:
 * 1. Aggregates proposals from clustering, retrospectives, issue patterns, manual feedback
 * 2. Clusters by theme with deterministic ordering
 * 3. Deduplicates similar/duplicate recommendations
 * 4. Ranks with stability checks
 * 5. Returns deterministic queue orderings with reasoning
 *
 * SD: SD-LEO-SELF-IMPROVE-001H (Phase 3b)
 *
 * @module central-planner
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Configuration for the Central Planner
 */
const CONFIG = {
  // Scoring weights (must sum to 1.0)
  WEIGHTS: {
    severity: 0.30,
    impact: 0.25,
    recurrence: 0.20,
    recency: 0.15,
    effort_inverse: 0.10
  },

  // Deduplication
  SIMILARITY_THRESHOLD: 0.65,  // >65% similar = duplicate
  TITLE_SIMILARITY_THRESHOLD: 0.80,  // >80% title match = likely duplicate

  // Stability
  STABILITY_TARGET: 0.85,  // 85% consistency target
  TOP_N_PROTECTED: 5,  // Protect top N from excessive churn
  MAX_POSITION_CHANGE: 3,  // Max positions an item can move without justification

  // Clustering
  MIN_CLUSTER_SIZE: 2,
  MAX_CLUSTERS: 10,

  // Performance
  MAX_PROPOSALS: 500,  // Safety limit

  // Model version
  MODEL_VERSION: '1.0.0'
};

/**
 * Severity scores for standardization
 */
const SEVERITY_SCORES = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
  info: 10
};

/**
 * Urgency bands based on score
 */
function scoreToBand(score) {
  if (score >= 85) return 'P0';
  if (score >= 65) return 'P1';
  if (score >= 40) return 'P2';
  return 'P3';
}

/**
 * Create Supabase client
 */
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Central Planner class
 */
class CentralPlanner {
  constructor(options = {}) {
    this.supabase = options.supabase || getSupabase();
    this.config = { ...CONFIG, ...options.config };
    this.correlationId = options.correlationId || `plan-${Date.now()}`;
    this.previousRanking = null;
  }

  /**
   * Main entry point - run the planning cycle
   *
   * @param {Object} options - Planning options
   * @param {boolean} options.dryRun - If true, don't persist changes
   * @param {boolean} options.includeCompleted - Include completed items
   * @returns {Promise<Object>} Planner output conforming to JSON schema
   */
  async plan(options = {}) {
    const startTime = Date.now();
    const { dryRun = false, includeCompleted = false } = options;

    console.log(`[central-planner] Starting planning cycle: ${this.correlationId}`);

    // Step 1: Aggregate proposals from all sources
    const rawProposals = await this.aggregateProposals({ includeCompleted });
    console.log(`[central-planner] Aggregated ${rawProposals.length} raw proposals`);

    if (rawProposals.length === 0) {
      return this.buildEmptyOutput(startTime);
    }

    // Step 2: Load previous ranking for stability comparison
    this.previousRanking = await this.loadPreviousRanking();

    // Step 3: Cluster by theme
    const clusters = this.clusterByTheme(rawProposals);
    console.log(`[central-planner] Created ${clusters.length} theme clusters`);

    // Step 4: Deduplicate within and across clusters
    const { deduplicated, deduplicationSummary } = this.deduplicate(rawProposals, clusters);
    console.log(`[central-planner] Deduplication: ${rawProposals.length} → ${deduplicated.length} proposals`);

    // Step 5: Score each proposal
    const scored = deduplicated.map(p => this.scoreProposal(p));

    // Step 6: Rank with stability checks
    const ranked = this.rankWithStability(scored);

    // Step 7: Build output conforming to JSON schema
    const output = this.buildOutput({
      queue: ranked,
      clusters,
      deduplicationSummary,
      startTime
    });

    // Step 8: Persist if not dry run
    if (!dryRun) {
      await this.persistRanking(output);
    }

    return output;
  }

  /**
   * Aggregate proposals from all sources
   */
  async aggregateProposals({ includeCompleted = false }) {
    const proposals = [];
    const sourceCounts = {};

    // Source 1: Feedback items
    const feedbackItems = await this.fetchFeedback({ includeCompleted });
    feedbackItems.forEach(item => {
      proposals.push(this.normalizeProposal(item, 'feedback'));
    });
    sourceCounts.feedback = feedbackItems.length;

    // Source 2: Issue patterns
    const patterns = await this.fetchIssuePatterns({ includeCompleted });
    patterns.forEach(item => {
      proposals.push(this.normalizeProposal(item, 'issue_pattern'));
    });
    sourceCounts.issue_pattern = patterns.length;

    // Source 3: Retrospective learnings
    const learnings = await this.fetchRetrospectiveLearnings({ includeCompleted });
    learnings.forEach(item => {
      proposals.push(this.normalizeProposal(item, 'retrospective'));
    });
    sourceCounts.retrospective = learnings.length;

    // Source 4: Protocol improvement queue
    const improvements = await this.fetchProtocolImprovements({ includeCompleted });
    improvements.forEach(item => {
      proposals.push(this.normalizeProposal(item, 'learning'));
    });
    sourceCounts.learning = improvements.length;

    // Source 5: Quick fix clusters (from feedback_clusterer)
    const quickFixClusters = await this.fetchQuickFixClusters();
    quickFixClusters.forEach(item => {
      proposals.push(this.normalizeProposal(item, 'quick_fix_cluster'));
    });
    sourceCounts.quick_fix_cluster = quickFixClusters.length;

    this.sourceCounts = sourceCounts;

    // Enforce safety limit
    if (proposals.length > this.config.MAX_PROPOSALS) {
      console.warn(`[central-planner] Truncating proposals: ${proposals.length} → ${this.config.MAX_PROPOSALS}`);
      return proposals.slice(0, this.config.MAX_PROPOSALS);
    }

    return proposals;
  }

  /**
   * Fetch feedback items
   */
  async fetchFeedback({ includeCompleted }) {
    const statuses = includeCompleted
      ? ['new', 'triaged', 'in_progress', 'resolved']
      : ['new', 'triaged', 'in_progress'];

    const { data, error } = await this.supabase
      .from('feedback')
      .select('id, title, description, category, severity, sd_id, error_hash, created_at, status')
      .in('status', statuses)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[central-planner] Error fetching feedback:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Fetch issue patterns
   */
  async fetchIssuePatterns({ includeCompleted }) {
    const statuses = includeCompleted
      ? ['draft', 'active', 'resolved']
      : ['draft', 'active'];

    const { data, error } = await this.supabase
      .from('issue_patterns')
      .select('pattern_id, issue_summary, category, severity, occurrence_count, created_at, updated_at, status, proven_solutions')
      .in('status', statuses)
      .order('occurrence_count', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[central-planner] Error fetching issue patterns:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Fetch retrospective learnings
   */
  async fetchRetrospectiveLearnings({ includeCompleted: _includeCompleted }) {
    const { data, error } = await this.supabase
      .from('retrospectives')
      .select('id, sd_id, key_learnings, improvement_areas, generated_by, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[central-planner] Error fetching retrospectives:', error);
      return [];
    }

    // Flatten key_learnings into individual proposals
    const learnings = [];
    for (const retro of (data || [])) {
      if (Array.isArray(retro.key_learnings)) {
        for (const learning of retro.key_learnings) {
          learnings.push({
            id: `${retro.id}-${learnings.length}`,
            title: typeof learning === 'string' ? learning : learning.learning || learning.title,
            description: typeof learning === 'object' ? learning.evidence : null,
            category: 'learning',
            severity: 'medium',
            sd_id: retro.sd_id,
            created_at: retro.created_at,
            source_retro_id: retro.id
          });
        }
      }
    }
    return learnings;
  }

  /**
   * Fetch protocol improvement queue
   */
  async fetchProtocolImprovements({ includeCompleted }) {
    const statuses = includeCompleted
      ? ['PENDING', 'APPLIED', 'SKIPPED']
      : ['PENDING'];

    const { data, error } = await this.supabase
      .from('protocol_improvement_queue')
      .select('id, improvement_type, description, evidence_count, source_retro_id, created_at, status')
      .in('status', statuses)
      .order('evidence_count', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[central-planner] Error fetching protocol improvements:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Fetch quick fix clusters
   */
  async fetchQuickFixClusters() {
    // Get recent quick fixes grouped by similar title
    const { data, error } = await this.supabase
      .from('quick_fixes')
      .select('id, title, type, severity, description, created_at, status')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[central-planner] Error fetching quick fixes:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Normalize a proposal from any source to a common format
   */
  normalizeProposal(item, source) {
    const id = item.pattern_id || item.id || `${source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      id,
      original_id: item.id || item.pattern_id,
      title: item.title || item.issue_summary || item.description?.substring(0, 100) || 'Untitled',
      description: item.description || item.issue_summary || '',
      source,
      source_ids: [id],
      category: item.category || item.type || item.improvement_type || 'general',
      severity: this.normalizeSeverity(item.severity || item.evidence_count),
      occurrence_count: item.occurrence_count || item.evidence_count || 1,
      created_at: item.created_at || new Date().toISOString(),
      last_seen_at: item.updated_at || item.created_at || new Date().toISOString(),
      sd_id: item.sd_id || item.source_sd_id || item.source_retro_id,
      error_hash: item.error_hash,
      metadata: {
        original_status: item.status,
        proven_solutions: item.proven_solutions
      }
    };
  }

  /**
   * Normalize severity to standard values
   */
  normalizeSeverity(severity) {
    if (!severity) return 'medium';
    const normalized = String(severity).toLowerCase();
    if (normalized === 'p0' || normalized === 'critical' || normalized === 'blocker') return 'critical';
    if (normalized === 'p1' || normalized === 'high' || normalized === 'major') return 'high';
    if (normalized === 'p2' || normalized === 'medium' || normalized === 'normal') return 'medium';
    if (normalized === 'p3' || normalized === 'low' || normalized === 'minor') return 'low';
    return 'medium';
  }

  /**
   * Cluster proposals by theme
   */
  clusterByTheme(proposals) {
    const clusters = new Map();

    // Group by category first
    for (const proposal of proposals) {
      const theme = this.extractTheme(proposal);

      if (!clusters.has(theme)) {
        clusters.set(theme, {
          id: `cluster-${crypto.randomBytes(4).toString('hex')}`,
          theme,
          description: '',
          proposal_ids: [],
          aggregate_score: 0
        });
      }

      clusters.get(theme).proposal_ids.push(proposal.id);
    }

    // Filter out small clusters and limit total
    const validClusters = Array.from(clusters.values())
      .filter(c => c.proposal_ids.length >= this.config.MIN_CLUSTER_SIZE)
      .slice(0, this.config.MAX_CLUSTERS);

    // Generate descriptions
    validClusters.forEach(cluster => {
      cluster.description = `${cluster.proposal_ids.length} related items in ${cluster.theme}`;
    });

    return validClusters;
  }

  /**
   * Extract theme from a proposal
   */
  extractTheme(proposal) {
    const category = (proposal.category || '').toLowerCase();
    const title = (proposal.title || '').toLowerCase();

    // Domain-specific theme detection
    if (title.includes('database') || title.includes('migration') || title.includes('schema') || category === 'database') {
      return 'Database & Schema';
    }
    if (title.includes('auth') || title.includes('security') || title.includes('permission') || category === 'security') {
      return 'Security & Auth';
    }
    if (title.includes('performance') || title.includes('slow') || title.includes('optimize') || category === 'performance') {
      return 'Performance';
    }
    if (title.includes('ui') || title.includes('ux') || title.includes('component') || title.includes('design') || category === 'ui') {
      return 'UI/UX';
    }
    if (title.includes('api') || title.includes('endpoint') || title.includes('route') || category === 'api') {
      return 'API & Integration';
    }
    if (title.includes('test') || title.includes('coverage') || title.includes('spec') || category === 'testing') {
      return 'Testing & Quality';
    }
    if (title.includes('doc') || title.includes('readme') || category === 'documentation') {
      return 'Documentation';
    }
    if (title.includes('protocol') || title.includes('leo') || title.includes('workflow')) {
      return 'Protocol & Workflow';
    }

    // Fall back to category or general
    return category || 'General';
  }

  /**
   * Deduplicate proposals
   */
  deduplicate(proposals, _clusters) {
    const seen = new Map();  // title hash -> canonical proposal
    const mergeGroups = [];
    const deduplicated = [];

    // Sort by occurrence_count descending so we keep the most significant
    const sorted = [...proposals].sort((a, b) =>
      (b.occurrence_count || 1) - (a.occurrence_count || 1)
    );

    for (const proposal of sorted) {
      const titleKey = this.normalizeForComparison(proposal.title);

      // Check for exact or near-duplicate by title
      let foundMatch = false;
      for (const [existingKey, canonical] of seen) {
        const similarity = this.calculateSimilarity(titleKey, existingKey);

        if (similarity > this.config.TITLE_SIMILARITY_THRESHOLD) {
          // Merge into existing
          canonical.source_ids.push(...proposal.source_ids);
          canonical.occurrence_count = (canonical.occurrence_count || 1) + (proposal.occurrence_count || 1);

          mergeGroups.push({
            canonical_id: canonical.id,
            merged_ids: [proposal.id],
            merge_reason: 'similar_title',
            similarity_score: similarity
          });

          foundMatch = true;
          break;
        }

        // Check error_hash match
        if (proposal.error_hash && proposal.error_hash === canonical.error_hash) {
          canonical.source_ids.push(...proposal.source_ids);
          canonical.occurrence_count = (canonical.occurrence_count || 1) + (proposal.occurrence_count || 1);

          mergeGroups.push({
            canonical_id: canonical.id,
            merged_ids: [proposal.id],
            merge_reason: 'same_error_hash',
            similarity_score: 1.0
          });

          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        seen.set(titleKey, proposal);
        deduplicated.push(proposal);
      }
    }

    const reductionPercentage = proposals.length > 0
      ? ((proposals.length - deduplicated.length) / proposals.length) * 100
      : 0;

    return {
      deduplicated,
      deduplicationSummary: {
        total_input: proposals.length,
        total_output: deduplicated.length,
        merged_groups: mergeGroups,
        reduction_percentage: Math.round(reductionPercentage * 10) / 10
      }
    };
  }

  /**
   * Normalize text for comparison
   */
  normalizeForComparison(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate similarity between two strings (Jaccard similarity)
   */
  calculateSimilarity(str1, str2) {
    const words1 = new Set(str1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(str2.split(' ').filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Score a proposal
   */
  scoreProposal(proposal) {
    const weights = this.config.WEIGHTS;

    // Severity score (0-100)
    const severityScore = SEVERITY_SCORES[proposal.severity] || 50;

    // Impact score based on occurrence count
    const impactScore = Math.min(100, (proposal.occurrence_count || 1) * 20);

    // Recurrence score
    const recurrenceScore = Math.min(100, (proposal.occurrence_count || 1) * 25);

    // Recency score (more recent = higher)
    const daysSinceCreated = (Date.now() - new Date(proposal.created_at).getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 100 - (daysSinceCreated * 3));  // -3 points per day

    // Effort inverse (assume medium effort for now)
    const effortScore = 60;  // Could be enhanced with LOC estimates

    // Calculate composite score
    const score =
      (severityScore * weights.severity) +
      (impactScore * weights.impact) +
      (recurrenceScore * weights.recurrence) +
      (recencyScore * weights.recency) +
      (effortScore * weights.effort_inverse);

    return {
      ...proposal,
      score: Math.round(score * 10) / 10,
      urgency_band: scoreToBand(score),
      score_breakdown: {
        severity: severityScore,
        impact: impactScore,
        recurrence: recurrenceScore,
        recency: Math.round(recencyScore),
        effort: effortScore
      },
      reasoning: this.generateReasoning(proposal, score, { severityScore, impactScore, recurrenceScore })
    };
  }

  /**
   * Generate human-readable reasoning for a score
   */
  generateReasoning(proposal, score, breakdown) {
    const parts = [];

    if (breakdown.severityScore >= 75) {
      parts.push(`${proposal.severity} severity`);
    }

    if (proposal.occurrence_count > 1) {
      parts.push(`${proposal.occurrence_count} occurrences`);
    }

    if (proposal.source === 'issue_pattern') {
      parts.push('proven pattern');
    }

    if (proposal.metadata?.proven_solutions?.length > 0) {
      parts.push('has known solutions');
    }

    const urgencyBand = scoreToBand(score);
    const urgencyText = {
      'P0': 'Critical priority',
      'P1': 'High priority',
      'P2': 'Medium priority',
      'P3': 'Low priority'
    }[urgencyBand];

    return `${urgencyText}: ${parts.join(', ') || 'standard prioritization'}`;
  }

  /**
   * Rank proposals with stability checks
   */
  rankWithStability(scoredProposals) {
    // Sort by score descending
    const sorted = [...scoredProposals].sort((a, b) => b.score - a.score);

    // Apply stability adjustments
    const ranked = sorted.map((proposal, index) => {
      const rank = index + 1;
      let previousRank = null;
      let rankDelta = null;

      if (this.previousRanking) {
        const prev = this.previousRanking.find(p => p.id === proposal.id);
        if (prev) {
          previousRank = prev.rank;
          rankDelta = previousRank - rank;  // positive = moved up

          // Check for excessive churn in top positions
          if (previousRank <= this.config.TOP_N_PROTECTED &&
              Math.abs(rankDelta) > this.config.MAX_POSITION_CHANGE) {
            // Log but don't block - stability is a metric, not a constraint
            console.log(`[central-planner] Significant position change: ${proposal.id} moved ${Math.abs(rankDelta)} positions`);
          }
        }
      }

      return {
        ...proposal,
        rank,
        previous_rank: previousRank,
        rank_delta: rankDelta,
        awaiting_human_approval: this.requiresHumanApproval(proposal)
      };
    });

    return ranked;
  }

  /**
   * Check if proposal requires human approval
   */
  requiresHumanApproval(proposal) {
    // Critical items always need approval
    if (proposal.severity === 'critical') return true;

    // Manual submissions need approval
    if (proposal.source === 'manual') return true;

    // High score items with low confidence
    if (proposal.score >= 80 && proposal.occurrence_count <= 1) return true;

    return false;
  }

  /**
   * Calculate stability metrics
   */
  calculateStability(ranked) {
    if (!this.previousRanking || this.previousRanking.length === 0) {
      return {
        consistency_score: 100,
        top_5_unchanged: true,
        positions_changed: 0,
        churn_rate: 0
      };
    }

    let unchanged = 0;
    let top5Unchanged = true;

    for (const item of ranked) {
      if (item.previous_rank === item.rank) {
        unchanged++;
      }
      if (item.rank <= 5 && item.previous_rank !== item.rank) {
        top5Unchanged = false;
      }
    }

    const consistencyScore = ranked.length > 0
      ? (unchanged / ranked.length) * 100
      : 100;

    return {
      consistency_score: Math.round(consistencyScore * 10) / 10,
      top_5_unchanged: top5Unchanged,
      positions_changed: ranked.length - unchanged,
      churn_rate: ranked.length > 0
        ? Math.round(((ranked.length - unchanged) / ranked.length) * 100 * 10) / 10
        : 0
    };
  }

  /**
   * Load previous ranking for comparison
   */
  async loadPreviousRanking() {
    const { data, error } = await this.supabase
      .from('leo_planner_rankings')
      .select('queue')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data.queue;
  }

  /**
   * Persist the ranking for future comparison
   */
  async persistRanking(output) {
    const { error } = await this.supabase
      .from('leo_planner_rankings')
      .insert({
        correlation_id: this.correlationId,
        queue: output.queue,
        metadata: output.metadata,
        stability: output.stability,
        created_at: output.generated_at
      });

    if (error) {
      console.error('[central-planner] Error persisting ranking:', error);
    }
  }

  /**
   * Build output conforming to JSON schema
   */
  buildOutput({ queue, clusters, deduplicationSummary, startTime }) {
    const processingTime = Date.now() - startTime;
    const stability = this.calculateStability(queue);

    // Map clusters to include aggregate scores
    const enrichedClusters = clusters.map(cluster => {
      const clusterItems = queue.filter(p => cluster.proposal_ids.includes(p.id));
      const aggregateScore = clusterItems.length > 0
        ? clusterItems.reduce((sum, p) => sum + p.score, 0) / clusterItems.length
        : 0;

      return {
        ...cluster,
        aggregate_score: Math.round(aggregateScore * 10) / 10
      };
    });

    // Format queue items
    const formattedQueue = queue.map(item => ({
      id: item.id,
      rank: item.rank,
      title: item.title,
      score: item.score,
      urgency_band: item.urgency_band,
      source: item.source,
      source_ids: item.source_ids,
      cluster_id: this.findClusterForProposal(item.id, enrichedClusters),
      reasoning: item.reasoning,
      score_breakdown: item.score_breakdown,
      estimated_effort: this.estimateEffort(item),
      dependencies: [],
      blocks: [],
      awaiting_human_approval: item.awaiting_human_approval,
      previous_rank: item.previous_rank,
      rank_delta: item.rank_delta
    }));

    return {
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      correlation_id: this.correlationId,
      queue: formattedQueue,
      clusters: enrichedClusters,
      deduplication: deduplicationSummary,
      stability,
      metadata: {
        processing_time_ms: processingTime,
        model_version: this.config.MODEL_VERSION,
        source_counts: this.sourceCounts || {},
        human_overrides_pending: queue.filter(p => p.awaiting_human_approval).length
      }
    };
  }

  /**
   * Build empty output
   */
  buildEmptyOutput(startTime) {
    return {
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      correlation_id: this.correlationId,
      queue: [],
      clusters: [],
      deduplication: {
        total_input: 0,
        total_output: 0,
        merged_groups: [],
        reduction_percentage: 0
      },
      stability: {
        consistency_score: 100,
        top_5_unchanged: true,
        positions_changed: 0,
        churn_rate: 0
      },
      metadata: {
        processing_time_ms: Date.now() - startTime,
        model_version: this.config.MODEL_VERSION,
        source_counts: {},
        human_overrides_pending: 0
      }
    };
  }

  /**
   * Find which cluster a proposal belongs to
   */
  findClusterForProposal(proposalId, clusters) {
    for (const cluster of clusters) {
      if (cluster.proposal_ids.includes(proposalId)) {
        return cluster.id;
      }
    }
    return null;
  }

  /**
   * Estimate effort based on proposal characteristics
   */
  estimateEffort(proposal) {
    // Simple heuristic - could be enhanced with ML
    if (proposal.source === 'quick_fix_cluster') return 'small';
    if (proposal.severity === 'critical') return 'large';
    if (proposal.occurrence_count >= 5) return 'medium';
    if (proposal.category === 'documentation') return 'small';
    return 'medium';
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const includeCompleted = args.includes('--include-completed');
  const jsonOutput = args.includes('--json');

  try {
    const planner = new CentralPlanner();
    const output = await planner.plan({ dryRun, includeCompleted });

    if (jsonOutput) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('CENTRAL PLANNER OUTPUT');
      console.log('='.repeat(60));
      console.log(`Generated: ${output.generated_at}`);
      console.log(`Correlation ID: ${output.correlation_id}`);
      console.log(`Processing Time: ${output.metadata.processing_time_ms}ms`);
      console.log('\n--- Source Counts ---');
      for (const [source, count] of Object.entries(output.metadata.source_counts)) {
        console.log(`  ${source}: ${count}`);
      }
      console.log('\n--- Deduplication ---');
      console.log(`  Input: ${output.deduplication.total_input}`);
      console.log(`  Output: ${output.deduplication.total_output}`);
      console.log(`  Reduction: ${output.deduplication.reduction_percentage}%`);
      console.log('\n--- Stability ---');
      console.log(`  Consistency: ${output.stability.consistency_score}%`);
      console.log(`  Top 5 Unchanged: ${output.stability.top_5_unchanged}`);
      console.log(`  Churn Rate: ${output.stability.churn_rate}%`);
      console.log('\n--- Top 10 Queue ---');
      for (const item of output.queue.slice(0, 10)) {
        console.log(`  ${item.rank}. [${item.urgency_band}] ${item.title.substring(0, 50)}... (${item.score})`);
      }
      console.log('\n--- Theme Clusters ---');
      for (const cluster of output.clusters) {
        console.log(`  ${cluster.theme}: ${cluster.proposal_ids.length} items (avg score: ${cluster.aggregate_score})`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Export for programmatic use
export { CentralPlanner, CONFIG, scoreToBand, SEVERITY_SCORES };
export default CentralPlanner;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith('central-planner.js')) {
  main();
}
