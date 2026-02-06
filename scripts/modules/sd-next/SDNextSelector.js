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

import { colors } from './colors.js';
import { checkDependenciesResolved } from './dependency-resolver.js';
import {
  loadActiveBaseline,
  loadRecentActivity,
  loadConflicts,
  loadPendingProposals,
  loadSDHierarchy,
  loadOKRScorecard,
  countActionableBaselineItems
} from './data-loaders.js';
import {
  displayOKRScorecard,
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
  isOrchestratorBlocked
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

    // Initialize session (auto-register and heartbeat)
    await this.initializeSession();

    // Load OKR scorecard first (strategic context)
    const okrData = await loadOKRScorecard(this.supabase);
    this.vision = okrData.vision;
    this.okrScorecard = okrData.scorecard;

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
    const recommendation = await displayRecommendations(this.supabase, this.baselineItems, this.conflicts);

    // Display proactive proposals (LEO v4.4)
    displayProposals(this.pendingProposals);

    // Display parallel opportunities
    await displayParallelOpportunities(this.sessionManager, this.currentSession);

    // Display session context
    displaySessionContext(this.recentActivity);

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
      this.currentSession = await this.sessionManager.getOrCreateSession();
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
      activeSessions: this.activeSessions
    };
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
      .select('id, sd_key, title, status, current_phase, progress_percentage, is_working_on, dependencies, is_active, parent_sd_id, category, metadata')
      .eq('is_active', true)
      .in('status', ['draft', 'active', 'in_progress', 'planning'])
      .order('created_at', { ascending: true });

    if (sdError || !allSDs) {
      console.log(`${colors.red}Error loading SDs: ${sdError?.message}${colors.reset}`);
      return;
    }

    // Create baseline lookup map for ordering and track assignment
    const baselineMap = new Map();
    for (const item of this.baselineItems) {
      baselineMap.set(item.sd_id, item);
    }

    // Process each SD
    for (const sd of allSDs) {
      if (sd.status === 'completed' || sd.status === 'cancelled') continue;

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

      tracks[trackKey].push({
        ...(baselineItem || {}),
        ...sd,
        sd_id: sd.sd_key || sd.id,
        sequence_rank: baselineItem?.sequence_rank || 9999,
        deps_resolved: depsResolved,
        childDepStatus,
        actual: this.actuals[sd.sd_key] || this.actuals[sd.id]
      });
    }

    // Sort each track by sequence_rank
    for (const trackKey of Object.keys(tracks)) {
      tracks[trackKey].sort((a, b) => (a.sequence_rank || 9999) - (b.sequence_rank || 9999));
    }

    const sessionContext = this.getSessionContext();
    displayTrackSection('A', 'Infrastructure/Safety', tracks.A, sessionContext);
    displayTrackSection('B', 'Feature/Stages', tracks.B, sessionContext);
    displayTrackSection('C', 'Quality', tracks.C, sessionContext);
    if (tracks.STANDALONE.length > 0) {
      displayTrackSection('STANDALONE', 'Standalone', tracks.STANDALONE, sessionContext);
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
