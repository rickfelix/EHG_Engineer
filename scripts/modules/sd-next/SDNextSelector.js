/**
 * SD Next Selector - Main Orchestration Class
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 *
 * Orchestrates the intelligent SD selection display using modular components.
 */

import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { warnIfTempFilesExceedThreshold } from '../../../lib/root-temp-checker.mjs';
import { checkUncommittedChanges, getAffectedRepos } from '../../../lib/multi-repo/index.js';
import { checkDependencyStatus } from '../../child-sd-preflight.js';
import { VentureContextManager } from '../../../lib/eva/venture-context-manager.js';
import { normalizeVenturePrefix } from '../sd-key-generator.js';

import { scoreToBand, bandToNumeric } from '../auto-proceed/urgency-scorer.js';
import { colors } from './colors.js';

/** Maximum time (ms) allowed for the displayTracks loop before preemption */
const MAX_DISPLAY_DURATION_MS = 30000;

/**
 * Compute OKR impact score for an SD from its KR alignments.
 * Inline implementation matching priority-scorer.js calculateOKRImpact logic.
 * @param {Array} alignments - KR alignment records for this SD
 * @param {Map} krMap - Map of KR id -> {id, status, code, title}
 * @returns {number} OKR impact score (0-90)
 */
function computeOKRScore(alignments, krMap) {
  const KR_URGENCY = { off_track: 3.0, at_risk: 2.0, on_track: 1.0, achieved: 0.0 };
  const CONTRIB = { direct: 1.5, enabling: 1.0, supporting: 0.5 };
  let total = 0;
  for (const a of alignments) {
    const kr = krMap.get(a.key_result_id);
    if (!kr) continue;
    const urgency = KR_URGENCY[kr.status] ?? 1.0;
    const contrib = CONTRIB[a.contribution_type] ?? 0.5;
    const weight = a.contribution_weight ?? 1.0;
    total += 10 * urgency * contrib * weight;
  }
  return Math.min(total, 90); // Cap at 90
}
import { checkDependenciesResolved, scanMetadataForMisplacedDependencies } from './dependency-resolver.js';
import { detectLocalSignals } from './local-signals.js';
import {
  loadActiveBaseline,
  loadRecentActivity,
  loadConflicts,
  loadPendingProposals,
  loadSDHierarchy,
  loadOKRScorecard,
  loadVisionScores,
  countActionableBaselineItems,
  loadOpenQuickFixes,
  triageQuickFixes,
  loadUnscheduledRoadmapItems,
  loadFeedbackItems
} from './data-loaders.js';
import {
  displayOKRScorecard,
  displayVisionPortfolioHeader,
  displayProposals,
  displayTrackSection,
  displayMultiRepoWarning,
  displayRecommendations,
  displayActiveSessions,
  displaySessionContext,
  displayParallelOpportunities,
  showFallbackQueue,
  showExhaustedBaselineMessage,
  displayBlockedStateBanner,
  isOrchestratorBlocked,
  displayTelemetryFindings,
  displayQuickFixes,
  displayRoadmapAwareness,
  displayBrainstormPipelineAdvisory
} from './display/index.js';
import {
  detectAllBlockedState,
  persistAllBlockedState
} from './blocked-state-detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * SDNextSelector - Intelligent Strategic Directive Selection
 *
 * Features:
 * 1. Multi-session awareness - Shows active sessions and their claims
 * 2. Dependency resolution - Verifies deps are actually completed
 * 3. Progress awareness - Surfaces partially completed SDs
 * 4. Session context - Checks recent git activity for continuity
 * 5. Risk-based ordering - Weights by downstream unblocking
 * 6. Conflict detection - Warns about parallel execution risks
 * 7. Track visibility - Shows parallel execution tracks
 * 8. Parallel opportunities - Proactively suggests opening new terminals
 */
export class SDNextSelector {
  constructor() {
    this.supabase = createSupabaseServiceClient();

    this.baseline = null;
    this.baselineItems = [];
    this.actuals = {};
    this.recentActivity = [];
    this.conflicts = [];
    this.currentSession = null;
    this.activeSessions = [];
    this.claimedSDs = new Map();
    this.pendingProposals = [];
    this.okrScorecard = [];
    this.vision = null;
    this.sdHierarchy = new Map();
    this.allSDs = new Map();
    this.multiRepoStatus = null;
    this.sessionManager = null;
    this.ventureContext = null; // Active venture context for SD filtering
    this.visionScores = new Map(); // Per-SD vision score aggregates (SD-MAN-INFRA-VISION-PORTFOLIO-SCORECARD-001)
    this.localSignals = new Map(); // Local filesystem signals (worktrees, auto-proceed-state) SD-LEO-INFRA-SESSION-COMPACTION-CLAIM-001
    this.openQuickFixes = [];
    this.qfTriageResults = new Map();
    this.unscheduledRoadmapItems = [];
    this.feedbackItems = [];
  }

