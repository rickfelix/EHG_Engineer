#!/usr/bin/env node
/**
 * roadmap-status.js — Display roadmap wave status
 * SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-C
 *
 * Shows all roadmaps with their waves, item counts, and progress.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { WAVE_STATUS_LABELS } from '../lib/integrations/roadmap-taxonomy.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const args = process.argv.slice(2);
  const roadmapIdFlag = args.indexOf('--roadmap-id');
  const roadmapId = roadmapIdFlag >= 0 ? args[roadmapIdFlag + 1] : null;

  // Fetch roadmaps
  const roadmapQuery = supabase
    .from('strategic_roadmaps')
    .select('id, title, status, current_baseline_version, created_at')
    .order('created_at', { ascending: false });

  if (roadmapId) roadmapQuery.eq('id', roadmapId);

  const { data: roadmaps, error: rmErr } = await roadmapQuery;
  if (rmErr) { console.error('Error fetching roadmaps:', rmErr.message); process.exit(1); }

  if (!roadmaps || roadmaps.length === 0) {
    console.log('No roadmaps found. Run `node scripts/roadmap-generate.js` to create one.');
    return;
  }

  console.log('Roadmap Status');
  console.log('═'.repeat(60));

  for (const rm of roadmaps) {
    console.log(`\n  ${rm.title} [${rm.status.toUpperCase()}]`);
    console.log(`  ID: ${rm.id}`);
    console.log(`  Baseline: v${rm.current_baseline_version}`);
    console.log(`  Created: ${new Date(rm.created_at).toLocaleDateString()}`);

    // Fetch waves
    const { data: waves, error: wErr } = await supabase
      .from('roadmap_waves')
      .select('id, sequence_rank, title, status, progress_pct, confidence_score')
      .eq('roadmap_id', rm.id)
      .order('sequence_rank', { ascending: true });

    if (wErr) { console.warn(`  Warning: Could not fetch waves: ${wErr.message}`); continue; }

    if (!waves || waves.length === 0) {
      console.log('  No waves defined.');
      continue;
    }

    console.log(`  Waves: ${waves.length}`);
    console.log('  ' + '─'.repeat(56));

    for (const wave of waves) {
      // Count items per wave
      const { count } = await supabase
        .from('roadmap_wave_items')
        .select('id', { count: 'exact', head: true })
        .eq('wave_id', wave.id);

      const promoted = await supabase
        .from('roadmap_wave_items')
        .select('id', { count: 'exact', head: true })
        .eq('wave_id', wave.id)
        .not('promoted_to_sd_key', 'is', null);

      // SD-DISTILLTOBRAINSTORM-ORCH-001-B: Disposition breakdown
      const { data: dispositionData } = await supabase
        .from('roadmap_wave_items')
        .select('item_disposition')
        .eq('wave_id', wave.id);
      const dispositions = {};
      for (const row of (dispositionData || [])) {
        const d = row.item_disposition || 'pending';
        dispositions[d] = (dispositions[d] || 0) + 1;
      }
      const dispStr = Object.entries(dispositions).map(([k, v]) => `${k}:${v}`).join(' ');

      const statusLabel = WAVE_STATUS_LABELS[wave.status] || wave.status;
      const progress = Number(wave.progress_pct || 0).toFixed(0);
      const conf = Number(wave.confidence_score || 0).toFixed(2);

      console.log(`    [${wave.sequence_rank}] ${wave.title}`);
      console.log(`        Status: ${statusLabel} | Progress: ${progress}% | Confidence: ${conf}`);
      console.log(`        Items: ${count || 0} | Promoted: ${promoted.count || 0}${dispStr ? ' | ' + dispStr : ''}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
