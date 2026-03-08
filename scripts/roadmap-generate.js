#!/usr/bin/env node
/**
 * roadmap-generate.js — Generate a roadmap from SD backlog items
 * SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-C
 *
 * Reads from sd_backlog_map, clusters items into waves via wave-clusterer,
 * and persists results to strategic_roadmaps + roadmap_waves + roadmap_wave_items.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { clusterItems } from '../lib/integrations/wave-clusterer.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fetchBacklogItems(visionKey) {
  const query = supabase
    .from('sd_backlog_map')
    .select('id, backlog_title, item_description, priority, category, source_type, source_id')
    .order('priority', { ascending: true });

  if (visionKey) {
    query.eq('vision_key', visionKey);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch backlog: ${error.message}`);
  return data || [];
}

async function createRoadmap(title, visionKey) {
  const { data, error } = await supabase
    .from('strategic_roadmaps')
    .insert({
      title,
      vision_key: visionKey || null,
      status: 'draft',
      created_by: 'leo-roadmap-generate',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create roadmap: ${error.message}`);
  return data.id;
}

async function createWaves(roadmapId, waves, items) {
  const results = [];

  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    const { data: waveRow, error: waveErr } = await supabase
      .from('roadmap_waves')
      .insert({
        roadmap_id: roadmapId,
        sequence_rank: i,
        title: wave.title,
        description: wave.description,
        status: 'proposed',
        confidence_score: 0,
        created_by: 'leo-roadmap-generate',
      })
      .select('id')
      .single();

    if (waveErr) throw new Error(`Failed to create wave ${i}: ${waveErr.message}`);

    // Insert wave items
    const waveItems = wave.item_indices
      .map(idx => items[idx - 1])
      .filter(Boolean)
      .map((item, rank) => ({
        wave_id: waveRow.id,
        source_type: item.source_type || 'todoist',
        source_id: item.id,
        title: item.backlog_title || item.title,
        priority_rank: rank,
      }));

    if (waveItems.length > 0) {
      const { error: itemErr } = await supabase
        .from('roadmap_wave_items')
        .insert(waveItems);
      if (itemErr) console.warn(`  Warning: Could not insert items for wave ${i}: ${itemErr.message}`);
    }

    results.push({ waveId: waveRow.id, title: wave.title, itemCount: waveItems.length });
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const titleFlag = args.indexOf('--title');
  const visionFlag = args.indexOf('--vision-key');
  const dryRun = args.includes('--dry-run');

  const title = titleFlag >= 0 ? args[titleFlag + 1] : 'Auto-Generated Roadmap';
  const visionKey = visionFlag >= 0 ? args[visionFlag + 1] : null;

  console.log('Roadmap Generator');
  console.log('═'.repeat(50));

  // Fetch backlog items
  const items = await fetchBacklogItems(visionKey);
  console.log(`  Backlog items found: ${items.length}`);

  if (items.length === 0) {
    console.log('  No backlog items found. Populate sd_backlog_map first.');
    process.exit(0);
  }

  // Cluster into waves
  const clusterInput = items.map(item => ({
    id: item.id,
    title: item.backlog_title || '',
    description: item.item_description || '',
    priority: item.priority || 'medium',
    category: item.category || '',
  }));

  const result = await clusterItems(clusterInput);
  console.log(`  Clustering method: ${result.method}`);
  console.log(`  Waves proposed: ${result.waves.length}`);

  result.waves.forEach((wave, i) => {
    console.log(`    Wave ${i + 1}: ${wave.title} (${wave.item_indices.length} items)`);
  });

  if (dryRun) {
    console.log('\n  [DRY RUN] No changes written to database.');
    return;
  }

  // Persist to database
  const roadmapId = await createRoadmap(title, visionKey);
  console.log(`\n  Roadmap created: ${roadmapId}`);

  const waveResults = await createWaves(roadmapId, result.waves, items);
  waveResults.forEach(w => {
    console.log(`  Wave: ${w.title} → ${w.itemCount} items`);
  });

  console.log('\n  Done. Run `node scripts/roadmap-status.js` to view.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