  /**
   * Run the SD-Next selector. Displays the queue and returns structured
   * action data for programmatic consumers (PAT-AUTO-PROCEED-002 CAPA).
   *
   * @returns {{ action: string, sd_id: string|null, reason: string }}
   */
  async run() {
    console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.white} LEAD SD EXECUTION QUEUE${colors.reset}`);
    console.log(`${colors.dim} Multi-Session Aware Strategic Directive Selection${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Show venture context indicator after header (FR-5: user-facing output)
    // Resolved later in resolveVentureContext(), displayed here if VENTURE env is set early
    if (process.env.VENTURE) {
      console.log(`${colors.bold}${colors.green}🏢 Venture: ${process.env.VENTURE}${colors.reset}\n`);
    }

    // Initialize session (auto-register and heartbeat)
    await this.initializeSession();

    // Resolve venture context for SD filtering (SD-LEO-INFRA-SD-NAMESPACING-001)
    await this.resolveVentureContext();

    // Load OKR scorecard first (strategic context)
    const okrData = await loadOKRScorecard(this.supabase);
    this.vision = okrData.vision;
    this.okrScorecard = okrData.scorecard;

    // Load vision scores for portfolio header + per-SD badges (SD-MAN-INFRA-VISION-PORTFOLIO-SCORECARD-001)
    this.visionScores = await loadVisionScores(this.supabase);

    // Load SD hierarchy for tree display
    const hierarchyData = await loadSDHierarchy(this.supabase);
    this.allSDs = hierarchyData.allSDs;
    this.sdHierarchy = hierarchyData.sdHierarchy;

    // Check for blocked orchestrators (SD-LEO-ENH-AUTO-PROCEED-001-12)
    await this.checkBlockedOrchestrators();

    // Load data
    const baselineData = await loadActiveBaseline(this.supabase);
    this.baseline = baselineData.baseline;
    this.baselineItems = baselineData.items;
    this.actuals = baselineData.actuals;

    this.recentActivity = await loadRecentActivity(this.supabase, process.cwd());
    this.conflicts = await loadConflicts(this.supabase);
    await this.loadActiveSessions();
    this.pendingProposals = await loadPendingProposals(this.supabase);
    this.openQuickFixes = await loadOpenQuickFixes(this.supabase);
    if (this.openQuickFixes.length > 0) {
      this.qfTriageResults = await triageQuickFixes(this.openQuickFixes, this.supabase);
    }
    this.unscheduledRoadmapItems = await loadUnscheduledRoadmapItems(this.supabase);
    this.feedbackItems = await loadFeedbackItems(this.supabase);
    this.loadMultiRepoStatus();

    // SD-LEO-INFRA-SESSION-COMPACTION-CLAIM-001: Detect local signals
    try {
      const repoRoot = path.resolve(__dirname, '../../..');
      this.localSignals = detectLocalSignals(repoRoot);
    } catch {
      this.localSignals = new Map();
    }

    // Display vision portfolio header (SD-MAN-INFRA-VISION-PORTFOLIO-SCORECARD-001)
    displayVisionPortfolioHeader(this.visionScores);

    // Display OKR scorecard (strategic visibility)
    displayOKRScorecard(this.vision, this.okrScorecard);

    // Display active sessions
    displayActiveSessions(this.activeSessions, this.currentSession);

    // Display multi-repo warning if uncommitted changes exist
    displayMultiRepoWarning(this.multiRepoStatus);

    // Display scheduled job failure alerts from feedback table
    await this.displayScheduledJobAlerts();

    if (!this.baseline) {
      await showFallbackQueue(this.supabase, {
        sessionContext: this.getSessionContext()
      });
      const qfSummaryNoBaseline = displayQuickFixes(this.openQuickFixes, this.qfTriageResults, this.getSessionContext());
      this.displayFeedbackItems();
      if (qfSummaryNoBaseline.topStartableQF) {
        return { action: 'qf_start', sd_id: null, qf_id: qfSummaryNoBaseline.topStartableQF.id, reason: `${qfSummaryNoBaseline.totalCount} open quick fix(es) available` };
      }
      return { action: 'none', sd_id: null, reason: 'No active baseline found' };
    }

    // Check if baseline has actionable (non-completed) items
    const actionableCount = await countActionableBaselineItems(this.supabase, this.baselineItems);

    if (actionableCount === 0) {
      // Baseline exists but is exhausted - show helpful message and fallback
      showExhaustedBaselineMessage(this.baseline, this.baselineItems);
      await showFallbackQueue(this.supabase, {
        skipBaselineWarning: true,
        sessionContext: this.getSessionContext()
      });
      const qfSummaryExhausted = displayQuickFixes(this.openQuickFixes, this.qfTriageResults, this.getSessionContext());
      this.displayFeedbackItems();
      if (qfSummaryExhausted.topStartableQF) {
        return { action: 'qf_start', sd_id: null, qf_id: qfSummaryExhausted.topStartableQF.id, reason: `Baseline exhausted but ${qfSummaryExhausted.totalCount} open quick fix(es) available` };
      }
      return { action: 'none', sd_id: null, reason: 'Baseline exhausted - all items completed' };
    }

    // Display tracks
    await this.displayTracks();

    // Display open quick fixes with re-triage escalation warnings
    const qfSummary = displayQuickFixes(this.openQuickFixes, this.qfTriageResults, this.getSessionContext());

    // Display actionable feedback items (SD-LEO-INFRA-FEEDBACK-PIPELINE-ACTIVATION-001-C)
    this.displayFeedbackItems();

    // Display recommendations and get structured action data
    const recommendation = await displayRecommendations(this.supabase, this.baselineItems, this.conflicts, this.getSessionContext(), qfSummary);

    // Display roadmap awareness (unscheduled architecture phases)
    displayRoadmapAwareness(this.unscheduledRoadmapItems);

    // Display proactive proposals (LEO v4.4)
    displayProposals(this.pendingProposals);

    // Display parallel opportunities
    await displayParallelOpportunities(this.sessionManager, this.currentSession);

    // Display session context
    displaySessionContext(this.recentActivity);

    // Display telemetry findings (SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001C)
    await this.displayTelemetryFindings();

    // Display health snapshot freshness advisory (SD-LEO-INFRA-PRIORITY-SCORER-HEALTH-001)
    await this.displayHealthFreshness();

    // Display brainstorm pipeline health advisory
    await this.displayBrainstormPipelineHealth();

    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

    return recommendation || { action: 'none', sd_id: null, reason: 'No recommendation available' };
  }

