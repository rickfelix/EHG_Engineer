/**
 * Assist Engine for LEO Assist
 *
 * Core processing logic for autonomous inbox processing.
 * Implements two-phase processing:
 * - Phase 1: Autonomous issue processing with intelligent retry
 * - Phase 2: Interactive enhancement scheduling
 *
 * Part of SD-LEO-FIX-LEO-ASSIST-INTELLIGENT-002: /leo assist implementation
 * Enhanced with Central Planner integration (SD-LEO-SELF-IMPROVE-001H)
 *
 * @module lib/quality/assist-engine
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import dotenv from 'dotenv';
import {
  buildAssistContext,
  generateRecommendation,
  estimateLOC,
  classifyVerificationLens
} from './context-analyzer.js';
import { CentralPlanner } from '../planner/central-planner.js';
import { enrichWithSensemaking, applyPriorityBoost } from './sensemaking-enricher.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

/**
 * Processing result types
 */
const RESULT_TYPES = {
  AUTO_MERGED: 'auto_merged',
  SD_CREATED: 'sd_created',
  NEEDS_ATTENTION: 'needs_attention',
  SCHEDULED: 'scheduled',
  BACKLOG: 'backlog',
  WONT_DO: 'wont_do'
};

/**
 * CAPA-5 (SD-LEO-INFRA-FEEDBACK-PIPELINE-HEALTH-001): Stale-untriaged grace window.
 *
 * Triage scheduler (clockwork-auto-triage.yml) runs hourly. Rows older than this
 * grace without ai_triage_classification signal a failing scheduler and are skipped.
 */
const STALE_UNTRIAGED_GRACE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Defense-in-depth filter for /leo assist inbox loading.
 *
 * Removes rows that are both untriaged (ai_triage_classification IS NULL) AND
 * older than the grace window. Triaged rows and fresh untriaged rows pass through
 * unchanged. Skip events are warn-logged with row id and age so operators can
 * diagnose triage-scheduler failures from /leo assist runs.
 *
 * @param {Array<object>} rows - Feedback rows from v_feedback_with_sensemaking
 * @returns {Array<object>} Filtered rows (triaged + fresh untriaged)
 */
function filterStaleUntriaged(rows) {
  const staleCutoffMs = Date.now() - STALE_UNTRIAGED_GRACE_MS;
  let skipped = 0;
  const kept = (rows || []).filter(item => {
    const isTriaged = item.ai_triage_classification !== null && item.ai_triage_classification !== undefined;
    if (isTriaged) return true;
    const createdMs = new Date(item.created_at).getTime();
    if (createdMs >= staleCutoffMs) return true; // within grace
    const ageHours = ((Date.now() - createdMs) / (60 * 60 * 1000)).toFixed(1);
    console.warn(`[assist-engine] Skipping stale-untriaged row ${item.id} (age=${ageHours}h, classification=NULL)`);
    skipped++;
    return false;
  });
  if (skipped > 0) {
    console.warn(`[assist-engine] CAPA-5: filtered ${skipped} stale-untriaged row(s). Check clockwork-auto-triage workflow status.`);
  }
  return kept;
}

/**
 * AssistEngine - Main class for /leo assist processing
 */
