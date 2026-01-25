#!/usr/bin/env node

/**
 * SD Burn Rate - Velocity Metrics and Forecasting
 *
 * Purpose: Calculate burn rate and forecast completion based on actual trends
 * Owner: LEAD role
 *
 * Features:
 * - Calculate actual velocity from completed SDs
 * - Compare to planned velocity
 * - Forecast completion dates
 * - Track load balancing across tracks
 * - Take periodic snapshots for trending
 */

import { createClient } from '@supabase/supabase-js';
// import { execSync } from 'child_process'; // Unused - available for future shell commands
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
};

class SDBurnRateCalculator {
  constructor() {
    this.command = process.argv[2] || 'report';
    this.baseline = null;
    this.items = [];
    this.actuals = {};
    this.sdDetails = {};
    this.completedSDs = [];
  }

  async run() {
    switch (this.command) {
      case 'report':
        await this.showReport();
        break;
      case 'snapshot':
        await this.takeSnapshot();
        break;
      case 'history':
        await this.showHistory();
        break;
      case 'forecast':
        await this.showForecast();
        break;
      default:
        this.showHelp();
    }
  }

  async loadData() {
    // Load active baseline
    const { data: baseline } = await supabase
      .from('sd_execution_baselines')
      .select('*')
      .eq('is_active', true)
      .single();

    if (!baseline) {
      console.log(`${colors.yellow}No active baseline found.${colors.reset}`);
      return false;
    }
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
    // Note: legacy_id column was deprecated and removed - using sd_key instead
    const sdIds = this.items.map(i => i.sd_id);
    const { data: sds } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, progress_percentage, updated_at, created_at')
      .in('sd_key', sdIds);

    if (sds) {
      sds.forEach(sd => this.sdDetails[sd.sd_key || sd.id] = sd);
      this.completedSDs = sds.filter(sd => sd.status === 'completed');
    }

    return true;
  }

  async showReport() {
    console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold} SD BURN RATE ANALYSIS${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

    if (!await this.loadData()) return;

    const metrics = this.calculateMetrics();

    // Summary
    console.log(`${colors.bold}VELOCITY METRICS${colors.reset}\n`);
    console.log(`  Total SDs in Baseline:    ${metrics.totalSDs}`);
    console.log(`  Completed:                ${metrics.completedCount} (${metrics.completedPct}%)`);
    console.log(`  In Progress:              ${metrics.inProgressCount}`);
    console.log(`  Remaining:                ${metrics.remainingCount}`);
    console.log();

    // Burn Rate
    console.log(`${colors.bold}BURN RATE${colors.reset}\n`);
    const baselineAgeDays = metrics.baselineAgeDays || 1;
    const velocity = metrics.completedCount / (baselineAgeDays / 7); // SDs per week

    console.log(`  Baseline Age:             ${baselineAgeDays} days`);
    console.log(`  Actual Velocity:          ${velocity.toFixed(2)} SDs/week`);

    if (velocity > 0) {
      const weeksRemaining = metrics.remainingCount / velocity;
      const daysRemaining = Math.ceil(weeksRemaining * 7);
      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + daysRemaining);

      console.log(`  Forecasted Completion:    ${forecastDate.toLocaleDateString()} (${daysRemaining} days)`);
    } else {
      console.log(`  Forecasted Completion:    ${colors.yellow}Cannot forecast (no completions yet)${colors.reset}`);
    }
    console.log();

    // Track Load Balancing
    console.log(`${colors.bold}TRACK LOAD BALANCE${colors.reset}\n`);
    const trackLoad = this.calculateTrackLoad();

    const maxLoad = Math.max(...Object.values(trackLoad).map(t => t.remaining));
    for (const [track, data] of Object.entries(trackLoad)) {
      if (data.total === 0) continue;

      const bar = '█'.repeat(Math.round((data.remaining / maxLoad) * 20));
      const pct = Math.round((data.completed / data.total) * 100);
      const statusColor = pct === 100 ? colors.green :
                          pct > 50 ? colors.yellow :
                          colors.red;

      console.log(`  Track ${track}: ${bar} ${data.remaining} remaining (${statusColor}${pct}% done${colors.reset})`);
    }
    console.log();

    // Recent Completions
    if (this.completedSDs.length > 0) {
      console.log(`${colors.bold}RECENT COMPLETIONS${colors.reset}\n`);
      const recent = this.completedSDs
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 5);

