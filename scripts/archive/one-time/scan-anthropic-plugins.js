#!/usr/bin/env node

/**
 * Anthropic Plugin Scanner CLI
 * SD: SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-C
 *
 * Usage:
 *   node scripts/scan-anthropic-plugins.js scan     # Discover plugins from GitHub
 *   node scripts/scan-anthropic-plugins.js evaluate  # Evaluate and auto-adapt
 *   node scripts/scan-anthropic-plugins.js status    # Show registry status
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { scanAnthropicRepos } from '../lib/plugins/anthropic-scanner.js';
import { evaluateAndAdapt } from '../lib/plugins/plugin-adapter.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cmdScan() {
  console.log('Scanning Anthropic GitHub repos for plugins...\n');
  const result = await scanAnthropicRepos(supabase);
  console.log(`  Discovered: ${result.discovered} plugin(s)`);
  if (result.errors.length) {
    console.log(`  Errors (${result.errors.length}):`);
    result.errors.forEach(e => console.log(`    - ${e}`));
  }
  return result;
}

async function cmdEvaluate() {
  console.log('Evaluating discovered plugins...\n');
  const result = await evaluateAndAdapt(supabase);
  console.log(`  Evaluated: ${result.evaluated}`);
  console.log(`  Adapted:   ${result.adapted}`);
  if (result.errors.length) {
    console.log(`  Errors (${result.errors.length}):`);
    result.errors.forEach(e => console.log(`    - ${e}`));
  }
  return result;
}

async function cmdStatus() {
  console.log('Anthropic Plugin Registry Status\n');
  const { data, error } = await supabase
    .from('anthropic_plugin_registry')
    .select('plugin_name, source_repo, status, fitness_score, last_scanned_at')
    .order('status')
    .order('fitness_score', { ascending: false, nullsFirst: false });

  if (error) {
    console.log(`  Error: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    console.log('  No plugins in registry. Run: node scripts/scan-anthropic-plugins.js scan');
    return;
  }

  // Group by status
  const grouped = {};
  for (const p of data) {
    grouped[p.status] = grouped[p.status] || [];
    grouped[p.status].push(p);
  }

  for (const [status, plugins] of Object.entries(grouped)) {
    console.log(`  [${status.toUpperCase()}] (${plugins.length})`);
    for (const p of plugins) {
      const score = p.fitness_score != null ? ` score:${p.fitness_score}` : '';
      console.log(`    ${p.plugin_name} (${p.source_repo})${score}`);
    }
  }

  console.log(`\n  Total: ${data.length} plugin(s)`);
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'scan':
      await cmdScan();
      break;
    case 'evaluate':
      await cmdEvaluate();
      break;
    case 'status':
      await cmdStatus();
      break;
    default:
      console.log('Anthropic Plugin Scanner');
      console.log('');
      console.log('Commands:');
      console.log('  scan      Discover plugins from Anthropic GitHub repos');
      console.log('  evaluate  Evaluate fitness and auto-adapt qualifying plugins');
      console.log('  status    Show current registry status');
      process.exit(command ? 1 : 0);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
