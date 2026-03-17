#!/usr/bin/env node
/**
 * Cleanup Stale is_working_on Flags
 * Part of SD-LEO-FIX-COMPLETION-WORKFLOW-001
 *
 * Finds and resets SDs that have is_working_on=true but are already completed.
 * This addresses the recurring issue where parent auto-completion or other
 * completion pathways fail to reset the is_working_on flag.
 *
 * Usage:
 *   node scripts/cleanup-stale-working-on.js           # Dry run (preview)
 *   node scripts/cleanup-stale-working-on.js --fix     # Actually fix
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupStaleWorkingOn(dryRun = true) {
  console.log('🔍 Scanning for stale is_working_on flags...\n');

  // Find SDs with is_working_on=true but completed status
  const { data: staleSDs, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress, is_working_on')
    .eq('is_working_on', true)
    .in('status', ['completed', 'archived', 'cancelled']);

  if (error) {
    console.error('Error querying database:', error.message);
    process.exit(1);
  }

  if (!staleSDs || staleSDs.length === 0) {
    console.log('✅ No stale is_working_on flags found. Database is clean.\n');
    return;
  }

  console.log(`Found ${staleSDs.length} SDs with stale is_working_on=true:\n`);

  for (const sd of staleSDs) {
    console.log(`  📌 ${sd.id}`);
    console.log(`     Title: ${sd.title}`);
    console.log(`     Status: ${sd.status} | Phase: ${sd.current_phase} | Progress: ${sd.progress}%`);
    console.log('');
  }

  if (dryRun) {
    console.log('---');
    console.log('🔵 DRY RUN: No changes made.');
    console.log('Run with --fix to actually reset these SDs.');
    return;
  }

  // Fix the stale SDs
  console.log('Resetting is_working_on to false...\n');

  let fixedCount = 0;
  for (const sd of staleSDs) {
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        is_working_on: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', sd.id);

    if (updateError) {
      console.log(`  ❌ Failed to fix ${sd.id}: ${updateError.message}`);
    } else {
      console.log(`  ✅ Fixed: ${sd.id}`);
      fixedCount++;
    }
  }

  console.log(`\n🎉 Cleanup complete. Fixed ${fixedCount}/${staleSDs.length} SDs.`);
}

// Parse args
const args = process.argv.slice(2);
const dryRun = !args.includes('--fix');

cleanupStaleWorkingOn(dryRun).catch(console.error);