  async initializeSession() {
    try {
      const sessionModule = await import('../../../lib/session-manager.mjs');
      this.sessionManager = sessionModule.default;
    } catch {
      this.sessionManager = null;
    }

    if (!this.sessionManager) {
      console.log(`${colors.dim}(Session coordination not available)${colors.reset}\n`);
      return;
    }

    try {
      await this.sessionManager.cleanupStaleSessions();
      await warnIfTempFilesExceedThreshold(10);

      // Try resolveOwnSession() first to reuse existing DB session,
      // avoiding duplicate session creation after context compaction.
      let resolved = null;
      try {
        const { resolveOwnSession } = await import('../../../lib/resolve-own-session.js');
        resolved = await resolveOwnSession(this.supabase, {
          select: 'session_id, sd_id, status, heartbeat_at, terminal_id',
          warnOnFallback: false
        });
        if (resolved.data && resolved.source !== 'heartbeat_fallback') {
          this.currentSession = resolved.data;
        }
      } catch { /* fall through */ }

      if (!this.currentSession) {
        this.currentSession = await this.sessionManager.getOrCreateSession();
      }
    } catch (e) {
      console.log(`${colors.dim}(Session init warning: ${e.message})${colors.reset}\n`);
    }
  }

  async loadActiveSessions() {
    if (!this.sessionManager) return;

    try {
      this.activeSessions = await this.sessionManager.getActiveSessions();

      for (const session of this.activeSessions) {
        if (session.sd_id) {
          this.claimedSDs.set(session.sd_id, session.session_id);
        }
      }

      // Supplement with direct claimed-sessions query so idle sessions with
      // active claims are not shown as available (QF-SD-NEXT-CLAIM-BLIND-SPOT-001)
      const claimedSessions = await this.sessionManager.getClaimedSessions();
      for (const session of claimedSessions) {
        if (session.sd_id && !this.claimedSDs.has(session.sd_id)) {
          this.claimedSDs.set(session.sd_id, session.session_id);
        }
      }
    } catch {
      // Non-fatal - continue without session data
    }
  }

  loadMultiRepoStatus() {
    try {
      this.multiRepoStatus = checkUncommittedChanges(true, { minAgeDays: 5 });
    } catch {
      this.multiRepoStatus = null;
    }
  }

