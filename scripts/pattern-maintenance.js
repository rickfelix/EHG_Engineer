#!/usr/bin/env node
/**
 * PATTERN MAINTENANCE
 * LEO Protocol v4.3.2 Enhancement
 *
 * Combines all pattern lifecycle maintenance tasks:
 * 1. Detect stale patterns (90+ days → decreasing, 180+ days → obsolete)
 * 2. Sync patterns to triggers (high-occurrence patterns get triggers)
 * 3. Backfill missing related_sub_agents
 * 4. Generate updated CLAUDE.md files
 *
 * Run weekly: node scripts/pattern-maintenance.js
 * Or via cron: 0 0 * * 0 node /path/to/scripts/pattern-maintenance.js
 *
 * Usage:
 *   node scripts/pattern-maintenance.js [--dry-run] [--skip-generate]
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { fetchAllPaginated, renderCount } from '../lib/db/fetch-all-paginated.mjs';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_GENERATE = process.argv.includes('--skip-generate');

/**
 * Run a script and capture output
 */
function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const allArgs = [...args];
    if (DRY_RUN && !args.includes('--dry-run')) {
      allArgs.push('--dry-run');
    }

    const proc = spawn('node', [scriptPath, ...allArgs], {
      cwd: process.cwd(),
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Get maintenance statistics
 */
async function getStatistics() {
  // Paginated — SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: issue_patterns is
  // unbounded-growth and status='active' does not bound it; patterns_without_subagents needs
  // the related_sub_agents array per row below, not just a count.
  let patterns;
  try {
    patterns = await fetchAllPaginated(() => supabase
      .from('issue_patterns')
      .select('status, trend, related_sub_agents')
      .eq('status', 'active')
      .order('id', { ascending: true }));
  } catch {
    patterns = null;
  }

  // Gauges (exact head-count) — only a count is used for both.
  const { count: totalMappings } = await supabase
    .from('pattern_subagent_mapping')
    .select('id', { count: 'exact', head: true });

  const { count: patternTriggerCount } = await supabase
    .from('leo_sub_agent_triggers')
    .select('id', { count: 'exact', head: true })
    .eq('trigger_context', 'pattern');

  return {
    total_patterns: patterns?.length || 0,
    patterns_without_subagents: patterns?.filter(p => !p.related_sub_agents || p.related_sub_agents.length === 0).length || 0,
    total_mappings: renderCount(totalMappings),
    pattern_triggers: renderCount(patternTriggerCount)
  };
}

/**
 * Main maintenance routine
 */
async function runMaintenance() {
  const startTime = Date.now();

  console.log('\n🔧 PATTERN MAINTENANCE');
  console.log('═'.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Skip generate: ${SKIP_GENERATE}`);
  console.log(`Started: ${new Date().toISOString()}`);

  // Get pre-maintenance stats
  console.log('\n📊 PRE-MAINTENANCE STATISTICS');
  console.log('─'.repeat(60));
  const preStats = await getStatistics();
  console.log(`   Active patterns: ${preStats.total_patterns}`);
  console.log(`   Patterns without sub-agents: ${preStats.patterns_without_subagents}`);
  console.log(`   Pattern-subagent mappings: ${preStats.total_mappings}`);
  console.log(`   Pattern triggers: ${preStats.pattern_triggers}`);

  const results = {
    staleness: null,
    backfill: null,
    sync: null,
    generate: null
  };

  // Step 1: Detect stale patterns
  console.log('\n\n' + '═'.repeat(60));
  console.log('📅 STEP 1: STALENESS DETECTION');
  console.log('═'.repeat(60));
  try {
    results.staleness = await runScript('scripts/detect-stale-patterns.js');
  } catch (err) {
    console.error('❌ Staleness detection failed:', err.message);
  }

  // Step 2: Backfill missing related_sub_agents
  console.log('\n\n' + '═'.repeat(60));
  console.log('🔄 STEP 2: BACKFILL SUB-AGENTS');
  console.log('═'.repeat(60));
  try {
    results.backfill = await runScript('scripts/backfill-pattern-subagents.js');
  } catch (err) {
    console.error('❌ Backfill failed:', err.message);
  }

  // Step 3: Sync patterns to triggers
  console.log('\n\n' + '═'.repeat(60));
  console.log('🔗 STEP 3: TRIGGER SYNC');
  console.log('═'.repeat(60));
  try {
    results.sync = await runScript('scripts/sync-pattern-triggers.js', ['--threshold=2']);
  } catch (err) {
    console.error('❌ Trigger sync failed:', err.message);
  }

  // Step 4: Regenerate CLAUDE.md
  if (!SKIP_GENERATE && !DRY_RUN) {
    console.log('\n\n' + '═'.repeat(60));
    console.log('📝 STEP 4: REGENERATE CLAUDE.MD');
    console.log('═'.repeat(60));
    try {
      results.generate = await runScript('scripts/generate-claude-md-from-db.js');
    } catch (err) {
      console.error('❌ CLAUDE.md generation failed:', err.message);
    }
  } else {
    console.log('\n\n' + '═'.repeat(60));
    console.log('📝 STEP 4: REGENERATE CLAUDE.MD (SKIPPED)');
    console.log('═'.repeat(60));
    console.log(DRY_RUN ? '   Skipped in dry-run mode' : '   Skipped via --skip-generate flag');
  }

  // Get post-maintenance stats
  console.log('\n\n' + '═'.repeat(60));
  console.log('📊 POST-MAINTENANCE STATISTICS');
  console.log('─'.repeat(60));
  const postStats = await getStatistics();
  console.log(`   Active patterns: ${postStats.total_patterns}`);
  console.log(`   Patterns without sub-agents: ${postStats.patterns_without_subagents}`);
  console.log(`   Pattern-subagent mappings: ${postStats.total_mappings}`);
  console.log(`   Pattern triggers: ${postStats.pattern_triggers}`);

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n\n' + '═'.repeat(60));
  console.log('✅ MAINTENANCE COMPLETE');
  console.log('═'.repeat(60));
  console.log(`   Duration: ${duration}s`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes made)' : 'LIVE'}`);
  console.log(`   Finished: ${new Date().toISOString()}`);

  // Changes summary
  console.log('\n📈 CHANGES:');
  console.log(`   Sub-agents populated: ${preStats.patterns_without_subagents - postStats.patterns_without_subagents}`);
  console.log(`   New mappings: ${postStats.total_mappings - preStats.total_mappings}`);
  console.log(`   New triggers: ${postStats.pattern_triggers - preStats.pattern_triggers}`);

  return {
    success: true,
    duration,
    preStats,
    postStats,
    results
  };
}

// Run
runMaintenance()
  .then((_result) => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
