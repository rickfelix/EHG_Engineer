/**
 * SD Next Selector - Main Orchestration Class
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 *
 * Orchestrates the intelligent SD selection display using modular components.
 */

import { createClient } from '@supabase/supabase-js';
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
  countActionableBaselineItems
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
  displayTelemetryFindings
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
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

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

    if (!this.baseline) {
      await showFallbackQueue(this.supabase, {
        sessionContext: this.getSessionContext()
      });
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
      return { action: 'none', sd_id: null, reason: 'Baseline exhausted - all items completed' };
    }

    // Display tracks
    await this.displayTracks();

    // Display recommendations and get structured action data
    const recommendation = await displayRecommendations(this.supabase, this.baselineItems, this.conflicts, this.getSessionContext());

    // Display proactive proposals (LEO v4.4)
    displayProposals(this.pendingProposals);

    // Display parallel opportunities
    await displayParallelOpportunities(this.sessionManager, this.currentSession);

    // Display session context
    displaySessionContext(this.recentActivity);

    // Display telemetry findings (SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001C)
    await this.displayTelemetryFindings();

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

  async displayTracks() {
    const tracks = { A: [], B: [], C: [], STANDALONE: [] };

    // SINGLE SOURCE OF TRUTH: Query all active SDs directly from strategic_directives_v2
    // This ensures SDs appear even if baseline sync trigger failed (SD-LEO-INFRA-QUEUE-SIMPLIFY-001)
    const { data: allSDs, error: sdError } = await this.supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase, progress_percentage, is_working_on, dependencies, is_active, parent_sd_id, category, metadata, vision_score, vision_origin_score_id')
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

    // SD-MAN-FEAT-CORRECTIVE-VISION-GAP-007: Guardrail 4 - OKR-Driven Queue Prioritization
    // Batch-load KR alignments to boost SDs linked to at-risk/off-track KRs
    const okrBoostMap = new Map(); // sd_id (UUID) -> boost factor
    try {
      const sdUUIDs = filteredSDs.map(sd => sd.id);
      const { data: krAlignments } = await this.supabase
        .from('sd_key_result_alignment')
        .select('sd_id, key_result_id, contribution_type, key_results!inner(status)')
        .in('sd_id', sdUUIDs);

      if (krAlignments && krAlignments.length > 0) {
        for (const alignment of krAlignments) {
          const krStatus = alignment.key_results?.status;
          // Boost SDs linked to at-risk or off-track KRs
          if (krStatus === 'at_risk' || krStatus === 'off_track') {
            const boostFactor = krStatus === 'off_track' ? 0.5 : 0.7; // Lower = higher priority
            const existing = okrBoostMap.get(alignment.sd_id);
            // Keep the strongest boost (lowest factor)
            if (!existing || boostFactor < existing) {
              okrBoostMap.set(alignment.sd_id, boostFactor);
            }
          }
        }
      }
    } catch {
      // Non-fatal: OKR boost is additive, not blocking
    }

    // Create baseline lookup map for ordering and track assignment
    const baselineMap = new Map();
    for (const item of this.baselineItems) {
      baselineMap.set(item.sd_id, item);
    }

    // Track SDs with misplaced dependency info in metadata
    const misplacedDeps = [];

    // Process each SD (uses filtered list when venture context is active)
    for (const sd of filteredSDs) {
      if (sd.status === 'completed' || sd.status === 'cancelled') continue;

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

      // SD-MAN-FEAT-CORRECTIVE-VISION-GAP-007: Guardrail 4 - OKR boost
      // SDs linked to at-risk/off-track KRs get priority boost (lower rank = higher priority)
      const okrBoost = okrBoostMap.get(sd.id) || 1.0;
      compositeRank = compositeRank * okrBoost;

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
        okr_boost: okrBoost < 1.0 ? okrBoost : null, // Only set if boosted
        urgency_score: urgencyScore,
        urgency_band: urgencyBand,
        urgency_numeric: urgencyNumeric,
        deps_resolved: depsResolved,
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

    const sessionContext = this.getSessionContext();
    await displayTrackSection('A', 'Infrastructure/Safety', tracks.A, sessionContext);
    await displayTrackSection('B', 'Feature/Stages', tracks.B, sessionContext);
    await displayTrackSection('C', 'Quality', tracks.C, sessionContext);
    if (tracks.STANDALONE.length > 0) {
      await displayTrackSection('STANDALONE', 'Standalone', tracks.STANDALONE, sessionContext);
    }

    // Display misplaced dependency warnings
    if (misplacedDeps.length > 0) {
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