  /**
   * Resolve venture context from session or environment.
   * When a venture is active, sd:next will filter to show only venture-scoped SDs.
   * SD-LEO-INFRA-SD-NAMESPACING-001
   */
  async resolveVentureContext() {
    try {
      // CLI override: VENTURE env var or --venture flag
      const envVenture = process.env.VENTURE;
      if (envVenture) {
        const prefix = normalizeVenturePrefix(envVenture);
        if (prefix) {
          this.ventureContext = { name: envVenture, prefix, source: 'env' };
          console.log(`${colors.dim}Venture context: ${this.ventureContext.name} (from VENTURE env var)${colors.reset}`);
          return;
        }
      }

      // Session-based: check active venture in session metadata
      const vcm = new VentureContextManager({ supabaseClient: this.supabase });
      const venture = await vcm.getActiveVenture();
      if (venture) {
        const prefix = normalizeVenturePrefix(venture.name);
        if (prefix) {
          this.ventureContext = { name: venture.name, prefix, source: 'session', ventureId: venture.id };
          console.log(`${colors.dim}Venture context: ${this.ventureContext.name} (from session)${colors.reset}`);
          return;
        }
      }
    } catch {
      // Non-fatal - continue without venture filtering
    }
    this.ventureContext = null;
  }

  /**
   * Check for blocked orchestrators (SD-LEO-ENH-AUTO-PROCEED-001-12)
   * Detects ALL_BLOCKED state for orchestrator SDs and displays warning
   */
  async checkBlockedOrchestrators() {
    // Find active orchestrator SDs
    const orchestrators = [];
    for (const [, sd] of this.allSDs) {
      if (sd.sd_type === 'orchestrator' && sd.status !== 'completed' && sd.status !== 'cancelled') {
        orchestrators.push(sd);
      }
    }

    if (orchestrators.length === 0) return;

    // Check each orchestrator for blocked state
    for (const orch of orchestrators) {
      // First check if already marked as blocked in metadata
      if (isOrchestratorBlocked(orch)) {
        const blockedState = orch.metadata?.all_blocked_state;
        if (blockedState?.is_blocked) {
          displayBlockedStateBanner({
            ...blockedState,
            orchestratorId: orch.id
          });
          continue;
        }
      }

      // Detect blocked state
      const blockedState = await detectAllBlockedState(orch.id, this.supabase);

      if (blockedState.isAllBlocked) {
        // Persist the blocked state
        await persistAllBlockedState(orch.id, blockedState, this.supabase);

        // Display the banner
        displayBlockedStateBanner(blockedState);
      }
    }
  }

  getSessionContext() {
    return {
      claimedSDs: this.claimedSDs,
      currentSession: this.currentSession,
      activeSessions: this.activeSessions,
      localSignals: this.localSignals, // SD-LEO-INFRA-SESSION-COMPACTION-CLAIM-001
      supabase: this.supabase // Needed for auto-release of stale dead claims
    };
  }

  /**
   * SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001: Annotate SDs with _stuck flag
   * Batch-loads accepted handoffs for all non-LEAD SDs and marks those with broken chains.
   */
  async _annotateStuckSDs(tracks) {
    try {
      // Collect all SD UUIDs that are beyond LEAD phase
      const allItems = [...tracks.A, ...tracks.B, ...tracks.C, ...(tracks.STANDALONE || [])];
      const beyondLead = allItems.filter(item => {
        const phase = item.current_phase || '';
        return ['PLAN_PRD', 'PLAN', 'PLAN_VERIFICATION', 'EXEC', 'EXEC_ACTIVE', 'EXEC_COMPLETE'].includes(phase);
      });

      if (beyondLead.length === 0) return;

      // Batch fetch accepted handoffs for these SDs
      const sdIds = beyondLead.map(item => item.id).filter(Boolean);
      if (sdIds.length === 0) return;

      const { data: handoffs } = await this.supabase
        .from('sd_phase_handoffs')
        .select('sd_id, from_phase, to_phase, status')
        .in('sd_id', sdIds)
        .eq('status', 'accepted');

      // Group handoffs by sd_id
      const handoffMap = new Map();
      for (const h of (handoffs || [])) {
        if (!handoffMap.has(h.sd_id)) handoffMap.set(h.sd_id, []);
        handoffMap.get(h.sd_id).push(h);
      }

      // Annotate items with _stuck flag
      const { isStuckSD } = await import('./status-helpers.js');
      for (const item of beyondLead) {
        const sdHandoffs = handoffMap.get(item.id) || [];
        item._stuck = isStuckSD(item, sdHandoffs);
      }
    } catch (e) {
      // Non-fatal: if stuck detection fails, items display normally
      console.debug('[sd-next] Stuck detection error:', e?.message || e);
    }
  }

  async displayTelemetryFindings() {
    try {
      const { getLatestFindings } = await import('../../../lib/telemetry/auto-trigger.js');
      const verbose = process.argv.includes('--verbose');
      const findings = await getLatestFindings(this.supabase);
      displayTelemetryFindings(findings, { verbose });
    } catch {
      // Non-critical - silently skip if telemetry module unavailable
    }
  }

