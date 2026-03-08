#!/usr/bin/env node
/**
 * roadmap-generate.js — Generate a roadmap from classified intake items
 *
 * Reads classified items directly from eva_todoist_intake and eva_youtube_intake,
 * clusters them into waves via wave-clusterer, and persists results to
 * strategic_roadmaps + roadmap_waves + roadmap_wave_items.
 *
 * Architecture ref: docs/plans/strategic-roadmap-artifact-architecture.md
 *
 * Usage:
 *   node scripts/roadmap-generate.js                              # Generate from all classified items
 *   node scripts/roadmap-generate.js --title "Q2 Roadmap"         # Custom roadmap title
 *   node scripts/roadmap-generate.js --app ehg_engineer            # Filter by application
 *   node scripts/roadmap-generate.js --dry-run                     # Preview without writing to DB
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { clusterItems, loadClassifiedIntakeItems } from '../lib/integrations/wave-clusterer.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createRoadmap(title) {
  const { data, error } = await supabase
    .from('strategic_roadmaps')
    .insert({
      title,
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

    // Insert wave items — reference intake source directly
    const waveItems = wave.item_indices
      .map(idx => items[idx - 1])
      .filter(Boolean)
      .map(item => ({
        wave_id: waveRow.id,
        source_type: item.source_type,
        source_id: item.id,
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
  const appFlag = args.indexOf('--app');
  const dryRun = args.includes('--dry-run');

  const title = titleFlag >= 0 ? args[titleFlag + 1] : 'EVA Intake Roadmap';
  const application = appFlag >= 0 ? args[appFlag + 1] : undefined;

  console.log('Roadmap Generator');
  console.log('═'.repeat(50));

  // Load classified intake items directly from intake tables
  const items = await loadClassifiedIntakeItems(supabase, { application, limit: 500 });
  console.log(`  Classified intake items: ${items.length}`);

  if (application) {
    console.log(`  Filtered by application: ${application}`);
  }

  if (items.length === 0) {
    console.log('  No classified items found. Run classification first:');
    console.log('    npm run eva:intake:classify -- --batch');
    process.exit(0);
  }

  // Show distribution
  const byApp = {};
  const byIntent = {};
  for (const item of items) {
    byApp[item.target_application] = (byApp[item.target_application] || 0) + 1;
    byIntent[item.chairman_intent] = (byIntent[item.chairman_intent] || 0) + 1;
  }
  console.log('  By application:', Object.entries(byApp).map(([k, v]) => `${k}(${v})`).join(', '));
  console.log('  By intent:', Object.entries(byIntent).map(([k, v]) => `${k}(${v})`).join(', '));

  // Cluster into waves
  console.log('\n  Clustering into waves...');
  const result = await clusterItems(items);
  console.log(`  Method: ${result.method}`);
  console.log(`  Waves proposed: ${result.waves.length}\n`);

  result.waves.forEach((wave, i) => {
    console.log(`  Wave ${i + 1}: ${wave.title} (${wave.item_indices.length} items)`);
    console.log(`    ${wave.description}`);
    // Show first 3 items as preview
    wave.item_indices.slice(0, 3).forEach(idx => {
      const item = items[idx - 1];
      if (item) console.log(`      - [${item.source_type}] ${(item.title || '').slice(0, 60)}`);
    });
    if (wave.item_indices.length > 3) {
      console.log(`      ... and ${wave.item_indices.length - 3} more`);
    }
    console.log('');
  });

  if (dryRun) {
    console.log('  [DRY RUN] No changes written to database.');
    return;
  }

  // Persist to database
  const roadmapId = await createRoadmap(title);
  console.log(`  Roadmap created: ${roadmapId}`);

  const waveResults = await createWaves(roadmapId, result.waves, items);
  waveResults.forEach(w => {
    console.log(`  Wave: ${w.title} → ${w.itemCount} items`);
  });

  console.log('\n  Done. Review waves with: node scripts/roadmap-status.js');
  console.log(`  Approve waves with:      node scripts/roadmap-promote.js --approve --roadmap-id ${roadmapId}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
