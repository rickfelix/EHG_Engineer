#!/usr/bin/env node

/**
 * SD Status - Execution Progress vs Baseline
 *
 * Purpose: Show current progress against baseline plan with variance analysis
 * Owner: LEAD role
 *
 * Features:
 * - Progress vs baseline comparison
 * - Variance highlighting (ahead/behind)
 * - Blocker identification
 * - Track-level summary
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ANSI color codes
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
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
};

class SDStatusReporter {
  constructor() {
    this.baseline = null;
    this.items = [];
    this.actuals = {};
    this.sdDetails = {};
  }

  async run() {
    console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold} SD EXECUTION STATUS REPORT${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

    await this.loadData();

    if (!this.baseline) {
      console.log(`${colors.yellow}No active baseline found. Run 'npm run sd:baseline create' first.${colors.reset}\n`);
      return;
    }

    console.log(`${colors.dim}Baseline: ${this.baseline.baseline_name}${colors.reset}`);
    console.log(`${colors.dim}Created: ${new Date(this.baseline.created_at).toLocaleString()}${colors.reset}\n`);

    this.displaySummary();
    this.displayTrackProgress();
    this.displayBlockers();
    this.displayRecentProgress();

    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);
  }

  async loadData() {
    // Load active baseline
    const { data: baseline } = await supabase
      .from('sd_execution_baselines')
      .select('*')
      .eq('is_active', true)
      .single();

    if (!baseline) return;
    this.baseline = baseline;

    // Load baseline items
    const { data: items } = await supabase
      .from('sd_baseline_items')
      .select('*')
      .eq('baseline_id', baseline.id)
      .order('sequence_rank');

    this.items = items || [];

    // Load actuals
    const { data: actuals } = await supabase
      .from('sd_execution_actuals')
      .select('*')
      .eq('baseline_id', baseline.id);

    if (actuals) {
      actuals.forEach(a => this.actuals[a.sd_id] = a);
    }

    // Load SD details
    const sdIds = this.items.map(i => i.sd_id);
    const { data: sds } = await supabase
      .from('strategic_directives_v2')
      .select('legacy_id, title, status, progress_percentage, updated_at')
      .in('legacy_id', sdIds);

    if (sds) {
      sds.forEach(sd => this.sdDetails[sd.legacy_id] = sd);
    }
  }

  displaySummary() {
    const total = this.items.length;
    let completed = 0;
    let inProgress = 0;
    let blocked = 0;
    let notStarted = 0;

    for (const item of this.items) {
      const sd = this.sdDetails[item.sd_id];
      const actual = this.actuals[item.sd_id];

      if (sd?.status === 'completed') {
        completed++;
      } else if (actual?.status === 'blocked' || (sd?.progress_percentage > 0 && !item.is_ready)) {
        blocked++;
      } else if (sd?.progress_percentage > 0) {
        inProgress++;
      } else {
        notStarted++;
      }
    }

    const pctComplete = Math.round((completed / total) * 100);

    console.log(`${colors.bold}OVERALL PROGRESS${colors.reset}`);
    console.log(`${'█'.repeat(Math.floor(pctComplete / 5))}${'░'.repeat(20 - Math.floor(pctComplete / 5))} ${pctComplete}%\n`);

    console.log(`  ${colors.green}Completed:${colors.reset}   ${completed}/${total}`);
    console.log(`  ${colors.blue}In Progress:${colors.reset} ${inProgress}/${total}`);
    console.log(`  ${colors.red}Blocked:${colors.reset}     ${blocked}/${total}`);
    console.log(`  ${colors.dim}Not Started:${colors.reset} ${notStarted}/${total}`);
    console.log();
  }

  displayTrackProgress() {
    const tracks = { A: [], B: [], C: [], STANDALONE: [] };

    for (const item of this.items) {
      const track = item.track || 'STANDALONE';
      if (tracks[track]) {
        const sd = this.sdDetails[item.sd_id];
        tracks[track].push({ ...item, sd });
      }
    }

    console.log(`${colors.bold}TRACK PROGRESS${colors.reset}\n`);

    const trackMeta = {
      A: { name: 'Infrastructure/Safety', color: colors.magenta },
      B: { name: 'Feature/Stages', color: colors.blue },
      C: { name: 'Quality', color: colors.cyan },
      STANDALONE: { name: 'Standalone', color: colors.yellow }
    };

    for (const [trackKey, trackItems] of Object.entries(tracks)) {
      if (trackItems.length === 0) continue;

      const meta = trackMeta[trackKey];
      const completed = trackItems.filter(i => i.sd?.status === 'completed').length;
      const total = trackItems.length;
      const pct = Math.round((completed / total) * 100);

      console.log(`${meta.color}${colors.bold}Track ${trackKey}${colors.reset} (${meta.name})`);
      console.log(`  Progress: ${completed}/${total} (${pct}%)`);

      // Show first incomplete SD in track
      const nextUp = trackItems.find(i => i.sd?.status !== 'completed');
      if (nextUp) {
        const status = nextUp.is_ready ? `${colors.green}READY${colors.reset}` : `${colors.yellow}WAITING${colors.reset}`;
        console.log(`  Next: [${nextUp.sequence_rank}] ${nextUp.sd_id} - ${status}`);
      }
      console.log();
    }
  }

  displayBlockers() {
    const blockers = [];

    for (const item of this.items) {
      const sd = this.sdDetails[item.sd_id];
      const _actual = this.actuals[item.sd_id];

      if (sd?.status !== 'completed' && !item.is_ready) {
        // Find what's blocking
        const deps = this.parseDependencies(item.dependencies_snapshot);
        const unresolvedDeps = [];

        for (const dep of deps) {
          const depSd = this.sdDetails[dep.sd_id];
          if (!depSd || depSd.status !== 'completed') {
            unresolvedDeps.push(dep.sd_id);
          }
        }

        if (unresolvedDeps.length > 0) {
          blockers.push({
            sd_id: item.sd_id,
            rank: item.sequence_rank,
            blocked_by: unresolvedDeps
          });
        }
      }
    }

    if (blockers.length === 0) {
      console.log(`${colors.green}No blockers detected.${colors.reset}\n`);
      return;
    }

    console.log(`${colors.bold}${colors.red}BLOCKERS (${blockers.length} SDs waiting)${colors.reset}\n`);

    // Show top 5 blockers
    blockers.slice(0, 5).forEach(b => {
      console.log(`  [${b.rank}] ${b.sd_id}`);
      console.log(`      ${colors.dim}Waiting on: ${b.blocked_by.join(', ')}${colors.reset}`);
    });

    if (blockers.length > 5) {
      console.log(`  ${colors.dim}... and ${blockers.length - 5} more${colors.reset}`);
    }
    console.log();
  }

  displayRecentProgress() {
    // Get SDs updated in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recent = Object.values(this.sdDetails)
      .filter(sd => new Date(sd.updated_at) > sevenDaysAgo)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 5);

    if (recent.length === 0) return;

    console.log(`${colors.bold}RECENT ACTIVITY (Last 7 Days)${colors.reset}\n`);

    recent.forEach(sd => {
      const statusIcon = sd.status === 'completed' ? `${colors.green}✓${colors.reset}` :
                         sd.progress_percentage > 0 ? `${colors.yellow}◐${colors.reset}` :
                         `${colors.dim}○${colors.reset}`;
      const date = new Date(sd.updated_at).toLocaleDateString();
      console.log(`  ${statusIcon} ${sd.legacy_id} - ${sd.title?.substring(0, 40)}... (${date})`);
    });
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
        const match = dep.match(/^(SD-[A-Z0-9-]+)/);
        return { sd_id: match ? match[1] : dep };
      }
      return { sd_id: dep.sd_id || dep };
    });
  }
}

const reporter = new SDStatusReporter();
reporter.run().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