      recent.forEach(sd => {
        const date = new Date(sd.updated_at).toLocaleDateString();
        // Note: legacy_id was deprecated - using sd_key instead
        console.log(`  ${colors.green}✓${colors.reset} ${sd.sd_key || sd.id} (${date})`);
      });
    }

    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);
  }

  async takeSnapshot() {
    if (!await this.loadData()) return;

    const metrics = this.calculateMetrics();
    const baselineAgeDays = metrics.baselineAgeDays || 1;
    const velocity = metrics.completedCount / (baselineAgeDays / 7);

    // Calculate forecast
    let forecastDate = null;
    let confidence = 'low';

    if (velocity > 0) {
      const weeksRemaining = metrics.remainingCount / velocity;
      const daysRemaining = Math.ceil(weeksRemaining * 7);
      forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + daysRemaining);

      // Confidence based on sample size
      confidence = metrics.completedCount >= 5 ? 'high' :
                   metrics.completedCount >= 2 ? 'medium' : 'low';
    }

    const snapshot = {
      baseline_id: this.baseline.id,
      snapshot_date: new Date().toISOString().split('T')[0],
      total_sds_planned: metrics.totalSDs,
      total_sds_completed: metrics.completedCount,
      actual_velocity: velocity,
      burn_rate_ratio: velocity > 0 ? 1.0 : 0, // Will improve with planned velocity
      forecasted_completion_date: forecastDate?.toISOString().split('T')[0],
      confidence_level: confidence,
      notes: `Snapshot taken at ${metrics.completedPct}% completion`
    };

    const { error } = await supabase
      .from('sd_burn_rate_snapshots')
      .upsert(snapshot, { onConflict: 'baseline_id,snapshot_date' });

    if (error) {
      console.log(`${colors.red}Error saving snapshot: ${error.message}${colors.reset}`);
      return;
    }

    console.log(`${colors.green}Snapshot saved for ${snapshot.snapshot_date}${colors.reset}`);
    console.log(`  Velocity: ${velocity.toFixed(2)} SDs/week`);
    console.log(`  Forecast: ${forecastDate?.toLocaleDateString() || 'N/A'} (${confidence} confidence)`);
  }

  async showHistory() {
    const { data: snapshots, error } = await supabase
      .from('sd_burn_rate_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(14);

    if (error || !snapshots || snapshots.length === 0) {
      console.log(`${colors.yellow}No snapshot history found.${colors.reset}`);
      console.log('Run \'npm run sd:burnrate snapshot\' to create one.\n');
      return;
    }

    console.log(`\n${colors.bold}BURN RATE HISTORY${colors.reset}\n`);
    console.log(`${'Date'.padEnd(12)} ${'Completed'.padEnd(12)} ${'Velocity'.padEnd(12)} ${'Forecast'.padEnd(14)} Confidence`);
    console.log(`${'-'.repeat(60)}`);

    snapshots.reverse().forEach(s => {
      const date = s.snapshot_date;
      const completed = `${s.total_sds_completed}/${s.total_sds_planned}`;
      const velocity = s.actual_velocity?.toFixed(2) || '0.00';
      const forecast = s.forecasted_completion_date || 'N/A';
      const conf = s.confidence_level || '-';

      console.log(`${date.padEnd(12)} ${completed.padEnd(12)} ${velocity.padEnd(12)} ${forecast.padEnd(14)} ${conf}`);
    });
    console.log();
  }

  async showForecast() {
    if (!await this.loadData()) return;

    console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold} COMPLETION FORECAST${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

    const metrics = this.calculateMetrics();
    const trackLoad = this.calculateTrackLoad();

    // Overall forecast
    const baselineAgeDays = metrics.baselineAgeDays || 1;
    const velocity = metrics.completedCount / (baselineAgeDays / 7);

    console.log(`${colors.bold}OVERALL FORECAST${colors.reset}\n`);

    if (velocity > 0) {
      // Optimistic (1.2x velocity)
      const optWeeks = metrics.remainingCount / (velocity * 1.2);
      const optDate = new Date();
      optDate.setDate(optDate.getDate() + Math.ceil(optWeeks * 7));

      // Expected (current velocity)
      const expWeeks = metrics.remainingCount / velocity;
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + Math.ceil(expWeeks * 7));

      // Pessimistic (0.8x velocity)
      const pesWeeks = metrics.remainingCount / (velocity * 0.8);
      const pesDate = new Date();
      pesDate.setDate(pesDate.getDate() + Math.ceil(pesWeeks * 7));

      console.log(`  ${colors.green}Optimistic:${colors.reset}  ${optDate.toLocaleDateString()} (if velocity increases 20%)`);
      console.log(`  ${colors.blue}Expected:${colors.reset}    ${expDate.toLocaleDateString()} (at current velocity)`);
      console.log(`  ${colors.yellow}Pessimistic:${colors.reset} ${pesDate.toLocaleDateString()} (if velocity drops 20%)`);
    } else {
      console.log(`  ${colors.yellow}Insufficient data for forecast.${colors.reset}`);
      console.log('  Complete at least 1 SD to enable forecasting.');
    }
    console.log();

    // Track-level forecast
    console.log(`${colors.bold}TRACK-LEVEL FORECAST${colors.reset}\n`);

    for (const [track, data] of Object.entries(trackLoad)) {
      if (data.total === 0) continue;

      const trackVelocity = data.completed / (baselineAgeDays / 7);

      if (trackVelocity > 0 && data.remaining > 0) {
        const weeksRemaining = data.remaining / trackVelocity;
        const forecastDate = new Date();
        forecastDate.setDate(forecastDate.getDate() + Math.ceil(weeksRemaining * 7));

        console.log(`  Track ${track}: ${forecastDate.toLocaleDateString()} (${data.remaining} remaining)`);
      } else if (data.remaining === 0) {
        console.log(`  Track ${track}: ${colors.green}COMPLETE${colors.reset}`);
      } else {
        console.log(`  Track ${track}: ${colors.dim}No velocity data${colors.reset} (${data.remaining} remaining)`);
      }
    }

    // Critical path
    console.log(`\n${colors.bold}CRITICAL PATH${colors.reset}\n`);

    // Find the track with most remaining work
    const criticalTrack = Object.entries(trackLoad)
      .filter(([_, d]) => d.remaining > 0)
      .sort((a, b) => b[1].remaining - a[1].remaining)[0];

    if (criticalTrack) {
      console.log(`  Bottleneck: Track ${criticalTrack[0]} (${criticalTrack[1].remaining} SDs remaining)`);
      console.log(`  ${colors.dim}Focus resources on Track ${criticalTrack[0]} to accelerate completion.${colors.reset}`);
    }

    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);
  }

  calculateMetrics() {
    const totalSDs = this.items.length;
    const completedCount = this.completedSDs.length;
    const inProgressCount = Object.values(this.sdDetails)
      .filter(sd => sd.status !== 'completed' && sd.progress_percentage > 0).length;
    const remainingCount = totalSDs - completedCount;
    const completedPct = Math.round((completedCount / totalSDs) * 100);

    const baselineCreated = new Date(this.baseline.created_at);
    const now = new Date();
    const baselineAgeDays = Math.max(1, Math.ceil((now - baselineCreated) / (1000 * 60 * 60 * 24)));

    return {
      totalSDs,
      completedCount,
      inProgressCount,
      remainingCount,
      completedPct,
      baselineAgeDays
    };
  }

  calculateTrackLoad() {
    const tracks = {};

    for (const item of this.items) {
      const track = item.track || 'UNASSIGNED';
      if (!tracks[track]) {
        tracks[track] = { total: 0, completed: 0, remaining: 0 };
      }

      tracks[track].total++;
      const sd = this.sdDetails[item.sd_id];
      if (sd?.status === 'completed') {
        tracks[track].completed++;
      } else {
        tracks[track].remaining++;
      }
    }

    return tracks;
  }

  showHelp() {
    console.log(`
${colors.bold}SD Burn Rate Calculator${colors.reset}

${colors.cyan}Commands:${colors.reset}
  report    Show current burn rate analysis (default)
  snapshot  Take a burn rate snapshot for trending
  history   Show snapshot history
  forecast  Show completion forecasts

${colors.cyan}Usage:${colors.reset}
  npm run sd:burnrate              Show burn rate report
  npm run sd:burnrate snapshot     Take a snapshot
  npm run sd:burnrate history      View historical snapshots
  npm run sd:burnrate forecast     Show detailed forecasts

${colors.cyan}Notes:${colors.reset}
  - Velocity is calculated as SDs completed per week
  - Forecasts improve as more SDs are completed
  - Take regular snapshots to track trends over time
`);
  }
}

const calculator = new SDBurnRateCalculator();
calculator.run().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
