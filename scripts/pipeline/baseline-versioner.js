#!/usr/bin/env node
/**
 * Baseline Versioner
 * Create and compare baseline version snapshots.
 *
 * Usage:
 *   node scripts/pipeline/baseline-versioner.js create [--baseline-id <uuid>] [--created-by <source>]
 *   node scripts/pipeline/baseline-versioner.js compare <baseline-id-from> <baseline-id-to>
 *   node scripts/pipeline/baseline-versioner.js history
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

const supabase = createSupabaseServiceClient();

async function getActiveBaseline() {
  const { data } = await supabase
    .from('sd_execution_baselines')
    .select('id, baseline_name, version, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function createVersion(baselineId, createdBy = 'manual') {
  if (!baselineId) {
    const active = await getActiveBaseline();
    if (!active) {
      console.error('No active baseline found.');
      process.exit(1);
    }
    baselineId = active.id;
    console.log(`Using active baseline: ${active.baseline_name} (v${active.version || 1})`);
  }

  const { data, error } = await supabase.rpc('create_baseline_version', {
    p_baseline_id: baselineId,
    p_created_by: createdBy,
  });

  if (error) {
    console.error('Error creating version:', error.message);
    process.exit(1);
  }

  console.log('✅ Baseline version created');
  console.log(`   Version: v${data.version}`);
  console.log(`   Items:   ${data.item_count}`);
  console.log(`   By:      ${data.created_by}`);
  console.log(`   At:      ${data.created_at}`);
  return data;
}

async function compareVersions(fromId, toId) {
  const { data, error } = await supabase.rpc('compare_baseline_versions', {
    p_baseline_id_from: fromId,
    p_baseline_id_to: toId,
  });

  if (error) {
    console.error('Error comparing versions:', error.message);
    process.exit(1);
  }

  console.log('Baseline Version Comparison');
  console.log('='.repeat(50));
  console.log(`  From: v${data.from_version} (${data.from_item_count} items)`);
  console.log(`  To:   v${data.to_version} (${data.to_item_count} items)`);
  console.log(`  Added:   ${data.added_count}`);
  console.log(`  Removed: ${data.removed_count}`);

  if (data.added_count > 0) {
    console.log('\n  Added SDs:');
    for (const item of data.added) {
      console.log(`    + ${item.sd_key || item.sd_id} (rank ${item.sequence_rank})`);
    }
  }

  if (data.removed_count > 0) {
    console.log('\n  Removed SDs:');
    for (const item of data.removed) {
      console.log(`    - ${item.sd_key || item.sd_id} (rank ${item.sequence_rank})`);
    }
  }

  return data;
}

async function showHistory() {
  const { data: baselines } = await supabase
    .from('sd_execution_baselines')
    .select('id, baseline_name, version, created_by, is_active, created_at')
    .not('version', 'is', null)
    .order('version', { ascending: false })
    .limit(20);

  if (!baselines || baselines.length === 0) {
    console.log('No versioned baselines found.');
    return;
  }

  console.log('Baseline Version History');
  console.log('='.repeat(70));
  console.log('  Version'.padEnd(10) + 'Name'.padEnd(35) + 'By'.padEnd(15) + 'Active');
  console.log('-'.repeat(70));

  for (const b of baselines) {
    console.log(
      `  v${b.version || '?'}`.padEnd(10) +
      `${(b.baseline_name || '').substring(0, 33)}`.padEnd(35) +
      `${b.created_by || '?'}`.padEnd(15) +
      `${b.is_active ? '✅' : ''}`
    );
  }
}

// CLI dispatch
const [,, command, ...args] = process.argv;

switch (command) {
  case 'create': {
    const baselineIdIdx = args.indexOf('--baseline-id');
    const createdByIdx = args.indexOf('--created-by');
    const baselineId = baselineIdIdx >= 0 ? args[baselineIdIdx + 1] : null;
    const createdBy = createdByIdx >= 0 ? args[createdByIdx + 1] : 'manual';
    createVersion(baselineId, createdBy).catch(err => { console.error('Fatal:', err); process.exit(1); });
    break;
  }
  case 'compare': {
    if (args.length < 2) {
      console.error('Usage: baseline-versioner.js compare <from-id> <to-id>');
      process.exit(1);
    }
    compareVersions(args[0], args[1]).catch(err => { console.error('Fatal:', err); process.exit(1); });
    break;
  }
  case 'history':
    showHistory().catch(err => { console.error('Fatal:', err); process.exit(1); });
    break;
  default:
    console.log('Baseline Versioner');
    console.log('  create  [--baseline-id <uuid>] [--created-by <source>]');
    console.log('  compare <baseline-id-from> <baseline-id-to>');
    console.log('  history');
    break;
}
