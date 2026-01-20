#!/usr/bin/env node

/**
 * SD Next - Intelligent Strategic Directive Selection
 *
 * Purpose: Help new Claude Code sessions know which SD to work on
 * Owner: LEAD role
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

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { warnIfTempFilesExceedThreshold } from '../lib/root-temp-checker.mjs';
import { getEstimatedDuration, formatEstimateShort } from './lib/duration-estimator.js';
import { checkDependencyStatus } from './child-sd-preflight.js';
import {
  getAffectedRepos,
  checkUncommittedChanges
} from '../lib/multi-repo/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from EHG_Engineer (Windows-compatible)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import session manager (dynamic import for ESM compatibility)
let sessionManager;
try {
  sessionManager = (await import('../lib/session-manager.mjs')).default;
} catch {
  // Fallback if module not found
  sessionManager = null;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
};

/**
 * Get phase-aware status icon for an SD
 * Control Gap Fix: SD status must reflect actual phase, not just dependency resolution
 *
 * @param {Object} item - SD item with current_phase, status, deps_resolved, progress_percentage
 * @returns {string} Colored status string for display
 */
function getPhaseAwareStatus(item) {
  const phase = item.current_phase || '';
  const status = item.status || '';
  const depsResolved = item.deps_resolved;
  const progress = item.progress_percentage || 0;

  // Phase-based status takes priority over dependency resolution
  // This prevents showing "READY" for SDs that need verification/review

  // EXEC_COMPLETE with review status = needs verification
  if (phase === 'EXEC_COMPLETE' && status === 'review') {
    return `${colors.magenta}VERIFY${colors.reset}`;
  }

  // Any COMPLETE phase that isn't fully completed = needs close-out
  if (phase.includes('COMPLETE') && status !== 'completed') {
    return `${colors.magenta}CLOSE-OUT${colors.reset}`;
  }

  // PLAN phases = in planning, not ready for LEAD work
  if (phase === 'PLAN_PRD' || phase === 'PLAN') {
    return `${colors.cyan}PLANNING${colors.reset}`;
  }

  // Draft status = needs LEAD review first
  if (status === 'draft') {
    return `${colors.yellow}DRAFT${colors.reset}`;
  }

  // In active EXEC phase
  if (phase === 'EXEC' || phase === 'EXEC_ACTIVE') {
    if (progress > 0 && progress < 100) {
      return `${colors.blue}EXEC ${progress}%${colors.reset}`;
    }
    return `${colors.blue}IN_EXEC${colors.reset}`;
  }

  // Standard dependency-based logic for LEAD phase or new SDs
  if (depsResolved) {
    return `${colors.green}READY${colors.reset}`;
  } else if (progress > 0) {
    return `${colors.yellow}${progress}%${colors.reset}`;
  } else {
    return `${colors.red}BLOCKED${colors.reset}`;
  }
}

/**
 * Check if an SD is actionable for LEAD work (starting new work)
 * Returns false for SDs in verification, planning, or other non-LEAD phases
 */
function isActionableForLead(item) {
  const phase = item.current_phase || '';
  const status = item.status || '';

  // Not actionable if needs verification
  if (phase === 'EXEC_COMPLETE' || phase.includes('COMPLETE')) {
    return false;
  }

  // Not actionable if in active planning or execution
  if (phase === 'PLAN_PRD' || phase === 'PLAN' || phase === 'EXEC' || phase === 'EXEC_ACTIVE') {
    return false;
  }

  // Not actionable if in review status
  if (status === 'review') {
    return false;
  }

  return true;
}

class SDNextSelector {
  constructor() {
    this.baseline = null;
    this.baselineItems = [];
    this.actuals = {};
    this.recentActivity = [];
    this.conflicts = [];
    this.currentSession = null;
    this.activeSessions = [];
    this.claimedSDs = new Map(); // sd_id -> session_id
    this.pendingProposals = []; // LEO v4.4: Proactive proposals
    this.okrScorecard = []; // OKR hierarchy scorecard
    this.vision = null; // Strategic vision
    this.sdHierarchy = new Map(); // parent_sd_id -> children[]
    this.allSDs = new Map(); // sd_id -> sd details
    this.multiRepoStatus = null; // Multi-repo uncommitted changes status
  }

