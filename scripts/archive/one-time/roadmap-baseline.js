#!/usr/bin/env node
/**
 * roadmap-baseline.js — Create and view baseline snapshots for roadmaps
 * SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-D
 *
 * Subcommands:
 *   create --roadmap-id <uuid> [--rationale "reason"]
 *   list   --roadmap-id <uuid>
 *   view   --roadmap-id <uuid> --version <n>
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createBaseline, listBaselines, getBaseline } from '../lib/integrations/baseline-manager.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function parseArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

async function handleCreate(args) {
  const roadmapId = parseArg(args, '--roadmap-id');
  if (!roadmapId) {
    console.log('Usage: node scripts/roadmap-baseline.js create --roadmap-id <uuid> [--rationale "reason"]');
    process.exit(0);
  }

  const rationale = parseArg(args, '--rationale');

  console.log('Creating Baseline Snapshot');
  console.log('═'.repeat(50));

  const result = await createBaseline(supabase, roadmapId, {
    rationale,
    createdBy: 'leo-roadmap-baseline',
  });

  console.log(`  ✓ Baseline v${result.version} created`);
  console.log(`  Snapshot ID: ${result.snapshotId}`);
  if (rationale) console.log(`  Rationale: ${rationale}`);
  console.log('\n  Run `node scripts/roadmap-baseline.js list --roadmap-id ' + roadmapId + '` to view history.');
}

async function handleList(args) {
  const roadmapId = parseArg(args, '--roadmap-id');
  if (!roadmapId) {
    // If no roadmap-id, list all roadmaps with their baseline versions
    const { data: roadmaps, error } = await supabase
      .from('strategic_roadmaps')
      .select('id, title, status, current_baseline_version, created_at')
      .order('created_at', { ascending: false });

    if (error) { console.error('Error:', error.message); process.exit(1); }

    if (!roadmaps || roadmaps.length === 0) {
      console.log('No roadmaps found.');
      return;
    }

    console.log('Roadmap Baselines');
    console.log('═'.repeat(60));
    for (const rm of roadmaps) {
      console.log(`  ${rm.title} [${rm.status}]`);
      console.log(`    ID: ${rm.id}`);
      console.log(`    Current baseline: v${rm.current_baseline_version}`);
      console.log(`    Created: ${new Date(rm.created_at).toLocaleDateString()}`);
      console.log('');
    }
    console.log('Use --roadmap-id <uuid> to see baseline history for a specific roadmap.');
    return;
  }

  const baselines = await listBaselines(supabase, roadmapId);

  console.log('Baseline History');
  console.log('═'.repeat(60));

  if (baselines.length === 0) {
    console.log('  No baselines found. Create one with:');
    console.log(`  node scripts/roadmap-baseline.js create --roadmap-id ${roadmapId}`);
    return;
  }

  for (const b of baselines) {
    const date = new Date(b.created_at).toLocaleString();
    const approved = b.approved_at ? ` | Approved: ${new Date(b.approved_at).toLocaleString()}` : '';
    console.log(`  v${b.version} — ${date}${approved}`);
    console.log(`    By: ${b.created_by || 'unknown'}`);
    if (b.change_rationale) console.log(`    Rationale: ${b.change_rationale}`);
    if (b.approved_by) console.log(`    Approved by: ${b.approved_by}`);
    console.log('');
  }
}

async function handleView(args) {
  const roadmapId = parseArg(args, '--roadmap-id');
  const version = parseInt(parseArg(args, '--version'), 10);

  if (!roadmapId || isNaN(version)) {
    console.log('Usage: node scripts/roadmap-baseline.js view --roadmap-id <uuid> --version <n>');
    process.exit(0);
  }

  const snapshot = await getBaseline(supabase, roadmapId, version);

  if (!snapshot) {
    console.error(`Baseline v${version} not found for roadmap ${roadmapId}`);
    process.exit(1);
  }

  console.log(`Baseline Snapshot v${snapshot.version}`);
  console.log('═'.repeat(60));
  console.log(`  Created: ${new Date(snapshot.created_at).toLocaleString()}`);
  console.log(`  By: ${snapshot.created_by || 'unknown'}`);
  if (snapshot.change_rationale) console.log(`  Rationale: ${snapshot.change_rationale}`);
  if (snapshot.approved_at) console.log(`  Approved: ${new Date(snapshot.approved_at).toLocaleString()} by ${snapshot.approved_by}`);

  const waves = snapshot.wave_sequence || [];
  console.log(`\n  Waves: ${waves.length}`);
  console.log('  ' + '─'.repeat(56));

  for (const wave of waves) {
    console.log(`    [${wave.sequence_rank}] ${wave.title} [${wave.status}]`);
    const items = wave.items || [];
    console.log(`        Items: ${items.length}`);
    items.forEach(item => {
      const promoted = item.promoted_to_sd_key ? ` → ${item.promoted_to_sd_key}` : '';
      console.log(`          - ${item.title || '(untitled)'}${promoted}`);
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (!subcommand || !['create', 'list', 'view'].includes(subcommand)) {
    console.log('Usage: node scripts/roadmap-baseline.js <create|list|view> [options]');
    console.log('\nSubcommands:');
    console.log('  create  --roadmap-id <uuid> [--rationale "reason"]  Create a new baseline snapshot');
    console.log('  list    [--roadmap-id <uuid>]                       List baselines (all roadmaps or specific)');
    console.log('  view    --roadmap-id <uuid> --version <n>           View a specific baseline snapshot');
    process.exit(0);
  }

  switch (subcommand) {
    case 'create': await handleCreate(args); break;
    case 'list': await handleList(args); break;
    case 'view': await handleView(args); break;
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
