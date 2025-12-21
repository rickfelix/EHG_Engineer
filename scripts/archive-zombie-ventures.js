#!/usr/bin/env node
/**
 * Archive Zombie Ventures
 *
 * SD-UNIFIED-PATH-2.0: Logic Locking & The Genesis Pulse
 * Codex/Anti-Gravity Audit Finding: 600+ ventures with 0 stage-work rows
 *
 * This script archives "zombie ventures" - ventures that have no stage-work
 * rows and therefore cannot participate in the 25-stage lifecycle.
 *
 * Actions:
 * 1. Identify ventures with 0 rows in venture_stage_work
 * 2. Update their status to 'archived' (soft delete)
 * 3. Log the operation to system_events
 *
 * Usage:
 *   node scripts/archive-zombie-ventures.js --dry-run   # Preview only
 *   node scripts/archive-zombie-ventures.js --execute   # Actually archive
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findZombieVentures() {
  // Get all venture IDs that have stage work
  const { data: healthyVentures, error: swError } = await supabase
    .from('venture_stage_work')
    .select('venture_id');

  if (swError) {
    console.error('Error fetching stage work:', swError.message);
    return null;
  }

  const healthyIds = new Set(healthyVentures.map(v => v.venture_id));

  // Get all ventures
  const { data: allVentures, error: vError } = await supabase
    .from('ventures')
    .select('id, name, status, current_lifecycle_stage, created_at')
    .neq('status', 'archived');

  if (vError) {
    console.error('Error fetching ventures:', vError.message);
    return null;
  }

  // Find zombies (ventures not in healthyIds)
  const zombies = allVentures.filter(v => !healthyIds.has(v.id));

  return {
    total: allVentures.length,
    healthy: healthyIds.size,
    zombies: zombies
  };
}

async function archiveZombies(zombies, dryRun = true) {
  if (dryRun) {
    console.log('\n📋 DRY RUN - No changes will be made\n');
  }

  console.log(`Found ${zombies.length} zombie ventures to archive\n`);

  if (zombies.length === 0) {
    console.log('✅ No zombie ventures found!');
    return { archived: 0, failed: 0 };
  }

  // Show sample
  console.log('Sample zombies (first 10):');
  zombies.slice(0, 10).forEach(z => {
    console.log(`  - ${z.name || 'Unnamed'} (${z.id.substring(0, 8)}...) - status: ${z.status}`);
  });

  if (dryRun) {
    console.log(`\n⚠️  Would archive ${zombies.length} ventures`);
    console.log('   Run with --execute to actually archive\n');
    return { archived: 0, failed: 0, dryRun: true };
  }

  // Archive in batches
  const batchSize = 100;
  let archived = 0;
  let failed = 0;

  for (let i = 0; i < zombies.length; i += batchSize) {
    const batch = zombies.slice(i, i + batchSize);
    const ids = batch.map(z => z.id);

    const { error } = await supabase
      .from('ventures')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString()
      })
      .in('id', ids);

    if (error) {
      console.error(`❌ Batch ${i / batchSize + 1} failed:`, error.message);
      failed += batch.length;
    } else {
      archived += batch.length;
      console.log(`✅ Archived batch ${i / batchSize + 1}: ${batch.length} ventures`);
    }
  }

  // Log to system_events
  const { error: logError } = await supabase
    .from('system_events')
    .insert({
      event_type: 'ZOMBIE_VENTURE_CLEANUP',
      actor_type: 'system',
      actor_role: 'LEO_PROTOCOL_RESTORATION',
      payload: {
        total_zombies: zombies.length,
        archived: archived,
        failed: failed,
        cleanup_date: new Date().toISOString()
      }
    });

  if (logError) {
    console.warn('⚠️  Could not log to system_events:', logError.message);
  }

  return { archived, failed };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('🧹 ZOMBIE VENTURE CLEANUP');
  console.log('═'.repeat(50));
  console.log('SD-UNIFIED-PATH-2.0: Logic Locking & The Genesis Pulse');
  console.log('Codex/Anti-Gravity Audit Finding Resolution\n');

  console.log('📊 Analyzing ventures...\n');

  const analysis = await findZombieVentures();

  if (!analysis) {
    console.error('❌ Failed to analyze ventures');
    process.exit(1);
  }

  console.log(`Total ventures: ${analysis.total}`);
  console.log(`Healthy ventures (with stage work): ${analysis.healthy}`);
  console.log(`Zombie ventures (no stage work): ${analysis.zombies.length}`);
  console.log('');

  const result = await archiveZombies(analysis.zombies, dryRun);

  console.log('\n📋 SUMMARY');
  console.log('═'.repeat(50));
  if (result.dryRun) {
    console.log(`Would archive: ${analysis.zombies.length} ventures`);
    console.log('\nRun with --execute to actually archive');
  } else {
    console.log(`Archived: ${result.archived} ventures`);
    console.log(`Failed: ${result.failed} ventures`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
