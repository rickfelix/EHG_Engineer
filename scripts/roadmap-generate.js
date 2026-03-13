#!/usr/bin/env node
/**
 * roadmap-generate.js — Generate or incrementally update a roadmap from classified intake items
 *
 * Two modes:
 *   1. Full (no baselined roadmap): Cluster all classified items into new waves
 *   2. Incremental (baselined roadmap exists): Assign only NEW items to existing waves
 *
 * The baseline acts as a control mechanism — once approved, items are locked.
 * New weekly distills only add to existing waves, never re-cluster.
 *
 * Usage:
 *   node scripts/roadmap-generate.js                              # Auto-detect mode
 *   node scripts/roadmap-generate.js --title "Q2 Roadmap"         # Custom roadmap title
 *   node scripts/roadmap-generate.js --app ehg_engineer            # Filter by application
 *   node scripts/roadmap-generate.js --dry-run                     # Preview without writing to DB
 *   node scripts/roadmap-generate.js --full                        # Force full clustering (ignore baseline)
 *   node scripts/roadmap-generate.js --force-reassign              # Ignore wave locks (assign to any wave)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  clusterItems,
  loadClassifiedIntakeItems,
  loadNewIntakeItems,
  assignToExistingWaves,
} from '../lib/integrations/wave-clusterer.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Find the active baselined roadmap (status='active', baseline_version > 0).
 * Returns null if no baselined roadmap exists.
 */
async function getBaselinedRoadmap() {
  const { data, error } = await supabase
    .from('strategic_roadmaps')
    .select('id, title, status, current_baseline_version')
    .eq('status', 'active')
    .gt('current_baseline_version', 0)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0];
}

/**
 * Load existing waves with sample item titles for context.
 * @param {string} roadmapId
 * @param {object} options
 * @param {boolean} options.respectLocks - When true, only return waves with status IN (proposed, draft)
 */
async function loadExistingWaves(roadmapId, options = {}) {
  let query = supabase
    .from('roadmap_waves')
    .select('id, title, description, sequence_rank, status')
    .eq('roadmap_id', roadmapId)
    .order('sequence_rank', { ascending: true });

  if (options.respectLocks) {
    query = query.in('status', ['proposed', 'draft']);
  }

  const { data: waves, error } = await query;

  if (error || !waves) return [];

  // Fetch a few sample titles per wave for AI context
  const result = [];
  for (const wave of waves) {
    const { data: items } = await supabase
      .from('roadmap_wave_items')
      .select('title')
      .eq('wave_id', wave.id)
      .limit(5);

    result.push({
      id: wave.id,
      title: wave.title,
      description: wave.description || '',
      sequence_rank: wave.sequence_rank,
      sample_titles: (items || []).map(i => i.title).filter(Boolean),
    });
  }

  return result;
}

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

/**
 * Create a new wave in an existing roadmap for overflow items.
 */
async function createOverflowWave(roadmapId, nextRank) {
  const { data, error } = await supabase
    .from('roadmap_waves')
    .insert({
      roadmap_id: roadmapId,
      sequence_rank: nextRank,
      title: `Wave ${nextRank + 1}: New Items`,
      description: 'Auto-created wave for items that could not be assigned to locked/approved waves.',
      status: 'proposed',
      confidence_score: 0,
      created_by: 'leo-roadmap-generate',
    })
    .select('id, title, description, sequence_rank, status')
    .single();

  if (error) throw new Error(`Failed to create overflow wave: ${error.message}`);
  return data;
}

/**
 * Validate post-clustering integrity: no orphans, no duplicates.
 */