  async displayHealthFreshness() {
    try {
      const { data: snapshots } = await this.supabase
        .from('codebase_health_snapshots')
        .select('dimension, scanned_at, score')
        .order('scanned_at', { ascending: false })
        .limit(10);

      if (!snapshots || snapshots.length === 0) {
        console.log(`\n${colors.yellow}⚠️  Health: No codebase health snapshots found. Run: npm run health:scan${colors.reset}`);
        return;
      }

      // Get latest per dimension
      const latest = {};
      for (const snap of snapshots) {
        if (!latest[snap.dimension]) latest[snap.dimension] = snap;
      }

      const now = new Date();
      const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
      const staleDimensions = [];

      for (const [dim, snap] of Object.entries(latest)) {
        const age = now - new Date(snap.scanned_at);
        if (age > staleThreshold) {
          staleDimensions.push({ dimension: dim, hoursAgo: Math.round(age / 3600000) });
        }
      }

      if (staleDimensions.length > 0) {
        console.log(`\n${colors.yellow}⚠️  Health Snapshots Stale (>${Math.round(staleThreshold / 3600000)}h):${colors.reset}`);
        for (const s of staleDimensions) {
          console.log(`${colors.dim}   ${s.dimension}: last scan ${s.hoursAgo}h ago${colors.reset}`);
        }
        console.log(`${colors.dim}   Run: npm run health:scan${colors.reset}`);
      }
    } catch {
      // Non-critical - silently skip
    }
  }

  async displayBrainstormPipelineHealth() {
    try {
      const { getBrainstormPipelineSummary } = await import('../../brainstorm-pipeline-health.js');
      const summary = await getBrainstormPipelineSummary();
      displayBrainstormPipelineAdvisory(summary);
    } catch {
      // Non-critical - silently skip if module unavailable
    }
  }

  /**
   * Display alert banner for failed scheduled GitHub Actions jobs.
   * Queries feedback table for source_type='github_actions' with status='new'.
   */
  async displayScheduledJobAlerts() {
    try {
      const { count, error } = await this.supabase
        .from('feedback')
        .select('*', { count: 'exact', head: true })
        .eq('source_type', 'github_actions')
        .eq('status', 'new');

      if (error || !count || count === 0) return;

      const plural = count === 1 ? 'failure' : 'failures';
      console.log(`\n${colors.yellow}${colors.bold}⚠  ${count} scheduled job ${plural} pending review${colors.reset}${colors.yellow} — run /inbox${colors.reset}`);
    } catch {
      // Non-critical — silently skip
    }
  }

  getSDRepos(sd) {
    try {
      return getAffectedRepos({
        title: sd.title || '',
        description: sd.description || '',
        sd_type: sd.sd_type || sd.metadata?.sd_type || 'feature'
      });
    } catch {
      return ['ehg', 'EHG_Engineer'];
    }
  }

  /**
   * Display actionable feedback items from the feedback table.
   * SD-LEO-INFRA-FEEDBACK-PIPELINE-ACTIVATION-001-C
   */
  displayFeedbackItems() {
    if (!this.feedbackItems || this.feedbackItems.length === 0) return;

    const c = colors;
    const severityBadge = (s) => {
      const badges = { critical: `${c.red}P0${c.reset}`, high: `${c.yellow}P1${c.reset}`, medium: `${c.dim}P2${c.reset}`, low: `${c.dim}P3${c.reset}` };
      return badges[s] || `${c.dim}P?${c.reset}`;
    };
    const daysAgo = (dateStr) => {
      const ms = Date.now() - new Date(dateStr).getTime();
      return Math.floor(ms / 86400000);
    };

    console.log(`\n${c.bold}${c.yellow}FEEDBACK INBOX${c.reset} (${this.feedbackItems.length} untriaged)`);
    for (const item of this.feedbackItems) {
      const age = daysAgo(item.created_at);
      const badge = severityBadge(item.severity || item.priority);
      const cat = item.category ? `${c.dim}[${item.category}]${c.reset} ` : '';
      const title = (item.title || '').substring(0, 60);
      console.log(`  ${badge} ${cat}${title}${age > 7 ? ` ${c.red}(${age}d)${c.reset}` : ` ${c.dim}(${age}d)${c.reset}`}`);
    }
    console.log(`${c.dim}  Run /inbox to triage${c.reset}`);
  }

