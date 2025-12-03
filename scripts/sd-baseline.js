#!/usr/bin/env node

/**
 * SD Baseline Management
 *
 * Purpose: Create and manage execution baselines for Strategic Directives
 * Owner: LEAD role
 *
 * Commands:
 *   create  - Create a new baseline from current sequence_rank assignments
 *   view    - View the active baseline
 *   list    - List all baselines
 *   activate - Activate a specific baseline (requires LEAD approval)
 *   rebaseline - Create new baseline and mark current as superseded
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import readline from 'readline';

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

class SDBaselineManager {
  constructor() {
    this.command = process.argv[2] || 'view';
    this.args = process.argv.slice(3);
  }

  async run() {
    switch (this.command) {
      case 'create':
        await this.createBaseline();
        break;
      case 'view':
        await this.viewActiveBaseline();
        break;
      case 'list':
        await this.listBaselines();
        break;
      case 'activate':
        await this.activateBaseline(this.args[0]);
        break;
      case 'rebaseline':
        await this.rebaseline();
        break;
      default:
        this.showHelp();
    }
  }

  async createBaseline() {
    console.log(`\n${colors.cyan}${colors.bold}Creating New SD Execution Baseline${colors.reset}\n`);

    // Check for existing active baseline
    const { data: existing } = await supabase
      .from('sd_execution_baselines')
      .select('id, baseline_name')
      .eq('is_active', true)
      .single();

    if (existing) {
      console.log(`${colors.yellow}Warning: Active baseline already exists: ${existing.baseline_name}${colors.reset}`);
      console.log('Use \'npm run sd:baseline rebaseline\' to create a new one.\n');
      return;
    }

    // Get SDs with sequence_rank set
    const { data: sds, error } = await supabase
      .from('strategic_directives_v2')
      .select('legacy_id, title, sequence_rank, priority, status, dependencies, metadata, progress_percentage')
      .not('sequence_rank', 'is', null)
      .in('status', ['draft', 'active', 'in_progress'])
      .order('sequence_rank')
      .limit(50);

    if (error || !sds || sds.length === 0) {
      console.log(`${colors.red}No SDs with sequence_rank found. Set sequence_rank on SDs first.${colors.reset}`);
      return;
    }

    console.log(`Found ${sds.length} SDs with sequence_rank assignments.\n`);

    // Create baseline
    const baselineName = `${new Date().toISOString().split('T')[0]} Initial Baseline`;
    const { data: baseline, error: baselineError } = await supabase
      .from('sd_execution_baselines')
      .insert({
        baseline_name: baselineName,
        baseline_type: 'initial',
        is_active: true,
        created_by: 'LEAD',
        approved_by: 'LEAD',
        approved_at: new Date().toISOString(),
        notes: `Initial baseline created with ${sds.length} prioritized SDs`
      })
      .select()
      .single();

    if (baselineError) {
      console.log(`${colors.red}Error creating baseline: ${baselineError.message}${colors.reset}`);
      return;
    }

    console.log(`${colors.green}Created baseline: ${baseline.baseline_name}${colors.reset}\n`);

    // Create baseline items
    const items = [];
    for (const sd of sds) {
      const track = sd.metadata?.execution_track || 'UNASSIGNED';
      const trackKey = track === 'Infrastructure' || track === 'Safety' ? 'A' :
                       track === 'Feature' ? 'B' :
                       track === 'Quality' ? 'C' :
                       track === 'STANDALONE' ? 'STANDALONE' : null;

      const trackName = trackKey === 'A' ? 'Infrastructure/Safety' :
                        trackKey === 'B' ? 'Feature/Stages' :
                        trackKey === 'C' ? 'Quality' :
                        trackKey === 'STANDALONE' ? 'Standalone' : 'Unassigned';

      // Calculate dependency health score
      const healthScore = await this.calculateDependencyHealthScore(sd.dependencies);

      items.push({
        baseline_id: baseline.id,
        sd_id: sd.legacy_id,
        sequence_rank: sd.sequence_rank,
        track: trackKey,
        track_name: trackName,
        dependencies_snapshot: sd.dependencies,
        dependency_health_score: healthScore,
        is_ready: healthScore >= 1.0,
        notes: sd.metadata?.rationale || null
      });
    }

    const { error: itemsError } = await supabase
      .from('sd_baseline_items')
      .insert(items);

    if (itemsError) {
      console.log(`${colors.red}Error creating baseline items: ${itemsError.message}${colors.reset}`);
      return;
    }

    // Create initial actuals records
    const actuals = sds.map(sd => ({
      sd_id: sd.legacy_id,
      baseline_id: baseline.id,
      status: sd.progress_percentage > 0 ? 'in_progress' : 'not_started'
    }));

    await supabase.from('sd_execution_actuals').insert(actuals);

    console.log(`${colors.green}Created ${items.length} baseline items.${colors.reset}\n`);

    // Display summary
    await this.viewActiveBaseline();
  }

  async viewActiveBaseline() {
    const { data: baseline, error } = await supabase
      .from('sd_execution_baselines')
      .select('*')
      .eq('is_active', true)
      .single();

    if (error || !baseline) {
      console.log(`${colors.yellow}No active baseline found.${colors.reset}`);
      console.log('Run \'npm run sd:baseline create\' to create one.\n');
      return;
    }

    console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold} ACTIVE BASELINE: ${baseline.baseline_name}${colors.reset}`);
    console.log(`${colors.dim} Created: ${new Date(baseline.created_at).toLocaleString()}${colors.reset}`);
    console.log(`${colors.dim} Approved by: ${baseline.approved_by || 'Pending'}${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Get baseline items
    const { data: items } = await supabase
      .from('sd_baseline_items')
      .select('*')
      .eq('baseline_id', baseline.id)
      .order('sequence_rank');

    if (!items || items.length === 0) {
      console.log(`${colors.yellow}No items in this baseline.${colors.reset}`);
      return;
    }

    // Group by track
    const tracks = { A: [], B: [], C: [], STANDALONE: [], null: [] };
    items.forEach(item => {
      const track = item.track || 'null';
      if (tracks[track]) tracks[track].push(item);
    });

    // Display tracks
    const trackColors = { A: colors.magenta, B: colors.blue, C: colors.cyan, STANDALONE: colors.yellow };

    for (const [trackKey, trackItems] of Object.entries(tracks)) {
      if (trackItems.length === 0 || trackKey === 'null') continue;

      const trackColor = trackColors[trackKey] || colors.dim;
      console.log(`${trackColor}${colors.bold}TRACK ${trackKey}: ${trackItems[0]?.track_name || trackKey}${colors.reset}`);

      for (const item of trackItems) {
        const readyIcon = item.is_ready ? `${colors.green}READY${colors.reset}` : `${colors.yellow}DEPS${colors.reset}`;
        const healthPct = Math.round((item.dependency_health_score || 0) * 100);
        console.log(`  [${item.sequence_rank}] ${item.sd_id} - ${readyIcon} (${healthPct}% deps satisfied)`);
      }
      console.log();
    }

    // Summary stats
    const readyCount = items.filter(i => i.is_ready).length;
    const totalCount = items.length;
    console.log(`${colors.dim}Summary: ${readyCount}/${totalCount} SDs ready to start${colors.reset}\n`);
  }

  async listBaselines() {
    const { data: baselines, error } = await supabase
      .from('sd_execution_baselines')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !baselines || baselines.length === 0) {
      console.log(`${colors.yellow}No baselines found.${colors.reset}`);
      return;
    }

    console.log(`\n${colors.bold}SD Execution Baselines:${colors.reset}\n`);

    for (const b of baselines) {
      const activeIcon = b.is_active ? `${colors.green}[ACTIVE]${colors.reset}` : `${colors.dim}[inactive]${colors.reset}`;
      console.log(`${activeIcon} ${b.baseline_name}`);
      console.log(`  ${colors.dim}ID: ${b.id}${colors.reset}`);
      console.log(`  ${colors.dim}Created: ${new Date(b.created_at).toLocaleString()} by ${b.created_by}${colors.reset}`);
      if (b.superseded_by) {
        console.log(`  ${colors.dim}Superseded by: ${b.superseded_by}${colors.reset}`);
      }
      console.log();
    }
  }

  async activateBaseline(baselineId) {
    if (!baselineId) {
      console.log(`${colors.red}Usage: npm run sd:baseline activate <baseline-id>${colors.reset}`);
      return;
    }

    // Require LEAD approval
    console.log(`${colors.yellow}LEAD APPROVAL REQUIRED${colors.reset}`);
    console.log(`Activating baseline: ${baselineId}\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      rl.question('Enter "LEAD APPROVED" to confirm: ', resolve);
    });
    rl.close();

    if (answer !== 'LEAD APPROVED') {
      console.log(`${colors.red}Activation cancelled.${colors.reset}`);
      return;
    }

    // Deactivate current baseline
    await supabase
      .from('sd_execution_baselines')
      .update({ is_active: false })
      .eq('is_active', true);

    // Activate new baseline
    const { error } = await supabase
      .from('sd_execution_baselines')
      .update({
        is_active: true,
        approved_by: 'LEAD',
        approved_at: new Date().toISOString()
      })
      .eq('id', baselineId);

    if (error) {
      console.log(`${colors.red}Error: ${error.message}${colors.reset}`);
      return;
    }

    console.log(`${colors.green}Baseline activated successfully.${colors.reset}`);
  }

  async rebaseline() {
    console.log(`\n${colors.cyan}${colors.bold}Creating Rebaseline${colors.reset}\n`);

    // Get current active baseline
    const { data: current } = await supabase
      .from('sd_execution_baselines')
      .select('id, baseline_name')
      .eq('is_active', true)
      .single();

    if (!current) {
      console.log(`${colors.yellow}No active baseline to rebaseline from. Use 'create' instead.${colors.reset}`);
      return;
    }

    console.log(`Current baseline: ${current.baseline_name}`);
    console.log(`${colors.yellow}LEAD APPROVAL REQUIRED for rebaseline${colors.reset}\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const reason = await new Promise(resolve => {
      rl.question('Reason for rebaseline: ', resolve);
    });

    const confirm = await new Promise(resolve => {
      rl.question('Enter "LEAD APPROVED" to confirm: ', resolve);
    });
    rl.close();

    if (confirm !== 'LEAD APPROVED') {
      console.log(`${colors.red}Rebaseline cancelled.${colors.reset}`);
      return;
    }

    // Create new baseline
    const baselineName = `${new Date().toISOString().split('T')[0]} Rebaseline`;
    const { data: newBaseline, error: baselineError } = await supabase
      .from('sd_execution_baselines')
      .insert({
        baseline_name: baselineName,
        baseline_type: 'rebaseline',
        is_active: true,
        created_by: 'LEAD',
        approved_by: 'LEAD',
        approved_at: new Date().toISOString(),
        notes: `Rebaseline from ${current.baseline_name}. Reason: ${reason}`
      })
      .select()
      .single();

    if (baselineError) {
      console.log(`${colors.red}Error: ${baselineError.message}${colors.reset}`);
      return;
    }

    // Mark old baseline as superseded and inactive
    await supabase
      .from('sd_execution_baselines')
      .update({
        is_active: false,
        superseded_by: newBaseline.id
      })
      .eq('id', current.id);

    // Copy items from current to new, updating with current sequence_rank
    const { data: sds } = await supabase
      .from('strategic_directives_v2')
      .select('legacy_id, title, sequence_rank, priority, status, dependencies, metadata')
      .not('sequence_rank', 'is', null)
      .in('status', ['draft', 'active', 'in_progress'])
      .order('sequence_rank')
      .limit(50);

    if (sds && sds.length > 0) {
      const items = [];
      for (const sd of sds) {
        const track = sd.metadata?.execution_track || 'UNASSIGNED';
        const trackKey = track === 'Infrastructure' || track === 'Safety' ? 'A' :
                         track === 'Feature' ? 'B' :
                         track === 'Quality' ? 'C' : 'STANDALONE';

        const healthScore = await this.calculateDependencyHealthScore(sd.dependencies);

        items.push({
          baseline_id: newBaseline.id,
          sd_id: sd.legacy_id,
          sequence_rank: sd.sequence_rank,
          track: trackKey,
          track_name: trackKey === 'A' ? 'Infrastructure/Safety' :
                      trackKey === 'B' ? 'Feature/Stages' :
                      trackKey === 'C' ? 'Quality' : 'Standalone',
          dependencies_snapshot: sd.dependencies,
          dependency_health_score: healthScore,
          is_ready: healthScore >= 1.0
        });
      }

      await supabase.from('sd_baseline_items').insert(items);
    }

    console.log(`${colors.green}Rebaseline complete: ${newBaseline.baseline_name}${colors.reset}\n`);
    await this.viewActiveBaseline();
  }

  async calculateDependencyHealthScore(dependencies) {
    if (!dependencies) return 1.0;

    let deps = [];
    if (typeof dependencies === 'string') {
      try {
        deps = JSON.parse(dependencies);
      } catch {
        return 1.0;
      }
    } else if (Array.isArray(dependencies)) {
      deps = dependencies;
    }

    if (deps.length === 0) return 1.0;

    let completedCount = 0;
    for (const dep of deps) {
      const depId = typeof dep === 'string' ?
        dep.match(/^(SD-[A-Z0-9-]+)/)?.[1] || dep :
        dep.sd_id || dep;

      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('status')
        .eq('legacy_id', depId)
        .single();

      if (sd && sd.status === 'completed') {
        completedCount++;
      }
    }

    return Math.round((completedCount / deps.length) * 100) / 100;
  }

  showHelp() {
    console.log(`
${colors.bold}SD Baseline Management${colors.reset}

${colors.cyan}Commands:${colors.reset}
  create     Create a new baseline from current sequence_rank assignments
  view       View the active baseline (default)
  list       List all baselines
  activate   Activate a specific baseline (requires LEAD approval)
  rebaseline Create new baseline, superseding the current one

${colors.cyan}Usage:${colors.reset}
  npm run sd:baseline              View active baseline
  npm run sd:baseline create       Create initial baseline
  npm run sd:baseline list         List all baselines
  npm run sd:baseline activate <id> Activate a baseline
  npm run sd:baseline rebaseline   Create a rebaseline

${colors.cyan}Notes:${colors.reset}
  - Only one baseline can be active at a time
  - Rebaseline requires LEAD approval
  - Baselines track planned vs actual execution for burn rate analysis
`);
  }
}

const manager = new SDBaselineManager();
manager.run().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