function validateAssignmentIntegrity(newItems, assignments, existingWaves) {
  const issues = [];

  // Check for orphaned items (not assigned to any wave)
  const assignedIndices = new Set(assignments.filter(a => a.wave_index > 0).map(a => a.item_index));
  const orphaned = newItems.filter((_, i) => !assignedIndices.has(i + 1));
  if (orphaned.length > 0) {
    issues.push({ type: 'orphaned', count: orphaned.length, items: orphaned.map(i => i.title || i.id) });
  }

  // Check for duplicates (same item assigned to multiple waves)
  const seenItems = new Map();
  for (const a of assignments) {
    if (a.wave_index === 0) continue;
    const key = a.item_index;
    if (seenItems.has(key)) {
      issues.push({ type: 'duplicate', itemIndex: key, waves: [seenItems.get(key), a.wave_index] });
    }
    seenItems.set(key, a.wave_index);
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Incremental mode: assign new items to existing baselined waves.
 */
async function runIncremental(roadmap, options) {
  const { application, dryRun, respectLocks = true } = options;

  console.log(`  Mode: INCREMENTAL (baseline v${roadmap.current_baseline_version})`);
  console.log(`  Roadmap: ${roadmap.title} [${roadmap.id.substring(0, 8)}]`);
  if (respectLocks) console.log('  Wave locking: ENABLED (only proposed/draft waves eligible)');

  // Load only items not yet assigned to any wave
  const newItems = await loadNewIntakeItems(supabase, { application, limit: 500 });
  console.log(`  New items (not in any wave): ${newItems.length}`);

  if (newItems.length === 0) {
    console.log('  No new items to assign. Roadmap is up to date.');
    return;
  }

  // Show distribution of new items
  const byApp = {};
  const byIntent = {};
  for (const item of newItems) {
    byApp[item.target_application] = (byApp[item.target_application] || 0) + 1;
    byIntent[item.chairman_intent] = (byIntent[item.chairman_intent] || 0) + 1;
  }
  console.log('  By application:', Object.entries(byApp).map(([k, v]) => `${k}(${v})`).join(', '));
  console.log('  By intent:', Object.entries(byIntent).map(([k, v]) => `${k}(${v})`).join(', '));

  // Load existing waves — filtered by status when respectLocks is true
  const existingWaves = await loadExistingWaves(roadmap.id, { respectLocks });
  console.log(`  Eligible waves: ${existingWaves.length}`);

  // If no eligible waves exist (all locked/approved), create a new one
  if (existingWaves.length === 0) {
    console.log('  No eligible waves (all locked/approved). Creating new wave...');
    // Get total wave count for sequencing
    const { data: allWaves } = await supabase
      .from('roadmap_waves')
      .select('sequence_rank')
      .eq('roadmap_id', roadmap.id)
      .order('sequence_rank', { ascending: false })
      .limit(1);
    const nextRank = allWaves && allWaves.length > 0 ? allWaves[0].sequence_rank + 1 : 0;
    const newWave = await createOverflowWave(roadmap.id, nextRank);
    existingWaves.push(newWave);
    console.log(`  Created: ${newWave.title} (rank ${newWave.sequence_rank})`);
  }

  existingWaves.forEach(w => console.log(`    [${w.sequence_rank}] ${w.title} (${w.status})`));

  // AI assigns new items to existing waves
  console.log('\n  Assigning new items to eligible waves...');
  const result = await assignToExistingWaves(newItems, existingWaves);
  console.log(`  Method: ${result.method}`);

  // Post-clustering integrity validation
  const integrity = validateAssignmentIntegrity(newItems, result.assignments, existingWaves);
  if (!integrity.valid) {
    console.log('\n  Integrity validation:');
    for (const issue of integrity.issues) {
      if (issue.type === 'orphaned') {
        console.log(`    WARNING: ${issue.count} orphaned item(s) not assigned to any wave`);
      } else if (issue.type === 'duplicate') {
        console.log(`    WARNING: Item ${issue.itemIndex} assigned to multiple waves: ${issue.waves.join(', ')}`);
      }
    }
  } else {
    console.log('  Integrity validation: PASSED');
  }

  // Summarize assignments per wave
  const waveCounts = {};
  for (const a of result.assignments) {
    const waveTitle = a.wave_index > 0 ? existingWaves[a.wave_index - 1].title : 'UNMATCHED';
    waveCounts[waveTitle] = (waveCounts[waveTitle] || 0) + 1;
  }

  console.log('\n  Assignment summary:');
  for (const [title, count] of Object.entries(waveCounts)) {
    console.log(`    ${title}: +${count} items`);
  }

  if (result.unmatched.length > 0) {
    console.log(`\n  Unmatched items (${result.unmatched.length}):`);
    result.unmatched.forEach(idx => {
      const item = newItems[idx - 1];
      if (item) console.log(`    - [${item.target_application}] ${(item.title || '').slice(0, 70)}`);
    });
    console.log('  These items need manual wave assignment or a roadmap restructure.');
  }

  if (dryRun) {
    console.log('\n  [DRY RUN] No changes written to database.');
    return;
  }

  // Persist: insert new wave items into existing waves
  let inserted = 0;
  for (const a of result.assignments) {
    if (a.wave_index === 0) continue; // Skip unmatched

    const item = newItems[a.item_index - 1];
    const wave = existingWaves[a.wave_index - 1];
    if (!item || !wave) continue;

    const { error } = await supabase
      .from('roadmap_wave_items')
      .insert({
        wave_id: wave.id,
        source_type: item.source_type,
        source_id: item.id,
      });

    if (error) {
      console.warn(`  Warning: Could not insert item ${item.id} into wave ${wave.title}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  console.log(`\n  Inserted ${inserted} items into existing waves.`);
  if (result.unmatched.length > 0) {
    console.log(`  ${result.unmatched.length} unmatched items not inserted.`);
  }
  console.log('  Done. Review with: node scripts/roadmap-status.js');
}

/**
 * Full mode: cluster all items into new waves (original behavior).
 */
async function runFull(options) {
  const { title, application, dryRun } = options;

  console.log('  Mode: FULL CLUSTERING');

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

async function main() {
  const args = process.argv.slice(2);
  const titleFlag = args.indexOf('--title');
  const appFlag = args.indexOf('--app');
  const dryRun = args.includes('--dry-run');
  const forceFull = args.includes('--full');
  const forceReassign = args.includes('--force-reassign');
  // --respect-locks is ON by default; --force-reassign disables it
  const respectLocks = !forceReassign;

  const title = titleFlag >= 0 ? args[titleFlag + 1] : 'EVA Intake Roadmap';
  const application = appFlag >= 0 ? args[appFlag + 1] : undefined;

  console.log('Roadmap Generator');
  console.log('═'.repeat(50));

  // Auto-detect mode: if a baselined roadmap exists, use incremental
  if (!forceFull) {
    const baselinedRoadmap = await getBaselinedRoadmap();
    if (baselinedRoadmap) {
      await runIncremental(baselinedRoadmap, { application, dryRun, respectLocks });
      return;
    }
  }

  await runFull({ title, application, dryRun });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
