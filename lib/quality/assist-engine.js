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
import { TERMINAL_CATEGORIES } from '../governance/feedback-terminal-categories.cjs';
import dotenv from 'dotenv';
import {
  buildAssistContext,
  generateRecommendation,
  estimateLOC,
  classifyVerificationLens
} from './context-analyzer.js';
import { CentralPlanner } from '../planner/central-planner.js';
import { enrichWithSensemaking, applyPriorityBoost } from './sensemaking-enricher.js';
import { isUntrustedOrigin, sanitizeUserText } from '../factory/content-sanitizer.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — loadInboxItems reads the
// full not-terminal feedback backlog and bulk-processes it (autonomous /leo assist
// pipeline); feedback is a growing table, so an un-ranged read here could silently drop
// items past the PostgREST 1000-row cap. The in-flight-QF guard read below gates a
// skip/exclude decision (FR-5 sibling-collision guard) so it also paginates and fails
// CLOSED (excludes QF-linked rows) rather than treating a failed read as "nothing in flight".
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

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
 * QF-20260509-149: Exclude category='harness_backlog' rows from the enhancements stream.
 *
 * Harness-backlog rows are deferred-class per CLAUDE.md MODE rule and surface in the
 * `npm run sd:next` HARNESS BACKLOG section. They are not schedulable enhancements and
 * must be excluded from /leo assist Phase 2 to prevent operator noise on every product-
 * default fall-through. Campaign-mode operators query the backlog directly.
 *
 * SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 (FR-1): also excludes the write-time-
 * terminal categories (completion_flag_witness/telemetry_aggregate/informational_note)
 * -- a harness_backlog-only exclusion would let fresh witness rows leak into this
 * enhancements stream (VALIDATION finding at PLAN_VERIFICATION).
 *
 * @param {Array<object>} enriched - Sensemaking-enriched feedback rows
 * @returns {{enhancements: Array<object>, skippedHarnessBacklog: number}}
 */
function splitEnhancementsExcludingHarnessBacklog(enriched) {
  const all = (enriched || []).filter(i => i.type === 'enhancement');
  const excluded = new Set(['harness_backlog', ...TERMINAL_CATEGORIES]);
  const enhancements = all.filter(i => !excluded.has(i.category));
  const skippedHarnessBacklog = all.length - enhancements.length;
  return { enhancements, skippedHarnessBacklog };
}

/**
 * QF-20260704-993: Exclude category='completion_flag' rows from the issues stream.
 *
 * scripts/capture-completion-flags.js deliberately stamps `needs_decision` completion
 * flags with type='issue' (category='completion_flag') for general inbox visibility --
 * but Phase 1's autonomous bug-fix loop has no business attempting a code fix for a pure
 * decision item. Confirmed live: 86/86 rows in the issues stream were completion_flag rows
 * with zero genuine bugs. Excluded rows still surface via /leo inbox for chairman/coordinator
 * review; this only removes them from the autonomous-fix retry loop.
 *
 * @param {Array<object>} enriched - Sensemaking-enriched feedback rows
 * @returns {{issues: Array<object>, skippedNeedsDecision: number}}
 */