  async run() {
    console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.white} LEAD SD EXECUTION QUEUE${colors.reset}`);
    console.log(`${colors.dim} Multi-Session Aware Strategic Directive Selection${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Initialize session (auto-register and heartbeat)
    await this.initializeSession();

    // Load OKR scorecard first (strategic context)
    await this.loadOKRScorecard();

    // Load SD hierarchy for tree display
    await this.loadSDHierarchy();

    // Load data
    await this.loadActiveBaseline();
    await this.loadRecentActivity();
    await this.loadConflicts();
    await this.loadActiveSessions();
    await this.loadPendingProposals();
    this.loadMultiRepoStatus(); // Phase 2: Multi-repo intelligence

    // Display OKR scorecard (strategic visibility)
    this.displayOKRScorecard();

    // Display active sessions
    await this.displayActiveSessions();

    // Display multi-repo warning if uncommitted changes exist (Phase 2)
    this.displayMultiRepoWarning();

    if (!this.baseline) {
      await this.showFallbackQueue();
      return;
    }

    // Check if baseline has actionable (non-completed) items
    const actionableCount = await this.countActionableBaselineItems();

    if (actionableCount === 0) {
      // Baseline exists but is exhausted - show helpful message and fallback
      await this.showExhaustedBaselineMessage();
      await this.showFallbackQueue({ skipBaselineWarning: true });
      return;
    }

    // Display tracks
    await this.displayTracks();

    // Display recommendations
    await this.displayRecommendations();

    // Display proactive proposals (LEO v4.4)
    await this.displayProposals();

    // Display parallel opportunities
    await this.displayParallelOpportunities();

    // Display session context
    this.displaySessionContext();

    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);
  }

  async initializeSession() {
    if (!sessionManager) {
      console.log(`${colors.dim}(Session coordination not available)${colors.reset}\n`);
      return;
    }

    try {
      // Cleanup stale sessions first
      await sessionManager.cleanupStaleSessions();

      // Check for accumulated temp files
      await warnIfTempFilesExceedThreshold(10);

      // Get or create session (auto-registers and updates heartbeat)
      this.currentSession = await sessionManager.getOrCreateSession();
    } catch {
      console.log(`${colors.dim}(Session init warning: ${e.message})${colors.reset}\n`);
    }
  }

  async loadActiveSessions() {
    if (!sessionManager) return;

    try {
      this.activeSessions = await sessionManager.getActiveSessions();

      // Build claimed SDs map
      for (const session of this.activeSessions) {
        if (session.sd_id) {
          this.claimedSDs.set(session.sd_id, session.session_id);
        }
      }
    } catch {
      // Non-fatal - continue without session data
    }
  }

  async displayActiveSessions() {
    if (this.activeSessions.length === 0) return;

    const sessionsWithClaims = this.activeSessions.filter(s => s.sd_id);
    const idleSessions = this.activeSessions.filter(s => !s.sd_id);

    if (sessionsWithClaims.length > 0) {
      console.log(`${colors.bold}ACTIVE SESSIONS (${sessionsWithClaims.length}):${colors.reset}\n`);

      for (const s of sessionsWithClaims) {
        const isCurrent = this.currentSession && s.session_id === this.currentSession.session_id;
        const marker = isCurrent ? `${colors.green}→${colors.reset}` : ' ';
        const shortId = s.session_id.substring(0, 16) + '...';
        const ageMin = Math.round(s.claim_duration_minutes || 0);

        console.log(`${marker} ${shortId} │ ${colors.bold}${s.sd_id}${colors.reset} (Track ${s.track}) │ ${ageMin}m active`);
      }
      console.log();
    }

    if (idleSessions.length > 0 && sessionsWithClaims.length === 0) {
      console.log(`${colors.dim}(${idleSessions.length} idle session(s) detected)${colors.reset}\n`);
    }
  }

  async loadActiveBaseline() {
    const { data: baseline, error } = await supabase
      .from('sd_execution_baselines')
      .select('*')
      .eq('is_active', true)
      .single();

    if (error || !baseline) {
      console.log(`${colors.yellow}No active baseline found. Using sequence_rank from SDs.${colors.reset}\n`);
      return;
    }

    this.baseline = baseline;

    // Load baseline items with SD details
    const { data: items } = await supabase
      .from('sd_baseline_items')
      .select('*')
      .eq('baseline_id', baseline.id)
      .order('sequence_rank');

    this.baselineItems = items || [];

    // Load actuals
    const { data: actuals } = await supabase
      .from('sd_execution_actuals')
      .select('*')
      .eq('baseline_id', baseline.id);

    if (actuals) {
      actuals.forEach(a => this.actuals[a.sd_id] = a);
    }
  }

  /**
   * Count how many baseline items have non-completed SDs
   */
  async countActionableBaselineItems() {
    if (!this.baseline || !this.baselineItems.length) return 0;

    let actionableCount = 0;
    for (const item of this.baselineItems) {
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('status, is_active')
        .eq('legacy_id', item.sd_id)
        .single();

      if (sd && sd.is_active && sd.status !== 'completed' && sd.status !== 'cancelled') {
        actionableCount++;
      }
    }
    return actionableCount;
  }

  /**
   * Show message when baseline exists but all items are completed
   */
  async showExhaustedBaselineMessage() {
    const completedCount = this.baselineItems.length;

    console.log(`${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.green}${colors.bold}✓ BASELINE COMPLETE${colors.reset}\n`);
    console.log(`  All ${completedCount} SDs in the current baseline are completed!`);
    console.log(`  ${colors.dim}Baseline ID: ${this.baseline.id.substring(0, 8)}...${colors.reset}\n`);

    console.log(`${colors.cyan}OPTIONS:${colors.reset}`);
    console.log(`  1. ${colors.bold}Continue with available SDs${colors.reset} (shown below)`);
    console.log(`  2. ${colors.bold}Create new baseline:${colors.reset} npm run sd:baseline`);
    console.log(`  3. ${colors.bold}Deactivate old baseline:${colors.reset} npm run sd:baseline:deactivate\n`);

    // Show completed baseline items summary
    console.log(`${colors.dim}Completed baseline items:${colors.reset}`);
    for (const item of this.baselineItems.slice(0, 5)) {
      console.log(`${colors.dim}  ✓ ${item.sd_id}${colors.reset}`);
    }
    if (this.baselineItems.length > 5) {
      console.log(`${colors.dim}  ... and ${this.baselineItems.length - 5} more${colors.reset}`);
    }
    console.log();
  }

  async loadRecentActivity() {
    // Method 1: Check git commits for SD references (last 7 days)
    try {
      const gitLog = execSync(
        'git log --oneline --since="7 days ago" --format="%s"',
        { encoding: 'utf8', cwd: process.cwd(), stdio: ['pipe', 'pipe', 'ignore'] }
      );

      const sdPattern = /SD-[A-Z0-9-]+/g;
      const matches = gitLog.match(sdPattern) || [];
      const sdCounts = {};

      matches.forEach(sd => {
        sdCounts[sd] = (sdCounts[sd] || 0) + 1;
      });

      // Sort by frequency
      this.recentActivity = Object.entries(sdCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([sd, count]) => ({ sd_id: sd, commits: count }));

    } catch {
      // Git not available or error
      this.recentActivity = [];
    }

    // Method 2: Check updated_at on SDs (fallback/supplement)
    const { data: recentSDs } = await supabase
      .from('strategic_directives_v2')
      .select('legacy_id, title, updated_at')
      .eq('is_active', true)
      .in('status', ['draft', 'active', 'in_progress'])
      .order('updated_at', { ascending: false })
      .limit(5);

    if (recentSDs) {
      recentSDs.forEach(sd => {
        if (!this.recentActivity.find(a => a.sd_id === sd.legacy_id)) {
          this.recentActivity.push({
            sd_id: sd.legacy_id,
            commits: 0,
            updated_at: sd.updated_at
          });
        }
      });
    }
  }

  async loadConflicts() {
    const { data: conflicts } = await supabase
      .from('sd_conflict_matrix')
      .select('*')
      .is('resolved_at', null)
      .eq('conflict_severity', 'blocking');

    this.conflicts = conflicts || [];
  }

  /**
   * Load multi-repo status (Phase 2 multi-repo intelligence)
   * Checks for uncommitted changes across all EHG repositories
   * Only warns about files older than 5 days (WIP files are ignored)
   */
  loadMultiRepoStatus() {
    try {
      // Only warn about files older than 5 days - recent WIP is expected
      this.multiRepoStatus = checkUncommittedChanges(true, { minAgeDays: 5 });
    } catch {
      // Non-fatal - continue without multi-repo status
      this.multiRepoStatus = null;
    }
  }

  /**
   * Get affected repos for an SD
   * @param {Object} sd - SD object with title, description, sd_type
   * @returns {Array} List of affected repo names
   */
  getSDRepos(sd) {
    try {
      return getAffectedRepos({
        title: sd.title || '',
        description: sd.description || '',
        sd_type: sd.sd_type || sd.metadata?.sd_type || 'feature'
      });
    } catch {
      return ['ehg', 'EHG_Engineer']; // Default to both
    }
  }

  /**
   * Display multi-repo status warning if uncommitted changes exist
   * Only shows files older than the configured threshold (default 5 days)
   */
  displayMultiRepoWarning() {
    if (!this.multiRepoStatus || !this.multiRepoStatus.hasChanges) return;

    const minAgeDays = this.multiRepoStatus.minAgeDays || 5;

    console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.bgYellow}${colors.bold} MULTI-REPO WARNING ${colors.reset}`);
    console.log(`${colors.dim}(Showing files ≥${minAgeDays} days old)${colors.reset}\n`);

    for (const repo of this.multiRepoStatus.summary) {
      const icon = repo.uncommittedCount > 0 ? '📝' : '📤';
      console.log(`  ${icon} ${colors.bold}${repo.displayName}${colors.reset} (${repo.branch})`);

      if (repo.uncommittedCount > 0) {
        console.log(`     ${repo.uncommittedCount} uncommitted change(s)`);
      }
      if (repo.unpushedCount > 0) {
        console.log(`     ${repo.unpushedCount} unpushed commit(s)`);
      }
    }

    console.log(`\n  ${colors.yellow}⚠️  Commit changes before starting new SD work${colors.reset}`);
    console.log(`  ${colors.dim}Run: node scripts/multi-repo-status.js for details${colors.reset}`);
  }

  /**
   * Load pending SD proposals (LEO Protocol v4.4)
   */
  async loadPendingProposals() {
    try {
      const { data: proposals, error } = await supabase
        .from('sd_proposals')
        .select('*')
        .eq('status', 'pending')
        .order('urgency_level', { ascending: true }) // critical first
        .order('confidence_score', { ascending: false })
        .limit(5);

      if (error) {
        // Table may not exist yet - non-fatal
        return;
      }

      this.pendingProposals = proposals || [];
    } catch {
      // Non-fatal - proposals are optional
    }
  }

  /**
   * Load SD hierarchy for parent-child tree display
   */
  async loadSDHierarchy() {
    try {
      const { data: sds } = await supabase
        .from('strategic_directives_v2')
        .select('id, legacy_id, title, parent_sd_id, status, current_phase, progress_percentage, dependencies, is_working_on, metadata, priority')
        .eq('is_active', true)
        .order('created_at');

      if (!sds) return;

      // Build lookup map and hierarchy
      for (const sd of sds) {
        const sdId = sd.legacy_id || sd.id;
        this.allSDs.set(sdId, sd);
        this.allSDs.set(sd.id, sd); // Also map by UUID

        if (sd.parent_sd_id) {
          if (!this.sdHierarchy.has(sd.parent_sd_id)) {
            this.sdHierarchy.set(sd.parent_sd_id, []);
          }
          this.sdHierarchy.get(sd.parent_sd_id).push(sd);
        }
      }
    } catch {
      // Non-fatal - continue without hierarchy
    }
  }

  /**
   * Get children of an SD (by legacy_id or UUID)
   */
  getChildren(sdId) {
    // Try both legacy_id and UUID lookups
    const children = this.sdHierarchy.get(sdId) || [];
    const sd = this.allSDs.get(sdId);
    if (sd && sd.id !== sdId) {
      const byUuid = this.sdHierarchy.get(sd.id) || [];
      return [...children, ...byUuid];
    }
    return children;
  }

  /**
   * Get parent SD details
   */
  getParent(sd) {
    if (!sd.parent_sd_id) return null;
    return this.allSDs.get(sd.parent_sd_id);
  }

  /**
   * Load OKR scorecard for strategic visibility
   */
  async loadOKRScorecard() {
    try {
      // Load active vision
      const { data: vision } = await supabase
        .from('strategic_vision')
        .select('*')
        .eq('is_active', true)
        .single();

      this.vision = vision;

      // Load OKR scorecard
      const { data: scorecard, error } = await supabase
        .from('v_okr_scorecard')
        .select('*')
        .order('sequence');

      if (error) {
        // View may not exist yet - non-fatal
        return;
      }

      this.okrScorecard = scorecard || [];

      // Load key results with details for each objective
      for (const obj of this.okrScorecard) {
        const { data: krs } = await supabase
          .from('key_results')
          .select('code, title, current_value, target_value, unit, status, baseline_value, direction')
          .eq('objective_id', obj.objective_id)
          .eq('is_active', true)
          .order('sequence');

        obj.key_results = krs || [];
      }
    } catch {
      // Non-fatal - OKRs are optional
    }
  }

  /**
   * Display OKR scorecard - strategic visibility header
   */
  displayOKRScorecard() {
    if (!this.okrScorecard || this.okrScorecard.length === 0) return;

    // Vision header (if available)
    if (this.vision) {
      console.log(`${colors.dim}┌─ VISION: ${this.vision.code} ${'─'.repeat(Math.max(0, 52 - this.vision.code.length))}┐${colors.reset}`);
      const stmt = this.vision.statement.substring(0, 63);
      console.log(`${colors.dim}│${colors.reset} ${colors.white}"${stmt}"${colors.reset}`);
      console.log(`${colors.dim}└${'─'.repeat(67)}┘${colors.reset}\n`);
    }

    console.log(`${colors.bold}┌─ OKR SCORECARD ${'─'.repeat(52)}┐${colors.reset}`);
    console.log(`${colors.bold}│${colors.reset}`);

    for (const obj of this.okrScorecard) {
      // Objective line with progress dots
      const dots = obj.progress_dots || '[○○○○○]';
      const pct = obj.avg_progress_pct ? `${Math.round(obj.avg_progress_pct)}%` : '0%';
      const statusColor = obj.at_risk_krs > 0 ? colors.yellow : colors.green;

      console.log(`${colors.bold}│${colors.reset} ${colors.bold}${obj.objective_code}${colors.reset}: ${obj.objective_title.substring(0, 35)}`);
      console.log(`${colors.bold}│${colors.reset}   ${statusColor}${dots}${colors.reset} ${pct} avg | ${obj.total_krs} KRs`);

      // Key results detail (if loaded)
      if (obj.key_results && obj.key_results.length > 0) {
        for (const kr of obj.key_results) {
          const krStatus = kr.status === 'achieved' ? `${colors.green}✓` :
                          kr.status === 'on_track' ? `${colors.green}●` :
                          kr.status === 'at_risk' ? `${colors.yellow}●` :
                          kr.status === 'off_track' ? `${colors.red}●` : `${colors.dim}○`;

          // Calculate progress bar
          let progress = 0;
          if (kr.target_value && kr.target_value !== 0) {
            if (kr.direction === 'decrease') {
              progress = ((kr.baseline_value - kr.current_value) / (kr.baseline_value - kr.target_value)) * 100;
            } else {
              progress = ((kr.current_value - (kr.baseline_value || 0)) / (kr.target_value - (kr.baseline_value || 0))) * 100;
            }
          }
          progress = Math.min(100, Math.max(0, progress));

          const barFilled = Math.round(progress / 10);
          const barEmpty = 10 - barFilled;
          const progressBar = '█'.repeat(barFilled) + '░'.repeat(barEmpty);

          const current = kr.current_value ?? 0;
          const target = kr.target_value ?? 0;
          const unit = kr.unit || '';

          console.log(`${colors.bold}│${colors.reset}     ${krStatus}${colors.reset} ${kr.code.substring(0, 20).padEnd(20)} ${progressBar} ${current}${unit}→${target}${unit}`);
        }
      }
      console.log(`${colors.bold}│${colors.reset}`);
    }

    console.log(`${colors.bold}└${'─'.repeat(67)}┘${colors.reset}\n`);
  }

  /**
   * Display pending proposals (LEO Protocol v4.4)
   */
  async displayProposals() {
    if (this.pendingProposals.length === 0) return;

    console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}SUGGESTED (Proactive Proposals):${colors.reset}\n`);

    for (const p of this.pendingProposals) {
      const urgencyIcon = p.urgency_level === 'critical' ? `${colors.red}🔴` :
                          p.urgency_level === 'medium' ? `${colors.yellow}🟡` : `${colors.green}🟢`;
      const triggerLabel = {
        'dependency_update': 'DEP',
        'retrospective_pattern': 'RETRO',
        'code_health': 'HEALTH'
      }[p.trigger_type] || p.trigger_type.substring(0, 5).toUpperCase();
      const confidence = (p.confidence_score * 100).toFixed(0);
      const shortId = p.id.substring(0, 8);

      console.log(`  ${urgencyIcon} [${triggerLabel}]${colors.reset} ${p.title.substring(0, 50)}...`);
      console.log(`${colors.dim}    Confidence: ${confidence}% | ID: ${shortId} | approve: npm run proposal:approve ${shortId}${colors.reset}`);
    }

    console.log(`\n${colors.dim}  Dismiss: npm run proposal:dismiss <id> <reason>${colors.reset}`);
    console.log(`${colors.dim}  Reasons: not_relevant, wrong_timing, duplicate, too_small, too_large, already_fixed${colors.reset}`);
  }

  async showFallbackQueue(options = {}) {
    const { skipBaselineWarning = false } = options;

    // No baseline - fall back to sequence_rank on SDs directly
    const { data: sds, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, title, priority, status, sequence_rank, progress_percentage, dependencies, metadata, is_working_on, parent_sd_id')
      .eq('is_active', true)
      .in('status', ['draft', 'lead_review', 'plan_active', 'exec_active', 'active', 'in_progress'])
      .in('priority', ['critical', 'high', 'medium'])
      .order('sequence_rank', { nullsFirst: false })
      .limit(15);

    if (error || !sds || sds.length === 0) {
      console.log(`${colors.red}No prioritized SDs found. Run: npm run sd:baseline to create one.${colors.reset}`);
      return;
    }

    // Group by track from metadata
    const tracks = { A: [], B: [], C: [], STANDALONE: [], UNASSIGNED: [] };

    for (const sd of sds) {
      const track = sd.metadata?.execution_track || 'UNASSIGNED';
      const trackKey = track === 'Infrastructure' || track === 'Safety' ? 'A' :
                       track === 'Feature' ? 'B' :
                       track === 'Quality' ? 'C' :
                       track === 'STANDALONE' ? 'STANDALONE' : 'UNASSIGNED';

      const depsResolved = await this.checkDependenciesResolved(sd.dependencies);

      tracks[trackKey].push({
        ...sd,
        deps_resolved: depsResolved,
        track: trackKey
      });
    }

    // Display tracks
    this.displayTrackSection('A', 'Infrastructure/Safety', tracks.A);
    this.displayTrackSection('B', 'Feature/Stages', tracks.B);
    this.displayTrackSection('C', 'Quality', tracks.C);
    if (tracks.STANDALONE.length > 0) {
      this.displayTrackSection('STANDALONE', 'Standalone (No Dependencies)', tracks.STANDALONE);
    }
    if (tracks.UNASSIGNED.length > 0) {
      this.displayTrackSection('UNASSIGNED', 'Unassigned (Needs Track)', tracks.UNASSIGNED);
    }

    // Find ready SDs (include unassigned)
    const _readySDs = sds.filter(sd => {
      return this.checkDependenciesResolvedSync(sd.dependencies);
    });

    console.log(`\n${colors.bold}${colors.green}RECOMMENDED STARTING POINTS:${colors.reset}`);

    if (sds.find(s => s.is_working_on)) {
      const workingOn = sds.find(s => s.is_working_on);
      console.log(`${colors.bgYellow}${colors.bold} CONTINUE ${colors.reset} ${workingOn.legacy_id} - ${workingOn.title}`);
      console.log(`${colors.dim}   (Marked as "Working On" in UI)${colors.reset}`);
    }

    // Show top ready SD per track (including unassigned)
    for (const [trackKey, trackSDs] of Object.entries(tracks)) {
      const ready = trackSDs.find(s => s.deps_resolved && !s.is_working_on);
      if (ready) {
        const trackLabel = trackKey === 'UNASSIGNED' ? 'Unassigned' : `Track ${trackKey}`;
        console.log(`${colors.green}  ${trackLabel}:${colors.reset} ${ready.legacy_id} - ${ready.title.substring(0, 50)}...`);
      }
    }

    console.log(`\n${colors.dim}To begin: "I'm working on <SD-ID>"${colors.reset}`);

    // Baseline creation prompt (skip if we already showed exhausted baseline message)
    if (!skipBaselineWarning) {
      console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
      console.log(`${colors.yellow}${colors.bold}⚠️  NO ACTIVE BASELINE${colors.reset}`);
      console.log(`${colors.dim}A baseline captures your execution plan with sequence and track assignments.${colors.reset}`);
      console.log(`${colors.dim}Without one, SDs are ordered by sequence_rank only.${colors.reset}\n`);
      console.log(`${colors.cyan}To create a baseline:${colors.reset}`);
      console.log(`  ${colors.bold}npm run sd:baseline${colors.reset}        ${colors.dim}Create execution baseline${colors.reset}`);
      console.log(`  ${colors.bold}npm run sd:baseline view${colors.reset}   ${colors.dim}View current baseline${colors.reset}`);
    }
  }

  displayTrackSection(trackKey, trackName, items) {
    if (items.length === 0) return;

    const trackColors = {
      A: colors.magenta,
      B: colors.blue,
      C: colors.cyan,
      STANDALONE: colors.yellow,
      UNASSIGNED: colors.dim
    };

    console.log(`\n${trackColors[trackKey]}${colors.bold}TRACK ${trackKey}: ${trackName}${colors.reset}`);

    // Group items by parent for hierarchical display
    const rootItems = [];
    const childItems = new Map(); // parent_sd_id -> children

    for (const item of items) {
      if (item.parent_sd_id) {
        if (!childItems.has(item.parent_sd_id)) {
          childItems.set(item.parent_sd_id, []);
        }
        childItems.get(item.parent_sd_id).push(item);
      } else {
        rootItems.push(item);
      }
    }

    // Also add items whose parent is not in this track as roots
    for (const item of items) {
      if (item.parent_sd_id) {
        const parentInTrack = items.find(i =>
          (i.legacy_id || i.sd_id) === item.parent_sd_id || i.id === item.parent_sd_id
        );
        if (!parentInTrack && !rootItems.includes(item)) {
          rootItems.push(item);
        }
      }
    }

    // Display hierarchically
    for (const item of rootItems) {
      this.displaySDItem(item, '', childItems, items);
    }
  }

  /**
   * Display a single SD item with its children (recursive)
   */
  displaySDItem(item, indent, childItems, allItems) {
    const sdId = item.legacy_id || item.sd_id;
    const rankStr = item.sequence_rank ? `[${item.sequence_rank}]`.padEnd(5) : '     ';

    // Check if claimed by another session
    const claimedBySession = this.claimedSDs.get(sdId);
    const isClaimedByOther = claimedBySession &&
      this.currentSession &&
      claimedBySession !== this.currentSession.session_id;
    const isClaimedByMe = claimedBySession &&
      this.currentSession &&
      claimedBySession === this.currentSession.session_id;

    // Status icon logic - now phase-aware (Control Gap Fix)
    let statusIcon;
    if (isClaimedByOther) {
      statusIcon = `${colors.yellow}CLAIMED${colors.reset}`;
    } else if (isClaimedByMe) {
      statusIcon = `${colors.green}YOURS${colors.reset}`;
    } else {
      // Use phase-aware status to prevent showing READY for SDs needing verification
      statusIcon = getPhaseAwareStatus(item);
    }

    const workingIcon = item.is_working_on ? `${colors.bgYellow} ACTIVE ${colors.reset} ` : '';
    const claimedIcon = isClaimedByOther ? `${colors.bgBlue} CLAIMED ${colors.reset} ` : '';
    const title = (item.title || '').substring(0, 40 - indent.length);

    console.log(`${indent}${claimedIcon}${workingIcon}${rankStr} ${sdId} - ${title}... ${statusIcon}`);

    // Show who claimed it
    if (isClaimedByOther) {
      const claimingSession = this.activeSessions.find(s => s.session_id === claimedBySession);
      const shortId = claimedBySession.substring(0, 12) + '...';
      const ageMin = claimingSession ? Math.round(claimingSession.claim_duration_minutes || 0) : '?';
      console.log(`${colors.dim}${indent}        └─ Claimed by session ${shortId} (${ageMin}m)${colors.reset}`);
    }

    // Show blockers if not resolved and not claimed
    if (!item.deps_resolved && item.dependencies && !isClaimedByOther) {
      const deps = this.parseDependencies(item.dependencies);
      const unresolvedDeps = deps.filter(d => !d.resolved);
      if (unresolvedDeps.length > 0) {
        console.log(`${colors.dim}${indent}        └─ Blocked by: ${unresolvedDeps.map(d => d.sd_id).join(', ')}${colors.reset}`);
      }
    }

    // Show sibling dependency status for child SDs (pre-computed)
    if (item.childDepStatus && !item.childDepStatus.allComplete) {
      console.log(`${colors.dim}${indent}        └─ Child deps: ${item.childDepStatus.summary}${colors.reset}`);
    }

    // Display children recursively
    const children = childItems.get(sdId) || childItems.get(item.id) || [];
    const childrenInTrack = children.filter(c => allItems.includes(c));

    for (let i = 0; i < childrenInTrack.length; i++) {
      const child = childrenInTrack[i];
      const isLast = i === childrenInTrack.length - 1;
      const childIndent = indent + (isLast ? '  └─ ' : '  ├─ ');
      const nextIndent = indent + (isLast ? '     ' : '  │  ');

      // For children, use simpler display
      this.displaySDItemSimple(child, childIndent, nextIndent, childItems, allItems);
    }
  }

  /**
   * Display child SD item (simpler format for nested items)
   */
  displaySDItemSimple(item, prefix, nextIndent, childItems, allItems) {
    const sdId = item.legacy_id || item.sd_id;

    // Status icon - now phase-aware (Control Gap Fix)
    const statusIcon = getPhaseAwareStatus(item);

    const workingIcon = item.is_working_on ? `${colors.bgYellow}◆${colors.reset}` : '';
    const title = (item.title || '').substring(0, 30);

    console.log(`${prefix}${workingIcon}${sdId} - ${title}... ${statusIcon}`);

    // Recursively show grandchildren
    const children = childItems.get(sdId) || childItems.get(item.id) || [];
    const childrenInTrack = children.filter(c => allItems.includes(c));

    for (let i = 0; i < childrenInTrack.length; i++) {
      const child = childrenInTrack[i];
      const isLast = i === childrenInTrack.length - 1;
      const childPrefix = nextIndent + (isLast ? '└─ ' : '├─ ');
      const childNextIndent = nextIndent + (isLast ? '   ' : '│  ');

      this.displaySDItemSimple(child, childPrefix, childNextIndent, childItems, allItems);
    }
  }

  async displayTracks() {
    // Group baseline items by track
    const tracks = { A: [], B: [], C: [], STANDALONE: [] };

    for (const item of this.baselineItems) {
      const trackKey = item.track || 'STANDALONE';
      if (tracks[trackKey]) {
        // Enrich with SD details (including parent_sd_id for hierarchy)
        const { data: sd } = await supabase
          .from('strategic_directives_v2')
          .select('id, legacy_id, title, status, current_phase, progress_percentage, is_working_on, dependencies, is_active, parent_sd_id')
          .eq('legacy_id', item.sd_id)
          .single();

        if (sd && sd.is_active && sd.status !== 'completed' && sd.status !== 'cancelled') {
          const depsResolved = await this.checkDependenciesResolved(sd.dependencies);

          // Check child dependency status if this is a child SD
          let childDepStatus = null;
          if (sd.parent_sd_id) {
            try {
              childDepStatus = await checkDependencyStatus(sd.legacy_id || sd.id);
            } catch {
              // Silently ignore errors
            }
          }

          tracks[trackKey].push({
            ...item,
            ...sd,
            deps_resolved: depsResolved,
            childDepStatus,
            actual: this.actuals[item.sd_id]
          });
        }
      }
    }

    // Display each track with hierarchy
    this.displayTrackSection('A', 'Infrastructure/Safety', tracks.A);
    this.displayTrackSection('B', 'Feature/Stages', tracks.B);
    this.displayTrackSection('C', 'Quality', tracks.C);
    if (tracks.STANDALONE.length > 0) {
      this.displayTrackSection('STANDALONE', 'Standalone', tracks.STANDALONE);
    }
  }

  async displayRecommendations() {
    console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.bold}${colors.green}RECOMMENDED ACTIONS:${colors.reset}\n`);

    // Check for "working on" SD first
    const { data: workingOn } = await supabase
      .from('strategic_directives_v2')
      .select('legacy_id, title, progress_percentage')
      .eq('is_active', true)
      .eq('is_working_on', true)
      .lt('progress_percentage', 100)
      .single();

    if (workingOn) {
      console.log(`${colors.bgYellow}${colors.bold} CONTINUE ${colors.reset} ${workingOn.legacy_id}`);
      console.log(`  ${workingOn.title}`);
      console.log(`  ${colors.dim}Progress: ${workingOn.progress_percentage || 0}% | Marked as "Working On"${colors.reset}`);

      // Add duration estimate for working on SD
      try {
        const { data: sdFull } = await supabase
          .from('strategic_directives_v2')
          .select('id, sd_type, category, priority')
          .eq('legacy_id', workingOn.legacy_id)
          .single();
        if (sdFull) {
          const estimate = await getEstimatedDuration(supabase, sdFull);
          console.log(`  ${colors.dim}Est: ${formatEstimateShort(estimate)}${colors.reset}\n`);
        } else {
          console.log();
        }
      } catch {
        console.log();
      }
    }

    // Find ready SDs from baseline
    // Find SDs that are truly READY for LEAD work (Control Gap Fix)
    const readySDs = [];
    const needsVerificationSDs = []; // SDs in EXEC_COMPLETE or review status
    for (const item of this.baselineItems) {
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('legacy_id, title, status, current_phase, progress_percentage, dependencies, is_active')
        .eq('legacy_id', item.sd_id)
        .single();

      if (sd && sd.is_active && sd.status !== 'completed' && sd.status !== 'cancelled') {
        const depsResolved = await this.checkDependenciesResolved(sd.dependencies);
        const enrichedSD = { ...item, ...sd, deps_resolved: depsResolved };

        // Separate SDs needing verification from truly ready SDs
        if (sd.current_phase === 'EXEC_COMPLETE' || sd.status === 'review') {
          needsVerificationSDs.push(enrichedSD);
        } else if (depsResolved && isActionableForLead(enrichedSD)) {
          readySDs.push(enrichedSD);
        }
      }
    }

    // Show SDs needing verification/close-out FIRST (Control Gap Fix)
    if (needsVerificationSDs.length > 0) {
      console.log(`${colors.bgMagenta}${colors.bold} NEEDS VERIFICATION ${colors.reset}`);
      needsVerificationSDs.forEach(sd => {
        console.log(`  ${sd.legacy_id} - ${sd.title.substring(0, 45)}...`);
        console.log(`  ${colors.dim}Phase: ${sd.current_phase} | Status: ${sd.status} | Run: npm run sd:verify ${sd.legacy_id}${colors.reset}\n`);
      });
    }

    if (readySDs.length > 0 && !workingOn) {
      const top = readySDs[0];
      console.log(`${colors.bgGreen}${colors.bold} START ${colors.reset} ${top.legacy_id}`);
      console.log(`  ${top.title}`);
      console.log(`  ${colors.dim}Track: ${top.track || 'N/A'} | Rank: ${top.sequence_rank} | All dependencies satisfied${colors.reset}`);

      // Add duration estimate
      try {
        const { data: sdFull } = await supabase
          .from('strategic_directives_v2')
          .select('id, sd_type, category, priority')
          .eq('legacy_id', top.legacy_id)
          .single();
        if (sdFull) {
          const estimate = await getEstimatedDuration(supabase, sdFull);
          console.log(`  ${colors.dim}Est: ${formatEstimateShort(estimate)}${colors.reset}\n`);
        } else {
          console.log();
        }
      } catch {
        console.log();
      }
    }

    // Show parallel opportunities
    const parallelReady = readySDs.filter(sd => sd.track !== readySDs[0]?.track).slice(0, 2);
    if (parallelReady.length > 0) {
      console.log(`${colors.cyan}PARALLEL OPPORTUNITIES:${colors.reset}`);
      parallelReady.forEach(sd => {
        console.log(`  Track ${sd.track}: ${sd.legacy_id} - ${sd.title.substring(0, 40)}...`);
      });
    }

    // Show conflicts if any
    if (this.conflicts.length > 0) {
      console.log(`\n${colors.red}${colors.bold}CONFLICT WARNINGS:${colors.reset}`);
      this.conflicts.forEach(c => {
        console.log(`  ${colors.red}!${colors.reset} ${c.sd_id_a} + ${c.sd_id_b}: ${c.conflict_type}`);
      });
    }

    // Show how to begin work
    console.log(`\n${colors.bold}TO BEGIN WORK:${colors.reset}`);
    console.log(`  ${colors.cyan}npm run sd:start <SD-ID>${colors.reset}  ${colors.dim}(recommended - claims SD and shows info)${colors.reset}`);
    console.log(`  ${colors.dim}OR: node scripts/handoff.js execute LEAD-TO-PLAN <SD-ID>${colors.reset}`);
  }

  async displayParallelOpportunities() {
    if (!sessionManager) return;

    try {
      const trackStatus = await sessionManager.getParallelTrackStatus();

      // Find tracks without active sessions that have available work
      const openTracks = trackStatus.filter(t =>
        t.track_status === 'open' && t.available_sds > 0
      );

      // If current session has no SD claimed, suggest claiming one
      if (this.currentSession && !this.currentSession.sd_id) {
        const readyTracks = trackStatus.filter(t => t.available_sds > 0);
        if (readyTracks.length > 0) {
          console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
          console.log(`${colors.bold}${colors.cyan}CLAIM AN SD:${colors.reset}\n`);
          console.log(`${colors.dim}This session has no SD claimed. To claim:${colors.reset}`);
          console.log(`  ${colors.cyan}npm run sd:claim <SD-ID>${colors.reset}  - Claim a specific SD`);
          console.log(`  ${colors.dim}Or tell me: "I want to work on <SD-ID>"${colors.reset}\n`);
        }
      }

      // If there are open tracks and current session already has a claim, suggest parallel
      if (openTracks.length > 0 && this.currentSession?.sd_id) {
        console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
        console.log(`${colors.bold}${colors.green}PARALLEL OPPORTUNITY:${colors.reset}\n`);
        console.log(`  ${colors.dim}Open another terminal for parallel work:${colors.reset}\n`);

        for (const track of openTracks) {
          const trackColor = track.track === 'A' ? colors.magenta :
                            track.track === 'B' ? colors.blue :
                            track.track === 'C' ? colors.cyan : colors.yellow;

          console.log(`  ${trackColor}${colors.bold}Track ${track.track}${colors.reset} (${track.track_name})`);
          console.log(`    Next: ${colors.bold}${track.next_available_sd}${colors.reset}`);
          console.log(`    Available: ${track.available_sds} SDs`);
        }

        console.log(`\n  ${colors.dim}Run ${colors.cyan}npm run sd:next${colors.dim} in new terminal, then:${colors.reset}`);
        console.log(`  ${colors.cyan}npm run sd:claim <SD-ID>${colors.reset}`);
      }

      // If all tracks are occupied, show status
      const occupiedTracks = trackStatus.filter(t => t.track_status === 'occupied');
      if (occupiedTracks.length === trackStatus.length && trackStatus.length > 0) {
        console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
        console.log(`${colors.bold}${colors.yellow}ALL TRACKS ACTIVE:${colors.reset}\n`);
        console.log(`  ${colors.dim}All parallel tracks have active sessions.${colors.reset}`);
        console.log(`  ${colors.dim}Wait for a session to complete or release its SD.${colors.reset}`);
      }

    } catch {
      // Non-fatal - just skip parallel suggestions
    }
  }

  displaySessionContext() {
    if (this.recentActivity.length === 0) return;

    console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.bold}RECENT SESSION ACTIVITY:${colors.reset}\n`);

    this.recentActivity.slice(0, 3).forEach(activity => {
      const commitInfo = activity.commits > 0 ? `${activity.commits} commits` : 'recently updated';
      console.log(`  ${activity.sd_id} - ${commitInfo}`);
    });

    console.log(`\n${colors.dim}Consider continuing recent work for context preservation.${colors.reset}`);
  }

  async checkDependenciesResolved(dependencies) {
    if (!dependencies) return true;

    const deps = this.parseDependencies(dependencies);
    if (deps.length === 0) return true;

    for (const dep of deps) {
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('status')
        .eq('legacy_id', dep.sd_id)
        .single();

      if (!sd || sd.status !== 'completed') {
        return false;
      }
    }

    return true;
  }

  checkDependenciesResolvedSync(_dependencies) {
    // Sync version for display - assumes deps were already checked
    return true; // Placeholder - actual check happens async
  }

  parseDependencies(dependencies) {
    if (!dependencies) return [];

    let deps = [];
    if (typeof dependencies === 'string') {
      try {
        deps = JSON.parse(dependencies);
      } catch {
        return [];
      }
    } else if (Array.isArray(dependencies)) {
      deps = dependencies;
    }

    // Only return entries that are actual SD references (SD-XXX format)
    // Ignore text descriptions of prerequisites
    return deps
      .map(dep => {
        if (typeof dep === 'string') {
          // Parse "SD-XXX (description)" format
          const match = dep.match(/^(SD-[A-Z0-9-]+)/);
          if (match) {
            return { sd_id: match[1], resolved: false };
          }
          // Not an SD reference - skip it
          return null;
        }
        // Object format with sd_id field
        if (dep.sd_id && dep.sd_id.match(/^SD-[A-Z0-9-]+/)) {
          return { sd_id: dep.sd_id, resolved: false };
        }
        return null;
      })
      .filter(Boolean); // Remove nulls
  }
}

// Main execution
const selector = new SDNextSelector();
selector.run().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
