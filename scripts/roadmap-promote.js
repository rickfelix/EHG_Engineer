#!/usr/bin/env node
/**
 * roadmap-promote.js — Promote wave items to Strategic Directives
 * SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-D
 *
 * Promotes all unpromoted items in a wave to SDs by creating entries
 * in strategic_directives_v2 and updating promoted_to_sd_key on each item.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function generateSDKey(title, index) {
  const slug = (title || 'ITEM')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
  return `SD-LEO-ROADMAP-${slug}-${String(index).padStart(3, '0')}`;
}

async function promoteItem(item, index, roadmapTitle) {
  const sdKey = generateSDKey(item.title, index);
  const sdId = randomUUID();

  const { error } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: sdId,
      sd_key: sdKey,
      title: item.title || `Roadmap Item ${index}`,
      summary: `Promoted from roadmap wave item. Source: ${item.source_type}. Roadmap: ${roadmapTitle}`,
      status: 'draft',
      current_phase: 'LEAD',
      sd_type: 'feature',
      priority: 'medium',
      progress: 0,
      strategic_objectives: [
        { objective: `Implement: ${item.title || 'roadmap item'}`, measurable: true }
      ],
      success_metrics: [
        { metric: 'Feature implemented and validated', target: '100%' }
      ],
      key_changes: [
        { change: `Implementation of ${item.title || 'roadmap item'}`, area: 'feature' }
      ],
      success_criteria: [
        { criterion: 'Feature works as specified in roadmap item', met: false }
      ],
      created_by: 'leo-roadmap-promote',
      metadata: {
        source: 'roadmap_promotion',
        wave_item_id: item.id,
        source_type: item.source_type,
      },
    });

  if (error) {
    return { success: false, item, error: error.message };
  }

  // Update wave item with promoted SD key
  const { error: updateErr } = await supabase
    .from('roadmap_wave_items')
    .update({ promoted_to_sd_key: sdKey })
    .eq('id', item.id);

  if (updateErr) {
    return { success: false, item, error: `SD created but failed to update wave item: ${updateErr.message}` };
  }

  return { success: true, item, sdKey, sdId };
}

async function main() {
  const args = process.argv.slice(2);
  const waveIdFlag = args.indexOf('--wave-id');
  const waveId = waveIdFlag >= 0 ? args[waveIdFlag + 1] : null;
  const dryRun = args.includes('--dry-run');

  if (!waveId) {
    console.log('Usage: node scripts/roadmap-promote.js --wave-id <uuid> [--dry-run]');
    console.log('\nPromotes all unassigned items in a wave to Strategic Directives.');
    console.log('  --dry-run    Preview what would be promoted without creating SDs');
    process.exit(0);
  }

  // Fetch wave
  const { data: wave, error: wErr } = await supabase
    .from('roadmap_waves')
    .select('id, title, status, roadmap_id')
    .eq('id', waveId)
    .single();

  if (wErr || !wave) {
    console.error(`Wave not found: ${waveId}`);
    process.exit(1);
  }

  // Fetch roadmap title for context
  const { data: roadmap } = await supabase
    .from('strategic_roadmaps')
    .select('title')
    .eq('id', wave.roadmap_id)
    .single();

  const roadmapTitle = roadmap?.title || 'Unknown Roadmap';

  // Fetch wave items
  const { data: items, error: iErr } = await supabase
    .from('roadmap_wave_items')
    .select('id, title, source_type, source_id, promoted_to_sd_key, priority_rank')
    .eq('wave_id', waveId)
    .order('priority_rank', { ascending: true });

  if (iErr) { console.error('Error:', iErr.message); process.exit(1); }

  const unpromoted = (items || []).filter(i => !i.promoted_to_sd_key);
  const promoted = (items || []).filter(i => i.promoted_to_sd_key);

  console.log('Roadmap Wave Promotion');
  console.log('═'.repeat(50));
  console.log(`  Roadmap: ${roadmapTitle}`);
  console.log(`  Wave: ${wave.title} [${wave.status}]`);
  console.log(`  Total items: ${(items || []).length}`);
  console.log(`  Already promoted: ${promoted.length}`);
  console.log(`  Ready to promote: ${unpromoted.length}`);

  if (unpromoted.length === 0) {
    console.log('\n  All items already promoted. Nothing to do.');
    return;
  }

  if (dryRun) {
    console.log('\n  [DRY RUN] Items that would be promoted:');
    unpromoted.forEach((item, i) => {
      const sdKey = generateSDKey(item.title, i + 1);
      console.log(`    ${i + 1}. ${item.title || '(untitled)'} [${item.source_type}] → ${sdKey}`);
    });
    console.log('\n  No changes written. Remove --dry-run to execute.');
    return;
  }

  // Execute promotion
  console.log('\n  Promoting items...');
  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < unpromoted.length; i++) {
    const result = await promoteItem(unpromoted[i], i + 1, roadmapTitle);
    results.push(result);

    if (result.success) {
      succeeded++;
      console.log(`    ✓ ${result.item.title || '(untitled)'} → ${result.sdKey}`);
    } else {
      failed++;
      console.log(`    ✗ ${result.item.title || '(untitled)'}: ${result.error}`);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`  Results: ${succeeded} promoted, ${failed} failed`);

  if (failed > 0) {
    console.log('  ⚠️  Some items failed. Review errors above.');
    process.exit(1);
  }

  console.log('  Run `node scripts/roadmap-status.js` to verify.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