  async displayTracks() {
    const tracks = { A: [], B: [], C: [], STANDALONE: [] };

    // SINGLE SOURCE OF TRUTH: Query all active SDs directly from strategic_directives_v2
    // This ensures SDs appear even if baseline sync trigger failed (SD-LEO-INFRA-QUEUE-SIMPLIFY-001)
    const { data: allSDs, error: sdError } = await this.supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase, progress_percentage, is_working_on, dependencies, is_active, parent_sd_id, category, metadata, vision_score, vision_origin_score_id, venture_id')
      .eq('is_active', true)
      .in('status', ['draft', 'active', 'in_progress', 'planning'])
      .order('created_at', { ascending: true });

    if (sdError || !allSDs) {
      console.log(`${colors.red}Error loading SDs: ${sdError?.message}${colors.reset}`);
      return;
    }

    // SD-LEO-INFRA-SD-NAMESPACING-001: Filter by venture prefix when venture context is active
    let filteredSDs = allSDs;
    if (this.ventureContext?.prefix) {
      const ventureKeyPrefix = `SD-${this.ventureContext.prefix}-`;
      filteredSDs = allSDs.filter(sd => {
        const key = sd.sd_key || '';
        return key.startsWith(ventureKeyPrefix);
      });
      console.log(`${colors.dim}Filtered to ${filteredSDs.length} venture-scoped SDs (prefix: ${ventureKeyPrefix})${colors.reset}`);
      if (filteredSDs.length === 0) {
        console.log(`${colors.yellow}No SDs found for venture "${this.ventureContext.name}". Showing all SDs.${colors.reset}`);
        filteredSDs = allSDs;
      }
    }

    // SD-LEO-INFRA-OKR-PIPELINE-AUTOMATION-001: OKR-Driven Queue Prioritization
    // Batch-load KR alignments and compute OKR impact scores per SD
    const okrBoostMap = new Map(); // sd_id (UUID) -> boost factor (legacy)
    const okrScoreMap = new Map(); // sd_id (UUID) -> OKR impact score (0-90)
    let okrBlendWeight = 0.30; // Default 30% OKR influence
    try {
      // Load configurable blend weight from chairman_dashboard_config
      const { data: configRow } = await this.supabase
        .from('chairman_dashboard_config')
        .select('metadata')
        .eq('config_key', 'default')
        .single();
      if (configRow?.metadata?.okr_blend_weight != null) {
        okrBlendWeight = Number(configRow.metadata.okr_blend_weight);
      }

      const sdUUIDs = filteredSDs.map(sd => sd.id);
      const { data: krAlignments } = await this.supabase
        .from('sd_key_result_alignment')
        .select('sd_id, key_result_id, contribution_type, contribution_weight, key_results!inner(id, status, code, title)')
        .in('sd_id', sdUUIDs);

      if (krAlignments && krAlignments.length > 0) {
        // Group alignments by SD for batch scoring
        const alignmentsBySD = new Map();
        const krMap = new Map();
        for (const alignment of krAlignments) {
          const kr = alignment.key_results;
          if (kr) krMap.set(kr.id, kr);
          if (!alignmentsBySD.has(alignment.sd_id)) alignmentsBySD.set(alignment.sd_id, []);
          alignmentsBySD.get(alignment.sd_id).push(alignment);

          // Legacy boost for backward compat
          const krStatus = kr?.status;
          if (krStatus === 'at_risk' || krStatus === 'off_track') {
            const boostFactor = krStatus === 'off_track' ? 0.5 : 0.7;
            const existing = okrBoostMap.get(alignment.sd_id);
            if (!existing || boostFactor < existing) {
              okrBoostMap.set(alignment.sd_id, boostFactor);
            }
          }
        }

        // Compute OKR impact score per SD using priority-scorer
        for (const [sdId, alignments] of alignmentsBySD) {
          const score = computeOKRScore(alignments, krMap);
          okrScoreMap.set(sdId, score);
        }
      }
    } catch {
      // Non-fatal: OKR scoring is additive, not blocking
    }

    // SD-LEO-INFRA-EHG-PORTFOLIO-ALLOCATION-001: Glide path policy boost
    // Maps venture_id -> multiplier based on growth_strategy weight in active policy.
    // Lower multiplier = higher priority (cash_engine gets lowest multiplier in profit-heavy phase).
    const policyBoostMap = new Map(); // venture_id (UUID) -> rank multiplier
    try {
      const { data: activePolicy } = await this.supabase
        .from('portfolio_allocation_policies')
        .select('weights, phase_definitions')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (activePolicy) {
        // Get ventures with growth_strategy for SDs that have venture_id
        const ventureIds = [...new Set(filteredSDs.map(sd => sd.venture_id).filter(Boolean))];
        if (ventureIds.length > 0) {
          const { data: ventures } = await this.supabase
            .from('ventures')
            .select('id, growth_strategy')
            .in('id', ventureIds);

          if (ventures) {
            // Weight map: higher weight = more aligned = lower rank multiplier (higher priority)
            // cash_engine with 0.60 weight -> multiplier 0.40 (big boost)
            // moonshot with 0.10 weight -> multiplier 0.90 (small boost)
            for (const v of ventures) {
              const strategy = v.growth_strategy;
              if (strategy && activePolicy.weights) {
                // Look for matching weight key (e.g., revenue_potential for cash_engine)
                // Simplified: map growth_strategy to a boost based on phase preference
                const phaseDefs = activePolicy.phase_definitions || [];
                const allowedCount = phaseDefs.filter(p =>
                  (p.allowed_growth_strategies || []).includes(strategy)
                ).length;
                // More phases allow it = more universal = less boosted
                // Fewer phases allow it = more specialized = more boosted in matching phase
                const boost = allowedCount >= phaseDefs.length ? 1.0 : 0.7 + (allowedCount / phaseDefs.length) * 0.3;
                policyBoostMap.set(v.id, boost);
              }
            }
          }
        }
      }
    } catch {
      // Non-fatal: policy scoring is additive, not blocking
    }

    // Create baseline lookup map for ordering and track assignment
    const baselineMap = new Map();
    for (const item of this.baselineItems) {
      baselineMap.set(item.sd_id, item);
    }

    // Track SDs with misplaced dependency info in metadata
    const misplacedDeps = [];

    // Process each SD (uses filtered list when venture context is active)
    const displayStartTime = Date.now();
    let preempted = false;
    for (const sd of filteredSDs) {
      // Preemption check: abort if display loop exceeds timeout
      if (Date.now() - displayStartTime > MAX_DISPLAY_DURATION_MS) {
        console.log(`${colors.yellow}⚠️  Display preempted after ${MAX_DISPLAY_DURATION_MS / 1000}s — showing ${Object.values(tracks).flat().length} of ${filteredSDs.length} SDs${colors.reset}`);
        preempted = true;
        break;
      }
      if (sd.status === 'completed' || sd.status === 'cancelled') continue;

      // Governance: skip deferred SDs from recommendation pipeline (keep in display with badge)
      const isDeferred = sd.metadata?.do_not_advance_without_trigger === true;

      // QA: Check for dependency info in metadata with empty dependencies column
      const depsEmpty = !sd.dependencies || (Array.isArray(sd.dependencies) && sd.dependencies.length === 0);
      if (depsEmpty && sd.metadata) {
        const scan = scanMetadataForMisplacedDependencies(sd.metadata);
        if (scan.hasMisplacedDeps) {
          misplacedDeps.push({ sd_key: sd.sd_key || sd.id, findings: scan.findings });
        }
      }

      // Look up baseline item by sd_key or id
      const baselineItem = baselineMap.get(sd.sd_key) || baselineMap.get(sd.id);

      // Derive track: baseline > metadata > category > STANDALONE
      let trackKey;
      if (baselineItem?.track) {
        trackKey = baselineItem.track;
      } else if (sd.metadata?.execution_track) {
        const track = sd.metadata.execution_track;
        trackKey = track === 'Infrastructure' || track === 'Safety' ? 'A' :
                   track === 'Feature' ? 'B' :
                   track === 'Quality' ? 'C' : 'STANDALONE';
      } else if (sd.category) {
        const cat = sd.category.toLowerCase();
        trackKey = cat === 'infrastructure' || cat === 'platform' ? 'A' :
                   cat === 'quality' || cat === 'testing' || cat === 'qa' ? 'C' : 'B';
      } else {
        trackKey = 'STANDALONE';
      }

      // Log warning if SD not in baseline (helps detect sync failures)
      if (!baselineItem && sd.status !== 'draft') {
        console.log(`${colors.yellow}⚠️  SD ${sd.sd_key || sd.id} not in baseline - using category-based track${colors.reset}`);
      }

      if (!tracks[trackKey]) trackKey = 'STANDALONE';

      const depsResolved = await checkDependenciesResolved(this.supabase, sd.dependencies);

      let childDepStatus = null;
      if (sd.parent_sd_id) {
        try {
          childDepStatus = await checkDependencyStatus(sd.sd_key || sd.id);
        } catch {
          // Silently ignore errors
        }
      }

      // SD-MAN-INFRA-PRIORITY-QUEUE-ROUTING-001: Vision-score-weighted priority
      // gap_weight = (100 - vision_score) / 100; composite_rank = sequence_rank / (1 + gap_weight)
      const sequenceRank = baselineItem?.sequence_rank || 9999;
      const hasVisionOrigin = !!sd.vision_origin_score_id;
      const visionScoreVal = sd.vision_score ?? null;
      const gapWeight = (hasVisionOrigin && visionScoreVal !== null)
        ? (100 - Math.max(0, Math.min(100, visionScoreVal))) / 100
        : 0;
      let compositeRank = gapWeight > 0 ? sequenceRank / (1 + gapWeight) : sequenceRank;

      // SD-LEO-INFRA-OKR-PIPELINE-AUTOMATION-001: OKR impact scoring
      // Higher OKR score = more strategic alignment = lower rank (higher priority)
      const okrScore = okrScoreMap.get(sd.id) || 0;
      const okrBoost = okrBoostMap.get(sd.id) || 1.0;
      // Blend: subtract OKR-proportional amount from rank (max 90 * 0.30 = 27 rank points)
      compositeRank = (compositeRank * okrBoost) - (okrScore * okrBlendWeight);

      // SD-LEO-INFRA-EHG-PORTFOLIO-ALLOCATION-001: Glide path policy boost
      // Venture-scoped SDs get a multiplier based on their growth_strategy alignment
      // with the active policy weights. Infrastructure SDs are policy-neutral (1.0x).
      const policyBoost = policyBoostMap.get(sd.venture_id) ?? 1.0;
      if (policyBoost !== 1.0) {
        compositeRank = compositeRank * policyBoost;
      }

      // SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-A: Extract urgency from metadata
      const urgencyScore = sd.metadata?.urgency_score ?? null;
      const urgencyBand = sd.metadata?.urgency_band ?? (urgencyScore !== null ? scoreToBand(urgencyScore) : 'P3');
      const urgencyNumeric = bandToNumeric(urgencyBand);

      tracks[trackKey].push({
        ...(baselineItem || {}),
        ...sd,
        sd_id: sd.sd_key || sd.id,
        sequence_rank: sequenceRank,
        gap_weight: gapWeight,
        composite_rank: compositeRank,
        okr_boost: okrBoost < 1.0 ? okrBoost : null,
        okr_score: okrScore > 0 ? okrScore : null, // OKR impact score (0-90)
        policy_boost: policyBoost !== 1.0 ? policyBoost : null, // Glide path weight
        urgency_score: urgencyScore,
        urgency_band: urgencyBand,
        urgency_numeric: urgencyNumeric,
        deps_resolved: depsResolved,
        is_deferred: isDeferred,
        childDepStatus,
        actual: this.actuals[sd.sd_key] || this.actuals[sd.id]
      });
    }

    // Sort each track: urgency band (P0 first) → urgency score (desc) → composite_rank fallback
    for (const trackKey of Object.keys(tracks)) {
      tracks[trackKey].sort((a, b) => {
        const bandDiff = (a.urgency_numeric ?? 3) - (b.urgency_numeric ?? 3);
        if (bandDiff !== 0) return bandDiff;
        const scoreDiff = (b.urgency_score ?? 0) - (a.urgency_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return (a.composite_rank ?? a.sequence_rank ?? 9999) - (b.composite_rank ?? b.sequence_rank ?? 9999);
      });
    }

    // SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001: Annotate stuck SDs
    await this._annotateStuckSDs(tracks);

    const sessionContext = this.getSessionContext();
    await displayTrackSection('A', 'Infrastructure/Safety', tracks.A, sessionContext);
    await displayTrackSection('B', 'Feature/Stages', tracks.B, sessionContext);
    await displayTrackSection('C', 'Quality', tracks.C, sessionContext);
    if (tracks.STANDALONE.length > 0) {
      await displayTrackSection('STANDALONE', 'Standalone', tracks.STANDALONE, sessionContext);
    }

    // Display misplaced dependency warnings (skip if preempted)
    if (!preempted && misplacedDeps.length > 0) {
      console.log(`\n${colors.yellow}${colors.bold}DEPENDENCY QA WARNING:${colors.reset} ${misplacedDeps.length} SD(s) have dependency info in metadata but empty dependencies column`);
      // Show up to 5 examples
      for (const item of misplacedDeps.slice(0, 5)) {
        const keys = item.findings.flatMap(f => f.sdKeys);
        const metaKeys = item.findings.map(f => `metadata.${f.key}`).join(', ');
        const sdKeyStr = keys.length > 0 ? ` → ${keys.join(', ')}` : '';
        console.log(`  ${colors.yellow}!${colors.reset} ${item.sd_key}: ${metaKeys}${sdKeyStr}`);
      }
      if (misplacedDeps.length > 5) {
        console.log(`  ${colors.dim}... and ${misplacedDeps.length - 5} more${colors.reset}`);
      }
      console.log(`  ${colors.dim}These dependencies are NOT enforced by the queue system.${colors.reset}`);
      console.log(`  ${colors.dim}Move them to the "dependencies" column for proper blocking/readiness control.${colors.reset}`);
    }
  }
}

/**
 * Create and run the SD Next selector.
 *
 * Returns structured action data for programmatic consumers
 * (PAT-AUTO-PROCEED-002 CAPA: action semantics for autonomous flows).
 *
 * @returns {{ action: string, sd_id: string|null, reason: string }}
 */
export async function runSDNext() {
  const selector = new SDNextSelector();
  return await selector.run();
}
