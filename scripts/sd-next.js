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
import fs from 'fs';
import dotenv from 'dotenv';
import { warnIfTempFilesExceedThreshold } from '../lib/root-temp-checker.mjs';
import { getEstimatedDuration, formatEstimateShort } from './lib/duration-estimator.js';

// Load environment from EHG_Engineer regardless of cwd
const envPath = '/mnt/c/_EHG/EHG_Engineer/.env';
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

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
};

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
  }

  async run() {
    console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.white} LEAD SD EXECUTION QUEUE${colors.reset}`);
    console.log(`${colors.dim} Multi-Session Aware Strategic Directive Selection${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Initialize session (auto-register and heartbeat)
    await this.initializeSession();

    // Load data
    await this.loadActiveBaseline();
    await this.loadRecentActivity();
    await this.loadConflicts();
    await this.loadActiveSessions();

    // Display active sessions
    await this.displayActiveSessions();

    if (!this.baseline) {
      await this.showFallbackQueue();
      return;
    }

    // Display tracks
    await this.displayTracks();

    // Display recommendations
    await this.displayRecommendations();

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

  async loadRecentActivity() {
    // Method 1: Check git commits for SD references (last 7 days)
    try {
      const gitLog = execSync(
        'git log --oneline --since="7 days ago" --format="%s" 2>/dev/null || echo ""',
        { encoding: 'utf8', cwd: process.cwd() }
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

  async showFallbackQueue() {
    // No baseline - fall back to sequence_rank on SDs directly
    const { data: sds, error } = await supabase
      .from('strategic_directives_v2')
      .select('legacy_id, title, priority, status, sequence_rank, progress_percentage, dependencies, metadata, is_working_on')
      .eq('is_active', true)
      .in('status', ['draft', 'active', 'in_progress'])
      .in('priority', ['critical', 'high'])
      .not('sequence_rank', 'is', null)
      .order('sequence_rank')
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

    // Find ready SDs
    const _readySDs = sds.filter(sd => {
      const track = sd.metadata?.execution_track;
      return track && this.checkDependenciesResolvedSync(sd.dependencies);
    });

    console.log(`\n${colors.bold}${colors.green}RECOMMENDED STARTING POINTS:${colors.reset}`);

    if (sds.find(s => s.is_working_on)) {
      const workingOn = sds.find(s => s.is_working_on);
      console.log(`${colors.bgYellow}${colors.bold} CONTINUE ${colors.reset} ${workingOn.legacy_id} - ${workingOn.title}`);
      console.log(`${colors.dim}   (Marked as "Working On" in UI)${colors.reset}`);
    }

    // Show top ready SD per track
    for (const [trackKey, trackSDs] of Object.entries(tracks)) {
      if (trackKey === 'UNASSIGNED') continue;
      const ready = trackSDs.find(s => s.deps_resolved && !s.is_working_on);
      if (ready) {
        console.log(`${colors.green}  Track ${trackKey}:${colors.reset} ${ready.legacy_id} - ${ready.title.substring(0, 50)}...`);
      }
    }

    console.log(`\n${colors.dim}To begin: "I'm working on <SD-ID>"${colors.reset}`);
    console.log(`${colors.dim}To create baseline: npm run sd:baseline${colors.reset}`);
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

    items.forEach(item => {
      const sdId = item.legacy_id || item.sd_id;
      const rankStr = `[${item.sequence_rank}]`.padEnd(5);

      // Check if claimed by another session
      const claimedBySession = this.claimedSDs.get(sdId);
      const isClaimedByOther = claimedBySession &&
        this.currentSession &&
        claimedBySession !== this.currentSession.session_id;
      const isClaimedByMe = claimedBySession &&
        this.currentSession &&
        claimedBySession === this.currentSession.session_id;

      // Status icon logic
      let statusIcon;
      if (isClaimedByOther) {
        statusIcon = `${colors.yellow}CLAIMED${colors.reset}`;
      } else if (isClaimedByMe) {
        statusIcon = `${colors.green}YOURS${colors.reset}`;
      } else if (item.deps_resolved) {
        statusIcon = `${colors.green}READY${colors.reset}`;
      } else if (item.progress_percentage > 0) {
        statusIcon = `${colors.yellow}${item.progress_percentage}%${colors.reset}`;
      } else {
        statusIcon = `${colors.red}BLOCKED${colors.reset}`;
      }

      const workingIcon = item.is_working_on ? `${colors.bgYellow} ACTIVE ${colors.reset} ` : '';
      const claimedIcon = isClaimedByOther ? `${colors.bgBlue} CLAIMED ${colors.reset} ` : '';

      console.log(`  ${claimedIcon}${workingIcon}${rankStr} ${sdId} - ${item.title.substring(0, 45)}... ${statusIcon}`);

      // Show who claimed it
      if (isClaimedByOther) {
        const claimingSession = this.activeSessions.find(s => s.session_id === claimedBySession);
        const shortId = claimedBySession.substring(0, 12) + '...';
        const ageMin = claimingSession ? Math.round(claimingSession.claim_duration_minutes || 0) : '?';
        console.log(`${colors.dim}        └─ Claimed by session ${shortId} (${ageMin}m)${colors.reset}`);
      }

      // Show blockers if not resolved and not claimed
      if (!item.deps_resolved && item.dependencies && !isClaimedByOther) {
        const deps = this.parseDependencies(item.dependencies);
        const unresolvedDeps = deps.filter(d => !d.resolved);
        if (unresolvedDeps.length > 0) {
          console.log(`${colors.dim}        └─ Blocked by: ${unresolvedDeps.map(d => d.sd_id).join(', ')}${colors.reset}`);
        }
      }
    });
  }

  async displayTracks() {
    // Group baseline items by track
    const tracks = { A: [], B: [], C: [], STANDALONE: [] };

    for (const item of this.baselineItems) {
      const trackKey = item.track || 'STANDALONE';
      if (tracks[trackKey]) {
        // Enrich with SD details
        const { data: sd } = await supabase
          .from('strategic_directives_v2')
          .select('legacy_id, title, status, progress_percentage, is_working_on, dependencies, is_active')
          .eq('legacy_id', item.sd_id)
          .single();

        if (sd && sd.is_active && sd.status !== 'completed' && sd.status !== 'cancelled') {
          const depsResolved = await this.checkDependenciesResolved(sd.dependencies);
          tracks[trackKey].push({
            ...item,
            ...sd,
            deps_resolved: depsResolved,
            actual: this.actuals[item.sd_id]
          });
        }
      }
    }

    // Display each track
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
    const readySDs = [];
    for (const item of this.baselineItems) {
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('legacy_id, title, status, progress_percentage, dependencies, is_active')
        .eq('legacy_id', item.sd_id)
        .single();

      if (sd && sd.is_active && sd.status !== 'completed' && sd.status !== 'cancelled') {
        const depsResolved = await this.checkDependenciesResolved(sd.dependencies);
        if (depsResolved) {
          readySDs.push({ ...item, ...sd });
        }
      }
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

    return deps.map(dep => {
      if (typeof dep === 'string') {
        // Parse "SD-XXX (description)" format
        const match = dep.match(/^(SD-[A-Z0-9-]+)/);
        return { sd_id: match ? match[1] : dep, resolved: false };
      }
      return { sd_id: dep.sd_id || dep, resolved: false };
    });
  }
}

// Main execution
const selector = new SDNextSelector();
selector.run().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