class AssistEngine {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.usePlanner = options.usePlanner !== false; // Enable by default
    this.context = null;
    this.plannerOutput = null;
    this.results = {
      phase1: {
        processed: [],
        autoMerged: [],
        sdCreated: [],
        needsAttention: []
      },
      phase2: {
        processed: [],
        implementNow: [],
        scheduled: [],
        backlog: [],
        wontDo: []
      },
      planner: {
        deduplication: null,
        stability: null,
        clusters: []
      },
      startTime: null,
      endTime: null
    };
  }

  /**
   * Initialize the engine with context
   */
  async initialize() {
    this.context = await buildAssistContext();
    this.results.startTime = new Date();

    // Run Central Planner if enabled (SD-LEO-SELF-IMPROVE-001H integration)
    if (this.usePlanner) {
      try {
        console.log('[assist-engine] Running Central Planner for prioritization...');
        const planner = new CentralPlanner({ correlationId: `assist-${Date.now()}` });
        this.plannerOutput = await planner.plan({ dryRun: this.dryRun });

        // Store planner metrics
        this.results.planner = {
          deduplication: this.plannerOutput.deduplication,
          stability: this.plannerOutput.stability,
          clusters: this.plannerOutput.clusters,
          queueSize: this.plannerOutput.queue.length
        };

        console.log(`[assist-engine] Planner complete: ${this.plannerOutput.queue.length} items, ${this.plannerOutput.deduplication.reduction_percentage}% deduplication`);
      } catch (plannerError) {
        console.warn('[assist-engine] Central Planner failed, falling back to default prioritization:', plannerError.message);
        this.plannerOutput = null;
      }
    }

    return this;
  }

  /**
   * Load all actionable inbox items
   *
   * @returns {Promise<Object>} Items separated by type
   */
  async loadInboxItems() {
    // FR-001: Query v_feedback_with_sensemaking VIEW for disposition-enriched data
    const { data: items, error } = await supabase
      .from('v_feedback_with_sensemaking')
      .select('*')
      .not('status', 'in', '(resolved,wont_fix,shipped,snoozed)')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to load inbox items: ${error.message}`);
    }

    // GAP-008: Filter out feedback already linked to an SD (duplicate guard)
    const unlinked = (items || []).filter(i => !i.strategic_directive_id && !i.resolution_sd_id);
    const skippedLinked = (items || []).length - unlinked.length;
    if (skippedLinked > 0) {
      console.log(`[assist-engine] Skipped ${skippedLinked} feedback item(s) already linked to SDs`);
    }

    // CAPA-5 (SD-LEO-INFRA-FEEDBACK-PIPELINE-HEALTH-001): Defense-in-depth filter.
    // Skip rows where ai_triage_classification is NULL AND age > 1h grace window.
    // Triage scheduler (clockwork-auto-triage.yml) runs hourly and should classify
    // within one cron cycle. Stale-untriaged rows mean the scheduler is failing —
    // don't waste sub-agent retries on them. Uses warn-log variant so the operator
    // sees the skip class during production cycles.
    const triaged = filterStaleUntriaged(unlinked);

    // FR-002: Enrich with sensemaking dispositions (filter discards, annotate keeps)
    const { enriched, discardedCount } = enrichWithSensemaking(triaged);

    // Separate issues from enhancements
    const issues = enriched.filter(i => i.type === 'issue');
    const enhancements = enriched.filter(i => i.type === 'enhancement');

    return { issues, enhancements, total: enriched.length, discardedCount };
  }

  /**
   * Prioritize issues for processing
   *
   * Uses Central Planner output when available (SD-LEO-SELF-IMPROVE-001H).
   * Falls back to simple priority order:
   * 1. P0 (critical)
   * 2. Related to current SD work
   * 3. P1 (high)
   * 4. P2/P3 (normal/low)
   *
   * @param {Object[]} issues - Issues to prioritize
   * @returns {Object[]} Prioritized issues
   */
  prioritizeIssues(issues) {
    // If Central Planner output is available, use its ranking
    if (this.plannerOutput?.queue?.length > 0) {
      const plannerRanks = new Map();
      for (const item of this.plannerOutput.queue) {
        plannerRanks.set(item.id, item.rank);
        // Also map by original_id if available in source_ids
        if (item.source_ids) {
          for (const sourceId of item.source_ids) {
            plannerRanks.set(sourceId, item.rank);
          }
        }
      }

      return issues.sort((a, b) => {
        const aRank = plannerRanks.get(a.id) ?? 999;
        const bRank = plannerRanks.get(b.id) ?? 999;
        return aRank - bRank;
      });
    }

    // FR-003: Apply half-band priority boost to sensemaking-kept items
    applyPriorityBoost(issues);

    // Fallback to simple prioritization
    return issues.sort((a, b) => {
      // P0 always first
      if (a.priority === 'P0' && b.priority !== 'P0') return -1;
      if (b.priority === 'P0' && a.priority !== 'P0') return 1;

      // Check relationship to recent work
      const aRelated = this.context.findRelated(a);
      const bRelated = this.context.findRelated(b);

      if (aRelated && !bRelated) return -1;
      if (bRelated && !aRelated) return 1;

      // Use _sortPriority (includes half-band boost for kept items)
      const aPrio = a._sortPriority ?? 2;
      const bPrio = b._sortPriority ?? 2;

      if (aPrio !== bPrio) return aPrio - bPrio;

      // Finally by age (older first)
      return new Date(a.created_at) - new Date(b.created_at);
    });
  }

  /**
   * Get Central Planner output for an item
   *
   * @param {string} itemId - Feedback item ID
   * @returns {Object|null} Planner data for this item
   */
  getPlannerDataForItem(itemId) {
    if (!this.plannerOutput?.queue) return null;

    return this.plannerOutput.queue.find(item =>
      item.id === itemId ||
      (item.source_ids && item.source_ids.includes(itemId))
    );
  }

  /**
   * Get theme cluster for an item
   *
   * @param {string} itemId - Feedback item ID
   * @returns {Object|null} Cluster this item belongs to
   */
  getClusterForItem(itemId) {
    if (!this.plannerOutput?.clusters) return null;

    for (const cluster of this.plannerOutput.clusters) {
      if (cluster.proposal_ids.includes(itemId)) {
        return cluster;
      }
    }
    return null;
  }

  /**
   * Classify an issue for processing approach
   *
   * @param {Object} issue - Issue to classify
   * @returns {Object} Classification result
   */
  classifyIssue(issue) {
    const estimatedLoc = issue.estimated_loc || estimateLOC(issue);

    if (estimatedLoc <= 50) {
      return {
        approach: 'quick_fix',
        estimatedLoc,
        reason: 'Estimated LOC within quick-fix threshold'
      };
    }

    if (estimatedLoc <= 100) {
      return {
        approach: 'small_sd',
        estimatedLoc,
        reason: 'Moderate scope - create and execute SD'
      };
    }

    return {
      approach: 'queue_sd',
      estimatedLoc,
      reason: 'Large scope - create SD and add to queue'
    };
  }

  /**
   * Process a single issue
   *
   * Returns processing instructions for Claude to execute
   *
   * @param {Object} issue - Issue to process
   * @returns {Object} Processing result/instructions
   */
  async processIssue(issue) {
    // FR-4: Classify verification lens BEFORE LOC sizing
    const lensResult = classifyVerificationLens(issue, {
      lensOverride: issue.lens_override || issue.metadata?.lensOverride
    });
    const classification = this.classifyIssue(issue);
    const related = this.context.findRelated(issue);

    const result = {
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
      verificationLens: lensResult,
      classification,
      related: related ? { sdKey: related.sd.sd_key, score: related.score } : null,
      attempts: 0,
      status: 'pending',
      instruction: null
    };

    if (this.dryRun) {
      result.instruction = {
        action: 'dry_run',
        message: `Would process as ${classification.approach} (~${classification.estimatedLoc} LOC)`
      };
      return result;
    }

    // Generate instruction based on classification
    switch (classification.approach) {
      case 'quick_fix':
        result.instruction = {
          action: 'invoke_quick_fix_skill',
          feedbackId: issue.id,
          title: issue.title,
          description: issue.description,
          estimatedLoc: classification.estimatedLoc,
          skillInvocation: {
            skill: 'quick-fix',
            args: `--feedback-id ${issue.id} --title "${issue.title.replace(/"/g, '\\"')}"`
          },
          safetyGates: [
            'tests_must_pass',
            'lint_must_pass',
            'no_test_deletions',
            'loc_ejection_at_50'
          ],
          retryStrategy: {
            maxAttempts: 3,
            attempt1: 'direct_fix',
            attempt2: 'rca_informed_fix',
            attempt3: 'specialist_agent_fix'
          }
        };

        // Log routing decision for observability
        await this._logRoutingEvent(issue, classification, 'quick_fix_skill', lensResult);
        break;

      case 'small_sd':
        result.instruction = {
          action: 'create_and_execute_sd',
          feedbackId: issue.id,
          title: issue.title,
          description: issue.description,
          estimatedLoc: classification.estimatedLoc,
          verificationLens: lensResult.lens,
          sdType: 'fix',
          autoExecute: true
        };
        await this._logRoutingEvent(issue, classification, 'create_and_execute_sd', lensResult);
        break;

      case 'queue_sd':
        result.instruction = {
          action: 'create_sd_only',
          feedbackId: issue.id,
          title: issue.title,
          description: issue.description,
          estimatedLoc: classification.estimatedLoc,
          verificationLens: lensResult.lens,
          sdType: 'fix',
          autoExecute: false,
          reason: 'Scope too large for autonomous processing'
        };
        await this._logRoutingEvent(issue, classification, 'create_sd_only', lensResult);
        break;
    }

    return result;
  }

  /**
   * Log a routing decision for observability (FR-5)
   *
   * @param {Object} issue - The feedback issue
   * @param {Object} classification - Classification result
   * @param {string} route - Chosen route (quick_fix_skill, create_and_execute_sd, create_sd_only)
   * @private
   */
  async _logRoutingEvent(issue, classification, route, lensResult) {
    try {
      await supabase.from('feedback').update({
        metadata: {
          ...(issue.metadata || {}),
          assist_routing: {
            route,
            estimated_loc: classification.estimatedLoc,
            approach: classification.approach,
            reason: classification.reason,
            routed_at: new Date().toISOString()
          },
          verification_lens: lensResult ? {
            lens: lensResult.lens,
            confidence: lensResult.confidence,
            reason: lensResult.reason,
            original_lens: lensResult.original_lens,
            override_lens: lensResult.override_lens,
            classified_at: new Date().toISOString()
          } : undefined
        },
        updated_at: new Date().toISOString()
      }).eq('id', issue.id);
    } catch (err) {
      console.warn(`[assist-engine] Failed to log routing event for ${issue.id}:`, err.message);
    }
  }

  /**
   * Record issue processing result
   *
   * @param {Object} issue - Original issue
   * @param {string} resultType - Result type from RESULT_TYPES
   * @param {Object} details - Additional details
   */
  recordIssueResult(issue, resultType, details = {}) {
    const record = {
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
      resultType,
      ...details,
      timestamp: new Date().toISOString()
    };

    this.results.phase1.processed.push(record);

    switch (resultType) {
      case RESULT_TYPES.AUTO_MERGED:
        this.results.phase1.autoMerged.push(record);
        break;
      case RESULT_TYPES.SD_CREATED:
        this.results.phase1.sdCreated.push(record);
        break;
      case RESULT_TYPES.NEEDS_ATTENTION:
        this.results.phase1.needsAttention.push(record);
        break;
    }
  }

  /**
   * Build enhancement presentation for interactive scheduling
   *
   * @param {Object} enhancement - Enhancement item
   * @returns {Object} Presentation object
   */
  buildEnhancementPresentation(enhancement) {
    const recommendation = generateRecommendation(
      enhancement,
      this.context,
      this.results.phase1.autoMerged
    );

    return {
      id: enhancement.id,
      title: enhancement.title,
      description: enhancement.description,
      priority: enhancement.priority,
      recommendation,
      related: this.context.findRelated(enhancement),
      estimatedLoc: estimateLOC(enhancement),
      schedulingOptions: [
        { value: 'now', label: 'Now', description: 'Create SD and implement immediately' },
        { value: 'this_week', label: 'This week', description: 'Schedule for this week' },
        { value: 'next_week', label: 'Next week', description: 'Schedule for next week' },
        { value: 'backlog', label: 'Backlog', description: 'Add to backlog for future consideration' },
        { value: 'wont_do', label: "Won't do", description: 'Close as won\'t implement' }
      ]
    };
  }

  /**
   * Record enhancement scheduling decision
   *
   * @param {Object} enhancement - Original enhancement
   * @param {string} decision - Scheduling decision
   * @param {Object} details - Additional details
   */
  async recordEnhancementDecision(enhancement, decision, details = {}) {
    const record = {
      id: enhancement.id,
      title: enhancement.title,
      decision,
      ...details,
      timestamp: new Date().toISOString()
    };

    this.results.phase2.processed.push(record);

    // Update feedback status based on decision
    if (!this.dryRun) {
      let updateData = { updated_at: new Date().toISOString() };

      switch (decision) {
        case 'now':
          this.results.phase2.implementNow.push(record);
          updateData.status = 'in_progress';
          break;

        case 'this_week':
        case 'next_week':
          this.results.phase2.scheduled.push(record);
          updateData.status = 'backlog';
          const scheduledDate = decision === 'this_week'
            ? getEndOfWeek()
            : getNextMonday();
          updateData.snoozed_until = scheduledDate.toISOString();
          break;

        case 'backlog':
          this.results.phase2.backlog.push(record);
          updateData.status = 'backlog';
          break;

        case 'wont_do':
          this.results.phase2.wontDo.push(record);
          updateData.status = 'wont_fix';
          updateData.resolution_notes = details.reason || 'Declined during /leo assist';
          break;
      }

      await supabase
        .from('feedback')
        .update(updateData)
        .eq('id', enhancement.id);
    }

    return record;
  }

  /**
   * Generate summary report
   *
   * @returns {string} Formatted summary report
   */
  generateSummary() {
    this.results.endTime = new Date();
    const duration = Math.round((this.results.endTime - this.results.startTime) / 60000);

    const totalItems =
      this.results.phase1.processed.length +
      this.results.phase2.processed.length;

    const lines = [];

    lines.push('');
    lines.push('════════════════════════════════════════════════════════════');
    lines.push('  /leo assist - Session Summary');
    lines.push('════════════════════════════════════════════════════════════');

    // Central Planner metrics (SD-LEO-SELF-IMPROVE-001H)
    if (this.results.planner?.deduplication) {
      lines.push('');
      lines.push('┌─────────────────────────────────────────────────────────────┐');
      lines.push('│  CENTRAL PLANNER                                            │');
      lines.push('└─────────────────────────────────────────────────────────────┘');
      lines.push(`  Deduplication: ${this.results.planner.deduplication.total_input} → ${this.results.planner.deduplication.total_output} (${this.results.planner.deduplication.reduction_percentage}% reduction)`);
      if (this.results.planner.stability) {
        lines.push(`  Ranking Consistency: ${this.results.planner.stability.consistency_score}%`);
      }
      if (this.results.planner.clusters?.length > 0) {
        lines.push(`  Theme Clusters: ${this.results.planner.clusters.length}`);
        for (const cluster of this.results.planner.clusters.slice(0, 3)) {
          lines.push(`    • ${cluster.theme}: ${cluster.proposal_ids.length} items`);
        }
      }
    }
    lines.push('');
    lines.push(`  Total Items: ${totalItems}`);
    lines.push(`  Duration: ${duration} minutes`);
    if (this.dryRun) {
      lines.push('  Mode: DRY RUN (no changes made)');
    }

    // Phase 1: Issues
    lines.push('');
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push(`│  PHASE 1: ISSUES (Autonomous)                    ${this.results.phase1.processed.length} items  │`);
    lines.push('└─────────────────────────────────────────────────────────────┘');

    if (this.results.phase1.autoMerged.length > 0) {
      lines.push('');
      lines.push(`  ✅ AUTO-MERGED (${this.results.phase1.autoMerged.length})`);
      lines.push('  ' + '─'.repeat(60));
      for (const item of this.results.phase1.autoMerged) {
        const loc = item.loc ? `${item.loc} LOC` : '';
        const attempts = item.attempts ? `${item.attempts} attempt${item.attempts > 1 ? 's' : ''}` : '';
        const detail = [loc, attempts].filter(Boolean).join(', ');
        lines.push(`  ${item.id.substring(0, 8)}  ${truncate(item.title, 40)} ${detail ? `(${detail})` : ''}`);
      }
    }

    if (this.results.phase1.sdCreated.length > 0) {
      lines.push('');
      lines.push(`  📋 SD CREATED & QUEUED (${this.results.phase1.sdCreated.length})`);
      lines.push('  ' + '─'.repeat(60));
      for (const item of this.results.phase1.sdCreated) {
        lines.push(`  ${item.id.substring(0, 8)}  → ${item.sdKey || 'pending'} (queued, ~${item.estimatedLoc || '?'} LOC)`);
      }
    }

    if (this.results.phase1.needsAttention.length > 0) {
      lines.push('');
      lines.push(`  ⚠️  NEEDS ATTENTION (${this.results.phase1.needsAttention.length})`);
      lines.push('  ' + '─'.repeat(60));
      for (const item of this.results.phase1.needsAttention) {
        lines.push(`  ${item.id.substring(0, 8)}  ${truncate(item.title, 40)}`);
        if (item.lastError) {
          lines.push(`           Last error: ${truncate(item.lastError, 50)}`);
        }
        if (item.recommendation) {
          lines.push(`           Recommendation: ${item.recommendation}`);
        }
      }
    }

    // Phase 2: Enhancements
    lines.push('');
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push(`│  PHASE 2: ENHANCEMENTS (Interactive)              ${this.results.phase2.processed.length} items  │`);
    lines.push('└─────────────────────────────────────────────────────────────┘');

    if (this.results.phase2.implementNow.length > 0) {
      lines.push('');
      lines.push(`  🚀 IMPLEMENT NOW (${this.results.phase2.implementNow.length})`);
      lines.push('  ' + '─'.repeat(60));
      for (const item of this.results.phase2.implementNow) {
        lines.push(`  ${item.id.substring(0, 8)}  ${truncate(item.title, 40)} → ${item.sdKey || 'queued'}`);
      }
    }

    if (this.results.phase2.scheduled.length > 0) {
      lines.push('');
      lines.push(`  📅 SCHEDULED (${this.results.phase2.scheduled.length})`);
      lines.push('  ' + '─'.repeat(60));
      for (const item of this.results.phase2.scheduled) {
        const when = item.decision === 'this_week' ? 'This week' : 'Next week';
        lines.push(`  ${item.id.substring(0, 8)}  ${truncate(item.title, 40)} → ${when}`);
      }
    }

    if (this.results.phase2.backlog.length > 0) {
      lines.push('');
      lines.push(`  📦 BACKLOG (${this.results.phase2.backlog.length})`);
      lines.push('  ' + '─'.repeat(60));
      for (const item of this.results.phase2.backlog) {
        lines.push(`  ${item.id.substring(0, 8)}  ${truncate(item.title, 40)}`);
      }
    }

    if (this.results.phase2.wontDo.length > 0) {
      lines.push('');
      lines.push(`  ❌ WON'T DO (${this.results.phase2.wontDo.length})`);
      lines.push('  ' + '─'.repeat(60));
      for (const item of this.results.phase2.wontDo) {
        lines.push(`  ${item.id.substring(0, 8)}  ${truncate(item.title, 40)}`);
      }
    }

    // Footer
    const remaining = totalItems -
      this.results.phase1.autoMerged.length -
      this.results.phase1.sdCreated.length -
      this.results.phase2.wontDo.length;

    const queuedSDs =
      this.results.phase1.sdCreated.length +
      this.results.phase2.implementNow.length;

    lines.push('');
    lines.push('════════════════════════════════════════════════════════════');
    lines.push(`  📊 Inbox Status: ${remaining} remaining`);
    if (queuedSDs > 0) {
      lines.push(`  🎯 Next: ${queuedSDs} SDs queued for implementation`);
    }
    lines.push('════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }
}

// Helper functions

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
}

function getEndOfWeek() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 0;
  const friday = new Date(now);
  friday.setDate(friday.getDate() + daysUntilFriday);
  friday.setHours(17, 0, 0, 0);
  return friday;
}

function getNextMonday() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(monday.getDate() + daysUntilMonday);
  monday.setHours(9, 0, 0, 0);
  return monday;
}

// Named exports
export {
  AssistEngine,
  RESULT_TYPES,
  filterStaleUntriaged,
  STALE_UNTRIAGED_GRACE_MS
};

// Default export
export default AssistEngine;