const NEEDS_DECISION_CATEGORY = 'completion_flag';
function filterIssuesExcludingNeedsDecision(enriched) {
  const all = (enriched || []).filter(i => i.type === 'issue');
  const issues = all.filter(i => i.category !== NEEDS_DECISION_CATEGORY);
  const skippedNeedsDecision = all.length - issues.length;
  return { issues, skippedNeedsDecision };
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
    let items;
    try {
      items = await fetchAllPaginated(() => supabase
        .from('v_feedback_with_sensemaking')
        .select('*')
        .not('status', 'in', '(resolved,wont_fix,shipped,snoozed)')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
    } catch (error) {
      throw new Error(`Failed to load inbox items: ${error.message}`);
    }

    // GAP-008: Filter out feedback already linked to an SD (duplicate guard)
    let unlinked = (items || []).filter(i => !i.strategic_directive_id && !i.resolution_sd_id);
    const skippedLinked = (items || []).length - unlinked.length;
    if (skippedLinked > 0) {
      console.log(`[assist-engine] Skipped ${skippedLinked} feedback item(s) already linked to SDs`);
    }

    // SD-FDBK-INFRA-PER-FEEDBACK-ROW-001 / FR-5: extend GAP-008 to also skip rows
    // pre-claimed by a sibling QF (metadata.qf_claim_state='pending') or linked to an
    // in-flight QF (quick_fix_id set + qf.status IN open/in_progress). Closes the
    // reader-side gap that fed the 2026-05-11 sibling collision (feedback 9a9292c8).
    // Toggleable via LEO_ASSIST_PRECLAIM_FILTER=false for emergency rollback.
    if (process.env.LEO_ASSIST_PRECLAIM_FILTER !== 'false') {
      const qfIds = [...new Set(unlinked.map(i => i.quick_fix_id).filter(Boolean))];
      let inFlightQfIds = new Set();
      let qfGuardUnavailable = false;
      if (qfIds.length > 0) {
        try {
          const qfs = await fetchAllPaginated(() => supabase
            .from('quick_fixes').select('id, status').in('id', qfIds)
            .order('id', { ascending: true })); // unique tiebreaker (FR-6)
          inFlightQfIds = new Set(qfs.filter(q => q.status === 'open' || q.status === 'in_progress').map(q => q.id));
        } catch (guardErr) {
          qfGuardUnavailable = true;
          console.warn(`[assist-engine] GUARD_UNAVAILABLE: in-flight QF liveness check skipped — excluding all QF-linked feedback this cycle (fail-closed): ${guardErr.message}`);
        }
      }
      const beforePreclaim = unlinked.length;
      unlinked = unlinked.filter(i => {
        const meta = i.metadata || {};
        if (meta.qf_claim_state === 'pending') return false; // pre-claimed by sibling, not yet shipped
        // GUARD_UNAVAILABLE fail-closed: can't verify liveness, so any QF-linked row is excluded
        // rather than assuming "not in flight" (never treat a failed read as an empty in-flight set).
        if (qfGuardUnavailable) return !i.quick_fix_id;
        if (i.quick_fix_id && inFlightQfIds.has(i.quick_fix_id)) return false; // QF in-flight
        return true;
      });
      const skippedPreclaim = beforePreclaim - unlinked.length;
      if (skippedPreclaim > 0) {
        console.log(`[assist-engine] Skipped ${skippedPreclaim} feedback item(s) pre-claimed or linked to in-flight QFs (FR-5 filter)`);
      }
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

    // Separate issues from enhancements; harness_backlog filtered out per QF-20260509-149.
    // needs_decision completion_flag rows filtered out per QF-20260704-993.
    const { issues, skippedNeedsDecision } = filterIssuesExcludingNeedsDecision(enriched);
    if (skippedNeedsDecision > 0) {
      console.log(`[assist-engine] Excluded ${skippedNeedsDecision} needs_decision completion_flag row(s) from Phase 1 autonomous-fix stream (QF-20260704-993)`);
    }
    const { enhancements, skippedHarnessBacklog } = splitEnhancementsExcludingHarnessBacklog(enriched);
    if (skippedHarnessBacklog > 0) {
      console.log(`[assist-engine] Excluded ${skippedHarnessBacklog} harness_backlog row(s) from enhancements stream (campaign-mode workflow)`);
    }

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
    // FR-4 (SD-FDBK-FIX-LIVE-PROMPT-INJECTION-001): untrusted-origin (public-submitted)
    // title/description is quarantine-wrapped before it reaches the acting Claude Code
    // agent's instruction context, so it is read as DATA, never as INSTRUCTIONS.
    const untrustedOrigin = isUntrustedOrigin(issue);
    const safeTitle = untrustedOrigin ? sanitizeUserText(issue.title).content : issue.title;
    const safeDescription = untrustedOrigin ? sanitizeUserText(issue.description).content : issue.description;

    // FR-4: Classify verification lens BEFORE LOC sizing
    const lensResult = classifyVerificationLens(issue, {
      lensOverride: issue.lens_override || issue.metadata?.lensOverride
    });
    const classification = this.classifyIssue(issue);
    const related = this.context.findRelated(issue);

    const result = {
      id: issue.id,
      title: safeTitle,
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
          title: safeTitle,
          description: safeDescription,
          estimatedLoc: classification.estimatedLoc,
          skillInvocation: {
            skill: 'quick-fix',
            args: `--feedback-id ${issue.id} --title "${safeTitle.replace(/"/g, '\\"')}"`
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
          title: safeTitle,
          description: safeDescription,
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
          title: safeTitle,
          description: safeDescription,
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
  STALE_UNTRIAGED_GRACE_MS,
  splitEnhancementsExcludingHarnessBacklog,
  filterIssuesExcludingNeedsDecision,
  NEEDS_DECISION_CATEGORY
};

// Default export
export default AssistEngine;
