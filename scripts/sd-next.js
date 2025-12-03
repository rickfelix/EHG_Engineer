#!/usr/bin/env node

/**
 * SD Next - Intelligent Strategic Directive Selection
 *
 * Purpose: Help new Claude Code sessions know which SD to work on
 * Owner: LEAD role
 *
 * Features:
 * 1. Dependency resolution - Verifies deps are actually completed
 * 2. Progress awareness - Surfaces partially completed SDs
 * 3. Session context - Checks recent git activity for continuity
 * 4. Risk-based ordering - Weights by downstream unblocking
 * 5. Conflict detection - Warns about parallel execution risks
 * 6. Track visibility - Shows parallel execution tracks
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

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
  }

  async run() {
    console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.white} LEAD SD EXECUTION QUEUE${colors.reset}`);
    console.log(`${colors.dim} Intelligent Strategic Directive Selection${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Load data
    await this.loadActiveBaseline();
    await this.loadRecentActivity();
    await this.loadConflicts();

    if (!this.baseline) {
      await this.showFallbackQueue();
      return;
    }

    // Display tracks
    await this.displayTracks();

    // Display recommendations
    await this.displayRecommendations();

    // Display session context
    this.displaySessionContext();

    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);
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

    } catch (e) {
      // Git not available or error
      this.recentActivity = [];
    }

    // Method 2: Check updated_at on SDs (fallback/supplement)
    const { data: recentSDs } = await supabase
      .from('strategic_directives_v2')
      .select('legacy_id, title, updated_at')
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
    const readySDs = sds.filter(sd => {
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
      const rankStr = `[${item.sequence_rank}]`.padEnd(5);
      const statusIcon = item.deps_resolved ? `${colors.green}READY${colors.reset}` :
                         item.progress_percentage > 0 ? `${colors.yellow}${item.progress_percentage}%${colors.reset}` :
                         `${colors.red}BLOCKED${colors.reset}`;

      const workingIcon = item.is_working_on ? `${colors.bgYellow} ACTIVE ${colors.reset} ` : '';

      console.log(`  ${workingIcon}${rankStr} ${item.legacy_id} - ${item.title.substring(0, 45)}... ${statusIcon}`);

      // Show blockers if not resolved
      if (!item.deps_resolved && item.dependencies) {
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
          .select('legacy_id, title, status, progress_percentage, is_working_on, dependencies')
          .eq('legacy_id', item.sd_id)
          .single();

        if (sd) {
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
      .eq('is_working_on', true)
      .lt('progress_percentage', 100)
      .single();

    if (workingOn) {
      console.log(`${colors.bgYellow}${colors.bold} CONTINUE ${colors.reset} ${workingOn.legacy_id}`);
      console.log(`  ${workingOn.title}`);
      console.log(`  ${colors.dim}Progress: ${workingOn.progress_percentage || 0}% | Marked as "Working On"${colors.reset}\n`);
    }

    // Find ready SDs from baseline
    const readySDs = [];
    for (const item of this.baselineItems) {
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('legacy_id, title, status, progress_percentage, dependencies')
        .eq('legacy_id', item.sd_id)
        .single();

      if (sd && sd.status !== 'completed' && sd.status !== 'cancelled') {
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
      console.log(`  ${colors.dim}Track: ${top.track || 'N/A'} | Rank: ${top.sequence_rank} | All dependencies satisfied${colors.reset}\n`);
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

  checkDependenciesResolvedSync(dependencies) {
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
