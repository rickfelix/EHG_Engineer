#!/usr/bin/env node
/**
 * roadmap-promote.js — Promote wave items to Strategic Directives
 * SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-D
 *
 * Creates SDs for unpromoted wave items, updates tracking fields,
 * and transitions wave status. Also supports --approve for baseline snapshots.
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';
import { promoteWaveToSDs, approveSequence, getRoadmapStats } from '../lib/integrations/roadmap-manager.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

async function main() {
  const args = process.argv.slice(2);
  const waveIdFlag = args.indexOf('--wave-id');
  const waveId = waveIdFlag >= 0 ? args[waveIdFlag + 1] : null;
  const approveFlag = args.includes('--approve');
  const roadmapIdFlag = args.indexOf('--roadmap-id');
  const roadmapId = roadmapIdFlag >= 0 ? args[roadmapIdFlag + 1] : null;
  const rationaleFlag = args.indexOf('--rationale');
  const rationale = rationaleFlag >= 0 ? args[rationaleFlag + 1] : 'Approved via CLI';
  const dryRun = args.includes('--dry-run');

  if (approveFlag && roadmapId) {
    return handleApprove(roadmapId, rationale);
  }

  if (!waveId) {
    console.log('Usage:');
    console.log('  node scripts/roadmap-promote.js --wave-id <uuid>              Promote wave items to SDs');
    console.log('  node scripts/roadmap-promote.js --wave-id <uuid> --dry-run    Preview without creating');
    console.log('  node scripts/roadmap-promote.js --approve --roadmap-id <uuid> Approve wave sequence');
    console.log('    --rationale "reason"                                        (optional rationale)');
    process.exit(0);
  }

  // Fetch wave and items for preview
  const { data: wave, error: wErr } = await supabase
    .from('roadmap_waves')
    .select('id, title, status')
    .eq('id', waveId)
    .single();

  if (wErr || !wave) {
    console.error(`Wave not found: ${waveId}`);
    process.exit(1);
  }

  const { data: items, error: iErr } = await supabase
    .from('roadmap_wave_items')
    .select('id, title, source_type, promoted_to_sd_key')
    .eq('wave_id', waveId)
    .order('priority_rank', { ascending: true });

  if (iErr) { console.error('Error:', iErr.message); process.exit(1); }

  const unpromoted = (items || []).filter(i => !i.promoted_to_sd_key);
  const promoted = (items || []).filter(i => i.promoted_to_sd_key);

  console.log(`\nWave: ${wave.title} [${wave.status}]`);
  console.log('═'.repeat(60));
  console.log(`  Total items: ${(items || []).length}`);
  console.log(`  Already promoted: ${promoted.length}`);
  console.log(`  Ready to promote: ${unpromoted.length}`);

  if (promoted.length > 0) {
    console.log('\n  Already promoted:');
    promoted.forEach((item, i) => {
      console.log(`    ✓ ${item.title || '(untitled)'} → ${item.promoted_to_sd_key}`);
    });
  }

  if (unpromoted.length === 0) {
    console.log('\n  All items already promoted. Nothing to do.');
    process.exit(0);
  }

  console.log('\n  Items to promote:');
  unpromoted.forEach((item, i) => {
    console.log(`    ${i + 1}. ${item.title || '(untitled)'} [${item.source_type}]`);
  });

  if (dryRun) {
    console.log('\n  [DRY RUN] No SDs created. Remove --dry-run to execute.');
    process.exit(0);
  }

  // Execute promotion
  console.log('\n  Promoting...');
  const result = await promoteWaveToSDs(supabase, waveId);

  console.log('\n  Results:');
  console.log(`    Created: ${result.created.length} SDs`);
  result.created.forEach(key => console.log(`      → ${key}`));
  if (result.skipped > 0) {
    console.log(`    Skipped: ${result.skipped} (already promoted)`);
  }
  if (result.errors.length > 0) {
    console.log(`    Errors: ${result.errors.length}`);
    result.errors.forEach(e => console.log(`      ✗ ${e}`));
  }
  console.log('═'.repeat(60));
}

async function handleApprove(roadmapId, rationale) {
  console.log(`\nApproving wave sequence for roadmap: ${roadmapId}`);
  console.log('═'.repeat(60));

  const result = await approveSequence(supabase, roadmapId, rationale);

  console.log(`  ✓ Baseline snapshot created (version ${result.version})`);
  console.log(`  ✓ Snapshot ID: ${result.snapshotId}`);
  console.log(`  ✓ Rationale: ${rationale}`);

  const stats = await getRoadmapStats(supabase, roadmapId);
  console.log('\n  Roadmap stats:');
  console.log(`    Waves: ${stats.wave_count}`);
  console.log(`    Items: ${stats.total_items} (${stats.promoted_items} promoted, ${stats.completion_pct}%)`);
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
