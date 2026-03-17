#!/usr/bin/env node
/**
 * Complete Orphaned Parent SDs
 *
 * Finds parent SDs where all children are completed but the parent
 * is still marked as active. This is a one-time fix script for legacy
 * data, and also validates the systemic fix in PlanToLeadExecutor.
 *
 * Root cause: Parent SDs weren't being automatically marked complete
 * when all children finished. Fixed in PlanToLeadExecutor._checkAndCompleteParentSD()
 *
 * Usage: node scripts/complete-orphaned-parents.js [--dry-run]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const isDryRun = process.argv.includes('--dry-run');

async function completeOrphanedParents() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          ORPHANED PARENT SD COMPLETION SCRIPT                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Find parent SDs that are not completed
  // A parent SD is one that has children (other SDs with parent_sd_id pointing to it)
  const { data: allSDs, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, progress, parent_sd_id, relationship_type')
    .neq('status', 'completed')
    .order('id');

  if (fetchError) {
    console.error('Error fetching SDs:', fetchError.message);
    return;
  }

  // Find which SDs are parents by checking if they have children
  const parentIds = new Set();
  for (const sd of allSDs || []) {
    if (sd.parent_sd_id) {
      parentIds.add(sd.parent_sd_id);
    }
  }

  // Also get completed SDs that might be parents
  const { data: completedSDs } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, parent_sd_id')
    .eq('status', 'completed');

  for (const sd of completedSDs || []) {
    if (sd.parent_sd_id) {
      parentIds.add(sd.parent_sd_id);
    }
  }

  console.log(`Found ${parentIds.size} SDs that have children\n`);

  let completedCount = 0;
  let skippedCount = 0;

  for (const parentId of parentIds) {
    // Get the parent SD
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, progress')
      .eq('id', parentId)
      .single();

    if (!parent) {
      console.log(`  ⚠️  Parent ${parentId} not found`);
      continue;
    }

    // Skip if already completed
    if (parent.status === 'completed') {
      continue;
    }

    // Get all children
    const { data: children } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status')
      .eq('parent_sd_id', parentId);

    if (!children || children.length === 0) {
      continue;
    }

    const allComplete = children.every(c => c.status === 'completed');
    const completedChildren = children.filter(c => c.status === 'completed').length;

    console.log(`📂 ${parent.id}: "${parent.title.substring(0, 50)}..."`);
    console.log(`   Status: ${parent.status}`);
    console.log(`   Children: ${completedChildren}/${children.length} completed`);

    if (allComplete) {
      console.log('   🎉 All children completed!');

      if (!isDryRun) {
        const { error: updateError } = await supabase
          .from('strategic_directives_v2')
          .update({
            status: 'completed',
            progress: 100,
            current_phase: 'COMPLETED',
            updated_at: new Date().toISOString()
          })
          .eq('id', parent.id);

        if (updateError) {
          console.log(`   ❌ Update error: ${updateError.message}`);
        } else {
          console.log('   ✅ Parent marked as COMPLETED');
          completedCount++;
        }
      } else {
        console.log('   → Would mark as COMPLETED (dry run)');
        completedCount++;
      }
    } else {
      const incomplete = children.filter(c => c.status !== 'completed');
      console.log(`   ⏳ Waiting for ${incomplete.length} children:`);
      incomplete.slice(0, 3).forEach(c => {
        console.log(`      - ${c.id}: ${c.status}`);
      });
      if (incomplete.length > 3) {
        console.log(`      ... and ${incomplete.length - 3} more`);
      }
      skippedCount++;
    }
    console.log('');
  }

  console.log('═'.repeat(70));
  console.log('\n📊 Summary:');
  console.log(`   ${isDryRun ? 'Would complete' : 'Completed'}: ${completedCount} parent SDs`);
  console.log(`   Still waiting: ${skippedCount} parent SDs`);

  if (isDryRun && completedCount > 0) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }
}

completeOrphanedParents()
  .then(() => console.log('\n✅ Done!'))
  .catch(err => console.error('Error:', err.message));
